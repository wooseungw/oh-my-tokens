import { describe, expect, it } from "vitest";

import { normalizeDisplayProvider } from "../../src/tracking/normalizer";

describe("normalizeDisplayProvider", () => {
  it("normalizes known provider aliases", () => {
    expect(normalizeDisplayProvider("github-copilot", "claude-sonnet-4")).toBe("copilot");
    expect(normalizeDisplayProvider("copilot-chat", "gpt-4o")).toBe("copilot");
    expect(normalizeDisplayProvider("vertexai", "gemini-2.5-pro")).toBe("google");
  });

  it("normalizes standard providers to lowercase", () => {
    expect(normalizeDisplayProvider("OpenAI", "gpt-4.1")).toBe("openai");
    expect(normalizeDisplayProvider("LOCAL", "llama3.2")).toBe("local");
  });

  it("infers providers from bare model prefixes", () => {
    expect(normalizeDisplayProvider(undefined, "claude-sonnet-4")).toBe("anthropic");
    expect(normalizeDisplayProvider(undefined, "gpt-4.1-mini")).toBe("openai");
    expect(normalizeDisplayProvider(undefined, "o3-mini")).toBe("openai");
    expect(normalizeDisplayProvider(undefined, "o4-mini")).toBe("openai");
    expect(normalizeDisplayProvider(undefined, "gemini-2.5-flash")).toBe("google");
    expect(normalizeDisplayProvider(undefined, "grok-3-beta")).toBe("xai");
  });

  it("infers providers from provider-prefixed model ids", () => {
    expect(normalizeDisplayProvider(undefined, "anthropic/claude-sonnet-4")).toBe("anthropic");
    expect(normalizeDisplayProvider("openrouter", "google/gemini-2.5-pro")).toBe("google");
  });

  it("falls back to the original provider id or unknown", () => {
    expect(normalizeDisplayProvider("my-proxy-1", "custom-model")).toBe("my-proxy-1");
    expect(normalizeDisplayProvider(undefined, undefined)).toBe("unknown");
  });
});
