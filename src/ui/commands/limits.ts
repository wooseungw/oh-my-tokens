import { getResolvedProviderConfig, hasAnyProviderLimits } from "../../analytics/plans";
import { getLiveProviders, getLiveQuota } from "../../analytics/quota";
import { computeTotalTokens } from "../../analytics/token-math";
import type { ProviderQuotaWindow } from "../../enrichment/providers";
import {
  getHourProviderTotals,
  getMonthProviderRollups,
  getTodayRollups,
  getWeekProviderRollups,
  type RollupRow,
} from "../../storage/rollup";

import { formatTokens } from "../formatter";
import { buildBar, formatTimeUntil, SECTION_RULE } from "../render";

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
      buildLiveWindowLine("⏱\uFE0F", "5-hour ", liveQuota.windows.fiveHour, undefined, textMode),
    );
  }
  if (liveQuota.windows.hourly) {
    const w = liveQuota.windows.hourly;
    const limitTok = cfg.limits.hourly;
    const tokStr =
      limitTok !== undefined
        ? `${formatTokens(Math.round(limitTok * ((100 - w.percentRemaining) / 100))).padStart(7)} / ${formatTokens(limitTok)}`
        : undefined;
    lines.push(buildLiveWindowLine("⏱\uFE0F", "hourly ", w, tokStr, textMode));
  }
  if (liveQuota.windows.sevenDay) {
    lines.push(
      buildLiveWindowLine("🗓\uFE0F", "7-day  ", liveQuota.windows.sevenDay, undefined, textMode),
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
  return `  📅 daily  ${buildBar(0)} ${"".padStart(4)}  ${limitLabel}${resetStr}  [est]`;
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
      return `  🗓\uFE0F monthly ${`${Math.round(pctUsed)}%`.padStart(4)} used  [live]  ${used} / ${liveQuota.limit} req${resetLabel}`;
    }
    return `  🗓\uFE0F monthly ${buildBar(pctUsed)} ${`${Math.round(pctUsed)}%`.padStart(4)}  [live]  ${used} / ${liveQuota.limit} req${resetLabel}`;
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
    { label: "⏱\uFE0F hourly ", used: hourTotals.get(name) ?? 0, limit: cfg.limits.hourly },
    { label: "📅 today  ", used: dayMap.get(name) ?? 0, limit: cfg.limits.daily },
    { label: "📆 weekly ", used: weekMap.get(name) ?? 0, limit: cfg.limits.weekly },
    { label: "🗓\uFE0F monthly", used: monthMap.get(name) ?? 0, limit: cfg.limits.monthly },
  ].filter((window) => window.limit !== undefined || window.used > 0);
  return windows.map((window) => buildLocalWindowLine(window, textMode));
}

function buildLocalWindowLine(
  window: {
    label: string;
    used: number;
    limit: number | undefined;
  },
  textMode = false,
): string {
  if (window.limit !== undefined) {
    const pct = Math.min((window.used / window.limit) * 100, 100);
    const over = window.used > window.limit;
    const mark = over ? " ⚠️" : "";
    if (textMode) {
      return `  ${window.label} ${formatTokens(window.used).padStart(7)} / ${formatTokens(window.limit).padStart(7)}${mark}`;
    }
    return `  ${window.label} ${buildBar(pct)} ${`${Math.round(pct)}%`.padStart(4)}  ${formatTokens(window.used).padStart(7)} / ${formatTokens(window.limit).padStart(7)}${mark}`;
  }
  if (textMode) {
    return `  ${window.label} ${formatTokens(window.used).padStart(7)}`;
  }
  return `  ${window.label} ${buildBar(0)}   --  ${formatTokens(window.used).padStart(7)}`;
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

export function buildLimitsSummary(textMode = false): string {
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
  const todayRows = getTodayRollups().filter((row) => row.kind === "provider");
  const weekRows = getWeekProviderRollups();
  const monthRows = getMonthProviderRollups();
  const toMap = (rows: RollupRow[]) =>
    new Map(rows.map((row) => [row.name, computeTotalTokens(row)]));
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
