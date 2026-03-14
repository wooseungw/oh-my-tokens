import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RollupRow } from "../../src/storage/rollup";

const { getRollupsMock } = vi.hoisted(() => ({
  getRollupsMock: vi.fn(),
}));

vi.mock("../../src/storage/rollup", () => ({
  getRollups: getRollupsMock,
}));

import {
  detectSpikes,
  formatTrendChart,
  getDailyTrend,
  getTaskTypeTrend,
  getWowChange,
} from "../../src/analytics/trends";

function createTotalRow(date: string, total: number): RollupRow {
  return {
    date,
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

describe("analytics trends", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T10:00:00"));
    getRollupsMock.mockReset();
  });

  it("builds a daily trend with zero-filled missing days", () => {
    getRollupsMock.mockReturnValue([
      createTotalRow("2026-03-06", 100),
      createTotalRow("2026-03-08", 250),
      createTotalRow("2026-03-12", 400),
    ]);

    expect(getDailyTrend()).toEqual([
      { date: "2026-03-06", total: 100 },
      { date: "2026-03-07", total: 0 },
      { date: "2026-03-08", total: 250 },
      { date: "2026-03-09", total: 0 },
      { date: "2026-03-10", total: 0 },
      { date: "2026-03-11", total: 0 },
      { date: "2026-03-12", total: 400 },
    ]);
    expect(getRollupsMock).toHaveBeenCalledWith("2026-03-06", "2026-03-12");
  });

  it("calculates week-over-week change", () => {
    getRollupsMock.mockImplementation((from: string, to: string) => {
      if (from === "2026-03-09" && to === "2026-03-15") {
        return [createTotalRow("2026-03-10", 150), createTotalRow("2026-03-12", 250)];
      }

      if (from === "2026-03-02" && to === "2026-03-08") {
        return [createTotalRow("2026-03-02", 100), createTotalRow("2026-03-08", 100)];
      }

      return [];
    });

    expect(getWowChange()).toEqual({
      current: 400,
      previous: 200,
      changePercent: 100,
    });
  });

  it("returns a null wow percentage when the previous week is zero", () => {
    getRollupsMock.mockImplementation((from: string, to: string) => {
      if (from === "2026-03-09" && to === "2026-03-15") {
        return [createTotalRow("2026-03-11", 300)];
      }

      return [];
    });

    expect(getWowChange()).toEqual({
      current: 300,
      previous: 0,
      changePercent: null,
    });
  });

  it("detects spikes with z-score above 2.0", () => {
    expect(
      detectSpikes([
        { date: "2026-03-06", total: 10 },
        { date: "2026-03-07", total: 10 },
        { date: "2026-03-08", total: 10 },
        { date: "2026-03-09", total: 10 },
        { date: "2026-03-10", total: 10 },
        { date: "2026-03-11", total: 10 },
        { date: "2026-03-12", total: 100 },
      ]),
    ).toEqual([
      {
        date: "2026-03-12",
        total: 100,
        zScore: expect.closeTo(2.449, 3),
      },
    ]);
  });

  it("returns no spikes for stable data", () => {
    expect(
      detectSpikes([
        { date: "2026-03-06", total: 10 },
        { date: "2026-03-07", total: 12 },
        { date: "2026-03-08", total: 9 },
        { date: "2026-03-09", total: 11 },
      ]),
    ).toEqual([]);
  });

  it("formats the trend chart as a fixed-width ascii bar chart", () => {
    expect(
      formatTrendChart([
        { date: "2026-03-10", total: 12_000 },
        { date: "2026-03-11", total: 24_000 },
        { date: "2026-03-12", total: 0 },
      ]),
    ).toBe(
      [
        "  2026-03-10  ██████░░░░░░   12.0K",
        "  2026-03-11  ████████████   24.0K",
        "  2026-03-12  ░░░░░░░░░░░░       0",
      ].join("\n"),
    );
  });

  describe("getTaskTypeTrend", () => {
    it("returns 7 points by default", () => {
      getRollupsMock.mockReturnValue([]);

      const points = getTaskTypeTrend();

      expect(points).toHaveLength(7);
    });

    it("returns zero percentages when no data", () => {
      getRollupsMock.mockReturnValue([]);

      const points = getTaskTypeTrend();

      for (const point of points) {
        expect(point.thinkPct).toBe(0);
        expect(point.chatPct).toBe(0);
        expect(point.codePct).toBe(0);
      }
    });

    it("computes rounded task-type percentages from total rows", () => {
      getRollupsMock.mockReturnValue([
        {
          ...createTotalRow("2026-03-11", 0),
          think: 9,
          chat: 6,
          code: 5,
        },
      ]);

      expect(getTaskTypeTrend()).toContainEqual({
        date: "2026-03-11",
        thinkPct: 45,
        chatPct: 30,
        codePct: 25,
      });
    });
  });
});
