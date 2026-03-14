import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/analytics/trends", () => ({
  detectSpikes: vi.fn(() => []),
  formatTrendChart: vi.fn(() => ""),
  getDailyTrend: vi.fn(() => []),
  getTaskTypeTrend: vi.fn(() => []),
  getWowChange: vi.fn(() => ({ changePercent: null })),
}));

import { buildTrendSummary } from "../../../src/ui/commands/trend";

describe("buildTrendSummary", () => {
  it("should be a function", () => {
    expect(typeof buildTrendSummary).toBe("function");
  });

  it("should return a string", () => {
    const result = buildTrendSummary();
    expect(typeof result).toBe("string");
  });

  it("includes TOKEN MIX section", () => {
    const result = buildTrendSummary();

    expect(result).toContain("TOKEN MIX");
  });

  it("renders task-type ratios and zero values as dashes", async () => {
    const trends = await import("../../../src/analytics/trends");
    vi.mocked(trends.getTaskTypeTrend).mockReturnValue([
      {
        date: "2026-03-14",
        thinkPct: 45,
        chatPct: 30,
        codePct: 25,
      },
      {
        date: "2026-03-13",
        thinkPct: 0,
        chatPct: 0,
        codePct: 0,
      },
    ]);

    const result = buildTrendSummary();

    expect(result).toContain("  2026-03-14  🧠 45%  💬 30%  ⌨️ 25%");
    expect(result).toContain("  2026-03-13  🧠   —  💬   —  ⌨️   —");
  });
});
