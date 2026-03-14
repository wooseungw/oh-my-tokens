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
});
