import { todayDateKey } from "../utils";
import { queryAll, queryOne } from "./db";

export interface RollupRow {
  date: string;
  kind: string;
  name: string;
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  cost: number;
  count: number;
}

interface AggregateRow {
  inp: number | null;
  out: number | null;
  think: number | null;
  chat: number | null;
  code: number | null;
  cache_r: number | null;
  cache_w: number | null;
  cost: number | null;
  count: number | null;
}

function monthBounds(date: Date): { from: string; to: string } {
  const year = date.getFullYear();
  const month = date.getMonth();

  return {
    from: formatLocalDate(year, month, 1),
    to: formatLocalDate(year, month + 1, 0),
  };
}

const DAY_NAME_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

let _weeklyResetDayIndex = 1;

export function setWeeklyResetDay(day: string | undefined): void {
  _weeklyResetDayIndex = day !== undefined ? (DAY_NAME_MAP[day.toLowerCase()] ?? 1) : 1;
}

function weekBounds(date: Date): { from: string; to: string } {
  const currentDay = date.getDay();
  const daysBack = (currentDay - _weeklyResetDayIndex + 7) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return {
    from: formatLocalDate(start.getFullYear(), start.getMonth(), start.getDate()),
    to: formatLocalDate(end.getFullYear(), end.getMonth(), end.getDate()),
  };
}

