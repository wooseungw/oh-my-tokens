import { type AuthEntry, readAuthJson, readAuthToken } from "./auth";
import {
  isRecord,
  parseUsageBody,
  readFiniteNumber,
  safeFetch,
  sumNestedUsage,
  type UsageBody,
} from "./fetch-utils";

export interface ProviderQuotaWindow {
  percentRemaining: number;
  resetTimeIso?: string;
}

export interface ProviderQuota {
  provider: string;
  used: number;
  limit: number;
  unit: "tokens" | "requests" | "credits";
  tier?: string;
  refreshesAt?: number;
  planLabel?: string;
  windows?: {
    fiveHour?: ProviderQuotaWindow;
    hourly?: ProviderQuotaWindow;
    sevenDay?: ProviderQuotaWindow;
    weekly?: ProviderQuotaWindow;
    daily?: ProviderQuotaWindow;
  };
}

export interface EnrichmentProvider {
  name: string;
  fetchQuota(authToken: string): Promise<ProviderQuota | null>;
}

function detectAnthropicTier(tokensLimit: number): string {
  if (tokensLimit <= 20_000) return "free";
  if (tokensLimit <= 40_000) return "tier_1";
  if (tokensLimit <= 80_000) return "tier_2";
  if (tokensLimit <= 160_000) return "tier_3";
  if (tokensLimit <= 400_000) return "tier_4";
  return "scale";
}

function detectOpenAITier(tokensLimit: number): string {
  if (tokensLimit <= 200_000) return "tier_1";
  if (tokensLimit <= 2_000_000) return "tier_2";
  if (tokensLimit <= 4_000_000) return "tier_3";
  if (tokensLimit <= 10_000_000) return "tier_4";
  return "tier_5";
}

function readHeaderNumber(headers: Headers, key: string): number | undefined {
  const value = headers.get(key);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readRefreshTime(body: UsageBody | null): number | undefined {
  if (body === null) return undefined;
  return (
    readFiniteNumber(body.refreshes_at) ??
    readFiniteNumber(body.refreshesAt) ??
    readFiniteNumber(body.reset_at) ??
    readFiniteNumber(body.resetAt)
  );
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function resetIsoFromNowSeconds(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(Date.now() + Math.round(seconds * 1000)).toISOString();
}

function resetIsoFromTimestamp(resetAt?: number): string | undefined {
  if (!Number.isFinite(resetAt) || !resetAt) return undefined;
  return new Date(Math.round(resetAt * 1000)).toISOString();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const COPILOT_FALLBACK_LIMITS = {
  free: 50,
  pro: 300,
  "pro+": 1500,
  business: 300,
  enterprise: 1000,
} as const;

async function fetchAnthropicOAuthQuota(token: string): Promise<ProviderQuota | null> {
  const data = (await safeFetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
  })) as {
    five_hour?: { utilization?: number; resets_at?: string };
    seven_day?: { utilization?: number; resets_at?: string };
  } | null;
  if (data === null) {
    return null;
  }

  const fiveHourUtil = data.five_hour?.utilization;
  const sevenDayUtil = data.seven_day?.utilization;
  if (fiveHourUtil === undefined && sevenDayUtil === undefined) return null;
  return {
    provider: "anthropic",
    used: 0,
    limit: 0,
    unit: "tokens",
    windows: {
      ...(fiveHourUtil !== undefined && {
        fiveHour: {
          percentRemaining: clampPercent(100 - fiveHourUtil),
          ...(data.five_hour?.resets_at !== undefined && {
            resetTimeIso: data.five_hour.resets_at,
          }),
        },
      }),
      ...(sevenDayUtil !== undefined && {
        sevenDay: {
          percentRemaining: clampPercent(100 - sevenDayUtil),
          ...(data.seven_day?.resets_at !== undefined && {
            resetTimeIso: data.seven_day.resets_at,
          }),
        },
      }),
    },
  };
}

export async function fetchAnthropicQuota(authToken: string): Promise<ProviderQuota | null> {
  const auth = readAuthJson();
  const entry = auth?.anthropic;
  const storedToken = readAuthToken("anthropic");

  if (entry?.type === "oauth" && storedToken) {
    const result = await fetchAnthropicOAuthQuota(storedToken);
    if (result !== null) return result;
  }

  const apiKey = storedToken ?? authToken;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/organizations/usage", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!response.ok) return null;

    const body = parseUsageBody(await response.json());
    const limit = readHeaderNumber(response.headers, "anthropic-ratelimit-tokens-limit");
    if (limit === undefined) return null;

    return {
      provider: "anthropic",
      used: sumNestedUsage(body, "tokens"),
      limit,
      unit: "tokens",
      tier: detectAnthropicTier(limit),
      refreshesAt: readRefreshTime(body),
    };
  } catch {
    return null;
  }
}

