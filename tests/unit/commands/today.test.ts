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

import { getLiveProviders, getLiveQuota } from "../../../src/analytics/quota";
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

  it("shows provider blocks with live quota windows", () => {
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getLiveQuota).mockReturnValue({
      provider: "anthropic",
      windows: {
        fiveHour: { percentRemaining: 92, resetTimeIso: "2026-03-15T17:00:00Z" },
        sevenDay: { percentRemaining: 95, resetTimeIso: "2026-03-22T00:00:00Z" },
      },
      unit: "tokens",
      limit: 0,
      used: 0,
    });

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

    expect(result).toContain("anthropic");
    expect(result).toContain("5h");
    expect(result).toContain("7d");
    expect(result).toContain("[live]");
  });

  it("shows budget alert when present", async () => {
    const budget = await import("../../../src/analytics/budget");
    vi.mocked(budget.formatBudgetAlert).mockReturnValue("⚠️ Daily budget exceeded!");

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

    expect(result).toContain("⚠️ Daily budget exceeded!");
  });

  it("text mode renders without bars", () => {
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

    const result = buildTodaySummary(rows, "text");

    expect(result).not.toContain("█");
    expect(result).not.toContain("░");
    expect(result).toContain("anthropic");
  });

  it("shows Today divider only when no provider rows", () => {
    const rows: RollupRow[] = [];

    const result = buildTodaySummary(rows, "normal");

    expect(result).toContain("Today");
    expect(result).toContain("Breakdown");
  });

  it("sorts multiple providers by usage descending", () => {
    const rows: RollupRow[] = [
      {
        date: "2026-03-14",
        kind: "provider",
        name: "openai",
        inp: 100,
        out: 50,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
      {
        date: "2026-03-14",
        kind: "provider",
        name: "anthropic",
        inp: 5_000,
        out: 2_500,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 2,
      },
      {
        date: "2026-03-14",
        kind: "provider",
        name: "google",
        inp: 500,
        out: 250,
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

    const anthropicIdx = result.indexOf("anthropic");
    const googleIdx = result.indexOf("google");
    const openaiIdx = result.indexOf("openai");

    expect(anthropicIdx).toBeLessThan(googleIdx);
    expect(googleIdx).toBeLessThan(openaiIdx);
  });

  it("shows provider quota with hourly window", () => {
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getLiveQuota).mockReturnValue({
      provider: "anthropic",
      windows: {
        hourly: { percentRemaining: 80, resetTimeIso: "2026-03-15T13:00:00Z" },
      },
      unit: "tokens",
      limit: 0,
      used: 0,
    });

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

    expect(result).toContain("1h");
    expect(result).toContain("[live]");
  });

  it("shows provider quota with weekly window credits", () => {
    vi.mocked(getLiveProviders).mockReturnValue(["openrouter"]);
    vi.mocked(getLiveQuota).mockReturnValue({
      provider: "openrouter",
      windows: {
        weekly: { percentRemaining: 70, resetTimeIso: "2026-03-22T00:00:00Z" },
      },
      unit: "credits",
      limit: 100.0,
      used: 30.0,
    });

    const rows: RollupRow[] = [
      {
        date: "2026-03-14",
        kind: "provider",
        name: "openrouter",
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

    expect(result).toContain("💳");
    expect(result).toContain("$");
    expect(result).toContain("[live]");
  });

  it("shows provider quota with weekly window requests", () => {
    vi.mocked(getLiveProviders).mockReturnValue(["copilot"]);
    vi.mocked(getLiveQuota).mockReturnValue({
      provider: "copilot",
      windows: {
        weekly: { percentRemaining: 60, resetTimeIso: "2026-03-22T00:00:00Z" },
      },
      unit: "requests",
      limit: 500,
      used: 200,
    });

    const rows: RollupRow[] = [
      {
        date: "2026-03-14",
        kind: "provider",
        name: "copilot",
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

    expect(result).toContain("🗓");
    expect(result).toContain("req");
    expect(result).toContain("[live]");
  });
});