function formatLocalDate(year: number, monthIndex: number, day: number): string {
  const date = new Date(year, monthIndex, day);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const datePart = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${datePart}`;
}

function normalizeAggregate(date: string, row: AggregateRow | null): RollupRow | null {
  if (row === null || row.count === null) {
    return null;
  }

  return {
    date,
    kind: "total",
    name: "*",
    inp: row.inp ?? 0,
    out: row.out ?? 0,
    think: row.think ?? 0,
    chat: row.chat ?? 0,
    code: row.code ?? 0,
    cache_r: row.cache_r ?? 0,
    cache_w: row.cache_w ?? 0,
    cost: row.cost ?? 0,
    count: row.count ?? 0,
  };
}

export function getTodayRollups(): RollupRow[] {
  return queryAll<RollupRow>(
    `
      SELECT date, kind, name, inp, out, think, chat, code, cache_r, cache_w, cost, count
      FROM rollups
      WHERE date = ?
      ORDER BY
        CASE kind
          WHEN 'total' THEN 0
          WHEN 'provider' THEN 1
          WHEN 'agent' THEN 2
          ELSE 3
        END,
        count DESC,
        name ASC
    `,
    todayDateKey(),
  );
}

export function getRollups(from: string, to: string): RollupRow[] {
  return queryAll<RollupRow>(
    `
      SELECT date, kind, name, inp, out, think, chat, code, cache_r, cache_w, cost, count
      FROM rollups
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC, kind ASC, count DESC, name ASC
    `,
    from,
    to,
  );
}

export function getSessionTotals(sessionId: string): {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  cost: number;
  count: number;
} | null {
  const row = queryOne<AggregateRow>(
    `
      SELECT
        SUM(inp) AS inp,
        SUM(out) AS out,
        SUM(think) AS think,
        SUM(chat) AS chat,
        SUM(code) AS code,
        SUM(cache_r) AS cache_r,
        SUM(cache_w) AS cache_w,
        SUM(cost) AS cost,
        COUNT(*) AS count
      FROM events
      WHERE sid = ?
    `,
    sessionId,
  );

  if (row === null || row.count === null || row.count < 1) {
    return null;
  }

  return {
    inp: row.inp ?? 0,
    out: row.out ?? 0,
    think: row.think ?? 0,
    chat: row.chat ?? 0,
    code: row.code ?? 0,
    cache_r: row.cache_r ?? 0,
    cache_w: row.cache_w ?? 0,
    cost: row.cost ?? 0,
    count: row.count,
  };
}

export function getWeekTotal(): RollupRow | null {
  const { from, to } = weekBounds(new Date());

  return normalizeAggregate(
    from,
    queryOne<AggregateRow>(
      `
        SELECT
          SUM(inp) AS inp,
          SUM(out) AS out,
          SUM(think) AS think,
          SUM(chat) AS chat,
          SUM(code) AS code,
          SUM(cache_r) AS cache_r,
          SUM(cache_w) AS cache_w,
          SUM(cost) AS cost,
          SUM(count) AS count
        FROM rollups
        WHERE kind = 'total' AND name = '*' AND date BETWEEN ? AND ?
      `,
      from,
      to,
    ),
  );
}

export function getMonthTotal(): RollupRow | null {
  const { from, to } = monthBounds(new Date());

  return normalizeAggregate(
    from,
    queryOne<AggregateRow>(
      `
        SELECT
          SUM(inp) AS inp,
          SUM(out) AS out,
          SUM(think) AS think,
          SUM(chat) AS chat,
          SUM(code) AS code,
          SUM(cache_r) AS cache_r,
          SUM(cache_w) AS cache_w,
          SUM(cost) AS cost,
          SUM(count) AS count
        FROM rollups
        WHERE kind = 'total' AND name = '*' AND date BETWEEN ? AND ?
      `,
      from,
      to,
    ),
  );
}

/**
 * Returns per-provider token totals aggregated over the current calendar month.
 * Used for 사용량/전체 display when provider plans are configured.
 */
export function getMonthProviderRollups(): RollupRow[] {
  const { from, to } = monthBounds(new Date());

  return queryAll<RollupRow>(
    `
      SELECT
        ? AS date,
        'provider' AS kind,
        name,
        CAST(SUM(inp) AS INTEGER) AS inp,
        CAST(SUM(out) AS INTEGER) AS out,
        CAST(SUM(think) AS INTEGER) AS think,
        CAST(SUM(chat) AS INTEGER) AS chat,
        CAST(SUM(code) AS INTEGER) AS code,
        CAST(SUM(cache_r) AS INTEGER) AS cache_r,
        CAST(SUM(cache_w) AS INTEGER) AS cache_w,
        SUM(cost) AS cost,
        CAST(SUM(count) AS INTEGER) AS count
      FROM rollups
      WHERE kind = 'provider' AND date BETWEEN ? AND ?
      GROUP BY name
      ORDER BY (SUM(inp) + SUM(out) + SUM(think) + SUM(cache_r) + SUM(cache_w)) DESC,
               name ASC
    `,
    from,
    from,
    to,
  );
}

export function getWeekProviderRollups(): RollupRow[] {
  const { from, to } = weekBounds(new Date());

  return queryAll<RollupRow>(
    `
      SELECT
        ? AS date,
        'provider' AS kind,
        name,
        CAST(SUM(inp) AS INTEGER) AS inp,
        CAST(SUM(out) AS INTEGER) AS out,
        CAST(SUM(think) AS INTEGER) AS think,
        CAST(SUM(chat) AS INTEGER) AS chat,
        CAST(SUM(code) AS INTEGER) AS code,
        CAST(SUM(cache_r) AS INTEGER) AS cache_r,
        CAST(SUM(cache_w) AS INTEGER) AS cache_w,
        SUM(cost) AS cost,
        CAST(SUM(count) AS INTEGER) AS count
      FROM rollups
      WHERE kind = 'provider' AND date BETWEEN ? AND ?
      GROUP BY name
      ORDER BY (SUM(inp) + SUM(out) + SUM(think) + SUM(cache_r) + SUM(cache_w)) DESC,
               name ASC
    `,
    from,
    from,
    to,
  );
}

interface HourProviderRow {
  provider: string;
  tokens: number;
}

export function getHourProviderTotals(): Map<string, number> {
  const sinceMs = Date.now() - 60 * 60 * 1000;
  const rows = queryAll<HourProviderRow>(
    `
      SELECT
        provider,
        CAST(SUM(inp + out + think + cache_r + cache_w) AS INTEGER) AS tokens
      FROM events
      WHERE ts >= ?
      GROUP BY provider
      ORDER BY tokens DESC
    `,
    sinceMs,
  );
  return new Map(rows.map((r) => [r.provider, r.tokens]));
}
