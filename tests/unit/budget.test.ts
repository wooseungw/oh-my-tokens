import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RollupRow } from "../../src/storage/rollup";

const { getMonthTotalMock, getTodayRollupsMock, getWeekTotalMock, getRollupsMock, queryOneMock } =
  vi.hoisted(() => ({
    getMonthTotalMock: vi.fn(),
    getTodayRollupsMock: vi.fn(),
    getWeekTotalMock: vi.fn(),
    getRollupsMock: vi.fn(),
    queryOneMock: vi.fn(),
  }));
vi.mock("../../src/storage/rollup", () => ({
  getMonthTotal: getMonthTotalMock,
  getTodayRollups: getTodayRollupsMock,
  getWeekTotal: getWeekTotalMock,
  getRollups: getRollupsMock,
}));

vi.mock("../../src/storage/db", () => ({
  queryOne: queryOneMock,
}));

import {
  checkBudget,
  formatBudgetAlert,
  getBudgetConfig,
  setBudgetConfig,
} from "../../src/analytics/budget";

function createRollup(total: number): RollupRow {
  return {
    date: "2026-03-12",
    kind: "total",
    name: "*",
    inp: total,
    out: 0,
    think: 0,
    chat: 0,
    code: 0,
    cache_r: 0,
    cache_w: 0,
    cost: 0,
    count: 1,
  };
}

describe("analytics budget", () => {
  beforeEach(() => {
    getTodayRollupsMock.mockReset();
    getWeekTotalMock.mockReset();
    getMonthTotalMock.mockReset();
    getRollupsMock.mockReset();
    queryOneMock.mockReset();
  });

  it("checks configured daily, weekly, and monthly budgets", () => {
    getTodayRollupsMock.mockReturnValue([createRollup(90)]);
    getWeekTotalMock.mockReturnValue(createRollup(450));
    getMonthTotalMock.mockReturnValue(createRollup(800));

    expect(checkBudget({ daily: 100, weekly: 500, monthly: 1_000 })).toEqual([
      { period: "daily", limit: 100, used: 90, ratio: 0.9, exceeded: false },
      { period: "weekly", limit: 500, used: 450, ratio: 0.9, exceeded: false },
      { period: "monthly", limit: 1_000, used: 800, ratio: 0.8, exceeded: false },
    ]);
  });

  it("returns an alert string for warning and exceeded budgets", () => {
    const alert = formatBudgetAlert([
      { period: "daily", limit: 100, used: 85, ratio: 0.85, exceeded: false },
      { period: "weekly", limit: 500, used: 550, ratio: 1.1, exceeded: true },
      { period: "monthly", limit: 1_000, used: 300, ratio: 0.3, exceeded: false },
    ]);

    expect(alert).toContain("oh-my-tokens — Budget Alert");
    expect(alert).toContain("daily   ██████████████░░  85%  85 / 100 ~");
    expect(alert).toContain("weekly  ████████████████ 110%  550 / 500 !");
    expect(alert).not.toContain("monthly");
  });

  it("returns null when all budgets are below warning threshold", () => {
    expect(
      formatBudgetAlert([{ period: "daily", limit: 100, used: 50, ratio: 0.5, exceeded: false }]),
    ).toBeNull();
  });
});

describe("budget config store", () => {
  afterEach(() => setBudgetConfig({}));

  it("setBudgetConfig stores and getBudgetConfig retrieves", () => {
    setBudgetConfig({ daily: 500_000, weekly: 3_000_000 });
    expect(getBudgetConfig().daily).toBe(500_000);
    expect(getBudgetConfig().weekly).toBe(3_000_000);
    expect(getBudgetConfig().monthly).toBeUndefined();
  });

  it("weeklyResetDay and dailyResetHour are stored", () => {
    setBudgetConfig({ weeklyResetDay: "wednesday", dailyResetHour: 6 });
    expect(getBudgetConfig().weeklyResetDay).toBe("wednesday");
    expect(getBudgetConfig().dailyResetHour).toBe(6);
  });

  it("empty config is returned after reset", () => {
    setBudgetConfig({ daily: 100 });
    setBudgetConfig({});
    expect(getBudgetConfig().daily).toBeUndefined();
  });
});

describe("budget reset period", () => {
  afterEach(() => setBudgetConfig({}));

  it("dailyResetHour: 6 queries events table from 6am", () => {
    queryOneMock.mockReturnValue({ tokens: 300 });
    const result = checkBudget({ daily: 1000, dailyResetHour: 6 });
    expect(result[0].used).toBe(300);
    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM events WHERE ts >="),
      expect.any(Number),
    );
  });

  it("dailyResetHour: 0 falls back to rollup (midnight = default)", () => {
    getTodayRollupsMock.mockReturnValue([createRollup(200)]);
    const result = checkBudget({ daily: 1000, dailyResetHour: 0 });
    expect(result[0].used).toBe(200);
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("dailyResetHour: 25 falls back to rollup (invalid)", () => {
    getTodayRollupsMock.mockReturnValue([createRollup(150)]);
    const result = checkBudget({ daily: 1000, dailyResetHour: 25 });
    expect(result[0].used).toBe(150);
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("weeklyResetDay: wednesday uses getRollups from last Wednesday", () => {
    getRollupsMock.mockReturnValue([createRollup(5000)]);
    const result = checkBudget({ weekly: 10000, weeklyResetDay: "wednesday" });
    expect(result[0].used).toBe(5000);
    expect(getRollupsMock).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  it("weeklyResetDay: monday falls back to getWeekTotal (default)", () => {
    getWeekTotalMock.mockReturnValue(createRollup(4000));
    const result = checkBudget({ weekly: 10000, weeklyResetDay: "monday" });
    expect(result[0].used).toBe(4000);
    expect(getRollupsMock).not.toHaveBeenCalled();
  });

  it("weeklyResetDay: funday falls back to getWeekTotal (invalid)", () => {
    getWeekTotalMock.mockReturnValue(createRollup(3000));
    const result = checkBudget({ weekly: 10000, weeklyResetDay: "funday" });
    expect(result[0].used).toBe(3000);
    expect(getRollupsMock).not.toHaveBeenCalled();
  });
});
