import { normalize } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAuthJsonCandidatePaths, readAuthToken } from "../../../src/enrichment/auth";

describe("auth utilities", () => {
  const originalAppData = process.env.APPDATA;
  const originalLocalAppData = process.env.LOCALAPPDATA;

  beforeEach(() => {
    delete process.env.APPDATA;
    delete process.env.LOCALAPPDATA;
  });

  afterEach(() => {
    if (originalAppData) process.env.APPDATA = originalAppData;
    if (originalLocalAppData) process.env.LOCALAPPDATA = originalLocalAppData;
  });

  it("getAuthJsonCandidatePaths returns an array", () => {
    const paths = getAuthJsonCandidatePaths();

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("getAuthJsonCandidatePaths includes APPDATA path when env var is set", () => {
    const appDataPath = "/tmp/appdata";
    process.env.APPDATA = appDataPath;
    const paths = getAuthJsonCandidatePaths();
    const normalized = normalize(appDataPath);

    expect(paths.some((p) => p.includes(normalized))).toBe(true);
    expect(paths.some((p) => p.includes("opencode"))).toBe(true);
  });

  it("getAuthJsonCandidatePaths excludes APPDATA path when env var is not set", () => {
    const paths = getAuthJsonCandidatePaths();
    const initialLength = paths.length;

    expect(initialLength).toBe(3);
  });

  it("getAuthJsonCandidatePaths includes LOCALAPPDATA path when env var is set", () => {
    const localAppDataPath = "/tmp/localappdata";
    process.env.LOCALAPPDATA = localAppDataPath;
    const paths = getAuthJsonCandidatePaths();
    const normalized = normalize(localAppDataPath);

    expect(paths.some((p) => p.includes(normalized))).toBe(true);
    expect(paths.some((p) => p.includes("opencode"))).toBe(true);
  });

  it("getAuthJsonCandidatePaths excludes LOCALAPPDATA path when env var is not set", () => {
    const paths = getAuthJsonCandidatePaths();
    const initialLength = paths.length;

    expect(initialLength).toBe(3);
  });

  it("readAuthToken returns null for unknown provider", () => {
    expect(readAuthToken("nonexistent-provider-xyz")).toBeNull();
  });
});
