import pkg from "../../../package.json";

import { execute, queryAll, queryOne, runInTransaction } from "../../storage/db";
import { getTodayRollups, type RollupRow } from "../../storage/rollup";
import { todayDateKey } from "../../utils";

import { SECTION_RULE } from "../render";

const PLUGIN_VERSION = pkg.version;

interface CountRow {
  count: number;
}

interface StateRow {
  value: string | null;
}

interface EventRow {
  key: string;
  ts: number;
  ver: number;
  sid: string;
  psid: string | null;
  pid: string | null;
  provider: string;
  model: string;
  agent: string | null;
  initiator: string | null;
  depth: number;
  inp: number;
  out: number;
  reasoning: number;
  cache_r: number;
  cache_w: number;
  think: number;
  chat: number;
  code: number;
  tools: number;
  cost: number;
}

interface UsageTotals {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
}

function findTodayTotal(rows: RollupRow[]): UsageTotals {
  const totalRow = rows.find((row) => row.kind === "total" && row.name === "*");

  if (totalRow !== undefined) {
    return totalRow;
  }

  return rows
    .filter((row) => row.kind === "provider")
    .reduce<UsageTotals>(
      (totals, row) => ({
        inp: totals.inp + row.inp,
        out: totals.out + row.out,
        think: totals.think + row.think,
        chat: totals.chat + row.chat,
        code: totals.code + row.code,
        cache_r: totals.cache_r + row.cache_r,
        cache_w: totals.cache_w + row.cache_w,
      }),
      { inp: 0, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 },
    );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function getRetentionDays(): number {
  const raw = process.env.OMT_RETENTION_DAYS ?? process.env.OH_MY_TOKENS_RETENTION_DAYS;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

function buildCsvRow(values: Array<string | number>): string {
  return values
    .map((value) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}

function getDayBounds(dateKey: string): { startMs: number; endMs: number } {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);

  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);

  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

export function buildExportOutput(format: "json" | "csv"): string {
  const date = todayDateKey();
  const rows = getTodayRollups();
  const bounds = getDayBounds(date);
  const events = queryAll<EventRow>(
    `
      SELECT key, ts, ver, sid, psid, pid, provider, model, agent, initiator, depth, inp, out, reasoning, cache_r, cache_w, think, chat, code, tools, cost
      FROM events
      WHERE ts >= ? AND ts < ?
      ORDER BY ts ASC, key ASC
    `,
    bounds.startMs,
    bounds.endMs,
  );

  if (format === "csv") {
    return [
      buildCsvRow([
        "date",
        "kind",
        "name",
        "inp",
        "out",
        "think",
        "chat",
        "code",
        "cache_r",
        "cache_w",
        "cost",
        "count",
      ]),
      ...rows.map((row) =>
        buildCsvRow([
          row.date,
          row.kind,
          row.name,
          row.inp,
          row.out,
          row.think,
          row.chat,
          row.code,
          row.cache_r,
          row.cache_w,
          row.cost,
          row.count,
        ]),
      ),
    ].join("\n");
  }

  return JSON.stringify(
    {
      date,
      providers: rows.filter((row) => row.kind === "provider"),
      agents: rows.filter((row) => row.kind === "agent"),
      totals: {
        ...(rows.find((row) => row.kind === "total" && row.name === "*") ?? findTodayTotal(rows)),
        events: events.length,
      },
    },
    null,
    2,
  );
}

export function buildStatusOutput(sessionID: string): string {
  const rows = getTodayRollups();
  const providers = rows
    .filter((row) => row.kind === "provider")
    .map((row) => row.name)
    .sort((left, right) => left.localeCompare(right));
  const eventCount = queryOne<CountRow>("SELECT COUNT(*) AS count FROM events")?.count ?? 0;
  const rollupCount = queryOne<CountRow>("SELECT COUNT(*) AS count FROM rollups")?.count ?? 0;
  const schemaVersion = queryOne<StateRow>(
    "SELECT value FROM state WHERE key = ?",
    "schema_version",
  )?.value;

  return [
    "oh-my-tokens — Status",
    SECTION_RULE,
    `Version      ${PLUGIN_VERSION}`,
    `Schema       v${schemaVersion ?? "0"}`,
    `Events       ${formatCount(eventCount)}`,
    `Rollup rows  ${formatCount(rollupCount)}`,
    `Providers    ${providers.length > 0 ? providers.join(", ") : "none"}`,
    `Session      ${sessionID}`,
    `Retention    ${getRetentionDays()} days`,
    SECTION_RULE,
  ].join("\n");
}

function rebuildRollups(): { eventsProcessed: number; rollupsCreated: number } {
  return runInTransaction(() => {
    const eventsProcessed = queryOne<CountRow>("SELECT COUNT(*) AS count FROM events")?.count ?? 0;

    execute("DELETE FROM rollups");

    execute(`
      INSERT INTO rollups (date, kind, name, inp, out, think, chat, code, cache_r, cache_w, cost, count)
      SELECT
        substr(datetime(ts / 1000, 'unixepoch', 'localtime'), 1, 10) AS date,
        'provider' AS kind,
        provider AS name,
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
      GROUP BY date, provider
    `);

    execute(`
      INSERT INTO rollups (date, kind, name, inp, out, think, chat, code, cache_r, cache_w, cost, count)
      SELECT
        substr(datetime(ts / 1000, 'unixepoch', 'localtime'), 1, 10) AS date,
        'agent' AS kind,
        agent AS name,
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
      WHERE agent IS NOT NULL AND agent != ''
      GROUP BY date, agent
    `);

    execute(`
      INSERT INTO rollups (date, kind, name, inp, out, think, chat, code, cache_r, cache_w, cost, count)
      SELECT
        substr(datetime(ts / 1000, 'unixepoch', 'localtime'), 1, 10) AS date,
        'total' AS kind,
        '*' AS name,
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
      GROUP BY date
    `);

    const rollupsCreated = queryOne<CountRow>("SELECT COUNT(*) AS count FROM rollups")?.count ?? 0;

    return { eventsProcessed, rollupsCreated };
  });
}

export function handleOmtRebuild(): string {
  const result = rebuildRollups();
  return `Rebuilt rollups: ${formatCount(result.eventsProcessed)} events → ${formatCount(result.rollupsCreated)} rollup rows`;
}
