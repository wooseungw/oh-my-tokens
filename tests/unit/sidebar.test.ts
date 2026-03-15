import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RollupRow } from "../../src/storage/rollup";

const {
  getTodayRollupsMock,
  getSessionTotalsMock,
  getWeekTotalMock,
  getMonthTotalMock,
  getMonthProviderRollupsMock,
} = vi.hoisted(() => ({
  getTodayRollupsMock: vi.fn(),
  getSessionTotalsMock: vi.fn(),
  getWeekTotalMock: vi.fn(),
  getMonthTotalMock: vi.fn(),
  getMonthProviderRollupsMock: vi.fn(),
}));

const { getBudgetConfigMock } = vi.hoisted(() => ({
  getBudgetConfigMock: vi.fn(),
}));

const { getLiveProvidersMock, getLiveQuotaMock } = vi.hoisted(() => ({
  getLiveProvidersMock: vi.fn(),
  getLiveQuotaMock: vi.fn(),
}));

vi.mock("../../src/storage/rollup", () => ({
  getTodayRollups: getTodayRollupsMock,
  getSessionTotals: getSessionTotalsMock,
  getWeekTotal: getWeekTotalMock,
  getMonthTotal: getMonthTotalMock,
  getMonthProviderRollups: getMonthProviderRollupsMock,
}));

vi.mock("../../src/analytics/budget", () => ({
  getBudgetConfig: getBudgetConfigMock,
}));