async function fetchOpenAIOAuthQuota(token: string): Promise<ProviderQuota | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "oh-my-tokens/1.0",
  };
  const payload = decodeJwtPayload(token);
  if (isRecord(payload?.["https://api.openai.com/auth"])) {
    const authClaim = payload["https://api.openai.com/auth"] as Record<string, unknown>;
    if (typeof authClaim.chatgpt_account_id === "string") {
      headers["ChatGPT-Account-Id"] = authClaim.chatgpt_account_id;
    }
  }

  const data = (await safeFetch("https://chatgpt.com/backend-api/wham/usage", { headers })) as {
    plan_type?: string;
    rate_limit?: {
      primary_window?: { used_percent: number; reset_after_seconds: number; reset_at?: number };
      secondary_window?: {
        used_percent: number;
        reset_after_seconds: number;
        reset_at?: number;
      } | null;
    } | null;
  } | null;
  if (data === null) {
    return null;
  }

  const primary = data.rate_limit?.primary_window;
  if (!primary) return null;
  const secondary = data.rate_limit?.secondary_window ?? null;

  // OpenAI removed the 5-hour rolling cap (July 2026), leaving only the weekly cap.
  // The /wham/usage endpoint may reflect this with different window arrangements:
  // - Old format: primary_window = 5h cap, secondary_window = weekly cap
  // - New format: primary_window = weekly cap, secondary_window is null/absent
  // Detect format by checking if secondary_window is present.
  const windows = secondary
    ? {
        // Old format: both windows exist, preserve original mapping
        hourly: {
          percentRemaining: clampPercent(100 - primary.used_percent),
          resetTimeIso:
            resetIsoFromTimestamp(primary.reset_at) ??
            resetIsoFromNowSeconds(primary.reset_after_seconds),
        },
        weekly: {
          percentRemaining: clampPercent(100 - secondary.used_percent),
          resetTimeIso:
            resetIsoFromTimestamp(secondary.reset_at) ??
            resetIsoFromNowSeconds(secondary.reset_after_seconds),
        },
      }
    : {
        // New format: primary_window is now the weekly cap
        weekly: {
          percentRemaining: clampPercent(100 - primary.used_percent),
          resetTimeIso:
            resetIsoFromTimestamp(primary.reset_at) ??
            resetIsoFromNowSeconds(primary.reset_after_seconds),
        },
      };

  return {
    provider: "openai",
    used: 0,
    limit: 0,
    unit: "tokens",
    planLabel: data.plan_type,
    windows,
  };
}

export async function fetchOpenAIQuota(authToken: string): Promise<ProviderQuota | null> {
  const auth = readAuthJson();
  const entry = auth?.openai;
  const storedToken = readAuthToken("openai");

  if (entry?.type === "oauth" && storedToken) {
    const result = await fetchOpenAIOAuthQuota(storedToken);
    if (result !== null) return result;
  }

  const apiKey = storedToken ?? authToken;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/organization/usage/completions", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;

    const body = parseUsageBody(await response.json());
    const limit = readHeaderNumber(response.headers, "x-ratelimit-limit-tokens");
    if (limit === undefined) return null;

    return {
      provider: "openai",
      used: sumNestedUsage(body, "tokens"),
      limit,
      unit: "tokens",
      tier: detectOpenAITier(limit),
      refreshesAt: readRefreshTime(body),
    };
  } catch {
    return null;
  }
}

