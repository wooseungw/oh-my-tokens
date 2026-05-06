import { describe, expect, it } from "vitest";

import {
  ALL_PROVIDERS,
  genericFallback,
  getProvider,
  listAuthKeysForProvider,
  listProviderIds,
} from "../../../src/providers/registry";

describe("provider registry", () => {
  it("registers every first-class provider id from the v1 plan", () => {
    const ids = new Set(listProviderIds());
    const expected = [
      "anthropic",
      "openai",
      "github-copilot",
      "gemini",
      "google",
      "openrouter",
      "groq",
      "xai",
      "deepseek",
      "mistral",
      "perplexity",
      "amazon-bedrock",
      "azure",
      "vercel",
      "ollama",
      "lmstudio",
    ];
    for (const id of expected) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("getProvider resolves aliases to canonical ids", () => {
    expect(getProvider("copilot").id).toBe("github-copilot");
    expect(getProvider("COPILOT").id).toBe("github-copilot");
    expect(getProvider("copilot-chat").id).toBe("github-copilot");
    expect(getProvider("vertexai").id).toBe("google");
    expect(getProvider("google-vertex").id).toBe("google");
    expect(getProvider("bedrock").id).toBe("amazon-bedrock");
  });

  it("getProvider returns the generic fallback for unknown ids", () => {
    expect(getProvider("completely-unknown-xyz").id).toBe(genericFallback.id);
    expect(getProvider("").id).toBe(genericFallback.id);
    expect(getProvider(undefined).id).toBe(genericFallback.id);
  });

  it("every registered provider declares a verification tier", () => {
    for (const spec of Object.values(ALL_PROVIDERS)) {
      expect(spec.tier).toMatch(/^(response|provider-api|subscription|local|unverifiable)$/);
    }
  });

  it("providers with fetchQuota declare at least one auth key", () => {
    for (const spec of Object.values(ALL_PROVIDERS)) {
      if (typeof spec.fetchQuota !== "function") continue;
      expect(spec.authKeys.length).toBeGreaterThan(0);
    }
  });

  it("local-tier providers have no auth keys and zero-cost estimate", () => {
    for (const spec of Object.values(ALL_PROVIDERS)) {
      if (spec.tier !== "local") continue;
      expect(spec.authKeys).toEqual([]);
      const cost = spec.estimateCost?.(
        {
          provider: spec.id,
          model: "any",
          inputTokens: 999,
          outputTokens: 999,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        null,
      );
      expect(cost).toBe(0);
    }
  });

  it("listAuthKeysForProvider resolves via registry for canonical + alias ids", () => {
    expect(listAuthKeysForProvider("anthropic")).toContain("ANTHROPIC_API_KEY");
    expect(listAuthKeysForProvider("copilot")).toContain("GITHUB_TOKEN");
    expect(listAuthKeysForProvider("deepseek")).toContain("DEEPSEEK_API_KEY");
    expect(listAuthKeysForProvider("groq")).toContain("GROQ_API_KEY");
  });
});
