import { afterEach, describe, expect, it } from "vitest";

import {
  KNOWN_PLANS,
  getConfiguredProviderNames,
  getResolvedProviderConfig,
  hasAnyProviderLimits,
  lookupPlan,
  setProviderConfigs,
} from "../../src/analytics/plans";

describe("lookupPlan", () => {
  it("returns preset for a known plan id", () => {
    const plan = lookupPlan("claude-max-5");
    expect(plan).not.toBeNull();
    expect(plan?.displayName).toBe("Claude Max 5");
    expect(plan?.provider).toBe("anthropic");
    expect(plan?.monthlyTokens).toBe(100_000_000);
  });

  it("returns null for an unknown plan id", () => {
    expect(lookupPlan("does-not-exist")).toBeNull();
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(lookupPlan("  Claude-Max-5  ")).not.toBeNull();
    expect(lookupPlan("CHATGPT-PLUS")).not.toBeNull();
  });

  it("covers all 9 providers in KNOWN_PLANS", () => {
    const providers = new Set(KNOWN_PLANS.map((p) => p.provider));
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("copilot");
    expect(providers).toContain("google");
    expect(providers).toContain("xai");
    expect(providers).toContain("groq");
    expect(providers).toContain("perplexity");
    expect(providers).toContain("mistral");
    expect(providers).toContain("deepseek");
  });
});

describe("setProviderConfigs / hasAnyProviderLimits / getConfiguredProviderNames", () => {
  afterEach(() => {
    setProviderConfigs({});
  });

  it("hasAnyProviderLimits returns false when no config set", () => {
    setProviderConfigs({});
    expect(hasAnyProviderLimits()).toBe(false);
  });

  it("hasAnyProviderLimits returns true when at least one provider configured", () => {
    setProviderConfigs({ anthropic: { plan: "claude-pro" } });
    expect(hasAnyProviderLimits()).toBe(true);
  });

  it("getConfiguredProviderNames returns all configured provider keys", () => {
    setProviderConfigs({
      anthropic: { plan: "claude-pro" },
      openai: { limits: { daily: 5_000_000 } },
    });
    const names = getConfiguredProviderNames();
    expect(names).toContain("anthropic");
    expect(names).toContain("openai");
    expect(names).toHaveLength(2);
  });
});

describe("getResolvedProviderConfig", () => {
  afterEach(() => {
    setProviderConfigs({});
  });

  it("returns empty limits and null planDisplayName when provider not configured", () => {
    setProviderConfigs({});
    const result = getResolvedProviderConfig("anthropic");
    expect(result.planDisplayName).toBeNull();
    expect(result.limits).toEqual({});
  });

  it("uses plan preset monthlyTokens as monthly limit when only plan is set", () => {
    setProviderConfigs({ anthropic: { plan: "claude-max-5" } });
    const result = getResolvedProviderConfig("anthropic");
    expect(result.planDisplayName).toBe("Claude Max 5");
    expect(result.limits.monthly).toBe(100_000_000);
    expect(result.limits.hourly).toBeUndefined();
    expect(result.limits.daily).toBeUndefined();
    expect(result.limits.weekly).toBeUndefined();
  });

  it("explicit monthly limit overrides plan preset but planDisplayName still resolves", () => {
    setProviderConfigs({
      anthropic: {
        plan: "claude-max-5",
        limits: { monthly: 50_000_000 },
      },
    });
    const result = getResolvedProviderConfig("anthropic");
    expect(result.planDisplayName).toBe("Claude Max 5");
    expect(result.limits.monthly).toBe(50_000_000);
  });

  it("explicit hourly/daily limits combine with plan preset monthly when monthly not overridden", () => {
    setProviderConfigs({
      anthropic: {
        plan: "claude-max-5",
        limits: { hourly: 10_000_000, daily: 80_000_000 },
      },
    });
    const result = getResolvedProviderConfig("anthropic");
    expect(result.limits.hourly).toBe(10_000_000);
    expect(result.limits.daily).toBe(80_000_000);
    expect(result.limits.monthly).toBe(100_000_000);
  });

  it("explicit-only limits (no plan) work without a planDisplayName", () => {
    setProviderConfigs({
      openai: { limits: { daily: 20_000_000 } },
    });
    const result = getResolvedProviderConfig("openai");
    expect(result.planDisplayName).toBeNull();
    expect(result.limits.daily).toBe(20_000_000);
    expect(result.limits.monthly).toBeUndefined();
  });

  it("lookup is case-insensitive for provider name", () => {
    setProviderConfigs({ anthropic: { plan: "claude-pro" } });
    const result = getResolvedProviderConfig("ANTHROPIC");
    expect(result.planDisplayName).toBe("Claude Pro");
  });

  it("unknown plan id returns null planDisplayName and no limits", () => {
    setProviderConfigs({ anthropic: { plan: "nonexistent-plan" } });
    const result = getResolvedProviderConfig("anthropic");
    expect(result.planDisplayName).toBeNull();
    expect(result.limits).toEqual({});
  });

  it("all four explicit limit windows are preserved", () => {
    const limits = { hourly: 1_000, daily: 5_000, weekly: 30_000, monthly: 120_000 };
    setProviderConfigs({ groq: { limits } });
    const result = getResolvedProviderConfig("groq");
    expect(result.limits).toEqual(limits);
  });
});