export async function fetchCopilotQuota(authToken: string): Promise<ProviderQuota | null> {
  const auth = readAuthJson();
  const entry: AuthEntry | undefined =
    auth?.["github-copilot"] ??
    auth?.copilot ??
    auth?.["copilot-chat"] ??
    auth?.["github-copilot-chat"];

  const token =
    (entry?.type === "oauth" ? (entry.access ?? entry.refresh) : undefined) ?? authToken;
  if (!token) return null;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "oh-my-tokens/1.0",
  };

  const userData = (await safeFetch("https://api.github.com/user", { headers })) as {
    login?: string;
  } | null;
  const username = userData?.login?.trim();
  if (!username) return null;

  const usageData = (await safeFetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/settings/billing/premium_request/usage`,
    { headers },
  )) as {
    usage_items?: Array<{
      sku?: string;
      gross_quantity?: number;
      net_quantity?: number;
      limit?: number;
    }>;
  } | null;
  if (usageData === null) {
    return null;
  }

  const items = Array.isArray(usageData.usage_items) ? usageData.usage_items : [];
  const premiumItem =
    items.find((item) => typeof item.sku === "string" && item.sku.includes("Premium")) ?? items[0];
  if (!premiumItem) return null;

  const used = premiumItem.gross_quantity ?? premiumItem.net_quantity ?? 0;
  const limit = premiumItem.limit ?? COPILOT_FALLBACK_LIMITS.pro;
  const percentRemaining = limit > 0 ? clampPercent(((limit - used) / limit) * 100) : 0;

  const now = new Date();
  const resetTimeIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
  const refreshesAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime();

  return {
    provider: "copilot",
    used,
    limit,
    unit: "requests",
    refreshesAt,
    windows: {
      // Re-use the "weekly" slot to surface the monthly window in buildLimitsSummary
      weekly: { percentRemaining, resetTimeIso },
    },
  };
}

export async function fetchGeminiQuota(authToken: string): Promise<ProviderQuota | null> {
  const token = readAuthToken("gemini") ?? authToken;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(token)}&pageSize=1`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
  } catch {
    return null;
  }

  const GEMINI_FREE_TIER_RPD_REDDIT_EST = 1_000;
  const PERCENT_REMAINING_UNKNOWN = 100;
  const PST_OFFSET_MS = 8 * 60 * 60 * 1000;
  const MS_PER_DAY = 86_400_000;
  const resetMs = Math.ceil((Date.now() - PST_OFFSET_MS) / MS_PER_DAY) * MS_PER_DAY + PST_OFFSET_MS;

  return {
    provider: "gemini",
    used: 0,
    limit: GEMINI_FREE_TIER_RPD_REDDIT_EST,
    unit: "requests",
    planLabel: "free~",
    windows: {
      daily: {
        percentRemaining: PERCENT_REMAINING_UNKNOWN,
        resetTimeIso: new Date(resetMs).toISOString(),
      },
    },
  };
}

export async function fetchOpenRouterQuota(authToken: string): Promise<ProviderQuota | null> {
  const token = readAuthToken("openrouter") ?? authToken;
  if (!token) return null;
  const data = (await safeFetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${token}`, "HTTP-Referer": "oh-my-tokens" },
  })) as { data?: { credits?: number; usage?: number } } | null;
  if (data === null) {
    return null;
  }

  const remaining = data.data?.credits;
  const usage = data.data?.usage;
  if (remaining === undefined && usage === undefined) return null;
  const usedAmt = usage ?? 0;
  const remainingAmt = remaining ?? 0;
  const total = usedAmt + remainingAmt;
  const percentRemaining = total > 0 ? clampPercent((remainingAmt / total) * 100) : 100;
  return {
    provider: "openrouter",
    used: usedAmt,
    limit: total,
    unit: "credits",
    windows: {
      // Re-use the "weekly" slot for the running balance (no time-based reset)
      weekly: { percentRemaining },
    },
  };
}

export const ENRICHMENT_PROVIDERS: Record<
  string,
  (token: string) => Promise<ProviderQuota | null>
> = {
  anthropic: fetchAnthropicQuota,
  openai: fetchOpenAIQuota,
  copilot: fetchCopilotQuota,
  gemini: fetchGeminiQuota,
  openrouter: fetchOpenRouterQuota,
};
