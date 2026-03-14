import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/analytics/budget", () => ({
  checkBudget: vi.fn(() => []),
  formatBudgetAlert: vi.fn(() => null),
  getBudgetConfig: vi.fn(() => ({})),
}));

vi.mock("../../../src/analytics/quota", () => ({
  getLiveProviders: vi.fn(() => []),
  getLiveQuota: vi.fn(() => null),
}));

vi.mock("../../../src/config/reader", () => ({
  getUnitSetting: vi.fn(() => "tokens"),
}));

import { getUnitSetting } from "../../../src/config/reader";
import type { RollupRow } from "../../../src/storage/rollup";
import { buildTodaySummary } from "../../../src/ui/commands/today";

describe("buildTodaySummary", () => {
  it("should be a function", () => {
    expect(typeof buildTodaySummary).toBe("function");
  });

  it("should return a string", () => {
    const rows: RollupRow[] = [];
    const result = buildTodaySummary(rows, false);
    expect(typeof result).toBe("string");
  });

  it("should contain Today section header", () => {
    const rows: RollupRow[] = [];
    const result = buildTodaySummary(rows, false);
    expect(result).toContain("Today");
  });

  it("shows cost when unit=cost", () => {
    vi.mocked(getUnitSetting).mockReturnValue("cost");

    const rows: RollupRow[] = [
      {
        date: "2026-03-14",
        kind: "provider",
        name: "anthropic",
        inp: 1_000,
        out: 500,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 1.5,
        count: 1,
      },
    ];

    const result = buildTodaySummary(rows, false);
    expect(result).toContain("$1.50");
    expect(result).not.toContain(" tok");
  });
});
