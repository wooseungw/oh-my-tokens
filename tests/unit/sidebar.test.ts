import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RollupRow } from "../../src/storage/rollup";

const { getTodayRollupsMock, getSessionTotalsMock, getWeekTotalMock, getMonthTotalMock } =
  vi.hoisted(() => ({
    getTodayRollupsMock: vi.fn(),
    getSessionTotalsMock: vi.fn(),
    getWeekTotalMock: vi.fn(),
    getMonthTotalMock: vi.fn(),
  }));

vi.mock("../../src/storage/rollup", () => ({
  getTodayRollups: getTodayRollupsMock,
  getSessionTotals: getSessionTotalsMock,
  getWeekTotal: getWeekTotalMock,
  getMonthTotal: getMonthTotalMock,
}));

import { buildSidebarItems, setCurrentSessionId, setLastReply } from "../../src/ui/sidebar";

function createRollup(overrides: Partial<RollupRow>): RollupRow {
  return {
    date: "2026-03-12",
    kind: "total",
    name: "*",
    inp: 20_000,
    out: 80_000,
    think: 10_000,
    chat: 20_000,
    code: 60_000,
    cache_r: 5_000,
    cache_w: 500,
    cost: 1.2,
    count: 4,
    ...overrides,
  };
}

describe("sidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00"));
    process.env.OMT_DAILY_BUDGET_TOKENS = undefined;
    process.env.OH_MY_TOKENS_DAILY_BUDGET = undefined;
    getTodayRollupsMock.mockReset();
    getSessionTotalsMock.mockReset();
    getWeekTotalMock.mockReset();
    getMonthTotalMock.mockReset();

    getTodayRollupsMock.mockReturnValue([
      createRollup({ kind: "total", name: "*" }),
      createRollup({
        kind: "provider",
        name: "anthropic",
        inp: 15_000,
        out: 60_000,
        think: 8_000,
        chat: 10_000,
        code: 50_000,
        cache_r: 4_000,
        cache_w: 0,
      }),
      createRollup({
        kind: "provider",
        name: "openai",
        inp: 5_000,
        out: 20_000,
        think: 2_000,
        chat: 10_000,
        code: 10_000,
        cache_r: 1_000,
        cache_w: 500,
      }),
      createRollup({
        kind: "agent",
        name: "coder",
        inp: 12_000,
        out: 55_000,
        think: 7_000,
        chat: 10_000,
        code: 45_000,
        cache_r: 4_000,
        cache_w: 0,
      }),
      createRollup({
        kind: "agent",
        name: "task",
        inp: 8_000,
        out: 25_000,
        think: 3_000,
        chat: 10_000,
        code: 15_000,
        cache_r: 1_000,
        cache_w: 500,
      }),
    ]);
    getSessionTotalsMock.mockReturnValue({
      inp: 10_000,
      out: 20_000,
      think: 4_000,
      chat: 5_000,
      code: 15_000,
      cache_r: 1_000,
      cache_w: 500,
      cost: 0.4,
      count: 2,
    });
    getWeekTotalMock.mockReturnValue(
      createRollup({ inp: 120_000, out: 300_000, think: 50_000, cache_r: 30_000, cache_w: 2_000 }),
    );
    getMonthTotalMock.mockReturnValue(
      createRollup({
        inp: 500_000,
        out: 1_500_000,
        think: 200_000,
        cache_r: 100_000,
        cache_w: 20_000,
      }),
    );

    setCurrentSessionId("ses_1");
    setLastReply({
      think: 820,
      chat: 0,
      code: 1_800,
      cache: 24_000,
      provider: "anthropic",
      model: "claude-sonnet-4",
    });
  });

  it("builds compact mode with reply, session, and budget-aware today rows", () => {
    process.env.OMT_DAILY_BUDGET_TOKENS = "500000";

    expect(buildSidebarItems("compact")).toEqual([
      { label: "Reply", value: "🧠820 💬0 ⌨️1.8K 📦24.0K", status: "info" },
      { label: "Session", value: "35.5K tok", status: "info" },
      { label: "Today", value: "115.5K / 500.0K (23%)", status: "success" },
    ]);
  });

  it("builds normal mode with provider, agent, today, and rate rows", () => {
    expect(buildSidebarItems("normal")).toEqual([
      { label: "Reply", value: "🧠820 💬0 ⌨️1.8K 📦24.0K", status: "info" },
      { label: "Session", value: "35.5K tok", status: "info" },
      { label: "anthropic", value: "87.0K tok (75%)", status: "info" },
      { label: "openai", value: "28.5K tok (25%)", status: "info" },
      { label: "coder", value: "78.0K tok", status: "info" },
      { label: "task", value: "37.5K tok", status: "info" },
      { label: "Today", value: "115.5K tok", status: "info" },
      { label: "Rate", value: "9.6K/h", status: "info" },
    ]);
  });

  it("builds text mode with same structure as extend when no live providers", () => {
    process.env.OMT_DAILY_BUDGET_TOKENS = "100000";

    expect(buildSidebarItems("text")).toEqual([
      { label: "Reply", value: "🧠820 💬0 ⌨️1.8K 📦24.0K", status: "info" },
      { label: "Session", value: "35.5K tok", status: "info" },
      { label: "anthropic", value: "87.0K tok (75%)", status: "info" },
      { label: "openai", value: "28.5K tok (25%)", status: "info" },
      { label: "coder", value: "78.0K tok", status: "info" },
      { label: "task", value: "37.5K tok", status: "info" },
      { label: "Today", value: "115.5K tok", status: "error" },
      { label: "Rate", value: "9.6K/h", status: "info" },
      { label: "🧠 think", value: "10.0K (9%)", status: "info" },
      { label: "💬 chat", value: "20.0K (17%)", status: "info" },
      { label: "⌨️ code", value: "60.0K (52%)", status: "info" },
      { label: "📥 input", value: "20.0K (17%)", status: "info" },
      { label: "📦 cache", value: "5.5K (5%)", status: "info" },
      { label: "This Week", value: "502.0K tok", status: "info" },
      { label: "This Month", value: "2.3M tok", status: "info" },
      { label: "Budget", value: "115.5K/100.0K day", status: "error" },
    ]);
  });

  it("builds extended mode with breakdown and period totals", () => {
    process.env.OMT_DAILY_BUDGET_TOKENS = "100000";

    expect(buildSidebarItems("extend")).toEqual([
      { label: "Reply", value: "🧠820 💬0 ⌨️1.8K 📦24.0K", status: "info" },
      { label: "Session", value: "35.5K tok", status: "info" },
      { label: "anthropic", value: "87.0K tok (75%)", status: "info" },
      { label: "openai", value: "28.5K tok (25%)", status: "info" },
      { label: "coder", value: "78.0K tok", status: "info" },
      { label: "task", value: "37.5K tok", status: "info" },
      { label: "Today", value: "115.5K tok", status: "error" },
      { label: "Rate", value: "9.6K/h", status: "info" },
      { label: "🧠 think", value: "10.0K (9%)", status: "info" },
      { label: "💬 chat", value: "20.0K (17%)", status: "info" },
      { label: "⌨️ code", value: "60.0K (52%)", status: "info" },
      { label: "📥 input", value: "20.0K (17%)", status: "info" },
      { label: "📦 cache", value: "5.5K (5%)", status: "info" },
      { label: "This Week", value: "502.0K tok", status: "info" },
      { label: "This Month", value: "2.3M tok", status: "info" },
      { label: "Budget", value: "115.5K/100.0K day", status: "error" },
    ]);
  });

  describe("getBudgetStatus thresholds", () => {
    it("returns success status when usage below 80% of budget", () => {
      // 79 / 100 = 79% → success
      getTodayRollupsMock.mockReturnValue([
        createRollup({ inp: 79, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 }),
      ]);
      process.env.OMT_DAILY_BUDGET_TOKENS = "100";
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("success");
      process.env.OMT_DAILY_BUDGET_TOKENS = undefined;
    });

    it("returns warning status when usage is exactly 80% of budget", () => {
      // 80 / 100 = 80% → warning
      getTodayRollupsMock.mockReturnValue([
        createRollup({ inp: 80, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 }),
      ]);
      process.env.OMT_DAILY_BUDGET_TOKENS = "100";
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("warning");
      process.env.OMT_DAILY_BUDGET_TOKENS = undefined;
    });

    it("returns error status when usage is exactly 100% of budget", () => {
      // 100 / 100 = 100% → error
      getTodayRollupsMock.mockReturnValue([
        createRollup({ inp: 100, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 }),
      ]);
      process.env.OMT_DAILY_BUDGET_TOKENS = "100";
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("error");
      process.env.OMT_DAILY_BUDGET_TOKENS = undefined;
    });

    it("returns info status when no budget configured", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({ inp: 500, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 }),
      ]);
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("info");
    });
  });
});
