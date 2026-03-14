import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import pkg from "../../package.json";
import { checkBudget, formatBudgetAlert, getBudgetConfig } from "../analytics/budget";
import { getResolvedProviderConfig, hasAnyProviderLimits } from "../analytics/plans";
import { getLiveProviders, getLiveQuota } from "../analytics/quota";
import { computeTotalTokens } from "../analytics/token-math";
import { detectSpikes, formatTrendChart, getDailyTrend, getWowChange } from "../analytics/trends";
import type { ProviderQuotaWindow } from "../enrichment/providers";
import { findOhMyTokensConfigPath, findOpencodeConfigPath } from "../paths";
import { execute, queryAll, queryOne, runInTransaction } from "../storage/db";
import {
  getHourProviderTotals,
  getMonthProviderRollups,
  getTodayRollups,
  getWeekProviderRollups,
  type RollupRow,
} from "../storage/rollup";

import { todayDateKey } from "../utils";
import { formatTokens } from "./formatter";
import {
  BAR_WIDTH,
  buildBar,
  buildProviderQuotaLine,
  buildProviderSectionHeader,
  formatTimeUntil,
  formatUsageLine,
  SECTION_RULE,
} from "./render";
import type { DisplayMode } from "./sidebar";

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

interface ParsedCommand {
  subcommand: string;
  args: string[];
  rawTail: string;
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

function getDailyBudget(): number | null {
  const cfg = getBudgetConfig();
  if (cfg.daily !== undefined) return cfg.daily;
  const raw = process.env.OMT_DAILY_BUDGET_TOKENS ?? process.env.OH_MY_TOKENS_DAILY_BUDGET;
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getPeriodBudget(period: "daily" | "weekly" | "monthly"): number | null {
  const cfg = getBudgetConfig();
  if (period === "daily" && cfg.daily !== undefined) return cfg.daily;
  if (period === "weekly" && cfg.weekly !== undefined) return cfg.weekly;
  if (period === "monthly" && cfg.monthly !== undefined) return cfg.monthly;
  const upper = period.toUpperCase();
  const raw =
    process.env[`OMT_${upper}_BUDGET_TOKENS`] ?? process.env[`OH_MY_TOKENS_${upper}_BUDGET`];
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function createCommandTextPart(text: string): { type: "text"; text: string } {
  return {
    type: "text",
    text,
  };
}

function buildProviderWeeklyQuotaLine(
  liveQuota: NonNullable<ReturnType<typeof getLiveQuota>>,
  textMode = false,
): string {
  const w = liveQuota.windows?.weekly;
  if (!w) return "";
  const pctUsed = Math.round(100 - w.percentRemaining);
  if (liveQuota.unit === "credits" && liveQuota.limit > 0) {
    const remaining = liveQuota.limit - liveQuota.used;
    if (textMode) {
      return `  💳 wk    ${`${pctUsed}%`.padStart(4)} used  $${remaining.toFixed(2)} / $${liveQuota.limit.toFixed(2)}  [live]`;
    }
    return `  💳 wk    ${buildBar(pctUsed)} ${`${pctUsed}%`.padStart(4)}  $${remaining.toFixed(2)} / $${liveQuota.limit.toFixed(2)}  [live]`;
  }
  if (liveQuota.unit === "requests" && liveQuota.limit > 0) {
    const used = Math.round(liveQuota.used);
    const resetStr = w.resetTimeIso
      ? `  resets ${new Date(w.resetTimeIso).toLocaleString("en-US", { month: "short", day: "numeric" })}`
      : "";
    if (textMode) {
      return `  🗓 mo    ${`${pctUsed}%`.padStart(4)} used  ${used} / ${liveQuota.limit} req${resetStr}  [live]`;
    }
    return `  🗓 mo    ${buildBar(pctUsed)} ${`${pctUsed}%`.padStart(4)}  ${used} / ${liveQuota.limit} req${resetStr}  [live]`;
  }
  return buildProviderQuotaLine("📆", "wk", pctUsed, w.resetTimeIso, textMode);
}

function buildProviderEstDailyLine(
  liveQuota: NonNullable<ReturnType<typeof getLiveQuota>>,
  textMode = false,
): string {
  const w = liveQuota.windows?.daily;
  if (!w) return "";
  const limitLabel =
    liveQuota.limit > 0 ? `~${formatTokens(liveQuota.limit)} req/day` : "? req/day";
  const resetStr = w.resetTimeIso ? `  resets ${formatTimeUntil(w.resetTimeIso)}` : "";
  if (textMode) {
    return `  📅 day   ${limitLabel}${resetStr}  [est]`;
  }
  return `  📅 day   ${"░".repeat(BAR_WIDTH)}     ${limitLabel}${resetStr}  [est]`;
}

function buildProviderBlock(
  name: string,
  todayTok: number | undefined,
  liveQuota: ReturnType<typeof getLiveQuota>,
  textMode = false,
): string[] {
  const tokLabel = todayTok !== undefined && todayTok > 0 ? formatTokens(todayTok) : undefined;
  const lines: string[] = [buildProviderSectionHeader(name, tokLabel)];

  if (liveQuota?.windows) {
    const { windows } = liveQuota;
    if (windows.fiveHour) {
      const pctUsed = Math.round(100 - windows.fiveHour.percentRemaining);
      lines.push(
        buildProviderQuotaLine("⏱", "5h", pctUsed, windows.fiveHour.resetTimeIso, textMode),
      );
    }
    if (windows.hourly) {
      const pctUsed = Math.round(100 - windows.hourly.percentRemaining);
      lines.push(buildProviderQuotaLine("⏱", "1h", pctUsed, windows.hourly.resetTimeIso, textMode));
    }
    if (windows.sevenDay) {
      const pctUsed = Math.round(100 - windows.sevenDay.percentRemaining);
      lines.push(
        buildProviderQuotaLine("🗓", "7d", pctUsed, windows.sevenDay.resetTimeIso, textMode),
      );
    }
    if (windows.weekly) {
      lines.push(buildProviderWeeklyQuotaLine(liveQuota, textMode));
    }
    if (windows.daily) {
      lines.push(buildProviderEstDailyLine(liveQuota, textMode));
    }
  }

  return lines;
}

function formatBudgetLine(
  status: { period: string; ratio: number; exceeded: boolean; used: number; limit: number },
  textMode: boolean,
): string {
  const pct = Math.min(status.ratio * 100, 100);
  const mark = status.exceeded ? "!" : status.ratio >= 0.8 ? "~" : "✓";
  const cols = `  ${status.period.padEnd(7)}  `;
  const tail = ` ${`${Math.round(pct)}%`.padStart(4)}  ${formatTokens(status.used).padStart(7)} / ${formatTokens(status.limit).padStart(7)}  ${mark}`;
  return textMode ? `${cols}${tail.trimStart()}` : `${cols}${buildBar(pct)}${tail}`;
}

function buildPaceLine(daily: number, total: number, todayRequests: number): string | null {
  const now = new Date();
  const hoursElapsed = now.getHours() + now.getMinutes() / 60;
  const hoursLeft = 24 - hoursElapsed;
  if (hoursElapsed <= 0.25 || hoursLeft <= 0.25) return null;
  const allowedPerHour = Math.max(0, daily - total) / hoursLeft;
  const reqPerHour = todayRequests / hoursElapsed;
  return `  pace     ${formatTokens(Math.round(allowedPerHour))}/h allowed  ·  ${reqPerHour.toFixed(1)} req/h  (${todayRequests} req today)`;
}

function buildBudgetSection(total: number, todayRequests: number, textMode = false): string[] {
  const daily = getDailyBudget();
  const weekly = getPeriodBudget("weekly");
  const monthly = getPeriodBudget("monthly");

  if (daily === null && weekly === null && monthly === null) return [];

  const cfg = getBudgetConfig();
  const statuses = checkBudget({
    ...cfg,
    daily: daily ?? undefined,
    weekly: weekly ?? undefined,
    monthly: monthly ?? undefined,
  });

  const lines: string[] = ["─── Budget ─────────────────────────"];
  for (const status of statuses) {
    lines.push(formatBudgetLine(status, textMode));
  }

  if (daily !== null) {
    const paceLine = buildPaceLine(daily, total, todayRequests);
    if (paceLine) lines.push(paceLine);
  }

  return lines;
}

function buildTodaySummary(rows: RollupRow[], textMode = false): string {
  const todayTotal = findTodayTotal(rows);
  const total = computeTotalTokens(todayTotal);
  const cacheTotal = todayTotal.cache_r + todayTotal.cache_w;

  const providerRows = rows
    .filter((row) => row.kind === "provider")
    .sort((left, right) => computeTotalTokens(right) - computeTotalTokens(left));
  const todayRequests = providerRows.reduce((sum, row) => sum + row.count, 0);
  const todayMap = new Map(providerRows.map((r) => [r.name, r]));

  const liveProviders = getLiveProviders();

  const alertCfg = {
    ...getBudgetConfig(),
    daily: getDailyBudget() ?? undefined,
    weekly: getPeriodBudget("weekly") ?? undefined,
    monthly: getPeriodBudget("monthly") ?? undefined,
  };
  const alert = formatBudgetAlert(checkBudget(alertCfg));

  const labelWidth = Math.max(10, ...providerRows.map((r) => r.name.length));
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const summaryBody = [
    "oh-my-tokens — Today's Summary",
    ...liveProviders.flatMap((name) => {
      const row = todayMap.get(name);
      return buildProviderBlock(
        name,
        row !== undefined ? computeTotalTokens(row) : undefined,
        getLiveQuota(name),
        textMode,
      );
    }),
    ...(providerRows.length > 0
      ? [
          "─── Today ──────────────────────────",
          ...providerRows.map((row) => {
            const tok = computeTotalTokens(row);
            return formatUsageLine(
              row.name,
              total > 0 ? (tok / total) * 100 : 0,
              tok,
              labelWidth,
              textMode,
            );
          }),
        ]
      : []),
    "─── Breakdown ──────────────────────",
    `  🧠 think  ${formatTokens(todayTotal.think).padStart(6)} (${`${pct(todayTotal.think)}%`.padStart(3)})   💬 chat  ${formatTokens(todayTotal.chat).padStart(6)} (${`${pct(todayTotal.chat)}%`.padStart(3)})`,
    `  ⌨️ code   ${formatTokens(todayTotal.code).padStart(6)} (${`${pct(todayTotal.code)}%`.padStart(3)})   📥 input ${formatTokens(todayTotal.inp).padStart(6)} (${`${pct(todayTotal.inp)}%`.padStart(3)})`,
    `  📦 cache  ${formatTokens(cacheTotal).padStart(6)} (${`${pct(cacheTotal)}%`.padStart(3)})   Σ total ${formatTokens(total).padStart(6)}`,
    ...buildBudgetSection(total, todayRequests, textMode),
  ].join("\n");

  return alert !== null ? `${alert}\n\n${summaryBody}` : summaryBody;
}

function buildAgentSummary(rows: RollupRow[], textMode = false): string {
  const agents = rows
    .filter((row) => row.kind === "agent")
    .sort((left, right) => computeTotalTokens(right) - computeTotalTokens(left));
  const total = agents.reduce((sum, row) => sum + computeTotalTokens(row), 0);
  const labelWidth = Math.max(
    10,
    ...agents.map((row) => (row.count > 1 ? `${row.name} ×${row.count}` : row.name).length),
  );

  return [
    "oh-my-tokens — Agent Usage",
    SECTION_RULE,
    "AGENTS",
    ...agents.map((row) => {
      const agentTotal = computeTotalTokens(row);
      const percent = total > 0 ? (agentTotal / total) * 100 : 0;
      const countLabel = row.count > 1 ? `${row.name} ×${row.count}` : row.name;
      return formatUsageLine(countLabel, percent, agentTotal, labelWidth, textMode);
    }),
    SECTION_RULE,
  ].join("\n");
}

function buildTrendSummary(): string {
  const points = getDailyTrend();
  const wow = getWowChange();
  const spikes = detectSpikes(points);
  const wowLabel =
    wow.changePercent === null
      ? "WoW  n/a (this week vs last week)"
      : `WoW  ${wow.changePercent >= 0 ? "+" : ""}${wow.changePercent.toFixed(1)}% (this week vs last week)`;

  return [
    "oh-my-tokens — 7-Day Trend",
    SECTION_RULE,
    "DAILY USAGE",
    formatTrendChart(points),
    SECTION_RULE,
    wowLabel,
    ...(spikes.length > 0
      ? spikes.map((spike) => `⚠️ Spike: ${spike.date} (Z=${spike.zScore.toFixed(1)})`)
      : []),
  ].join("\n");
}

function buildBudgetSummary(textMode = false): string {
  const config = {
    daily: getPeriodBudget("daily") ?? undefined,
    weekly: getPeriodBudget("weekly") ?? undefined,
    monthly: getPeriodBudget("monthly") ?? undefined,
  };
  const statuses = checkBudget(config);

  if (statuses.length === 0) {
    return [
      "oh-my-tokens — Budget Status",
      SECTION_RULE,
      "No budgets configured. Set OMT_DAILY_BUDGET_TOKENS, OMT_WEEKLY_BUDGET_TOKENS, or OMT_MONTHLY_BUDGET_TOKENS.",
    ].join("\n");
  }

  return [
    "oh-my-tokens — Budget Status",
    SECTION_RULE,
    ...statuses.map((status) => {
      const percent = status.ratio * 100;
      const mark = status.exceeded ? "!" : status.ratio >= 0.8 ? "~" : "✓";
      if (textMode) {
        return `  ${status.period.padEnd(7)} ${`${percent.toFixed(1)}%`.padStart(6)}  ${formatTokens(status.used).padStart(7)} / ${formatTokens(status.limit).padStart(7)} ${mark}`;
      }
      return `  ${status.period.padEnd(7)} ${buildBar(percent)} ${`${percent.toFixed(1)}%`.padStart(6)}  ${formatTokens(status.used).padStart(7)} / ${formatTokens(status.limit).padStart(7)} ${mark}`;
    }),
    SECTION_RULE,
  ].join("\n");
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

function buildExportOutput(format: "json" | "csv"): string {
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

function buildStatusOutput(sessionID: string): string {
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

function parseCommand(args: string): ParsedCommand {
  const trimmed = args.trim();
  const lower = trimmed.toLowerCase();
  const tokens = lower.split(/\s+/).filter((token) => token.length > 0);
  const subcommand = tokens[0] ?? "";
  const firstSpace = trimmed.indexOf(" ");
  const rawTail = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
  return { subcommand, args: tokens.slice(1), rawTail };
}

function buildLiveWindowLine(
  icon: string,
  label: string,
  window: ProviderQuotaWindow,
  tokenCount?: string,
  textMode = false,
): string {
  const pctUsed = 100 - window.percentRemaining;
  const pctStr = `${Math.round(pctUsed)}%`.padStart(4);
  const resetStr = window.resetTimeIso ? `  resets ${formatTimeUntil(window.resetTimeIso)}` : "";
  const tokStr = tokenCount ? `  ${tokenCount}` : "";
  if (textMode) {
    return `  ${icon} ${label} ${pctStr} used  [live]${tokStr}${resetStr}`;
  }
  return `  ${icon} ${label} ${buildBar(pctUsed)} ${pctStr}  [live]${tokStr}${resetStr}`;
}
function buildLiveQuotaLines(
  _name: string,
  liveQuota: ReturnType<typeof getLiveQuota>,
  cfg: ReturnType<typeof getResolvedProviderConfig>,
  textMode = false,
): string[] {
  const lines: string[] = [];
  if (!liveQuota?.windows) return lines;
  if (liveQuota.windows.fiveHour) {
    lines.push(
      buildLiveWindowLine("⏱", "5-hour ", liveQuota.windows.fiveHour, undefined, textMode),
    );
  }
  if (liveQuota.windows.hourly) {
    const w = liveQuota.windows.hourly;
    const limitTok = cfg.limits.hourly;
    const tokStr =
      limitTok !== undefined
        ? `${formatTokens(Math.round(limitTok * ((100 - w.percentRemaining) / 100))).padStart(7)} / ${formatTokens(limitTok)}`
        : undefined;
    lines.push(buildLiveWindowLine("⏱", "hourly ", w, tokStr, textMode));
  }
  if (liveQuota.windows.sevenDay) {
    lines.push(
      buildLiveWindowLine("🗓", "7-day  ", liveQuota.windows.sevenDay, undefined, textMode),
    );
  }
  if (liveQuota.windows.weekly) {
    lines.push(buildWeeklyWindowLine(liveQuota, textMode));
  }
  if (liveQuota.windows.daily) {
    lines.push(buildEstDailyWindowLine(liveQuota, textMode));
  }
  return lines;
}

function buildEstDailyWindowLine(
  liveQuota: NonNullable<ReturnType<typeof getLiveQuota>>,
  textMode = false,
): string {
  const w = liveQuota.windows?.daily;
  if (!w) return "";
  const limitLabel =
    liveQuota.limit > 0 ? `~${formatTokens(liveQuota.limit)} req/day` : "? req/day";
  const resetStr = w.resetTimeIso ? `  resets ${formatTimeUntil(w.resetTimeIso)}` : "";
  if (textMode) {
    return `  📅 daily  ${limitLabel}${resetStr}  [est]`;
  }
  return `  📅 daily  ${"░".repeat(BAR_WIDTH)}     ${limitLabel}${resetStr}  [est]`;
}

function buildWeeklyWindowLine(
  liveQuota: NonNullable<ReturnType<typeof getLiveQuota>>,
  textMode = false,
): string {
  const w = liveQuota.windows?.weekly;
  if (!w) return "";
  if (liveQuota.unit === "credits" && liveQuota.limit > 0) {
    const remaining = liveQuota.limit - liveQuota.used;
    const pctUsed = 100 - w.percentRemaining;
    if (textMode) {
      return `  💳 credits ${`${Math.round(pctUsed)}%`.padStart(4)} used  [live]  $${remaining.toFixed(2)} / $${liveQuota.limit.toFixed(2)}`;
    }
    return `  💳 credits ${buildBar(pctUsed)} ${`${Math.round(pctUsed)}%`.padStart(4)}  [live]  $${remaining.toFixed(2)} / $${liveQuota.limit.toFixed(2)}`;
  }
  if (liveQuota.unit === "requests" && liveQuota.limit > 0) {
    const used = Math.round(liveQuota.used);
    const resetLabel = w.resetTimeIso
      ? `  resets ${new Date(w.resetTimeIso).toLocaleString("en-US", { month: "short", day: "numeric" })}`
      : "";
    const pctUsed = 100 - w.percentRemaining;
    if (textMode) {
      return `  🗓 monthly ${`${Math.round(pctUsed)}%`.padStart(4)} used  [live]  ${used} / ${liveQuota.limit} req${resetLabel}`;
    }
    return `  🗓 monthly ${buildBar(pctUsed)} ${`${Math.round(pctUsed)}%`.padStart(4)}  [live]  ${used} / ${liveQuota.limit} req${resetLabel}`;
  }
  return buildLiveWindowLine("📆", "weekly ", w, undefined, textMode);
}

function buildLocalWindowLines(
  name: string,
  cfg: ReturnType<typeof getResolvedProviderConfig>,
  hourTotals: Map<string, number>,
  dayMap: Map<string, number>,
  weekMap: Map<string, number>,
  monthMap: Map<string, number>,
  textMode = false,
): string[] {
  const windows = [
    { label: "⏱ hourly ", used: hourTotals.get(name) ?? 0, limit: cfg.limits.hourly },
    { label: "📅 today  ", used: dayMap.get(name) ?? 0, limit: cfg.limits.daily },
    { label: "📆 weekly ", used: weekMap.get(name) ?? 0, limit: cfg.limits.weekly },
    { label: "🗓 monthly", used: monthMap.get(name) ?? 0, limit: cfg.limits.monthly },
  ].filter((w) => w.limit !== undefined || w.used > 0);
  return windows.map((w) => buildLocalWindowLine(w, textMode));
}

function buildLocalWindowLine(
  w: {
    label: string;
    used: number;
    limit: number | undefined;
  },
  textMode = false,
): string {
  if (w.limit !== undefined) {
    const pct = Math.min((w.used / w.limit) * 100, 100);
    const over = w.used > w.limit;
    const mark = over ? " ⚠️" : "";
    if (textMode) {
      return `  ${w.label} ${formatTokens(w.used).padStart(7)} / ${formatTokens(w.limit).padStart(7)}${mark}`;
    }
    return `  ${w.label} ${buildBar(pct)} ${`${Math.round(pct)}%`.padStart(4)}  ${formatTokens(w.used).padStart(7)} / ${formatTokens(w.limit).padStart(7)}${mark}`;
  }
  if (textMode) {
    return `  ${w.label} ${formatTokens(w.used).padStart(7)}`;
  }
  return `  ${w.label} ${buildBar(0)} ${" ".padStart(4, " ")}--  ${formatTokens(w.used).padStart(7)}`;
}

function buildProviderLimitLines(
  name: string,
  cfg: ReturnType<typeof getResolvedProviderConfig>,
  liveQuota: ReturnType<typeof getLiveQuota>,
  hourTotals: Map<string, number>,
  dayMap: Map<string, number>,
  weekMap: Map<string, number>,
  monthMap: Map<string, number>,
  textMode = false,
): string[] {
  const hasLive = Boolean(liveQuota?.windows);
  const header =
    cfg.planDisplayName !== null
      ? `${name.toUpperCase()}  (${cfg.planDisplayName})${hasLive ? "  [live]" : ""}`
      : `${name.toUpperCase()}${hasLive ? "  [live]" : ""}`;
  return [
    header,
    ...buildLiveQuotaLines(name, liveQuota, cfg, textMode),
    ...buildLocalWindowLines(name, cfg, hourTotals, dayMap, weekMap, monthMap, textMode),
    "",
  ];
}

function buildLimitsSummary(textMode = false): string {
  const liveProviders = getLiveProviders();
  const hasLiveData = liveProviders.length > 0;
  if (!hasAnyProviderLimits() && !hasLiveData) {
    return [
      "oh-my-tokens — Provider Limits",
      SECTION_RULE,
      "No provider limits configured.",
      'Add providers config to opencode.json experimental["oh-my-tokens"].providers',
    ].join("\n");
  }
  const hourTotals = getHourProviderTotals();
  const todayRows = getTodayRollups().filter((r) => r.kind === "provider");
  const weekRows = getWeekProviderRollups();
  const monthRows = getMonthProviderRollups();
  const toMap = (rows: RollupRow[]) => new Map(rows.map((r) => [r.name, computeTotalTokens(r)]));
  const dayMap = toMap(todayRows);
  const weekMap = toMap(weekRows);
  const monthMap = toMap(monthRows);
  const allProviders = Array.from(
    new Set([
      ...liveProviders,
      ...Array.from(hourTotals.keys()),
      ...Array.from(dayMap.keys()),
      ...Array.from(weekMap.keys()),
      ...Array.from(monthMap.keys()),
    ]),
  ).sort();
  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", { month: "short", year: "numeric" });
  const lines: string[] = [`oh-my-tokens — Provider Limits  [${monthLabel}]`, SECTION_RULE];
  for (const name of allProviders) {
    const cfg = getResolvedProviderConfig(name);
    const liveQuota = getLiveQuota(name);
    lines.push(
      ...buildProviderLimitLines(
        name,
        cfg,
        liveQuota,
        hourTotals,
        dayMap,
        weekMap,
        monthMap,
        textMode,
      ),
    );
  }
  lines.push(SECTION_RULE);
  return lines.join("\n");
}

type SettingValue = string | number | boolean;

function readOhMyTokensConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readRawPluginConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const exp = raw.experimental as Record<string, unknown> | undefined;
    return (exp?.["oh-my-tokens"] as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

function getEffectivePluginConfig(): Record<string, unknown> {
  const omtPath = findOhMyTokensConfigPath();
  if (existsSync(omtPath)) {
    return readOhMyTokensConfig(omtPath);
  }
  return readRawPluginConfig(findOpencodeConfigPath());
}

function getDisplayMode(): DisplayMode {
  const cfg = getEffectivePluginConfig();
  const display = cfg.display;
  if (display === "compact" || display === "normal" || display === "extend" || display === "text") {
    return display;
  }
  return "normal";
}

function coerceSettingValue(raw: string): SettingValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(n)) return n;
  return raw;
}

function fmtVal(val: unknown): string {
  if (val === undefined || val === null) return "(not set)";
  return String(val);
}

function buildSettingDisplay(): string {
  const omtPath = findOhMyTokensConfigPath();
  const cfg = existsSync(omtPath)
    ? readOhMyTokensConfig(omtPath)
    : readRawPluginConfig(findOpencodeConfigPath());
  const budget = (cfg.budget as Record<string, unknown>) ?? {};
  const toast = (cfg.toast as Record<string, unknown>) ?? {};
  const KEY_W = 24;
  const VAL_W = 14;
  const row = (key: string, val: unknown, hint: string) => {
    const k = key.padEnd(KEY_W);
    const v = fmtVal(val).padEnd(VAL_W);
    return `  ${k} ${v}  ${hint}`;
  };
  return [
    "oh-my-tokens — Settings",
    SECTION_RULE,
    `Config   ${omtPath}`,
    "",
    row("display", cfg.display, "compact | normal | extend | text"),
    row("unit", cfg.unit, "tokens | cost"),
    row("enrichment", cfg.enrichment, "off | auto | manual | opencode-quota"),
    row("lang", cfg.lang, "auto | en | ko | ja | zh"),
    row("retention", cfg.retention, "<number> (days)"),
    "─── Budget ─────────────────────────────",
    row("budget.daily", budget.daily, "<number> (tokens)"),
    row("budget.weekly", budget.weekly, "<number> (tokens)"),
    row("budget.monthly", budget.monthly, "<number> (tokens)"),
    row("budget.timezone", budget.timezone, "IANA timezone  e.g. Asia/Seoul"),
    row("budget.dailyResetHour", budget.dailyResetHour, "0–23"),
    row("budget.weeklyResetDay", budget.weeklyResetDay, "monday | tuesday | ... | sunday"),
    "─── Toast ───────────────────────────────",
    row("toast.enabled", toast.enabled, "true | false"),
    row("toast.durationMs", toast.durationMs, "<number> (ms)"),
    "",
    "Set:  /omt setting <key> <value>",
    SECTION_RULE,
  ].join("\n");
}

function readCurrentSettingValue(
  plugin: Record<string, unknown>,
  key: string,
): SettingValue | undefined {
  const dotIdx = key.indexOf(".");
  if (dotIdx !== -1) {
    const parent = plugin[key.slice(0, dotIdx)];
    if (typeof parent === "object" && parent !== null) {
      return (parent as Record<string, unknown>)[key.slice(dotIdx + 1)] as SettingValue;
    }
    return undefined;
  }
  return plugin[key] as SettingValue;
}

function applyOhMyTokensSetting(
  configPath: string,
  key: string,
  value: SettingValue,
): { ok: boolean; oldValue?: SettingValue; error?: string } {
  let cfg: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "Could not parse oh-my-tokens.json" };
    }
  }
  const oldValue = readCurrentSettingValue(cfg, key);
  const dotIdx = key.indexOf(".");
  if (dotIdx !== -1) {
    const parentKey = key.slice(0, dotIdx);
    const childKey = key.slice(dotIdx + 1);
    if (typeof cfg[parentKey] !== "object" || cfg[parentKey] === null) {
      cfg[parentKey] = {};
    }
    (cfg[parentKey] as Record<string, unknown>)[childKey] = value;
  } else {
    cfg[key] = value;
  }
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return { ok: true, oldValue };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

type SettingSpec =
  | { type: "enum"; values: readonly string[] }
  | { type: "positive-integer"; hint: string; example: string }
  | { type: "integer-range"; min: number; max: number; example: string }
  | { type: "boolean" }
  | { type: "timezone" };

const KEY_CANONICAL: Readonly<Record<string, string>> = {
  "budget.dailyresethour": "budget.dailyResetHour",
  "budget.weeklyresetday": "budget.weeklyResetDay",
  "toast.durationms": "toast.durationMs",
};

const SETTING_SPECS: Readonly<Record<string, SettingSpec>> = {
  display: { type: "enum", values: ["compact", "normal", "extend", "text"] },
  unit: { type: "enum", values: ["tokens", "cost"] },
  enrichment: { type: "enum", values: ["off", "auto", "manual", "opencode-quota"] },
  lang: { type: "enum", values: ["auto", "en", "ko", "ja", "zh"] },
  retention: { type: "positive-integer", hint: "days", example: "90" },
  "budget.daily": { type: "positive-integer", hint: "tokens", example: "500000" },
  "budget.weekly": { type: "positive-integer", hint: "tokens", example: "3000000" },
  "budget.monthly": { type: "positive-integer", hint: "tokens", example: "10000000" },
  "budget.timezone": { type: "timezone" },
  "budget.dailyResetHour": { type: "integer-range", min: 0, max: 23, example: "9" },
  "budget.weeklyResetDay": {
    type: "enum",
    values: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  },
  "toast.enabled": { type: "boolean" },
  "toast.durationMs": { type: "positive-integer", hint: "ms", example: "9000" },
};

function specHint(spec: SettingSpec): string {
  switch (spec.type) {
    case "enum":
      return spec.values.join(" | ");
    case "positive-integer":
      return `<number>  (${spec.hint})`;
    case "integer-range":
      return `<number>  (${spec.min}–${spec.max})`;
    case "boolean":
      return "true | false";
    case "timezone":
      return "IANA timezone  e.g. Asia/Seoul";
  }
}

function specExample(spec: SettingSpec): string {
  switch (spec.type) {
    case "enum":
      return spec.values[0] ?? "";
    case "positive-integer":
      return spec.example;
    case "integer-range":
      return spec.example;
    case "boolean":
      return "true";
    case "timezone":
      return "Asia/Seoul";
  }
}

function validateSettingValue(key: string, value: SettingValue): string | null {
  const spec = SETTING_SPECS[key];
  if (spec === undefined) return null;
  switch (spec.type) {
    case "enum":
      if (!spec.values.includes(String(value))) {
        return `Invalid value for ${key}: "${value}"\n  Valid: ${spec.values.join(" | ")}`;
      }
      return null;
    case "positive-integer":
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return `Invalid value for ${key}: "${value}"\n  Expected: positive integer  e.g. ${spec.example}`;
      }
      return null;
    case "integer-range":
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < spec.min ||
        value > spec.max
      ) {
        return `Invalid value for ${key}: "${value}"\n  Expected: integer ${spec.min}–${spec.max}`;
      }
      return null;
    case "boolean":
      if (typeof value !== "boolean") {
        return `Invalid value for ${key}: "${value}"\n  Valid: true | false`;
      }
      return null;
    case "timezone":
      try {
        Intl.DateTimeFormat(undefined, { timeZone: String(value) });
        return null;
      } catch {
        return `Invalid timezone: "${value}"\n  Expected: IANA timezone  e.g. Asia/Seoul`;
      }
  }
}

function buildSettingCommandOutput(rawTail: string, onSettingApplied?: () => void): string {
  const omtConfigPath = findOhMyTokensConfigPath();
  if (rawTail.trim() === "") {
    return buildSettingDisplay();
  }
  const parts = rawTail.split(/\s+/);
  const rawKey = (parts[0] ?? "").toLowerCase();
  const key = KEY_CANONICAL[rawKey] ?? rawKey;
  const rawValue = parts.slice(1).join(" ");
  if (rawValue === "") {
    const spec = SETTING_SPECS[key];
    if (spec === undefined) {
      return [
        "oh-my-tokens — Settings",
        SECTION_RULE,
        `Unknown setting: ${key}`,
        "Run /omt setting to see all available settings.",
      ].join("\n");
    }
    const hint = specHint(spec);
    const example = specExample(spec);
    const current = readCurrentSettingValue(getEffectivePluginConfig(), key);
    const lines = [
      "oh-my-tokens — Settings",
      SECTION_RULE,
      `  ${key.padEnd(24)} ${hint}`,
      ...(current !== undefined ? [`  Current: ${String(current)}`] : []),
      "",
      `Usage:   /omt setting ${key} ${example}`,
      SECTION_RULE,
    ];
    return lines.join("\n");
  }
  const value = coerceSettingValue(rawValue);
  const validationError = validateSettingValue(key, value);
  if (validationError !== null) {
    return ["oh-my-tokens — Settings", SECTION_RULE, `✗ ${validationError}`].join("\n");
  }
  const result = applyOhMyTokensSetting(omtConfigPath, key, value);
  if (!result.ok) {
    return ["oh-my-tokens — Settings", SECTION_RULE, `✗ ${result.error}`].join("\n");
  }
  onSettingApplied?.();
  const oldLabel = result.oldValue !== undefined ? String(result.oldValue) : "(not set)";
  const lines = [
    "oh-my-tokens — Settings",
    SECTION_RULE,
    `✓ ${key}   ${oldLabel} → ${String(value)}`,
    `Config   ${omtConfigPath}`,
  ];
  if (onSettingApplied === undefined) {
    lines.push("Restart OpenCode to apply changes.");
  }
  lines.push(SECTION_RULE);
  if (
    key === "display" &&
    (value === "compact" || value === "normal" || value === "extend" || value === "text")
  ) {
    lines.push("", "─── Preview ────────────────────────────");
    lines.push(buildTodaySummary(getTodayRollups(), value === "text"));
  }
  return lines.join("\n");
}

function buildCommandText(
  command: ParsedCommand,
  sessionID: string,
  onSettingApplied?: () => void,
): string {
  const textMode = getDisplayMode() === "text";
  switch (command.subcommand) {
    case "agents":
      return buildAgentSummary(getTodayRollups(), textMode);
    case "trend":
      return buildTrendSummary();
    case "budget":
      return buildBudgetSummary(textMode);
    case "export":
      return buildExportOutput(command.args[0] === "csv" ? "csv" : "json");
    case "status":
      return buildStatusOutput(sessionID);
    case "rebuild": {
      const result = rebuildRollups();
      return `Rebuilt rollups: ${formatCount(result.eventsProcessed)} events → ${formatCount(result.rollupsCreated)} rollup rows`;
    }
    case "limits":
      return buildLimitsSummary(textMode);
    case "setting":
      return buildSettingCommandOutput(command.rawTail, onSettingApplied);
    default:
      return buildTodaySummary(getTodayRollups(), textMode);
  }
}

export function handleOmtCommand(
  args: string,
  sessionID: string,
  onSettingApplied?: () => void,
): { type: "text"; text: string } {
  const text = buildCommandText(parseCommand(args), sessionID, onSettingApplied);
  return createCommandTextPart(text);
}
