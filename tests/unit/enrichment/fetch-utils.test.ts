import { describe, expect, it, vi } from "vitest";

import {
  isRecord,
  parseUsageBody,
  readFiniteNumber,
  safeFetch,
} from "../../../src/enrichment/fetch-utils";

describe("fetch-utils", () => {
  it("isRecord returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("isRecord returns false for non-objects", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it("readFiniteNumber returns number for valid input", () => {
    expect(readFiniteNumber(42)).toBe(42);
    expect(readFiniteNumber("100")).toBe(100);
  });

  it("readFiniteNumber returns undefined for invalid input", () => {
    expect(readFiniteNumber(null)).toBeUndefined();
    expect(readFiniteNumber(Infinity)).toBeUndefined();
    expect(readFiniteNumber("abc")).toBeUndefined();
  });

  it("parseUsageBody returns a usage body for records", () => {
    expect(parseUsageBody({ used_tokens: 10 })).toEqual({ used_tokens: 10 });
  });

  it("parseUsageBody returns null for non-record values", () => {
    expect(parseUsageBody(null)).toBeNull();
    expect(parseUsageBody("invalid")).toBeNull();
  });

  it("safeFetch returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));

    await expect(safeFetch("http://invalid-url")).resolves.toBeNull();

    vi.unstubAllGlobals();
  });

  it("safeFetch returns null on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );

    await expect(safeFetch("http://example.com")).resolves.toBeNull();

    vi.unstubAllGlobals();
  });

  it("safeFetch returns parsed JSON on success", async () => {
    const mockData = { tokens: 100 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }));

    await expect(safeFetch("http://example.com")).resolves.toEqual(mockData);

    vi.unstubAllGlobals();
  });
});
