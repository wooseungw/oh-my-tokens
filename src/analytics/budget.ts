import { queryOne } from "../storage/db";
import type { RollupRow } from "../storage/rollup";
import { getMonthTotal, getRollups, getTodayRollups, getWeekTotal } from "../storage/rollup";
import { formatTokens } from "../ui/formatter";
import { todayDateKey } from "../utils";

const BAR_WIDTH = 16;

export interface BudgetConfig {
  daily?: number;
  weekly?: number;
  monthly?: number;
  weeklyResetDay?: string;
  dailyResetHour?: number;
}

let _budgetConfig: BudgetConfig = {};

export function getBudgetConfig(): BudgetConfig {
  return _budgetConfig;
}

export function setBudgetConfig(config: BudgetConfig): void {
  _budgetConfig = config;
}

export interface BudgetStatus {
  period: "daily" | "weekly" | "monthly";
  limit: number;
  used: number;
  ratio: number;
  exceeded: boolean;
}

function totalTokens(
  row: Pick<RollupRow, "inp" | "out" | "think" | "cache_r" | "cache_w">,
): number {
  return row.inp + row.out + row.think + row.cache_r + row.cache_w;
}

function buildBar(ratio: number): string {
  const normalized = Math.max(0, Math.min(ratio, 1));
  const filled = Math.round(normalized * BAR_WIDTH);
  return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
}

interface TokenSumRow {
  tokens: number | null;
}

function parseWeekdayIndex(day: string): number {
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[day.toLowerCase()] ?? -1;
}

function todayAtHourMs(hour: number): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0).getTime();
}

function mostRecentWeekdayDate(weekdayIndex: number): string {
  const now = new Date();
  const daysBack = (now.getDay() - weekdayIndex + 7) % 7;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function getTotalRowTotal(rows: RollupRow[]): number {
  const totalRow = rows.find((row) => row.kind === "total" && row.name === "*");

  if (totalRow !== undefined) {
    return totalTokens(totalRow);
  }

  return rows
    .filter((row) => row.kind === "provider")
    .reduce((sum, row) => sum + totalTokens(row), 0);
}

function getDailyUsed(resetHour: number | undefined): number {
  const validHour =
    resetHour !== undefined && Number.isInteger(resetHour) && resetHour >= 1 && resetHour <= 23;
  if (validHour) {
    const row = queryOne<TokenSumRow>(
      "SELECT CAST(SUM(inp + out + think + cache_r + cache_w) AS INTEGER) AS tokens FROM events WHERE ts >= ?",
      todayAtHourMs(resetHour as number),
    );
    return row?.tokens ?? 0;
  }
  return getTotalRowTotal(getTodayRollups());
}

function getWeeklyUsed(resetDay: string | undefined): number {
  const weekdayIdx = resetDay !== undefined ? parseWeekdayIndex(resetDay) : 1;
  if (weekdayIdx !== -1 && weekdayIdx !== 1) {
    const rows = getRollups(mostRecentWeekdayDate(weekdayIdx), todayDateKey());
    return rows
      .filter((row) => row.kind === "total" && row.name === "*")
      .reduce((sum, row) => sum + totalTokens(row), 0);
  }
  return totalTokens(getWeekTotal() ?? { inp: 0, out: 0, think: 0, cache_r: 0, cache_w: 0 });
}

export function checkBudget(config: BudgetConfig): BudgetStatus[] {
  const statuses: BudgetStatus[] = [];

  if (config.daily !== undefined) {
    const used = getDailyUsed(config.dailyResetHour);
    statuses.push({
      period: "daily",
      limit: config.daily,
      used,
      ratio: config.daily > 0 ? used / config.daily : 0,
      exceeded: config.daily > 0 && used >= config.daily,
    });
  }

  if (config.weekly !== undefined) {
    const used = getWeeklyUsed(config.weeklyResetDay);
    statuses.push({
      period: "weekly",
      limit: config.weekly,
      used,
      ratio: config.weekly > 0 ? used / config.weekly : 0,
      exceeded: config.weekly > 0 && used >= config.weekly,
    });
  }

  if (config.monthly !== undefined) {
    const used = totalTokens(
      getMonthTotal() ?? {
        inp: 0,
        out: 0,
        think: 0,
        cache_r: 0,
        cache_w: 0,
      },
    );
    statuses.push({
      period: "monthly",
      limit: config.monthly,
      used,
      ratio: config.monthly > 0 ? used / config.monthly : 0,
      exceeded: config.monthly > 0 && used >= config.monthly,
    });
  }

  return statuses;
}

export function formatBudgetAlert(statuses: BudgetStatus[]): string | null {
  const flagged = statuses.filter((status) => status.ratio >= 0.8);

  if (flagged.length === 0) {
    return null;
  }

  const hasExceeded = flagged.some((status) => status.exceeded);
  const title = hasExceeded ? "oh-my-tokens — Budget Alert" : "oh-my-tokens — Budget Warning";

  return [
    title,
    "═══════════════════════════════════════",
    ...flagged.map((status) => {
      const marker = status.exceeded ? "!" : "~";
      return `  ${status.period.padEnd(7, " ")} ${buildBar(status.ratio)} ${`${Math.round(status.ratio * 100)}%`.padStart(4, " ")}  ${formatTokens(status.used)} / ${formatTokens(status.limit)} ${marker}`;
    }),
  ].join("\n");
}
