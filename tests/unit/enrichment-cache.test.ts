import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnrichmentCache } from "../../src/enrichment/cache";

describe("EnrichmentCache", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("stores and retrieves values", () => {
    const cache = new EnrichmentCache<number>();

    cache.set("anthropic", 42);

    expect(cache.get("anthropic")).toBe(42);
  });

  it("expires entries after the ttl", () => {
    vi.useFakeTimers();
    const cache = new EnrichmentCache<number>(1_000);

    cache.set("openai", 99);
    vi.advanceTimersByTime(1_001);

    expect(cache.get("openai")).toBeNull();
  });

  it("clears all entries", () => {
    const cache = new EnrichmentCache<number>();

    cache.set("copilot", 7);
    cache.clear();

    expect(cache.get("copilot")).toBeNull();
  });

  it("reports whether a non-expired entry exists", () => {
    vi.useFakeTimers();
    const cache = new EnrichmentCache<number>(500);

    cache.set("gemini", 5);
    expect(cache.has("gemini")).toBe(true);

    vi.advanceTimersByTime(501);

    expect(cache.has("gemini")).toBe(false);
  });
});
