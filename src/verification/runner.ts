import type { PerProviderConfig, ProviderVerifyMode } from "../config/reader";
import { extractAllProviderConfigs, extractPerProviderConfig } from "../config/reader";
import { resolveProviderAuthToken } from "../enrichment/resolver";
import { getProvider } from "../providers/registry";
import type { UsageRecord, VerificationResult } from "../providers/types";

export interface VerificationItem {
  sessionId: string;
  messageId: string;
  provider: string;
  result: VerificationResult;
}

export interface VerificationReport {
  items: VerificationItem[];
  summary: {
    ok: number;
    delta: number;
    skipped: number;
    errored: number;
    totalExpected: number;
    totalActual: number;
  };
}

export function shouldVerify(mode: ProviderVerifyMode, randomValue: number): boolean {
  if (mode === "all") return true;
  if (mode === "sample") return randomValue < 0.1;
  return false;
}

export interface VerifySessionInput {
  sessionId: string;
  records: UsageRecord[];
  configSnapshot?: Record<string, unknown>;
  randomSource?: () => number;
}

export async function verifyRecords(input: VerifySessionInput): Promise<VerificationReport> {
  const perProvider: Record<string, PerProviderConfig> = input.configSnapshot
    ? extractAllProviderConfigs(input.configSnapshot)
    : {};
  const random = input.randomSource ?? Math.random;

  const items: VerificationItem[] = [];
  let totalExpected = 0;
  let totalActual = 0;
  let ok = 0;
  let delta = 0;
  let skipped = 0;
  let errored = 0;

  for (const record of input.records) {
    const spec = getProvider(record.provider);
    const verifyMode =
      perProvider[spec.id]?.verify ??
      (input.configSnapshot !== undefined
        ? extractPerProviderConfig(input.configSnapshot, spec.id).verify
        : "off");

    if (!shouldVerify(verifyMode, random())) {
      continue;
    }

    if (typeof spec.verifyUsage !== "function") {
      items.push({
        sessionId: input.sessionId,
        messageId: record.generationId ?? "",
        provider: spec.id,
        result: {
          status: "skipped",
          expected: record.recordedCost,
          reason: "no_verifier_for_provider",
        },
      });
      skipped += 1;
      continue;
    }

    const token = resolveProviderAuthToken(spec.id);
    let result: VerificationResult;
    try {
      result = await spec.verifyUsage(record, token);
    } catch (err) {
      result = {
        status: "error",
        expected: record.recordedCost,
        reason: err instanceof Error ? err.message : "verify_threw",
      };
    }

    items.push({
      sessionId: input.sessionId,
      messageId: record.generationId ?? "",
      provider: spec.id,
      result,
    });

    totalExpected += result.expected;
    if (typeof result.actual === "number") totalActual += result.actual;
    if (result.status === "ok") ok += 1;
    else if (result.status === "delta") delta += 1;
    else if (result.status === "skipped") skipped += 1;
    else errored += 1;
  }

  return {
    items,
    summary: { ok, delta, skipped, errored, totalExpected, totalActual },
  };
}
