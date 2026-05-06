import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { estimateCost, lookupPricing, normalizePricingProvider } from "../../src/analytics/pricing";
import {
  loadPricingCatalog,
  resetPricingCatalogForTest,
} from "../../src/analytics/pricing-catalog";

describe("pricing lookup", () => {
  it("returns pricing for an exact model match", () => {
    expect(lookupPricing("gpt-4o")).toEqual({ inputPer1M: 2.5, outputPer1M: 10 });
  });

  it("returns pricing for prefix-compatible model ids", () => {
    expect(lookupPricing("claude-sonnet-4")).toEqual({ inputPer1M: 3, outputPer1M: 15 });
    expect(lookupPricing("gpt-4o-mini-2026-01-01")).toEqual({ inputPer1M: 0.15, outputPer1M: 0.6 });
  });

  it("falls back to bundled models.dev catalog when the static table misses", async () => {
    resetPricingCatalogForTest();
    const previous = process.env.OMT_PRICING_OFFLINE;
    process.env.OMT_PRICING_OFFLINE = "1";
    await loadPricingCatalog();
    const pricing = lookupPricing("claude-sonnet-4-5-20250929", "anthropic");
    expect(pricing).not.toBeNull();
    expect(pricing?.inputPer1M).toBe(3);
    expect(pricing?.outputPer1M).toBe(15);
    expect(pricing?.cacheReadPer1M).toBe(0.3);
    expect(pricing?.cacheWritePer1M).toBe(3.75);
    if (previous === undefined) {
      delete process.env.OMT_PRICING_OFFLINE;
    } else {
      process.env.OMT_PRICING_OFFLINE = previous;
    }
    resetPricingCatalogForTest();
  });

  it("returns null for genuinely unknown models", () => {
    expect(lookupPricing("completely-made-up-model-xyz-qqq")).toBeNull();
  });
});

describe("estimateCost", () => {
  it("calculates token costs from pricing data", () => {
    expect(estimateCost("gpt-4o", 2_000_000, 500_000)).toBe(10);
  });

  it("returns null when pricing is unavailable", () => {
    expect(estimateCost("completely-made-up-model-xyz-qqq", 1_000, 1_000)).toBeNull();
  });

  it("applies cache_read and cache_write rates from catalog pricing", async () => {
    resetPricingCatalogForTest();
    const previous = process.env.OMT_PRICING_OFFLINE;
    process.env.OMT_PRICING_OFFLINE = "1";
    await loadPricingCatalog();

    const input = 200_000;
    const cacheRead = 50_000;
    const cacheWrite = 10_000;
    const output = 5_000;
    const cost = estimateCost(
      "claude-sonnet-4-5-20250929",
      input,
      output,
      cacheRead,
      cacheWrite,
      "anthropic",
    );
    const regularInput = input - cacheRead;
    const expected =
      (regularInput * 3) / 1_000_000 +
      (cacheRead * 0.3) / 1_000_000 +
      (cacheWrite * 3.75) / 1_000_000 +
      (output * 15) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 9);

    if (previous === undefined) {
      delete process.env.OMT_PRICING_OFFLINE;
    } else {
      process.env.OMT_PRICING_OFFLINE = previous;
    }
    resetPricingCatalogForTest();
  });

  it("defaults cache_read rate to input rate when catalog/table does not publish it", () => {
    // gpt-4o static pricing has no cache_read — falls back to input rate.
    const cost = estimateCost("gpt-4o", 100_000, 10_000, 20_000, 0);
    const expected = (100_000 * 2.5) / 1_000_000 + (10_000 * 10) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 9);
  });

  it("defaults cache_write rate to input rate when cache_write pricing is absent", () => {
    const cost = estimateCost("gpt-4o", 10_000, 1_000, 0, 5_000);
    const expected =
      (10_000 * 2.5) / 1_000_000 + (5_000 * 2.5) / 1_000_000 + (1_000 * 10) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 9);
  });
});

describe("normalizePricingProvider", () => {
  it("keeps github-copilot as its own provider (no fold into openai)", () => {
    // The prior copilot → openai alias was wrong — models.dev publishes copilot pricing
    // as its own provider (0 per-token, subscription-based), not OpenAI's rates.
    expect(normalizePricingProvider("copilot", "gpt-4o")).toBe("github-copilot");
    expect(normalizePricingProvider("github-copilot", "gpt-4o")).toBe("github-copilot");
    expect(normalizePricingProvider("copilot-chat", "gpt-4o")).toBe("github-copilot");
  });

  it("treats first-class provider ids as authoritative (no model-id re-routing)", () => {
    expect(normalizePricingProvider("OpenAI", "gpt-4o")).toBe("openai");
    // openrouter is first-class — do not fold to google just because model is gemini.
    expect(normalizePricingProvider("openrouter", "gemini-2.5-pro")).toBe("openrouter");
    // Unknown provider id + recognizable model id → infer from model.
    expect(normalizePricingProvider("unknown-thing", "gemini-2.5-pro")).toBe("google");
  });

  it("falls back to 'unknown' when neither provider nor model is recognizable", () => {
    expect(normalizePricingProvider("", "")).toBe("unknown");
  });
});

describe("pricing catalog loader", () => {
  let priorOffline: string | undefined;
  let priorUrl: string | undefined;

  beforeEach(() => {
    priorOffline = process.env.OMT_PRICING_OFFLINE;
    priorUrl = process.env.OMT_PRICING_URL;
    resetPricingCatalogForTest();
  });

  afterEach(() => {
    if (priorOffline === undefined) {
      delete process.env.OMT_PRICING_OFFLINE;
    } else {
      process.env.OMT_PRICING_OFFLINE = priorOffline;
    }
    if (priorUrl === undefined) {
      delete process.env.OMT_PRICING_URL;
    } else {
      process.env.OMT_PRICING_URL = priorUrl;
    }
    resetPricingCatalogForTest();
  });

  it("returns bundled catalog when OMT_PRICING_OFFLINE=1", async () => {
    process.env.OMT_PRICING_OFFLINE = "1";
    const catalog = await loadPricingCatalog();
    expect(catalog.providers.anthropic).toBeDefined();
    expect(Object.keys(catalog.providers).length).toBeGreaterThan(50);
  });

  it("does not throw when OMT_PRICING_URL is unreachable", async () => {
    process.env.OMT_PRICING_URL = "http://127.0.0.1:1/definitely-not-listening/models.json";
    const catalog = await loadPricingCatalog({ refresh: true });
    // No exception escapes; we still get a usable catalog (disk cache or bundled fallback).
    expect(catalog.providers).toBeDefined();
    expect(Object.keys(catalog.providers).length).toBeGreaterThan(0);
  });
});
