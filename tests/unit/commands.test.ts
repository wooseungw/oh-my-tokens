import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTodayRollupsMock,
  getHourProviderTotalsMock,
  getWeekProviderRollupsMock,
  getMonthProviderRollupsMock,
  hasAnyProviderLimitsMock,
  getResolvedProviderConfigMock,
  existsSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
  mkdirSyncMock,
  findOpencodeConfigPathMock,
  findOhMyTokensConfigPathMock,
  formatBudgetAlertMock,
} = vi.hoisted(() => ({
  getTodayRollupsMock: vi.fn(),
  getHourProviderTotalsMock: vi.fn(),
  getWeekProviderRollupsMock: vi.fn(),
  getMonthProviderRollupsMock: vi.fn(),
  hasAnyProviderLimitsMock: vi.fn(),
  getResolvedProviderConfigMock: vi.fn(),
  existsSyncMock: vi.fn<(p: string) => boolean>(() => false),
  readFileSyncMock: vi.fn<(p: string, enc: string) => string>(() => "{}"),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  findOpencodeConfigPathMock: vi.fn(() => "/mock/opencode.json"),
  findOhMyTokensConfigPathMock: vi.fn(() => "/mock/oh-my-tokens.json"),
  formatBudgetAlertMock: vi.fn<(statuses: unknown[]) => string | null>(() => null),
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
  formatBudgetAlert: formatBudgetAlertMock,
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

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
}));

vi.mock("../../src/paths", () => ({
  findOpencodeConfigPath: findOpencodeConfigPathMock,
  findOhMyTokensConfigPath: findOhMyTokensConfigPathMock,
}));

import { handleOmtCommand } from "../../src/ui/commands/index";

