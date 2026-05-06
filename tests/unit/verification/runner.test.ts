import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageRecord } from "../../../src/providers/types";
import { shouldVerify, verifyRecords } from "../../../src/verification/runner";

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    provider: "openrouter",
    model: "google/gemini-2.5-pro",
    inputTokens: 1_000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    recordedCost: 0.01,
    generationId: "gen-1",
    timestamp: 1_700_000_000,
    ...overrides,
  };
}

describe("shouldVerify", () => {
  it("returns true for mode 'all' regardless of random", () => {
    expect(shouldVerify("all", 0)).toBe(true);
    expect(shouldVerify("all", 0.5)).toBe(true);
    expect(shouldVerify("all", 0.99)).toBe(true);
  });

  it("returns true for mode 'sample' when random < 0.1", () => {
    expect(shouldVerify("sample", 0.05)).toBe(true);
    expect(shouldVerify("sample", 0.09999)).toBe(true);
  });

  it("returns false for mode 'sample' when random >= 0.1", () => {
    expect(shouldVerify("sample", 0.1)).toBe(false);
    expect(shouldVerify("sample", 0.5)).toBe(false);
  });

  it("returns false for mode 'off'", () => {
    expect(shouldVerify("off", 0)).toBe(false);
    expect(shouldVerify("off", 0.99)).toBe(false);
  });
});

describe("verifyRecords", () => {
  const originalEnv = { ...process.env };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENROUTER_API_KEY = "or-test";
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fetchSpy.mockRestore();
  });

  it("skips every record when verify mode is 'off' for that provider", async () => {
    const report = await verifyRecords({
      sessionId: "s1",
      records: [makeRecord()],
      configSnapshot: { providers: { openrouter: { verify: "off" } } },
    });
    expect(report.items).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("verifies every record when verify mode is 'all'", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { id: "gen-1", total_cost: 0.01 } }), { status: 200 }),
      ),
    );
    const report = await verifyRecords({
      sessionId: "s1",
      records: [makeRecord(), makeRecord({ generationId: "gen-2" })],
      configSnapshot: { providers: { openrouter: { verify: "all" } } },
    });
    expect(report.items).toHaveLength(2);
    expect(report.summary.ok).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("uses the random source to make sample decisions deterministic", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { id: "gen-1", total_cost: 0.01 } }), { status: 200 }),
      ),
    );
    let callCount = 0;
    const randomSource = () => {
      const values = [0.05, 0.2, 0.09, 0.5];
      return values[callCount++ % values.length] ?? 0;
    };
    const report = await verifyRecords({
      sessionId: "s1",
      records: [
        makeRecord({ generationId: "g1" }),
        makeRecord({ generationId: "g2" }),
        makeRecord({ generationId: "g3" }),
        makeRecord({ generationId: "g4" }),
      ],
      configSnapshot: { providers: { openrouter: { verify: "sample" } } },
      randomSource,
    });
    expect(report.items).toHaveLength(2);
  });

  it("marks providers without verifyUsage as 'skipped/no_verifier_for_provider'", async () => {
    const report = await verifyRecords({
      sessionId: "s1",
      records: [makeRecord({ provider: "groq", generationId: "gr-1" })],
      configSnapshot: { providers: { groq: { verify: "all" } } },
    });
    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.result.status).toBe("skipped");
    expect(report.items[0]?.result.reason).toBe("no_verifier_for_provider");
  });
});
