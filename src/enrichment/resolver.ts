import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { ProviderQuota } from "./providers";

import { getDataDirCandidates } from "../paths";
import { EnrichmentCache } from "./cache";
import { ENRICHMENT_PROVIDERS } from "./providers";

export type EnrichmentMode = "off" | "auto" | "manual" | "opencode-quota";

export interface EnrichmentConfig {
  mode: EnrichmentMode;
  providers?: Record<string, { budget: number; unit: "tokens" | "requests"; period: string }>;
}

export interface EnrichmentResult {
  provider: string;
  quota: ProviderQuota | null;
  source: EnrichmentMode;
}

interface OpencodeQuotaSnapshot {
  providers: ProviderQuota[];
}

const quotaCache = new EnrichmentCache<ProviderQuota | null>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeMode(value: string | undefined): EnrichmentMode {
  switch (value?.trim().toLowerCase()) {
    case "auto":
    case "manual":
    case "opencode-quota":
      return value.trim().toLowerCase() as EnrichmentMode;
    default:
      return "off";
  }
}

function toManualQuota(
  provider: string,
  config: { budget: number; unit: "tokens" | "requests"; period: string },
): ProviderQuota {
  void config.period;

  return {
    provider,
    used: 0,
    limit: config.budget,
    unit: config.unit,
  };
}

async function resolveAutoEnrichment(): Promise<EnrichmentResult[]> {
  const envTokens: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    copilot: process.env.GITHUB_TOKEN,
    gemini: process.env.GEMINI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  const tasks = Object.keys(ENRICHMENT_PROVIDERS).map(
    async (provider): Promise<EnrichmentResult | null> => {
      const fetchFn = ENRICHMENT_PROVIDERS[provider];
      if (!fetchFn) return null;

      const cacheKey = provider;
      const cachedQuota = quotaCache.get(cacheKey);
      if (cachedQuota !== null) {
        return { provider, quota: cachedQuota, source: "auto" };
      }

      const envToken = envTokens[provider] ?? "";
      const quota = await fetchFn(envToken);
      if (quota !== null && quota !== undefined) {
        quotaCache.set(cacheKey, quota);
      }

      return { provider, quota: quota ?? null, source: "auto" };
    },
  );

  const results = await Promise.all(tasks);
  return results.filter(
    (result): result is EnrichmentResult => result !== null && result.quota !== null,
  );
}

function getOpencodeQuotaConfigCandidates(): string[] {
  return [
    ...getDataDirCandidates().map((candidate) => path.join(candidate, "opencode.json")),
    path.join(homedir(), ".config", "opencode", "opencode.json"),
  ];
}

function getOpencodeQuotaDataCandidates(): string[] {
  return [
    ...getDataDirCandidates().flatMap((candidate) => [
      path.join(candidate, "qwen-local-quota.json"),
      path.join(candidate, "opencode-quota.json"),
    ]),
    path.join(homedir(), ".config", "opencode", "qwen-local-quota.json"),
    path.join(homedir(), ".config", "opencode", "opencode-quota.json"),
  ];
}

function readJsonFile(filePath: string): unknown | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function hasOpencodeQuotaPlugin(config: unknown): boolean {
  if (!isRecord(config) || !Array.isArray(config.plugin)) {
    return false;
  }

  return config.plugin.some((entry) => {
    if (typeof entry === "string") {
      return entry.includes("opencode-quota");
    }

    if (isRecord(entry)) {
      return [entry.name, entry.package, entry.path].some(
        (value) => typeof value === "string" && value.includes("opencode-quota"),
      );
    }

    return false;
  });
}

function toProviderQuota(value: unknown): ProviderQuota | null {
  if (!isRecord(value)) {
    return null;
  }

  const provider = readString(value.provider) ?? readString(value.name) ?? readString(value.id);
  const used = readFiniteNumber(value.used) ?? readFiniteNumber(value.usage) ?? 0;
  const limit =
    readFiniteNumber(value.limit) ??
    readFiniteNumber(value.total) ??
    readFiniteNumber(value.budget);
  const unitValue = readString(value.unit);

  if (provider === undefined || limit === undefined) {
    return null;
  }

  return {
    provider,
    used,
    limit,
    unit: unitValue === "requests" ? "requests" : "tokens",
    tier: readString(value.tier),
    refreshesAt:
      readFiniteNumber(value.refreshesAt) ??
      readFiniteNumber(value.refreshes_at) ??
      readFiniteNumber(value.resetAt) ??
      readFiniteNumber(value.reset_at),
  };
}

function parseOpencodeQuotaSnapshot(raw: unknown): OpencodeQuotaSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const collection = Array.isArray(raw.providers)
    ? raw.providers
    : Array.isArray(raw.quotas)
      ? raw.quotas
      : isRecord(raw.providers)
        ? Object.entries(raw.providers).map(([provider, quota]) => ({
            provider,
            ...(isRecord(quota) ? quota : {}),
          }))
        : null;

  if (collection === null) {
    return null;
  }

  const providers = collection
    .map(toProviderQuota)
    .filter((quota): quota is ProviderQuota => quota !== null);

  return providers.length > 0 ? { providers } : null;
}

function readOpencodeQuotaSnapshot(): OpencodeQuotaSnapshot | null {
  const config = getOpencodeQuotaConfigCandidates()
    .map((filePath) => readJsonFile(filePath))
    .find((value) => value !== null);

  if (config === undefined || !hasOpencodeQuotaPlugin(config)) {
    return null;
  }

  for (const filePath of getOpencodeQuotaDataCandidates()) {
    const snapshot = parseOpencodeQuotaSnapshot(readJsonFile(filePath));
    if (snapshot !== null) {
      return snapshot;
    }
  }

  return null;
}

export function getEnrichmentMode(): EnrichmentMode {
  return normalizeMode(process.env.OMT_ENRICHMENT);
}

export async function resolveEnrichment(config: EnrichmentConfig): Promise<EnrichmentResult[]> {
  if (config.mode === "off") {
    return [];
  }

  if (config.mode === "manual") {
    return Object.entries(config.providers ?? {}).map(([provider, providerConfig]) => ({
      provider,
      quota: toManualQuota(provider, providerConfig),
      source: "manual",
    }));
  }

  if (config.mode === "opencode-quota") {
    const snapshot = readOpencodeQuotaSnapshot();

    if (snapshot !== null) {
      return snapshot.providers.map((quota) => ({
        provider: quota.provider,
        quota,
        source: "opencode-quota",
      }));
    }

    const fallbackResults = await resolveAutoEnrichment();
    return fallbackResults.map((result) => ({
      ...result,
      source: "auto",
    }));
  }

  return resolveAutoEnrichment();
}
