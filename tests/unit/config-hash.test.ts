import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock, queryOneMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  queryOneMock: vi.fn(),
}));

vi.mock("../../src/storage/db", () => ({
  execute: executeMock,
  queryOne: queryOneMock,
}));

const originalEnv = { ...process.env };

describe("config hash", () => {
  beforeEach(() => {
    executeMock.mockReset();
    queryOneMock.mockReset();
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("returns a stable hash for the same environment", async () => {
    const { computeConfigHash } = await import("../../src/tracking/config-hash");

    expect(computeConfigHash()).toBe(computeConfigHash());
  });

  it("changes when tracked env var presence changes", async () => {
    const { computeConfigHash } = await import("../../src/tracking/config-hash");
    const before = computeConfigHash();

    process.env.OPENAI_API_KEY = "sk-test";

    expect(computeConfigHash()).not.toBe(before);
  });

  it("stores a new hash when configuration changes", async () => {
    const { computeConfigHash, hasConfigChanged } = await import("../../src/tracking/config-hash");
    queryOneMock.mockReturnValue({ value: null });

    const currentHash = computeConfigHash();

    expect(hasConfigChanged()).toBe(true);
    expect(queryOneMock).toHaveBeenCalledWith(
      "SELECT value FROM state WHERE key = ?",
      "config_hash",
    );
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO state"),
      "config_hash",
      currentHash,
    );
  });

  it("returns false when the stored hash matches", async () => {
    const { computeConfigHash, hasConfigChanged } = await import("../../src/tracking/config-hash");
    queryOneMock.mockReturnValue({ value: computeConfigHash() });

    expect(hasConfigChanged()).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
