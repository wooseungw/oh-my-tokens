import { getRollups, type RollupRow } from "../storage/rollup";
import { formatCost, formatTokens } from "../ui/formatter";
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

export interface TaskTypeTrendPoint {
  date: string;
  thinkPct: number;
  chatPct: number;
  codePct: number;
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

function getDailyUsage(rows: RollupRow[]) {
  const totalRows = rows.filter((row) => row.kind === "total" && row.name === "*");

  if (totalRows.length > 0) {
    return aggregateByDate(totalRows);
  }

  const providerRows = rows.filter((row) => row.kind === "provider");
  return aggregateByDate(providerRows);
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
  const usageByDate = getDailyUsage(getRollups(from, to));

  return keys.map((date) => ({
    date,
    total: usageByDate.get(date)?.totalTokens ?? 0,
  }));
}

export function getDailyCosts(days = 7): Map<string, number> {
  const { from, to, keys } = getDateRange(days);
  const usageByDate = getDailyUsage(getRollups(from, to));

  return new Map(keys.map((date) => [date, usageByDate.get(date)?.cost ?? 0]));
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

export function formatTrendChart(
  points: TrendPoint[],
  costByDate?: ReadonlyMap<string, number>,
): string {
  const maxTotal = points.reduce((max, point) => Math.max(max, point.total), 0);

  return points
    .map(
      (point) =>
        `  ${point.date}  ${buildBar(point.total, maxTotal)}  ${
          costByDate !== undefined
            ? formatCost(costByDate.get(point.date) ?? 0).padStart(7)
            : formatTokens(point.total).padStart(6, " ")
        }`,
    )
    .join("\n");
}

export function getTaskTypeTrend(days = 7): TaskTypeTrendPoint[] {
  const { from, to, keys } = getDateRange(days);
  const rows = getRollups(from, to).filter((row) => row.kind === "total" && row.name === "*");

  const byDate = new Map<string, { think: number; chat: number; code: number }>();
  for (const row of rows) {
    byDate.set(row.date, { think: row.think, chat: row.chat, code: row.code });
  }

  return keys.map((date) => {
    const data = byDate.get(date);
    if (!data) {
      return { date, thinkPct: 0, chatPct: 0, codePct: 0 };
    }

    const total = data.think + data.chat + data.code;
    if (total === 0) {
      return { date, thinkPct: 0, chatPct: 0, codePct: 0 };
    }

    return {
      date,
      thinkPct: Math.round((data.think / total) * 100),
      chatPct: Math.round((data.chat / total) * 100),
      codePct: Math.round((data.code / total) * 100),
    };
  });
}
