import { queryOne } from "../storage/db";
import type { RollupRow } from "../storage/rollup";
import { getMonthTotal, getRollups, getTodayRollups, getWeekTotal } from "../storage/rollup";
import { formatTokens } from "../ui/formatter";
import { todayDateKey } from "../utils";
import { computeTotalTokens } from "./token-math";

const BAR_WIDTH = 16;

export interface BudgetConfig {
  daily?: number;
  weekly?: number;
  monthly?: number;
  weeklyResetDay?: string;
  dailyResetHour?: number;
  /** IANA timezone identifier, e.g. "Asia/Seoul", "America/New_York". Defaults to local system timezone. */
  timezone?: string;
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

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localDateParts(tz: string | undefined): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const now = new Date();
  if (tz === undefined || !isValidTimezone(tz)) {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      weekday: now.getDay(),
    };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")) - 1,
    day: Number(get("day")),
    weekday: weekdayNames.indexOf(get("weekday")),
  };
}

function todayAtHourMs(hour: number, tz: string | undefined): number {
  const { year, month, day } = localDateParts(tz);
  if (tz === undefined || !isValidTimezone(tz)) {
    return new Date(year, month, day, hour, 0, 0, 0).getTime();
  }
  const mm = `${month + 1}`.padStart(2, "0");
  const dd = `${day}`.padStart(2, "0");
  const hh = `${hour}`.padStart(2, "0");
  const localIso = `${year}-${mm}-${dd}T${hh}:00:00`;
  const probe = new Date(`${localIso}Z`);
  const displayed = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(probe);
  const displayedMs = new Date(`${displayed.replace(", ", "T")}Z`).getTime();
  const offsetMs = probe.getTime() - displayedMs;
  return new Date(`${localIso}Z`).getTime() + offsetMs;
}

function mostRecentWeekdayDate(weekdayIndex: number, tz: string | undefined): string {
  const { year, month, day, weekday } = localDateParts(tz);
  const daysBack = (weekday - weekdayIndex + 7) % 7;
  const d = new Date(year, month, day - daysBack);
  const mo = `${d.getMonth() + 1}`.padStart(2, "0");
  const da = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${da}`;
}

function getTotalRowTotal(rows: RollupRow[]): number {
  const totalRow = rows.find((row) => row.kind === "total" && row.name === "*");

  if (totalRow !== undefined) {
    return computeTotalTokens(totalRow);
  }

  return rows
    .filter((row) => row.kind === "provider")
    .reduce((sum, row) => sum + computeTotalTokens(row), 0);
}

function getDailyUsed(resetHour: number | undefined, tz: string | undefined): number {
  const validHour =
    resetHour !== undefined && Number.isInteger(resetHour) && resetHour >= 1 && resetHour <= 23;
  if (validHour) {
    const row = queryOne<TokenSumRow>(
      "SELECT CAST(SUM(inp + out + think + cache_r + cache_w) AS INTEGER) AS tokens FROM events WHERE ts >= ?",
      todayAtHourMs(resetHour as number, tz),
    );
    return row?.tokens ?? 0;
  }
  return getTotalRowTotal(getTodayRollups());
}

function getWeeklyUsed(resetDay: string | undefined, tz: string | undefined): number {
  const weekdayIdx = resetDay !== undefined ? parseWeekdayIndex(resetDay) : 1;
  if (weekdayIdx !== -1 && weekdayIdx !== 1) {
    const rows = getRollups(mostRecentWeekdayDate(weekdayIdx, tz), todayDateKey());
    return rows
      .filter((row) => row.kind === "total" && row.name === "*")
      .reduce((sum, row) => sum + computeTotalTokens(row), 0);
  }
  return computeTotalTokens(
    getWeekTotal() ?? { inp: 0, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 },
  );
}

export function checkBudget(config: BudgetConfig): BudgetStatus[] {
  const statuses: BudgetStatus[] = [];

  if (config.daily !== undefined) {
    const used = getDailyUsed(config.dailyResetHour, config.timezone);
    statuses.push({
      period: "daily",
      limit: config.daily,
      used,
      ratio: config.daily > 0 ? used / config.daily : 0,
      exceeded: config.daily > 0 && used >= config.daily,
    });
  }

  if (config.weekly !== undefined) {
    const used = getWeeklyUsed(config.weeklyResetDay, config.timezone);
    statuses.push({
      period: "weekly",
      limit: config.weekly,
      used,
      ratio: config.weekly > 0 ? used / config.weekly : 0,
      exceeded: config.weekly > 0 && used >= config.weekly,
    });
  }

  if (config.monthly !== undefined) {
    const used = computeTotalTokens(
      getMonthTotal() ?? {
        inp: 0,
        out: 0,
        think: 0,
        chat: 0,
        code: 0,
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