vi.mock("../../src/analytics/quota", () => ({
  getLiveProviders: getLiveProvidersMock,
  getLiveQuota: getLiveQuotaMock,
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
    getMonthProviderRollupsMock.mockReset();
    getBudgetConfigMock.mockReset();
    getLiveProvidersMock.mockReset();
    getLiveQuotaMock.mockReset();
    getBudgetConfigMock.mockReturnValue({});
    getLiveProvidersMock.mockReturnValue([]);
    getMonthProviderRollupsMock.mockReturnValue([]);

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
    getBudgetConfigMock.mockReturnValue({ daily: 500000 });

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
    getBudgetConfigMock.mockReturnValue({ daily: 100000 });

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
    getBudgetConfigMock.mockReturnValue({ daily: 100000 });

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
      getBudgetConfigMock.mockReturnValue({ daily: 100 });
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("success");
    });

    it("returns warning status when usage is exactly 80% of budget", () => {
      // 80 / 100 = 80% → warning
      getTodayRollupsMock.mockReturnValue([
        createRollup({ inp: 80, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 }),
      ]);
      getBudgetConfigMock.mockReturnValue({ daily: 100 });
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("warning");
    });

    it("returns error status when usage is exactly 100% of budget", () => {
      // 100 / 100 = 100% → error
      getTodayRollupsMock.mockReturnValue([
        createRollup({ inp: 100, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 }),
      ]);
      getBudgetConfigMock.mockReturnValue({ daily: 100 });
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("error");
    });

    it("returns info status when no budget configured", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({ inp: 500, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 }),
      ]);
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.status).toBe("info");
    });

    it("reads budget from config store instead of env vars", () => {
      getBudgetConfigMock.mockReturnValue({ daily: 500000 });
      const items = buildSidebarItems("compact");
      const todayItem = items.find((i) => i.label === "Today");
      expect(todayItem?.value).toBe("115.5K / 500.0K (23%)");
      expect(todayItem?.status).toBe("success");
    });
  });

  describe("quota items with live providers", () => {
    it("includes quota items when live providers exist", () => {
      getLiveProvidersMock.mockReturnValue(["gemini"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "gemini",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("normal");
      const labels = items.map((i) => i.label);
      expect(labels).toContain("gemini");
    });

    it("shows multiple quota windows for provider", () => {
      getLiveProvidersMock.mockReturnValue(["gemini"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "gemini",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 50 },
          sevenDay: { percentRemaining: 75 },
        },
      });

      const items = buildSidebarItems("extend");
      const quotaItems = items.filter((i) => i.label.includes("gemini"));
      expect(quotaItems.length).toBeGreaterThanOrEqual(2);
    });

    it("shows error status when percent remaining <= 20", () => {
      getLiveProvidersMock.mockReturnValue(["gemini"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "gemini",
        used: 8500,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 15 },
        },
      });

      const items = buildSidebarItems("normal");
      const quotaItem = items.find((i) => i.label === "gemini");
      expect(quotaItem?.status).toBe("error");
    });

    it("shows warning status when percent remaining between 20-40", () => {
      getLiveProvidersMock.mockReturnValue(["gemini"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "gemini",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 30 },
        },
      });

      const items = buildSidebarItems("normal");
      const quotaItem = items.find((i) => i.label === "gemini");
      expect(quotaItem?.status).toBe("warning");
    });

    it("shows success status when percent remaining > 40", () => {
      getLiveProvidersMock.mockReturnValue(["gemini"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "gemini",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("normal");
      const quotaItem = items.find((i) => i.label === "gemini");
      expect(quotaItem?.status).toBe("success");
    });

    it("uses minimum percent for status when multiple windows", () => {
      getLiveProvidersMock.mockReturnValue(["gemini"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "gemini",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 15 },
          sevenDay: { percentRemaining: 75 },
        },
      });

      const items = buildSidebarItems("normal");
      const quotaItem = items.find((i) => i.label === "gemini");
      expect(quotaItem?.status).toBe("error");
    });
  });

  describe("quota items in extend mode with bars", () => {
    it("includes bars in extend mode quota items", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const quotaItems = items.filter(
        (i) => i.label.includes("anthropic") && i.label.includes("⏱"),
      );
      quotaItems.forEach((item) => {
        expect(item.value).toContain("█");
      });
    });
  });

  describe("quota items in text mode without bars", () => {
    it("excludes bars in text mode quota items", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("text");
      const quotaItems = items.filter((i) => i.label.includes("anthropic"));
      quotaItems.forEach((item) => {
        expect(item.value).not.toContain("█");
      });
    });
  });

  describe("tier-based quota estimation", () => {
    it("estimates quota from tier when no windows", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        tier: "tier_1",
      });
      getMonthProviderRollupsMock.mockReturnValue([
        createRollup({
          kind: "provider",
          name: "anthropic",
          inp: 1000,
          out: 500,
          think: 100,
          chat: 50,
          code: 50,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("anthropic"))).toBe(true);
    });

    it("handles unknown tier gracefully", () => {
      getLiveProvidersMock.mockReturnValue(["unknown_provider"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "unknown_provider",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        tier: "unknown_tier",
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels).not.toContain("unknown_provider");
    });

    it("handles unknown provider gracefully", () => {
      getLiveProvidersMock.mockReturnValue(["unknown_provider"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "unknown_provider",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        tier: "tier_1",
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels).not.toContain("unknown_provider");
    });
  });

  describe("setLastReply with various token combinations", () => {
    it("shows all token types when all > 0", () => {
      setLastReply({
        think: 1000,
        chat: 500,
        code: 200,
        cache: 5000,
        provider: "anthropic",
        model: "claude-3",
      });

      const items = buildSidebarItems("compact");
      const replyItem = items.find((i) => i.label === "Reply");
      expect(replyItem?.value).toContain("🧠");
      expect(replyItem?.value).toContain("💬");
      expect(replyItem?.value).toContain("⌨️");
      expect(replyItem?.value).toContain("📦");
    });

    it("omits cache emoji when cache is 0", () => {
      setLastReply({
        think: 1000,
        chat: 500,
        code: 200,
        cache: 0,
        provider: "anthropic",
        model: "claude-3",
      });

      const items = buildSidebarItems("compact");
      const replyItem = items.find((i) => i.label === "Reply");
      expect(replyItem?.value).not.toContain("📦");
    });
  });

  describe("setCurrentSessionId", () => {
    it("shows session tokens when session found", () => {
      getSessionTotalsMock.mockReturnValue({
        inp: 5000,
        out: 2000,
        think: 1000,
        chat: 500,
        code: 500,
        cache_r: 1000,
        cache_w: 0,
        cost: 0.5,
        count: 10,
      });

      setCurrentSessionId("session-123");
      const items = buildSidebarItems("compact");
      const sessionItem = items.find((i) => i.label === "Session");
      expect(sessionItem?.value).not.toBe("0 tok");
    });

    it("shows 0 tok when session not found", () => {
      getSessionTotalsMock.mockReturnValue(null);

      setCurrentSessionId("session-123");
      const items = buildSidebarItems("compact");
      const sessionItem = items.find((i) => i.label === "Session");
      expect(sessionItem?.value).toBe("0 tok");
    });
  });

  describe("breakdown items in extend mode", () => {
    it("shows all 5 breakdown items", () => {
      const items = buildSidebarItems("extend");
      const breakdownLabels = ["🧠 think", "💬 chat", "⌨️ code", "📥 input", "📦 cache"];
      const breakdownItems = items.filter((i) => breakdownLabels.includes(i.label));
      expect(breakdownItems).toHaveLength(5);
    });

    it("calculates percentages correctly", () => {
      const items = buildSidebarItems("extend");
      const thinkItem = items.find((i) => i.label === "🧠 think");
      expect(thinkItem?.value).toContain("(");
      expect(thinkItem?.value).toContain("%");
    });

    it("includes cache_r and cache_w in cache total", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({
          kind: "total",
          name: "*",
          inp: 100,
          out: 100,
          think: 100,
          chat: 100,
          code: 100,
          cache_r: 50,
          cache_w: 30,
        }),
      ]);

      const items = buildSidebarItems("extend");
      const cacheItem = items.find((i) => i.label === "📦 cache");
      expect(cacheItem?.value).toContain("80");
    });
  });

  describe("rate item calculation", () => {
    it("shows warning when rate > 50k/h", () => {
      vi.setSystemTime(new Date("2026-03-12T01:00:00"));
      getTodayRollupsMock.mockReturnValue([
        createRollup({
          kind: "total",
          name: "*",
          inp: 100000,
          out: 50000,
          think: 0,
          chat: 0,
          code: 0,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const rateItem = items.find((i) => i.label === "Rate");
      expect(rateItem?.status).toBe("warning");
    });

    it("shows info when rate <= 50k/h", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({
          kind: "total",
          name: "*",
          inp: 10000,
          out: 5000,
          think: 0,
          chat: 0,
          code: 0,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const rateItem = items.find((i) => i.label === "Rate");
      expect(rateItem?.status).toBe("info");
    });

    it("handles zero tokens gracefully", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({
          kind: "total",
          name: "*",
          inp: 0,
          out: 0,
          think: 0,
          chat: 0,
          code: 0,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const rateItem = items.find((i) => i.label === "Rate");
      expect(rateItem?.value).toContain("/h");
    });
  });

  describe("week and month totals", () => {
    it("shows week total in extend mode", () => {
      const items = buildSidebarItems("extend");
      const weekItem = items.find((i) => i.label === "This Week");
      expect(weekItem?.value).toContain("tok");
    });

    it("shows month total in extend mode", () => {
      const items = buildSidebarItems("extend");
      const monthItem = items.find((i) => i.label === "This Month");
      expect(monthItem?.value).toContain("tok");
    });

    it("shows 0 when week total is null", () => {
      getWeekTotalMock.mockReturnValue(null);
      const items = buildSidebarItems("extend");
      const weekItem = items.find((i) => i.label === "This Week");
      expect(weekItem?.value).toContain("0");
    });

    it("shows 0 when month total is null", () => {
      getMonthTotalMock.mockReturnValue(null);
      const items = buildSidebarItems("extend");
      const monthItem = items.find((i) => i.label === "This Month");
      expect(monthItem?.value).toContain("0");
    });
  });

  describe("budget item in extend mode", () => {
    it("shows budget with limit when configured", () => {
      getBudgetConfigMock.mockReturnValue({ daily: 100000 });
      const items = buildSidebarItems("extend");
      const budgetItem = items.find((i) => i.label === "Budget");
      expect(budgetItem?.value).toContain("/");
      expect(budgetItem?.value).toContain("day");
    });

    it("shows budget without limit when not configured", () => {
      getBudgetConfigMock.mockReturnValue({});
      const items = buildSidebarItems("extend");
      const budgetItem = items.find((i) => i.label === "Budget");
      expect(budgetItem?.value).toContain("tok");
      expect(budgetItem?.value).not.toContain("/");
    });

    it("shows error status when over budget", () => {
      getBudgetConfigMock.mockReturnValue({ daily: 100000 });
      getTodayRollupsMock.mockReturnValue([
        createRollup({
          kind: "total",
          name: "*",
          inp: 100000,
          out: 50000,
          think: 0,
          chat: 0,
          code: 0,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("extend");
      const budgetItem = items.find((i) => i.label === "Budget");
      expect(budgetItem?.status).toBe("error");
    });
  });

  describe("provider items sorting", () => {
    it("sorts providers by total tokens descending", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({ kind: "total", name: "*" }),
        createRollup({
          kind: "provider",
          name: "google",
          inp: 1000,
          out: 500,
          think: 100,
          chat: 50,
          code: 50,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "provider",
          name: "anthropic",
          inp: 15000,
          out: 10000,
          think: 5000,
          chat: 5000,
          code: 5000,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const providerItems = items.filter((i) => ["anthropic", "google"].includes(i.label));
      expect(providerItems[0].label).toBe("anthropic");
    });

    it("limits to top 2 providers", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({ kind: "total", name: "*" }),
        createRollup({
          kind: "provider",
          name: "provider1",
          inp: 10000,
          out: 5000,
          think: 1000,
          chat: 1000,
          code: 1000,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "provider",
          name: "provider2",
          inp: 8000,
          out: 4000,
          think: 800,
          chat: 800,
          code: 800,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "provider",
          name: "provider3",
          inp: 6000,
          out: 3000,
          think: 600,
          chat: 600,
          code: 600,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const providerItems = items.filter((i) =>
        ["provider1", "provider2", "provider3"].includes(i.label),
      );
      expect(providerItems).toHaveLength(2);
    });
  });

  describe("agent items sorting", () => {
    it("sorts agents by total tokens descending", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({ kind: "total", name: "*" }),
        createRollup({
          kind: "agent",
          name: "librarian",
          inp: 1000,
          out: 500,
          think: 100,
          chat: 50,
          code: 50,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "agent",
          name: "coder",
          inp: 15000,
          out: 10000,
          think: 5000,
          chat: 5000,
          code: 5000,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const agentItems = items.filter((i) => ["coder", "librarian"].includes(i.label));
      expect(agentItems[0].label).toBe("coder");
    });

    it("limits to top 2 agents", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({ kind: "total", name: "*" }),
        createRollup({
          kind: "agent",
          name: "agent1",
          inp: 10000,
          out: 5000,
          think: 1000,
          chat: 1000,
          code: 1000,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "agent",
          name: "agent2",
          inp: 8000,
          out: 4000,
          think: 800,
          chat: 800,
          code: 800,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "agent",
          name: "agent3",
          inp: 6000,
          out: 3000,
          think: 600,
          chat: 600,
          code: 600,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const agentItems = items.filter((i) => ["agent1", "agent2", "agent3"].includes(i.label));
      expect(agentItems).toHaveLength(2);
    });
  });

  describe("provider percentage calculation", () => {
    it("calculates provider percentage of total", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({
          kind: "total",
          name: "*",
          inp: 20000,
          out: 10000,
          think: 2000,
          chat: 2000,
          code: 2000,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "provider",
          name: "anthropic",
          inp: 10000,
          out: 5000,
          think: 1000,
          chat: 1000,
          code: 1000,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const anthropicItem = items.find((i) => i.label === "anthropic");
      expect(anthropicItem?.value).toContain("50%");
    });

    it("handles zero total tokens gracefully", () => {
      getTodayRollupsMock.mockReturnValue([
        createRollup({
          kind: "total",
          name: "*",
          inp: 0,
          out: 0,
          think: 0,
          chat: 0,
          code: 0,
          cache_r: 0,
          cache_w: 0,
        }),
        createRollup({
          kind: "provider",
          name: "anthropic",
          inp: 0,
          out: 0,
          think: 0,
          chat: 0,
          code: 0,
          cache_r: 0,
          cache_w: 0,
        }),
      ]);

      const items = buildSidebarItems("normal");
      const anthropicItem = items.find((i) => i.label === "anthropic");
      expect(anthropicItem?.value).toContain("0%");
    });
  });

  describe("empty rollup handling", () => {
    it("handles empty rollup rows", () => {
      getTodayRollupsMock.mockReturnValue([]);
      const items = buildSidebarItems("compact");
      expect(items).toHaveLength(3);
      expect(items[0].label).toBe("Reply");
      expect(items[1].label).toBe("Session");
      expect(items[2].label).toBe("Today");
    });

    it("handles no providers in normal mode", () => {
      getTodayRollupsMock.mockReturnValue([createRollup({ kind: "total", name: "*" })]);
      const items = buildSidebarItems("normal");
      const labels = items.map((i) => i.label);
      expect(labels).not.toContain("anthropic");
      expect(labels).not.toContain("openai");
    });

    it("handles no agents in normal mode", () => {
      getTodayRollupsMock.mockReturnValue([createRollup({ kind: "total", name: "*" })]);
      const items = buildSidebarItems("normal");
      const labels = items.map((i) => i.label);
      expect(labels).not.toContain("coder");
      expect(labels).not.toContain("task");
    });
  });

  describe("quota window types", () => {
    it("handles fiveHour window", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          fiveHour: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("anthropic"))).toBe(true);
    });

    it("handles hourly window", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          hourly: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("anthropic"))).toBe(true);
    });

    it("handles sevenDay window", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          sevenDay: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("anthropic"))).toBe(true);
    });

    it("handles weekly window", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          weekly: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("anthropic"))).toBe(true);
    });
  });

  describe("quota unit types", () => {
    it("handles tokens unit", () => {
      getLiveProvidersMock.mockReturnValue(["anthropic"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "anthropic",
        used: 1000,
        limit: 10000,
        unit: "tokens",
        windows: {
          weekly: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("anthropic"))).toBe(true);
    });

    it("handles requests unit", () => {
      getLiveProvidersMock.mockReturnValue(["openai"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "openai",
        used: 100,
        limit: 1000,
        unit: "requests",
        windows: {
          weekly: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("openai"))).toBe(true);
    });

    it("handles credits unit", () => {
      getLiveProvidersMock.mockReturnValue(["openrouter"]);
      getLiveQuotaMock.mockReturnValue({
        provider: "openrouter",
        used: 50,
        limit: 500,
        unit: "credits",
        windows: {
          weekly: { percentRemaining: 50 },
        },
      });

      const items = buildSidebarItems("extend");
      const labels = items.map((i) => i.label);
      expect(labels.some((l) => l.includes("openrouter"))).toBe(true);
    });
  });

  describe("all display modes return valid items", () => {
    it("compact mode returns valid items", () => {
      const items = buildSidebarItems("compact");
      expect(Array.isArray(items)).toBe(true);
      items.forEach((item) => {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("value");
        expect(item).toHaveProperty("status");
        expect(typeof item.label).toBe("string");
        expect(typeof item.value).toBe("string");
        expect(["success", "warning", "error", "info"]).toContain(item.status);
      });
    });

    it("normal mode returns valid items", () => {
      const items = buildSidebarItems("normal");
      expect(Array.isArray(items)).toBe(true);
      items.forEach((item) => {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("value");
        expect(item).toHaveProperty("status");
        expect(typeof item.label).toBe("string");
        expect(typeof item.value).toBe("string");
        expect(["success", "warning", "error", "info"]).toContain(item.status);
      });
    });

    it("extend mode returns valid items", () => {
      const items = buildSidebarItems("extend");
      expect(Array.isArray(items)).toBe(true);
      items.forEach((item) => {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("value");
        expect(item).toHaveProperty("status");
        expect(typeof item.label).toBe("string");
        expect(typeof item.value).toBe("string");
        expect(["success", "warning", "error", "info"]).toContain(item.status);
      });
    });

    it("text mode returns valid items", () => {
      const items = buildSidebarItems("text");
      expect(Array.isArray(items)).toBe(true);
      items.forEach((item) => {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("value");
        expect(item).toHaveProperty("status");
        expect(typeof item.label).toBe("string");
        expect(typeof item.value).toBe("string");
        expect(["success", "warning", "error", "info"]).toContain(item.status);
      });
    });
  });
});
