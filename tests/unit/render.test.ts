import { describe, expect, it, vi } from "vitest";
import {
  BAR_WIDTH,
  buildBar,
  buildProviderQuotaLine,
  buildProviderSectionHeader,
  buildSectionRule,
  formatTimeUntil,
  maxContentWidth,
  padVisualEnd,
  SECTION_WIDTH,
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

describe("buildSectionRule", () => {
  it("returns default-width rule", () => {
    const rule = buildSectionRule();
    expect(rule).toBe("═".repeat(SECTION_WIDTH));
  });
  it("returns custom-width rule", () => {
    expect(buildSectionRule(60)).toBe("═".repeat(60));
  });
});

describe("maxContentWidth", () => {
  it("returns SECTION_WIDTH for short lines", () => {
    expect(maxContentWidth("hi")).toBe(SECTION_WIDTH);
  });
  it("returns longest line width when exceeding SECTION_WIDTH", () => {
    const long = "x".repeat(60);
    expect(maxContentWidth("short", long)).toBe(60);
  });
});

describe("formatTimeUntil", () => {
  it("returns 'now' for past time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = formatTimeUntil("2026-03-15T11:00:00Z");

    expect(result).toBe("now");
    vi.useRealTimers();
  });

  it("returns minutes only when less than 1 hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = formatTimeUntil("2026-03-15T12:30:00Z");

    expect(result).toBe("30m");
    vi.useRealTimers();
  });

  it("returns hours and minutes when 1-24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = formatTimeUntil("2026-03-15T15:45:00Z");

    expect(result).toBe("3h 45m");
    vi.useRealTimers();
  });

  it("returns days and hours when >= 24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = formatTimeUntil("2026-03-17T18:00:00Z");

    expect(result).toBe("2d 6h");
    vi.useRealTimers();
  });

  it("handles exactly 24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = formatTimeUntil("2026-03-16T12:00:00Z");

    expect(result).toBe("1d 0h");
    vi.useRealTimers();
  });

  it("handles exactly 1 hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = formatTimeUntil("2026-03-15T13:00:00Z");

    expect(result).toBe("1h 0m");
    vi.useRealTimers();
  });

  it("handles 0 minutes remaining", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = formatTimeUntil("2026-03-15T12:00:30Z");

    expect(result).toBe("0m");
    vi.useRealTimers();
  });
});

describe("buildProviderQuotaLine", () => {
  it("includes icon and label", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 50);

    expect(result).toContain("⏱");
    expect(result).toContain("5h");
  });

  it("includes percentage used", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 75);

    expect(result).toContain("75%");
  });

  it("includes bar in normal mode", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 50, undefined, false);

    expect(result).toContain("█");
    expect(result).toContain("░");
  });

  it("excludes bar in text mode", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 50, undefined, true);

    expect(result).not.toContain("█");
    expect(result).not.toContain("░");
  });

  it("includes reset time when provided", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = buildProviderQuotaLine("⏱", "5h", 50, "2026-03-15T13:00:00Z");

    expect(result).toContain("resets");
    expect(result).toContain("1h");
    vi.useRealTimers();
  });

  it("excludes reset time when not provided", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 50);

    expect(result).not.toContain("resets");
  });

  it("includes [live] marker", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 50);

    expect(result).toContain("[live]");
  });

  it("includes 'used' text in text mode", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 50, undefined, true);

    expect(result).toContain("used");
  });

  it("pads percentage to 4 characters", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 5);

    expect(result).toContain("   5%");
  });

  it("handles 100% usage", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 100);

    expect(result).toContain("100%");
  });

  it("handles 0% usage", () => {
    const result = buildProviderQuotaLine("⏱", "5h", 0);

    expect(result).toContain("  0%");
  });

  it("combines reset time with text mode", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const result = buildProviderQuotaLine("⏱", "5h", 50, "2026-03-15T14:30:00Z", true);

    expect(result).toContain("used");
    expect(result).toContain("resets");
    expect(result).toContain("2h 30m");
    vi.useRealTimers();
  });
});
