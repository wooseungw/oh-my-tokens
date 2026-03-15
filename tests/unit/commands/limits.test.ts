import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/analytics/plans", () => ({
  getResolvedProviderConfig: vi.fn(() => ({ planDisplayName: null, limits: {} })),
  hasAnyProviderLimits: vi.fn(() => false),
}));

vi.mock("../../../src/analytics/quota", () => ({
  getLiveProviders: vi.fn(() => []),
  getLiveQuota: vi.fn(() => null),
}));

vi.mock("../../../src/analytics/token-math", () => ({
  computeTotalTokens: vi.fn(
    (row) => row.inp + row.out + row.think + row.chat + row.code + row.cache_r + row.cache_w,
  ),
}));

vi.mock("../../../src/storage/rollup", () => ({
  getHourProviderTotals: vi.fn(() => new Map()),
  getTodayRollups: vi.fn(() => []),
  getWeekProviderRollups: vi.fn(() => []),
  getMonthProviderRollups: vi.fn(() => []),
}));

vi.mock("../../../src/ui/formatter", () => ({
  formatTokens: vi.fn((n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }),
}));

vi.mock("../../../src/ui/render", () => ({
  buildBar: vi.fn((pct: number) => {
    const filled = Math.round((pct / 100) * 16);
    return `${"█".repeat(filled)}${"░".repeat(16 - filled)}`;
  }),
  buildSectionRule: vi.fn((width?: number) => "═".repeat(width ?? 42)),
  formatTimeUntil: vi.fn((iso: string) => {
    const now = new Date();
    const reset = new Date(iso);
    const diffMs = reset.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  }),
  maxContentWidth: vi.fn((title: string, ...lines: string[]) => {
    const allLines = [title, ...lines];
    return Math.max(42, ...allLines.map((l) => l.length));
  }),
}));

import { getResolvedProviderConfig, hasAnyProviderLimits } from "../../../src/analytics/plans";
import { getLiveProviders, getLiveQuota } from "../../../src/analytics/quota";
import { buildLimitsSummary } from "../../../src/ui/commands/limits";

