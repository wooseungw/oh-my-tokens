import type { UsageRecord, VerificationResult } from "./types";

const GENERATION_ENDPOINT = "https://openrouter.ai/api/v1/generation";

interface OpenRouterGenerationResponse {
  data?: {
    id?: string;
    total_cost?: number;
    cache_discount?: number;
    tokens_prompt?: number;
    tokens_completion?: number;
    native_tokens_prompt?: number;
    native_tokens_completion?: number;
  };
}

export async function verifyOpenRouterUsage(
  record: UsageRecord,
  authToken: string,
): Promise<VerificationResult> {
  if (!record.generationId || record.generationId.length === 0) {
    return {
      status: "skipped",
      expected: record.recordedCost,
      reason: "no_generation_id",
    };
  }

  if (!authToken || authToken.length === 0) {
    return {
      status: "skipped",
      expected: record.recordedCost,
      reason: "no_openrouter_token",
    };
  }

  try {
    const url = `${GENERATION_ENDPOINT}?id=${encodeURIComponent(record.generationId)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "HTTP-Referer": "oh-my-tokens",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        status: "error",
        expected: record.recordedCost,
        reason: `openrouter_${response.status}`,
      };
    }

    const body = (await response.json()) as OpenRouterGenerationResponse;
    const totalCost = body.data?.total_cost;
    if (typeof totalCost !== "number" || !Number.isFinite(totalCost)) {
      return {
        status: "error",
        expected: record.recordedCost,
        reason: "no_total_cost_in_response",
      };
    }

    const delta = record.recordedCost - totalCost;
    const withinTolerance =
      Math.abs(delta) < 0.0001 || Math.abs(delta / Math.max(totalCost, 1e-9)) < 0.01;

    return {
      status: withinTolerance ? "ok" : "delta",
      expected: record.recordedCost,
      actual: totalCost,
      delta,
    };
  } catch (err) {
    return {
      status: "error",
      expected: record.recordedCost,
      reason: err instanceof Error ? err.message : "network_error",
    };
  }
}
