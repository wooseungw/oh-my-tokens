import { describe, expect, it } from "vitest";

import { extractAllProviderConfigs, extractPerProviderConfig } from "../../../src/config/reader";

describe("per-provider config", () => {
  it("returns defaults when providers section is absent", () => {
    expect(extractPerProviderConfig({}, "anthropic")).toEqual({
      enrichment: true,
      verify: "off",
    });
  });

  it("returns defaults for a provider not listed in the config", () => {
    const raw = { providers: { anthropic: { verify: "all" } } };
    expect(extractPerProviderConfig(raw, "openai")).toEqual({
      enrichment: true,
      verify: "off",
    });
  });

  it("reads enrichment and verify for a declared provider", () => {
    const raw = {
      providers: {
        openrouter: { enrichment: false, verify: "all" },
        deepseek: { verify: "sample" },
      },
    };
    expect(extractPerProviderConfig(raw, "openrouter")).toEqual({
      enrichment: false,
      verify: "all",
    });
    expect(extractPerProviderConfig(raw, "deepseek")).toEqual({
      enrichment: true,
      verify: "sample",
    });
  });

  it("rejects invalid verify values by falling back to default", () => {
    const raw = { providers: { openrouter: { verify: "invalid-mode" } } };
    expect(extractPerProviderConfig(raw, "openrouter").verify).toBe("off");
  });

  it("extractAllProviderConfigs returns per-provider configs keyed by id", () => {
    const raw = {
      providers: {
        anthropic: { verify: "sample" },
        deepseek: { enrichment: false },
      },
    };
    const all = extractAllProviderConfigs(raw);
    expect(all.anthropic).toEqual({ enrichment: true, verify: "sample" });
    expect(all.deepseek).toEqual({ enrichment: false, verify: "off" });
  });
});
