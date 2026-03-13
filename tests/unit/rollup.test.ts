import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryAllMock, queryOneMock } = vi.hoisted(() => ({
  queryAllMock: vi.fn(),
  queryOneMock: vi.fn(),
}));

vi.mock("../../src/storage/db", () => ({
  queryAll: queryAllMock,
  queryOne: queryOneMock,
}));

import {
  getHourProviderTotals,
  getMonthProviderRollups,
  getMonthTotal,
  getRollups,
  getSessionTotals,
  getTodayRollups,
  getWeekProviderRollups,
  getWeekTotal,
} from "../../src/storage/rollup";

describe("rollup storage queries", () => {
  beforeEach(() => {
    queryAllMock.mockReset();
    queryOneMock.mockReset();
    vi.useRealTimers();
  });

  it("reads today's rollups", () => {
    vi.setSystemTime(new Date("2026-03-12T10:00:00"));
    queryAllMock.mockReturnValue([{ kind: "total" }]);

    expect(getTodayRollups()).toEqual([{ kind: "total" }]);
    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM rollups"),
      "2026-03-12",
    );
  });

  it("reads rollups for a date range", () => {
    queryAllMock.mockReturnValue([]);

    getRollups("2026-03-01", "2026-03-31");

    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE date BETWEEN ? AND ?"),
      "2026-03-01",
      "2026-03-31",
    );
  });

  it("reads session totals from events", () => {
    queryOneMock.mockReturnValue({
      inp: 100,
      out: 40,
      think: 8,
      chat: 0,
      code: 40,
      cache_r: 5,
      cache_w: 2,
      cost: 0.42,
      count: 2,
    });

    expect(getSessionTotals("ses_1")).toEqual({
      inp: 100,
      out: 40,
      think: 8,
      chat: 0,
      code: 40,
      cache_r: 5,
      cache_w: 2,
      cost: 0.42,
      count: 2,
    });
  });

  it("returns null when a session has no events", () => {
    queryOneMock.mockReturnValue({ count: 0 });

    expect(getSessionTotals("ses_2")).toBeNull();
  });

  it("aggregates the current ISO week total", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T10:00:00"));
    queryOneMock.mockReturnValue({
      inp: 300,
      out: 100,
      think: 20,
      chat: 10,
      code: 90,
      cache_r: 30,
      cache_w: 5,
      cost: 1.2,
      count: 4,
    });

    expect(getWeekTotal()).toEqual({
      date: "2026-03-09",
      kind: "total",
      name: "*",
      inp: 300,
      out: 100,
      think: 20,
      chat: 10,
      code: 90,
      cache_r: 30,
      cache_w: 5,
      cost: 1.2,
      count: 4,
    });
    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE kind = 'total' AND name = '*' AND date BETWEEN ? AND ?"),
      "2026-03-09",
      "2026-03-15",
    );
  });

  it("aggregates the current month total", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T10:00:00"));
    queryOneMock.mockReturnValue({
      inp: 900,
      out: 500,
      think: 120,
      chat: 80,
      code: 420,
      cache_r: 60,
      cache_w: 10,
      cost: 3.8,
      count: 11,
    });

    expect(getMonthTotal()).toEqual({
      date: "2026-03-01",
      kind: "total",
      name: "*",
      inp: 900,
      out: 500,
      think: 120,
      chat: 80,
      code: 420,
      cache_r: 60,
      cache_w: 10,
      cost: 3.8,
      count: 11,
    });
    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE kind = 'total' AND name = '*' AND date BETWEEN ? AND ?"),
      "2026-03-01",
      "2026-03-31",
    );
  });

  it("returns per-provider aggregated rows for the current calendar month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T10:00:00"));
    queryAllMock.mockReturnValue([
      {
        date: "2026-03-01",
        kind: "provider",
        name: "anthropic",
        inp: 900,
        out: 500,
        think: 120,
        chat: 80,
        code: 420,
        cache_r: 60,
        cache_w: 10,
        cost: 3.8,
        count: 11,
      },
      {
        date: "2026-03-01",
        kind: "provider",
        name: "openai",
        inp: 200,
        out: 100,
        think: 0,
        chat: 100,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0.5,
        count: 3,
      },
    ]);

    const rows = getMonthProviderRollups();
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("anthropic");
    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE kind = 'provider' AND date BETWEEN ? AND ?"),
      "2026-03-01",
      "2026-03-01",
      "2026-03-31",
    );
  });

  it("returns per-provider aggregated rows for the current ISO week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T10:00:00"));
    queryAllMock.mockReturnValue([
      {
        date: "2026-03-09",
        kind: "provider",
        name: "anthropic",
        inp: 300,
        out: 100,
        think: 20,
        chat: 10,
        code: 90,
        cache_r: 30,
        cache_w: 5,
        cost: 1.2,
        count: 4,
      },
    ]);

    const rows = getWeekProviderRollups();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("anthropic");
    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE kind = 'provider' AND date BETWEEN ? AND ?"),
      "2026-03-09",
      "2026-03-09",
      "2026-03-15",
    );
  });

  it("returns a Map of provider->tokens for the last hour", () => {
    queryAllMock.mockReturnValue([
      { provider: "anthropic", tokens: 2_100_000 },
      { provider: "openai", tokens: 500_000 },
    ]);

    const map = getHourProviderTotals();
    expect(map.get("anthropic")).toBe(2_100_000);
    expect(map.get("openai")).toBe(500_000);
    expect(map.size).toBe(2);
    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM events"),
      expect.any(Number),
    );
  });

  it("returns an empty Map when no events exist in the last hour", () => {
    queryAllMock.mockReturnValue([]);
    expect(getHourProviderTotals().size).toBe(0);
  });
});