describe("handleOmtCommand — default summary", () => {
  beforeEach(() => {
    getWeekProviderRollupsMock.mockReset();
    getWeekProviderRollupsMock.mockReturnValue([]);
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

  it("prepends budget alert when formatBudgetAlert returns non-null", () => {
    formatBudgetAlertMock.mockReturnValueOnce(
      "oh-my-tokens — Budget Warning\n═══...\n  daily ████ 85%  85.0K / 100.0K ~",
    );
    const result = handleOmtCommand("", "ses_test");
    expect(result.text).toContain("oh-my-tokens — Budget Warning");
    const alertIdx = result.text.indexOf("oh-my-tokens — Budget Warning");
    const summaryIdx = result.text.indexOf("oh-my-tokens — Today's Summary");
    expect(alertIdx).toBeLessThan(summaryIdx);
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
    expect(result.text).toContain("⏱\uFE0F hourly");
    expect(result.text).toContain("📅 today");
    expect(result.text).toContain("🗓\uFE0F monthly");
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

describe("handleOmtCommand — text display mode", () => {
  beforeEach(() => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ display: "text" }));
    getWeekProviderRollupsMock.mockReset();
    getWeekProviderRollupsMock.mockReturnValue([]);
    getTodayRollupsMock.mockReset();
    getTodayRollupsMock.mockReturnValue([
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

  it("renders summary without block bar characters when display is text", () => {
    const result = handleOmtCommand("", "ses_test");
    expect(result.text).not.toContain("█");
    expect(result.text).not.toContain("░");
    expect(result.text).toContain("anthropic");
    expect(result.text).toContain("24.3K tok");
  });

  it("shows display hint including text option in settings output", () => {
    const result = handleOmtCommand("setting", "ses_test");
    expect(result.text).toContain("text");
    expect(result.text).toContain("compact | normal | extend | text");
  });
});

describe("handleOmtCommand — setting subcommand", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    findOpencodeConfigPathMock.mockReturnValue("/mock/opencode.json");
    getTodayRollupsMock.mockReturnValue([]);
    getWeekProviderRollupsMock.mockReturnValue([]);
    getMonthProviderRollupsMock.mockReturnValue([]);
    getHourProviderTotalsMock.mockReturnValue(new Map());
  });

  it("displays current settings when no args given", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ display: "compact", budget: { daily: 500000 } }),
    );
    const result = handleOmtCommand("setting", "ses_test");
    expect(result.text).toContain("oh-my-tokens — Settings");
    expect(result.text).toContain("/mock/oh-my-tokens.json");
    expect(result.text).toContain("display");
    expect(result.text).toContain("compact");
    expect(result.text).toContain("budget.daily");
    expect(result.text).toContain("500000");
  });

  it("shows (not set) for unconfigured keys", () => {
    existsSyncMock.mockReturnValue(false);
    const result = handleOmtCommand("setting", "ses_test");
    expect(result.text).toContain("(not set)");
  });

  it("sets a top-level key and writes back to config file", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    const result = handleOmtCommand("setting display compact", "ses_test");
    expect(result.text).toContain("✓ display");
    expect(result.text).toContain("compact");
    expect(result.text).toContain("Restart OpenCode");
    expect(writeFileSyncMock.mock.calls[0][0]).toBe("/mock/oh-my-tokens.json");
    const written = JSON.parse(writeFileSyncMock.mock.calls[0][1] as string);
    expect(written.display).toBe("compact");
  });

  it("sets a nested budget key using dot notation", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    const result = handleOmtCommand("setting budget.daily 1000000", "ses_test");
    expect(result.text).toContain("✓ budget.daily");
    expect(result.text).toContain("1000000");
    expect(writeFileSyncMock.mock.calls[0][0]).toBe("/mock/oh-my-tokens.json");
    const written = JSON.parse(writeFileSyncMock.mock.calls[0][1] as string);
    expect(written.budget.daily).toBe(1000000);
  });

  it("preserves casing for string values like IANA timezones", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    handleOmtCommand("setting budget.timezone Asia/Seoul", "ses_test");
    const written = JSON.parse(writeFileSyncMock.mock.calls[0][1] as string);
    expect(written.budget.timezone).toBe("Asia/Seoul");
  });

  it("coerces boolean string values", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    handleOmtCommand("setting toast.enabled false", "ses_test");
    const written = JSON.parse(writeFileSyncMock.mock.calls[0][1] as string);
    expect(written.toast.enabled).toBe(false);
  });

  it("shows preview in bar mode after setting display to normal", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    getTodayRollupsMock.mockReturnValue([
      {
        date: "2026-03-12",
        kind: "provider",
        name: "anthropic",
        inp: 100,
        out: 200,
        think: 0,
        chat: 200,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
    ]);
    const result = handleOmtCommand("setting display normal", "ses_test");
    expect(result.text).toContain("✓ display");
    expect(result.text).toContain("Preview");
    expect(result.text).toContain("█");
  });

  it("shows preview in text mode after setting display to text", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    getTodayRollupsMock.mockReturnValue([
      {
        date: "2026-03-12",
        kind: "provider",
        name: "anthropic",
        inp: 100,
        out: 200,
        think: 0,
        chat: 200,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
    ]);
    const result = handleOmtCommand("setting display text", "ses_test");
    expect(result.text).toContain("✓ display");
    expect(result.text).toContain("Preview");
    expect(result.text).not.toContain("█");
    expect(result.text).not.toContain("░");
  });

  it("rejects invalid display value with error and valid options", () => {
    const result = handleOmtCommand("setting display minimal", "ses_test");
    expect(result.text).toContain("✗");
    expect(result.text).toContain("minimal");
    expect(result.text).toContain("compact | normal | extend | text");
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("rejects invalid enrichment value", () => {
    const result = handleOmtCommand("setting enrichment always", "ses_test");
    expect(result.text).toContain("✗");
    expect(result.text).toContain("always");
    expect(result.text).toContain("off | auto | manual | opencode-quota");
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("shows key-specific hint with valid values when key given but no value", () => {
    existsSyncMock.mockReturnValue(false);
    const result = handleOmtCommand("setting display", "ses_test");
    expect(result.text).toContain("compact | normal | extend | text");
    expect(result.text).toContain("Usage:");
  });

  it("shows current value in key hint when set", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ display: "text" }));
    const result = handleOmtCommand("setting display", "ses_test");
    expect(result.text).toContain("Current: text");
  });

  it("shows unknown setting message for unrecognised key", () => {
    const result = handleOmtCommand("setting unknownkey", "ses_test");
    expect(result.text).toContain("Unknown setting: unknownkey");
  });

  it("rejects non-integer budget.daily value", () => {
    const result = handleOmtCommand("setting budget.daily abc", "ses_test");
    expect(result.text).toContain("✗");
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range budget.dailyResetHour", () => {
    const result = handleOmtCommand("setting budget.dailyResetHour 25", "ses_test");
    expect(result.text).toContain("✗");
    expect(result.text).toContain("0–23");
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("rejects invalid IANA timezone", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    const result = handleOmtCommand("setting budget.timezone Fake/Zone", "ses_test");
    expect(result.text).toContain("✗");
    expect(result.text).toContain("IANA timezone");
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("accepts valid IANA timezone", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({}));
    const result = handleOmtCommand("setting budget.timezone Asia/Seoul", "ses_test");
    expect(result.text).toContain("✓ budget.timezone");
    expect(writeFileSyncMock).toHaveBeenCalled();
  });

  it("shows error when oh-my-tokens.json is unparseable", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("{ invalid json }");
    const result = handleOmtCommand("setting display compact", "ses_test");
    expect(result.text).toContain("✗");
    expect(result.text).toContain("parse");
  });
});
