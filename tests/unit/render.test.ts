import { describe, expect, it } from "vitest";
import {
  BAR_WIDTH,
  buildBar,
  buildProviderSectionHeader,
  padVisualEnd,
  SECTION_RULE,
  visualWidth,
} from "../../src/ui/render";

describe("buildBar", () => {
  it("fills 8 of 16 at 50% (default width)", () => {
    expect(buildBar(50)).toBe("████████░░░░░░░░");
  });
  it("fills 4 of 8 at 50% (width=8)", () => {
    expect(buildBar(50, 8)).toBe("████░░░░");
  });
  it("clamps at 0%", () => {
    expect(buildBar(-10)).toBe("░".repeat(BAR_WIDTH));
  });
  it("clamps at 100%", () => {
    expect(buildBar(110)).toBe("█".repeat(BAR_WIDTH));
  });
});

describe("buildProviderSectionHeader", () => {
  it("includes name in header", () => {
    expect(buildProviderSectionHeader("anthropic")).toContain("anthropic");
  });
  it("includes tokLabel when provided", () => {
    expect(buildProviderSectionHeader("openai", "1.2M")).toContain("1.2M");
  });
});

describe("visualWidth", () => {
  it("ASCII string", () => {
    expect(visualWidth("abc")).toBe(3);
  });

  it("emoji counts as 2", () => {
    expect(visualWidth("⏱")).toBe(2);
  });

  it("variation selector ignored", () => {
    expect(visualWidth("⌨️")).toBe(2);
  });

  it("ZWJ ignored", () => {
    expect(visualWidth("a\u200Db")).toBe(2);
  });

  it("CJK counts as 2", () => {
    expect(visualWidth("한")).toBe(2);
  });

  it("empty string", () => {
    expect(visualWidth("")).toBe(0);
  });
});

describe("padVisualEnd", () => {
  it("pads ASCII to target width", () => {
    expect(padVisualEnd("ab", 5)).toBe("ab   ");
  });

  it("pads emoji label to target width", () => {
    const result = padVisualEnd("⏱ hi", 8);
    expect(visualWidth(result)).toBe(8);
  });

  it("no padding when already at target", () => {
    expect(padVisualEnd("abcde", 5)).toBe("abcde");
  });

  it("no padding when wider than target", () => {
    expect(padVisualEnd("abcdef", 5)).toBe("abcdef");
  });
});

describe("SECTION_RULE", () => {
  it("exists and is a non-empty string", () => {
    expect(typeof SECTION_RULE).toBe("string");
    expect(SECTION_RULE.length).toBeGreaterThan(0);
  });
});
