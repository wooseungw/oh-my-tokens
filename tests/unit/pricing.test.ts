import { describe, expect, it } from "vitest";

import { estimateCost, lookupPricing, normalizePricingProvider } from "../../src/analytics/pricing";

describe("pricing lookup", () => {
  it("returns pricing for an exact model match", () => {
    expect(lookupPricing("gpt-4o")).toEqual({ inputPer1M: 2.5, outputPer1M: 10 });
  });

  it("returns pricing for prefix-compatible model ids", () => {
    expect(lookupPricing("claude-sonnet-4")).toEqual({ inputPer1M: 3, outputPer1M: 15 });
    expect(lookupPricing("gpt-4o-mini-2026-01-01")).toEqual({ inputPer1M: 0.15, outputPer1M: 0.6 });
  });

  it("returns null for unknown models", () => {
    expect(lookupPricing("unknown-model")).toBeNull();
  });
});

describe("estimateCost", () => {
  it("calculates token costs from pricing data", () => {
    expect(estimateCost("gpt-4o", 2_000_000, 500_000)).toBe(10);
  });

  it("returns null when pricing is unavailable", () => {
    expect(estimateCost("unknown-model", 1_000, 1_000)).toBeNull();
  });
});

describe("normalizePricingProvider", () => {
  it("maps copilot aliases to openai", () => {
    expect(normalizePricingProvider("copilot", "gpt-4o")).toBe("openai");
    expect(normalizePricingProvider("github-copilot", "gpt-4o")).toBe("openai");
  });

  it("normalizes standard providers and infers from model ids", () => {
    expect(normalizePricingProvider("OpenAI", "gpt-4o")).toBe("openai");
    expect(normalizePricingProvider("openrouter", "gemini-2.5-pro")).toBe("google");
  });
});
