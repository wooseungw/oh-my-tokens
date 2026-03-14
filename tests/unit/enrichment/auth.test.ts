import { describe, expect, it } from "vitest";

import { getAuthJsonCandidatePaths, readAuthToken } from "../../../src/enrichment/auth";

describe("auth utilities", () => {
  it("getAuthJsonCandidatePaths returns an array", () => {
    const paths = getAuthJsonCandidatePaths();

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("readAuthToken returns null for unknown provider", () => {
    expect(readAuthToken("nonexistent-provider-xyz")).toBeNull();
  });
});
