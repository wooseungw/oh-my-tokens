import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { existsSyncMock, readFileSyncMock, homedirMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(target: string) => boolean>(() => false),
  readFileSyncMock: vi.fn<(target: string, encoding: BufferEncoding) => string>(),
  homedirMock: vi.fn(() => "/home/tester"),
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

vi.mock("node:os", () => ({
  homedir: homedirMock,
}));

const originalEnv = { ...process.env };

async function loadResolverModule() {
  vi.resetModules();
  return import("../../src/enrichment/resolver");
}

describe("resolveEnrichment", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockReset();
    homedirMock.mockReset();
    homedirMock.mockReturnValue("/home/tester");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns an empty list when enrichment is off", async () => {
    const { resolveEnrichment } = await loadResolverModule();

    await expect(resolveEnrichment({ mode: "off" })).resolves.toEqual([]);
  });

  it("converts manual provider budgets into quota objects", async () => {
    const { resolveEnrichment } = await loadResolverModule();

    await expect(
      resolveEnrichment({
        mode: "manual",
        providers: {
          anthropic: { budget: 500_000, unit: "tokens", period: "day" },
          copilot: { budget: 300, unit: "requests", period: "month" },
        },
      }),
    ).resolves.toEqual([
      {
        provider: "anthropic",
        quota: {
          provider: "anthropic",
          used: 0,
          limit: 500_000,
          unit: "tokens",
        },
        source: "manual",
      },
      {
        provider: "copilot",
        quota: {
          provider: "copilot",
          used: 0,
          limit: 300,
          unit: "requests",
        },
        source: "manual",
      },
    ]);
  });

  it("fetches quotas in auto mode from available provider tokens", async () => {
    process.env.OPENAI_API_KEY = "openai-test-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ total_tokens: 12_345, refreshes_at: 1_717_171_717_000 }), {
        status: 200,
        headers: {
          "x-ratelimit-limit-tokens": "1000000",
        },
      }),
    );

    const { resolveEnrichment } = await loadResolverModule();

    await expect(resolveEnrichment({ mode: "auto" })).resolves.toEqual([
      {
        provider: "openai",
        quota: {
          provider: "openai",
          used: 12_345,
          limit: 1_000_000,
          unit: "tokens",
          tier: "tier_2",
          refreshesAt: 1_717_171_717_000,
        },
        source: "auto",
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.openai.com/v1/organization/usage/completions",
      {
        headers: {
          Authorization: "Bearer openai-test-token",
        },
      },
    );
  });

  it("falls back from opencode-quota mode to auto mode", async () => {
    process.env.OPENAI_API_KEY = "openai-test-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ total_tokens: 500 }), {
        status: 200,
        headers: {
          "x-ratelimit-limit-tokens": "500000",
        },
      }),
    );

    const { resolveEnrichment } = await loadResolverModule();

    await expect(resolveEnrichment({ mode: "opencode-quota" })).resolves.toEqual([
      {
        provider: "openai",
        quota: {
          provider: "openai",
          used: 500,
          limit: 500_000,
          unit: "tokens",
          tier: "tier_2",
          refreshesAt: undefined,
        },
        source: "auto",
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