describe("buildLimitsSummary", () => {
  it("should return no limits configured message when no limits and no live data", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue([]);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("No provider limits configured.");
    expect(result).toContain("opencode.json");
  });

  it("should show live providers with fiveHour window", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({ planDisplayName: null, limits: {} });

    const mockQuota = {
      provider: "anthropic",
      windows: {
        fiveHour: { percentRemaining: 90, resetTimeIso: "2026-03-15T17:00:00Z" },
      },
      unit: "tokens" as const,
      limit: 0,
      used: 0,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("ANTHROPIC");
    expect(result).toContain("5-hour");
    expect(result).toContain("[live]");
  });

  it("should show hourly window with token usage", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({
      planDisplayName: null,
      limits: { hourly: 100_000 },
    });

    const mockQuota = {
      provider: "anthropic",
      windows: {
        hourly: { percentRemaining: 80, resetTimeIso: "2026-03-15T13:00:00Z" },
      },
      unit: "tokens" as const,
      limit: 100_000,
      used: 20_000,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("hourly");
    expect(result).toContain("20.0K");
    expect(result).toContain("100.0K");
  });

  it("should show sevenDay window", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({ planDisplayName: null, limits: {} });

    const mockQuota = {
      provider: "anthropic",
      windows: {
        sevenDay: { percentRemaining: 95, resetTimeIso: "2026-03-22T00:00:00Z" },
      },
      unit: "tokens" as const,
      limit: 0,
      used: 0,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("7-day");
    expect(result).toContain("[live]");
  });

  it("should show weekly window with credits unit", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["openrouter"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({ planDisplayName: null, limits: {} });

    const mockQuota = {
      provider: "openrouter",
      windows: {
        weekly: { percentRemaining: 70, resetTimeIso: "2026-03-22T00:00:00Z" },
      },
      unit: "credits" as const,
      limit: 100.0,
      used: 30.0,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("credits");
    expect(result).toContain("$70.00");
    expect(result).toContain("$100.00");
  });

  it("should show weekly window with requests unit", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["copilot"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({ planDisplayName: null, limits: {} });

    const mockQuota = {
      provider: "copilot",
      windows: {
        weekly: { percentRemaining: 60, resetTimeIso: "2026-03-22T00:00:00Z" },
      },
      unit: "requests" as const,
      limit: 500,
      used: 200,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("monthly");
    expect(result).toContain("200 / 500 req");
  });

  it("should show local limits configured", async () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(true);
    vi.mocked(getLiveProviders).mockReturnValue([]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({
      planDisplayName: null,
      limits: { daily: 1_000_000, hourly: 100_000 },
    });
    const rollup = await import("../../../src/storage/rollup");
    vi.mocked(rollup.getTodayRollups).mockReturnValue([
      {
        date: "2026-03-15",
        kind: "provider",
        name: "anthropic",
        inp: 100_000,
        out: 50_000,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
    ]);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("ANTHROPIC");
    expect(result).toContain("today");
    expect(result).toContain("hourly");
  });

  it("should render text mode without bars", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({ planDisplayName: null, limits: {} });

    const mockQuota = {
      provider: "anthropic",
      windows: {
        fiveHour: { percentRemaining: 90, resetTimeIso: "2026-03-15T17:00:00Z" },
      },
      unit: "tokens" as const,
      limit: 0,
      used: 0,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("text");

    expect(result).toContain("5-hour");
    expect(result).toContain("10%");
    expect(result).not.toContain("█");
  });

  it("should show plan display name in header", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({
      planDisplayName: "Pro",
      limits: {},
    });

    const mockQuota = {
      provider: "anthropic",
      windows: {
        fiveHour: { percentRemaining: 90, resetTimeIso: "2026-03-15T17:00:00Z" },
      },
      unit: "tokens" as const,
      limit: 0,
      used: 0,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("ANTHROPIC  (Pro)");
  });

  it("should show daily estimated window", () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(false);
    vi.mocked(getLiveProviders).mockReturnValue(["gemini"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({ planDisplayName: null, limits: {} });

    const mockQuota = {
      provider: "gemini",
      windows: {
        daily: { percentRemaining: 50, resetTimeIso: "2026-03-16T00:00:00Z" },
      },
      unit: "tokens" as const,
      limit: 1000,
      used: 0,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("daily");
    expect(result).toContain("[est]");
  });

  it("should combine live and local limits for same provider", async () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(true);
    vi.mocked(getLiveProviders).mockReturnValue(["anthropic"]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({
      planDisplayName: null,
      limits: { daily: 1_000_000 },
    });
    const rollup = await import("../../../src/storage/rollup");
    vi.mocked(rollup.getTodayRollups).mockReturnValue([
      {
        date: "2026-03-15",
        kind: "provider",
        name: "anthropic",
        inp: 100_000,
        out: 50_000,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
    ]);

    const mockQuota = {
      provider: "anthropic",
      windows: {
        fiveHour: { percentRemaining: 90, resetTimeIso: "2026-03-15T17:00:00Z" },
      },
      unit: "tokens" as const,
      limit: 0,
      used: 0,
    };
    vi.mocked(getLiveQuota).mockReturnValue(mockQuota);

    const result = buildLimitsSummary("normal");

    expect(result).toContain("ANTHROPIC");
    expect(result).toContain("5-hour");
    expect(result).toContain("today");
  });

  it("should include month label in title when limits exist", async () => {
    vi.mocked(hasAnyProviderLimits).mockReturnValue(true);
    vi.mocked(getLiveProviders).mockReturnValue([]);
    vi.mocked(getResolvedProviderConfig).mockReturnValue({
      planDisplayName: null,
      limits: { daily: 1_000_000 },
    });

    const result = buildLimitsSummary("normal");

    expect(result).toContain("Provider Limits");
    expect(result).toMatch(/\[.*\d{4}\]/);
  });
});
