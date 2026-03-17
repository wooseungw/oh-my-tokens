import { describe, expect, it } from "vitest";

import { formatCost, formatTokens } from "../../src/ui/formatter";

describe("formatTokens", () => {
  it("returns small values as-is", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(820)).toBe("820");
  });

  it("formats thousands with one decimal place", () => {
    expect(formatTokens(1_000)).toBe("1.0K");
    expect(formatTokens(1_800)).toBe("1.8K");
  });

  it("formats millions with one decimal place", () => {
    expect(formatTokens(1_200_000)).toBe("1.2M");
  });

  it("formats billions with one decimal place", () => {
    expect(formatTokens(1_500_000_000)).toBe("1.5B");
  });

  it("formats exactly one billion", () => {
    expect(formatTokens(1_000_000_000)).toBe("1.0B");
  });
});

describe("formatCost", () => {
  it("formats zero as $0.00", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats decimal values with two decimal places", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });

  it("rounds to two decimal places", () => {
    expect(formatCost(0.001)).toBe("$0.00");
  });
});
