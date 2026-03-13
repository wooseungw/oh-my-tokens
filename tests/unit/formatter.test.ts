import { describe, expect, it } from "vitest";

import { formatTokens } from "../../src/ui/formatter";

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
});
