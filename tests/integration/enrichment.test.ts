import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EnrichmentConfig } from "../../src/enrichment/resolver";
import { resolveEnrichment } from "../../src/enrichment/resolver";

vi.mock("../../src/enrichment/auth", () => ({
  readAuthJson: () => null,
  readAuthToken: () => undefined,
}));

const originalEnv = { ...process.env };

describe("enrichment resolver integration", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("off mode returns empty array without calling fetch", async () => {
    const config: EnrichmentConfig = { mode: "off" };

    const results = await resolveEnrichment(config);

    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("manual mode returns quota from config without calling fetch", async () => {
    const config: EnrichmentConfig = {
      mode: "manual",
      providers: {
        anthropic: { budget: 1_000_000, unit: "tokens", period: "monthly" },
      },
    };

    const results = await resolveEnrichment(config);

    expect(results).toEqual([
      {
        provider: "anthropic",
        quota: {
          provider: "anthropic",
          used: 0,
          limit: 1_000_000,
          unit: "tokens",
        },
        source: "manual",
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("auto mode calls fetch and returns results", async () => {
    process.env.OPENAI_API_KEY = "openai-test-token";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ total_tokens: 150_000, refreshes_at: 1_717_171_717_000 }), {
        status: 200,
        headers: {
          "x-ratelimit-limit-tokens": "1000000",
        },
      }),
    );

    const results = await resolveEnrichment({ mode: "auto" });

    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/organization/usage/completions", {
      headers: {
        Authorization: "Bearer openai-test-token",
      },
    });
    expect(results).toEqual([
      {
        provider: "openai",
        quota: {
          provider: "openai",
          used: 150_000,
          limit: 1_000_000,
          unit: "tokens",
          tier: "tier_2",
          refreshesAt: 1_717_171_717_000,
        },
        source: "auto",
      },
    ]);
  });
});
