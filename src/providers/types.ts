import type { ModelPricing } from "../analytics/pricing";
import type { ProviderQuota } from "../enrichment/providers";

export type VerificationTier =
  | "response"
  | "provider-api"
  | "subscription"
  | "local"
  | "unverifiable";

export interface UsageRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  recordedCost: number;
  generationId?: string;
  timestamp: number;
}

export interface VerificationResult {
  status: "ok" | "delta" | "skipped" | "error";
  expected: number;
  actual?: number;
  delta?: number;
  reason?: string;
}

export interface ProviderSpec {
  id: string;
  displayName: string;
  tier: VerificationTier;
  authKeys: string[];
  tierMonthlyEstimate?: Readonly<Record<string, number>>;
  fetchQuota?: (authToken: string) => Promise<ProviderQuota | null>;
  verifyUsage?: (record: UsageRecord, authToken: string) => Promise<VerificationResult>;
  estimateCost?: (
    record: Omit<UsageRecord, "recordedCost" | "generationId" | "timestamp">,
    pricing: ModelPricing | null,
  ) => number | null;
}
