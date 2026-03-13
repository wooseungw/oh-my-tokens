import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTodayRollupsMock,
  getHourProviderTotalsMock,
  getWeekProviderRollupsMock,
  getMonthProviderRollupsMock,
  hasAnyProviderLimitsMock,
  getResolvedProviderConfigMock,
} = vi.hoisted(() => ({
  getTodayRollupsMock: vi.fn(),
  getHourProviderTotalsMock: vi.fn(),
  getWeekProviderRollupsMock: vi.fn(),
  getMonthProviderRollupsMock: vi.fn(),
  hasAnyProviderLimitsMock: vi.fn(),
  getResolvedProviderConfigMock: vi.fn(),
}));
vi.mock("../../src/storage/db", () => ({
  execute: vi.fn(),
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(() => null),
  runInTransaction: (fn: () => unknown) => fn(),
}));
vi.mock("../../src/storage/rollup", () => ({
  getTodayRollups: getTodayRollupsMock,
  getHourProviderTotals: getHourProviderTotalsMock,
  getWeekProviderRollups: getWeekProviderRollupsMock,
  getMonthProviderRollups: getMonthProviderRollupsMock,
}));
vi.mock("../../src/analytics/plans", () => ({
  hasAnyProviderLimits: hasAnyProviderLimitsMock,
  getResolvedProviderConfig: getResolvedProviderConfigMock,
}));

vi.mock("../../src/analytics/budget", () => ({
  checkBudget: vi.fn(() => []),
  getBudgetConfig: vi.fn(() => ({})),
  formatBudgetAlert: vi.fn(() => null),
}));

vi.mock("../../src/analytics/trends", () => ({
  detectSpikes: vi.fn(() => []),
  formatTrendChart: vi.fn(() => ""),
  getDailyTrend: vi.fn(() => []),
  getWowChange: vi.fn(() => ({ changePercent: null })),
}));

vi.mock("../../src/utils", () => ({
  todayDateKey: vi.fn(() => "2026-03-12"),
}));

import { handleOmtCommand } from "../../src/ui/commands";

describe("handleOmtCommand — default summary", () => {
  beforeEach(() => {
    getTodayRollupsMock.mockReset();
    getTodayRollupsMock.mockReturnValue([
      {
        date: "2026-03-12",
        kind: "total",
        name: "*",
        inp: 3,
        out: 299,
        think: 0,
        chat: 299,
        code: 0,
        cache_r: 0,
        cache_w: 24_034,
        cost: 0,
        count: 1,
      },
      {
        date: "2026-03-12",
        kind: "provider",
        name: "anthropic",
        inp: 3,
        out: 299,
        think: 0,
        chat: 299,
        code: 0,
        cache_r: 0,
        cache_w: 24_034,
        cost: 0,
        count: 1,
      },
    ]);
  });

  it("shows cache tokens explicitly in the default summary", () => {
    const result = handleOmtCommand("", "ses_test");
    expect(result.text).toContain("📦 cache");
    expect(result.text).toContain("24.0K");
    expect(result.text).toContain("Σ total");
  });
});

describe("handleOmtCommand — limits subcommand", () => {
  beforeEach(() => {
    getTodayRollupsMock.mockReset();
    getTodayRollupsMock.mockReturnValue([]);
    getHourProviderTotalsMock.mockReset();
    getHourProviderTotalsMock.mockReturnValue(new Map());
    getWeekProviderRollupsMock.mockReset();
    getWeekProviderRollupsMock.mockReturnValue([]);
    getMonthProviderRollupsMock.mockReset();
    getMonthProviderRollupsMock.mockReturnValue([]);
    hasAnyProviderLimitsMock.mockReset();
    getResolvedProviderConfigMock.mockReset();
  });

  it("shows no-config message when hasAnyProviderLimits returns false", () => {
    hasAnyProviderLimitsMock.mockReturnValue(false);
    const result = handleOmtCommand("limits", "ses_test");
    expect(result.text).toContain("No provider limits configured");
  });

  it("shows per-provider section with plan name and time windows when limits configured", () => {
    hasAnyProviderLimitsMock.mockReturnValue(true);
    getHourProviderTotalsMock.mockReturnValue(new Map([["anthropic", 2_100_000]]));
    getTodayRollupsMock.mockReturnValue([
      {
        date: "2026-03-12",
        kind: "provider",
        name: "anthropic",
        inp: 10_000_000,
        out: 5_000_000,
        think: 0,
        chat: 5_000_000,
        code: 0,
        cache_r: 10_000_000,
        cache_w: 5_000_000,
        cost: 0,
        count: 5,
      },
    ]);
    getResolvedProviderConfigMock.mockReturnValue({
      planDisplayName: "Claude Max 5",
      limits: { hourly: 10_000_000, daily: 100_000_000, monthly: 100_000_000 },
    });

    const result = handleOmtCommand("limits", "ses_test");
    expect(result.text).toContain("ANTHROPIC");
    expect(result.text).toContain("Claude Max 5");
    expect(result.text).toContain("⏱ hourly");
    expect(result.text).toContain("📅 today");
    expect(result.text).toContain("🗓 monthly");
  });

  it("shows warning emoji when usage exceeds the configured limit", () => {
    hasAnyProviderLimitsMock.mockReturnValue(true);
    getTodayRollupsMock.mockReturnValue([
      {
        date: "2026-03-12",
        kind: "provider",
        name: "openai",
        inp: 12_000_000,
        out: 5_000_000,
        think: 0,
        chat: 5_000_000,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 3,
      },
    ]);
    getHourProviderTotalsMock.mockReturnValue(new Map());
    getResolvedProviderConfigMock.mockReturnValue({
      planDisplayName: null,
      limits: { daily: 10_000_000 },
    });

    const result = handleOmtCommand("limits", "ses_test");
    expect(result.text).toContain("⚠️");
  });

  it("shows -- and raw usage when no limit is configured for a window", () => {
    hasAnyProviderLimitsMock.mockReturnValue(true);
    getTodayRollupsMock.mockReturnValue([
      {
        date: "2026-03-12",
        kind: "provider",
        name: "copilot",
        inp: 500_000,
        out: 200_000,
        think: 0,
        chat: 200_000,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
    ]);
    getHourProviderTotalsMock.mockReturnValue(new Map());
    getResolvedProviderConfigMock.mockReturnValue({
      planDisplayName: null,
      limits: {},
    });

    const result = handleOmtCommand("limits", "ses_test");
    expect(result.text).toContain("COPILOT");
    expect(result.text).toContain("--");
  });
});
