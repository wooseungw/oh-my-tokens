import { checkBudget, formatBudgetAlert, getBudgetConfig } from "../../analytics/budget";
import { getLiveProviders, getLiveQuota } from "../../analytics/quota";
import { computeTotalTokens } from "../../analytics/token-math";
import { getUnitSetting } from "../../config/reader";
import type { RollupRow } from "../../storage/rollup";
import { formatCost, formatTokens } from "../formatter";
import {
  BAR_WIDTH,
  buildBar,
  buildProviderQuotaLine,
  buildProviderSectionHeader,
  buildSectionDivider,
  formatTimeUntil,
  formatUsageLine,
  LABEL_AREA_MIN,
  maxContentWidth,
  padVisualEnd,
  QUOTA_PREFIX_WIDTH,
  visualWidth,
} from "../render";

interface UsageTotals {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
}

export function getDailyBudget(): number | null {
  const cfg = getBudgetConfig();
  if (cfg.daily !== undefined) return cfg.daily;
  const raw = process.env.OMT_DAILY_BUDGET_TOKENS ?? process.env.OH_MY_TOKENS_DAILY_BUDGET;
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getPeriodBudget(period: "daily" | "weekly" | "monthly"): number | null {
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
    const prefix = padVisualEnd("💳 wk", QUOTA_PREFIX_WIDTH);
    if (textMode) {
      return `  ${prefix}   ${`${pctUsed}%`.padStart(4)} used  $${remaining.toFixed(2)} / $${liveQuota.limit.toFixed(2)}  [live]`;
    }
    return `  ${prefix}   ${buildBar(pctUsed)} ${`${pctUsed}%`.padStart(4)}  $${remaining.toFixed(2)} / $${liveQuota.limit.toFixed(2)}  [live]`;
  }
  if (liveQuota.unit === "requests" && liveQuota.limit > 0) {
    const used = Math.round(liveQuota.used);
    const resetStr = w.resetTimeIso
      ? `  resets ${new Date(w.resetTimeIso).toLocaleString("en-US", { month: "short", day: "numeric" })}`
      : "";
    const prefix = padVisualEnd("🗓\uFE0F mo", QUOTA_PREFIX_WIDTH);
    if (textMode) {
      return `  ${prefix}   ${`${pctUsed}%`.padStart(4)} used  ${used} / ${liveQuota.limit} req${resetStr}  [live]`;
    }
    return `  ${prefix}   ${buildBar(pctUsed)} ${`${pctUsed}%`.padStart(4)}  ${used} / ${liveQuota.limit} req${resetStr}  [live]`;
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
  const prefix = padVisualEnd("📅 day", QUOTA_PREFIX_WIDTH);
  if (textMode) {
    return `  ${prefix}   ${limitLabel}${resetStr}  [est]`;
  }
  return `  ${prefix}   ${"░".repeat(BAR_WIDTH)}     ${limitLabel}${resetStr}  [est]`;
}

interface ProviderBlock {
  name: string;
  tokLabel: string | undefined;
  contentLines: string[];
}

function buildProviderBlock(
  name: string,
  todayTok: number | undefined,
  liveQuota: ReturnType<typeof getLiveQuota>,
  textMode = false,
): ProviderBlock {
  const tokLabel = todayTok !== undefined && todayTok > 0 ? formatTokens(todayTok) : undefined;
  const contentLines: string[] = [];

  if (liveQuota?.windows) {
    const { windows } = liveQuota;
    if (windows.fiveHour) {
      const pctUsed = Math.round(100 - windows.fiveHour.percentRemaining);
      contentLines.push(
        buildProviderQuotaLine("⏱\uFE0F", "5h", pctUsed, windows.fiveHour.resetTimeIso, textMode),
      );
    }
    if (windows.hourly) {
      const pctUsed = Math.round(100 - windows.hourly.percentRemaining);
      contentLines.push(
        buildProviderQuotaLine("⏱\uFE0F", "1h", pctUsed, windows.hourly.resetTimeIso, textMode),
      );
    }
    if (windows.sevenDay) {
      const pctUsed = Math.round(100 - windows.sevenDay.percentRemaining);
      contentLines.push(
        buildProviderQuotaLine("🗓\uFE0F", "7d", pctUsed, windows.sevenDay.resetTimeIso, textMode),
      );
    }
    if (windows.weekly) {
      contentLines.push(buildProviderWeeklyQuotaLine(liveQuota, textMode));
    }
    if (windows.daily) {
      contentLines.push(buildProviderEstDailyLine(liveQuota, textMode));
    }
  }

  return { name, tokLabel, contentLines };
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

function buildBudgetContentLines(total: number, todayRequests: number, textMode = false): string[] {
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

  const lines: string[] = [];
  for (const status of statuses) {
    lines.push(formatBudgetLine(status, textMode));
  }

  if (daily !== null) {
    const paceLine = buildPaceLine(daily, total, todayRequests);
    if (paceLine) lines.push(paceLine);
  }

  return lines;
}

export function buildTodaySummary(rows: RollupRow[], textMode = false): string {
  const todayTotal = findTodayTotal(rows);
  const total = computeTotalTokens(todayTotal);
  const cacheTotal = todayTotal.cache_r + todayTotal.cache_w;
  const costMode = getUnitSetting() === "cost";

  const providerRows = rows
    .filter((row) => row.kind === "provider")
    .sort((left, right) => computeTotalTokens(right) - computeTotalTokens(left));
  const todayRequests = providerRows.reduce((sum, row) => sum + row.count, 0);
  const todayMap = new Map(providerRows.map((row) => [row.name, row]));

  const liveProviders = getLiveProviders();

  const alertCfg = {
    ...getBudgetConfig(),
    daily: getDailyBudget() ?? undefined,
    weekly: getPeriodBudget("weekly") ?? undefined,
    monthly: getPeriodBudget("monthly") ?? undefined,
  };
  const alert = formatBudgetAlert(checkBudget(alertCfg));

  const labelWidth = Math.max(LABEL_AREA_MIN, ...providerRows.map((row) => visualWidth(row.name)));
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const title = "oh-my-tokens — Today's Summary";
  const providerBlocks = liveProviders.map((name) => {
    const row = todayMap.get(name);
    return buildProviderBlock(
      name,
      row !== undefined ? computeTotalTokens(row) : undefined,
      getLiveQuota(name),
      textMode,
    );
  });
  const usageLines =
    providerRows.length > 0
      ? providerRows.map((row) => {
          const tok = computeTotalTokens(row);
          const costStr = costMode ? formatCost(row.cost) : undefined;
          return formatUsageLine(
            row.name,
            total > 0 ? (tok / total) * 100 : 0,
            tok,
            labelWidth,
            textMode,
            costStr,
          );
        })
      : [];
  const breakdownLines = [
    `  🧠 think  ${formatTokens(todayTotal.think).padStart(6)} (${`${pct(todayTotal.think)}%`.padStart(3)})   💬 chat  ${formatTokens(todayTotal.chat).padStart(6)} (${`${pct(todayTotal.chat)}%`.padStart(3)})`,
    `  ⌨️ code   ${formatTokens(todayTotal.code).padStart(6)} (${`${pct(todayTotal.code)}%`.padStart(3)})   📥 input ${formatTokens(todayTotal.inp).padStart(6)} (${`${pct(todayTotal.inp)}%`.padStart(3)})`,
    `  📦 cache  ${formatTokens(cacheTotal).padStart(6)} (${`${pct(cacheTotal)}%`.padStart(3)})   Σ total ${formatTokens(total).padStart(6)}`,
  ];
  const budgetLines = buildBudgetContentLines(total, todayRequests, textMode);

  const allContent = [
    title,
    ...providerBlocks.flatMap((b) => b.contentLines),
    ...usageLines,
    ...breakdownLines,
    ...budgetLines,
  ];
  const width = maxContentWidth(...allContent);

  const output: string[] = [title];
  for (const block of providerBlocks) {
    output.push(buildProviderSectionHeader(block.name, block.tokLabel, width));
    output.push(...block.contentLines);
  }
  if (usageLines.length > 0) {
    output.push(buildSectionDivider("Today", width), ...usageLines);
  }
  output.push(buildSectionDivider("Breakdown", width), ...breakdownLines);
  if (budgetLines.length > 0) {
    output.push(buildSectionDivider("Budget", width), ...budgetLines);
  }

  const summaryText = createCommandTextPart(output.join("\n")).text;
  return alert !== null ? `${alert}\n\n${summaryText}` : summaryText;
}
