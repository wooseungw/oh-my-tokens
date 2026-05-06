import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyOpenRouterUsage } from "../../../src/providers/openrouter";
import type { UsageRecord } from "../../../src/providers/types";

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    provider: "openrouter",
    model: "google/gemini-2.5-pro",
    inputTokens: 1_000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    recordedCost: 0.01,
    generationId: "gen-abc123",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("verifyOpenRouterUsage", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("skips when generationId is missing", async () => {
    const result = await verifyOpenRouterUsage(makeRecord({ generationId: undefined }), "token");
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_generation_id");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips when authToken is empty", async () => {
    const result = await verifyOpenRouterUsage(makeRecord(), "");
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_openrouter_token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok when recorded cost matches actual total_cost within tolerance", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "gen-abc123", total_cost: 0.01 } }), {
        status: 200,
      }),
    );

    const result = await verifyOpenRouterUsage(makeRecord(), "or-tok");
    expect(result.status).toBe("ok");
    expect(result.actual).toBe(0.01);
    expect(result.delta).toBe(0);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://openrouter.ai/api/v1/generation?id=gen-abc123"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer or-tok" }),
      }),
    );
  });

  it("returns delta when recorded cost diverges beyond 1%", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "gen-abc123", total_cost: 0.02 } }), {
        status: 200,
      }),
    );

    const result = await verifyOpenRouterUsage(makeRecord({ recordedCost: 0.01 }), "or-tok");
    expect(result.status).toBe("delta");
    expect(result.actual).toBe(0.02);
    expect(result.delta).toBeCloseTo(-0.01, 9);
  });

  it("returns error when the endpoint returns non-OK", async () => {
    fetchSpy.mockResolvedValue(new Response("forbidden", { status: 403 }));
    const result = await verifyOpenRouterUsage(makeRecord(), "or-tok");
    expect(result.status).toBe("error");
    expect(result.reason).toBe("openrouter_403");
  });

  it("returns error when response omits total_cost", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "gen-abc123" } }), { status: 200 }),
    );
    const result = await verifyOpenRouterUsage(makeRecord(), "or-tok");
    expect(result.status).toBe("error");
    expect(result.reason).toBe("no_total_cost_in_response");
  });
});
