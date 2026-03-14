import { getRollups, type RollupRow } from "../storage/rollup";
import { formatTokens } from "../ui/formatter";
import { dateKeyFromMs } from "../utils";
import { aggregateByDate } from "./aggregator";
import { computeTotalTokens } from "./token-math";

const CHART_BAR_WIDTH = 12;
const SPIKE_Z_SCORE_THRESHOLD = 2;

export interface TrendPoint {
  date: string;
  total: number;
}

export interface SpikeResult {
  date: string;
  total: number;
  zScore: number;
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateRange(days: number): { from: string; to: string; keys: string[] } {
  const safeDays = Math.max(1, Math.floor(days));
  const end = new Date();
  const start = addLocalDays(end, -(safeDays - 1));
  const keys: string[] = [];

  for (let index = 0; index < safeDays; index += 1) {
    keys.push(dateKeyFromMs(addLocalDays(start, index).getTime()));
  }

  return {
    from: keys[0],
    to: keys[keys.length - 1],
    keys,
  };
}

function getDailyTotals(rows: RollupRow[]): Map<string, number> {
  const totalRows = rows.filter((row) => row.kind === "total" && row.name === "*");

  if (totalRows.length > 0) {
    const totalsByDate = aggregateByDate(totalRows);
    return new Map(
      Array.from(totalsByDate.entries(), ([date, usage]) => [date, usage.totalTokens]),
    );
  }

  const providerRows = rows.filter((row) => row.kind === "provider");
  const providerTotalsByDate = aggregateByDate(providerRows);
  return new Map(
    Array.from(providerTotalsByDate.entries(), ([date, usage]) => [date, usage.totalTokens]),
  );
}

function getWeekWindow(offsetWeeks: number): { from: string; to: string } {
  const today = new Date();
  const shifted = addLocalDays(today, offsetWeeks * 7);
  const day = shifted.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = addLocalDays(shifted, diffToMonday);
  const end = addLocalDays(start, 6);

  return {
    from: dateKeyFromMs(start.getTime()),
    to: dateKeyFromMs(end.getTime()),
  };
}

function sumRangeTotal(from: string, to: string): number {
  const rows = getRollups(from, to).filter((row) => row.kind === "total" && row.name === "*");

  if (rows.length > 0) {
    return rows.reduce((sum, row) => sum + computeTotalTokens(row), 0);
  }

  return getRollups(from, to)
    .filter((row) => row.kind === "provider")
    .reduce((sum, row) => sum + computeTotalTokens(row), 0);
}

function buildBar(total: number, maxTotal: number): string {
  if (maxTotal <= 0 || total <= 0) {
    return "░".repeat(CHART_BAR_WIDTH);
  }

  const filled = Math.max(1, Math.round((total / maxTotal) * CHART_BAR_WIDTH));
  return `${"█".repeat(filled)}${"░".repeat(CHART_BAR_WIDTH - filled)}`;
}

export function getDailyTrend(days = 7): TrendPoint[] {
  const { from, to, keys } = getDateRange(days);
  const totalsByDate = getDailyTotals(getRollups(from, to));

  return keys.map((date) => ({
    date,
    total: totalsByDate.get(date) ?? 0,
  }));
}

export function getWowChange(): {
  current: number;
  previous: number;
  changePercent: number | null;
} {
  const currentWindow = getWeekWindow(0);
  const previousWindow = getWeekWindow(-1);
  const current = sumRangeTotal(currentWindow.from, currentWindow.to);
  const previous = sumRangeTotal(previousWindow.from, previousWindow.to);

  return {
    current,
    previous,
    changePercent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

export function detectSpikes(points: TrendPoint[]): SpikeResult[] {
  if (points.length === 0) {
    return [];
  }

  const totals = points.map((point) => point.total);
  const mean = totals.reduce((sum, total) => sum + total, 0) / totals.length;
  const variance = totals.reduce((sum, total) => sum + (total - mean) ** 2, 0) / totals.length;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) {
    return [];
  }

  return points
    .map((point) => ({
      date: point.date,
      total: point.total,
      zScore: (point.total - mean) / stddev,
    }))
    .filter((point) => point.zScore > SPIKE_Z_SCORE_THRESHOLD);
}

export function formatTrendChart(points: TrendPoint[]): string {
  const maxTotal = points.reduce((max, point) => Math.max(max, point.total), 0);

  return points
    .map(
      (point) =>
        `  ${point.date}  ${buildBar(point.total, maxTotal)}  ${formatTokens(point.total).padStart(6, " ")}`,
    )
    .join("\n");
}
