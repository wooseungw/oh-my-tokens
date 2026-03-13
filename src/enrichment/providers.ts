import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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
  };
}

export interface EnrichmentProvider {
  name: string;
  fetchQuota(authToken: string): Promise<ProviderQuota | null>;
}

interface AuthEntry {
  type?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
  key?: string;
}

export function readAuthJson(): Record<string, AuthEntry> | null {
  const candidates = [
    path.join(homedir(), ".local", "share", "opencode", "auth.json"),
    path.join(homedir(), ".config", "opencode", "auth.json"),
    path.join(homedir(), "Library", "Application Support", "opencode", "auth.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8")) as Record<string, AuthEntry>;
      } catch {}
    }
  }
  return null;
}

export function readAuthToken(provider: string): string | null {
  const auth = readAuthJson();
  const entry = auth?.[provider];
  if (!entry) return null;
  if (entry.type === "oauth") return entry.access ?? null;
  if (entry.type === "api") return entry.key ?? null;
  return entry.access ?? entry.key ?? null;
}

function isTokenExpired(entry: AuthEntry): boolean {
  return typeof entry.expires === "number" && entry.expires < Date.now();
}

interface UsageBody {
  total_tokens?: number;
  totalTokens?: number;
  used_tokens?: number;
  usedTokens?: number;
  total_requests?: number;
  totalRequests?: number;
  used_requests?: number;
  usedRequests?: number;
  usage?: UsageBody;
  data?: UsageBody[];
  plan?: string;
  tier?: string;
  account_type?: string;
  accountType?: string;
  refreshes_at?: number;
  refreshesAt?: number;
  reset_at?: number;
  resetAt?: number;
  limit?: number;
  total?: number;
  included?: number;
  usage_count?: number;
  usageCount?: number;
  used?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBodyNumber(body: UsageBody, keys: (keyof UsageBody)[]): number | undefined {
  for (const key of keys) {
    const value = readFiniteNumber(body[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function parseUsageBody(value: unknown): UsageBody | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as UsageBody;
}

function sumNestedUsage(body: UsageBody | null, unit: "tokens" | "requests"): number {
  if (body === null) {
    return 0;
  }

  const direct =
    unit === "tokens"
      ? readBodyNumber(body, ["used", "used_tokens", "usedTokens", "total_tokens", "totalTokens"])
      : readBodyNumber(body, [
          "used",
          "used_requests",
          "usedRequests",
          "usage_count",
          "usageCount",
          "total_requests",
          "totalRequests",
        ]);

  if (direct !== undefined) {
    return direct;
  }

  if (body.usage !== undefined) {
    return sumNestedUsage(body.usage, unit);
  }

  if (Array.isArray(body.data)) {
    return body.data.reduce((total, item) => total + sumNestedUsage(parseUsageBody(item), unit), 0);
  }

  return 0;
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
  return readBodyNumber(body, ["refreshes_at", "refreshesAt", "reset_at", "resetAt"]);
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
  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      five_hour?: { utilization?: number };
      seven_day?: { utilization?: number };
    };
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
          fiveHour: { percentRemaining: clampPercent(100 - fiveHourUtil) },
        }),
        ...(sevenDayUtil !== undefined && {
          sevenDay: { percentRemaining: clampPercent(100 - sevenDayUtil) },
        }),
      },
    };
  } catch {
    return null;
  }
}

export async function fetchAnthropicQuota(authToken: string): Promise<ProviderQuota | null> {
  const auth = readAuthJson();
  const entry = auth?.anthropic;

  if (entry?.type === "oauth" && entry.access && !isTokenExpired(entry)) {
    const result = await fetchAnthropicOAuthQuota(entry.access);
    if (result !== null) return result;
  }

  const apiKey = (entry?.type === "api" ? entry.key : undefined) ?? authToken;
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
  try {
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
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      plan_type?: string;
      rate_limit?: {
        primary_window?: { used_percent: number; reset_after_seconds: number; reset_at?: number };
        secondary_window?: {
          used_percent: number;
          reset_after_seconds: number;
          reset_at?: number;
        } | null;
      } | null;
    };
    const primary = data.rate_limit?.primary_window;
    if (!primary) return null;
    const secondary = data.rate_limit?.secondary_window ?? null;
    return {
      provider: "openai",
      used: 0,
      limit: 0,
      unit: "tokens",
      planLabel: data.plan_type,
      windows: {
        hourly: {
          percentRemaining: clampPercent(100 - primary.used_percent),
          resetTimeIso:
            resetIsoFromTimestamp(primary.reset_at) ??
            resetIsoFromNowSeconds(primary.reset_after_seconds),
        },
        ...(secondary && {
          weekly: {
            percentRemaining: clampPercent(100 - secondary.used_percent),
            resetTimeIso:
              resetIsoFromTimestamp(secondary.reset_at) ??
              resetIsoFromNowSeconds(secondary.reset_after_seconds),
          },
        }),
      },
    };
  } catch {
    return null;
  }
}

export async function fetchOpenAIQuota(authToken: string): Promise<ProviderQuota | null> {
  const auth = readAuthJson();
  const entry = auth?.openai;

  if (entry?.type === "oauth" && entry.access && !isTokenExpired(entry)) {
    const result = await fetchOpenAIOAuthQuota(entry.access);
    if (result !== null) return result;
  }

  const apiKey = (entry?.type === "api" ? entry.key : undefined) ?? authToken;
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
  const entry =
    auth?.["github-copilot"] ??
    auth?.copilot ??
    auth?.["copilot-chat"] ??
    auth?.["github-copilot-chat"];

  const token =
    (entry?.type === "oauth" ? (entry.access ?? entry.refresh) : undefined) ?? authToken;
  if (!token) return null;

  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "oh-my-tokens/1.0",
      },
    });
    if (!userResponse.ok) return null;

    const userData = (await userResponse.json()) as { login?: string };
    const username = userData.login?.trim();
    if (!username) return null;

    const usageResponse = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/settings/billing/premium_request/usage`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "oh-my-tokens/1.0",
        },
      },
    );
    if (!usageResponse.ok) return null;

    const usageData = (await usageResponse.json()) as {
      usage_items?: Array<{
        sku?: string;
        gross_quantity?: number;
        net_quantity?: number;
        limit?: number;
      }>;
    };

    const items = Array.isArray(usageData.usage_items) ? usageData.usage_items : [];
    const premiumItem =
      items.find((item) => typeof item.sku === "string" && item.sku.includes("Premium")) ??
      items[0];
    if (!premiumItem) return null;

    const used = premiumItem.gross_quantity ?? premiumItem.net_quantity ?? 0;
    const limit = premiumItem.limit ?? COPILOT_FALLBACK_LIMITS.pro;
    const percentRemaining = limit > 0 ? clampPercent(((limit - used) / limit) * 100) : 0;

    const now = new Date();
    const resetTimeIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString();
    const refreshesAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).getTime();

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
  } catch {
    return null;
  }
}

export async function fetchGeminiQuota(_authToken: string): Promise<ProviderQuota | null> {
  return null;
}

export async function fetchOpenRouterQuota(authToken: string): Promise<ProviderQuota | null> {
  const token = readAuthToken("openrouter") ?? authToken;
  if (!token) return null;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${token}`, "HTTP-Referer": "oh-my-tokens" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: { credits?: number; usage?: number } };
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
  } catch {
    return null;
  }
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
