import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/analytics/trends", () => ({
  detectSpikes: vi.fn(() => []),
  formatTrendChart: vi.fn(() => ""),
  getDailyTrend: vi.fn(() => []),
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
});
