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
    const result = buildTodaySummary(rows, "normal");
    expect(typeof result).toBe("string");
  });

  it("should contain Today section header", () => {
    const rows: RollupRow[] = [];
    const result = buildTodaySummary(rows, "normal");
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

    const result = buildTodaySummary(rows, "text");
    expect(result).toContain("$1.50");
    expect(result).not.toContain(" tok");
  });

  it("shows compact output without breakdown or budget", async () => {
    const budget = await import("../../../src/analytics/budget");
    vi.mocked(budget.getBudgetConfig).mockReturnValue({ daily: 10_000 });
    vi.mocked(budget.checkBudget).mockReturnValue([
      { period: "daily", ratio: 0.5, exceeded: false, used: 5_000, limit: 10_000 },
    ]);

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
        cost: 0,
        count: 1,
      },
    ];

    const result = buildTodaySummary(rows, "compact");

    expect(result).toContain("Σ total");
    expect(result).not.toContain("Breakdown");
    expect(result).not.toContain("Budget");
  });

  it("shows budget only in extend and text modes", async () => {
    const budget = await import("../../../src/analytics/budget");
    vi.mocked(budget.getBudgetConfig).mockReturnValue({ daily: 10_000 });
    vi.mocked(budget.checkBudget).mockReturnValue([
      { period: "daily", ratio: 0.5, exceeded: false, used: 5_000, limit: 10_000 },
    ]);

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
        cost: 0,
        count: 1,
      },
    ];

    expect(buildTodaySummary(rows, "normal")).not.toContain("Budget");
    expect(buildTodaySummary(rows, "extend")).toContain("Budget");
    expect(buildTodaySummary(rows, "text")).toContain("Budget");
  });

  it("extend shows Budget and Stats even without budget configured", async () => {
    const budget = await import("../../../src/analytics/budget");
    vi.mocked(budget.getBudgetConfig).mockReturnValue({});
    vi.mocked(budget.checkBudget).mockReturnValue([]);

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
        cost: 0,
        count: 3,
      },
    ];

    const result = buildTodaySummary(rows, "extend");
    expect(result).toContain("Budget");
    expect(result).toContain("No budgets configured.");
    expect(result).toContain("Stats");
    expect(result).toContain("requests");
    expect(result).toContain("providers");
  });

  it("normal does not show Stats section", () => {
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
        cost: 0,
        count: 1,
      },
    ];

    const result = buildTodaySummary(rows, "normal");
    expect(result).not.toContain("Stats");
    expect(result).not.toContain("📊");
  });
});
