export interface UsageBody {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
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

export function parseUsageBody(value: unknown): UsageBody | null {
  if (!isRecord(value)) {
    return null;
  }

  return value as UsageBody;
}

export function sumNestedUsage(body: UsageBody | null, unit: "tokens" | "requests"): number {
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

export async function safeFetch(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
