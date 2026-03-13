import { getLiveProviders, getLiveQuota } from "../analytics/quota";
import type { ProviderQuota } from "../enrichment/providers";
import {
  getMonthProviderRollups,
  getMonthTotal,
  getSessionTotals,
  getTodayRollups,
  getWeekTotal,
  type RollupRow,
} from "../storage/rollup";
import { formatTokens } from "./formatter";

export interface SidebarItem {
  label: string;
  value: string;
  status: "success" | "warning" | "error" | "info";
}

export type DisplayMode = "compact" | "normal" | "extend";

interface ReplyState {
  think: number;
  chat: number;
  code: number;
  cache: number;
  provider: string;
  model: string;
}

interface UsageTotals {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  cost?: number;
  count?: number;
}

interface BudgetInfo {
  limit: number | null;
  used: number;
  ratio: number | null;
}

interface QuotaWindowEntry {
  icon: string;
  label: string;
  pct: number;
}

const QUOTA_BAR_WIDTH = 8;

const TIER_MONTHLY_ESTIMATE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  anthropic: {
    free: 1_000_000,
    tier_1: 10_000_000,
    tier_2: 30_000_000,
    tier_3: 80_000_000,
    tier_4: 200_000_000,
    scale: 500_000_000,
  },
  openai: {
    tier_1: 10_000_000,
    tier_2: 100_000_000,
    tier_3: 300_000_000,
    tier_4: 1_000_000_000,
    tier_5: 5_000_000_000,
  },
} as const;
let currentSessionId: string | null = null;
let lastReply: ReplyState | null = null;

function getBudgetLimit(): number | null {
  const raw = process.env.OMT_DAILY_BUDGET_TOKENS ?? process.env.OH_MY_TOKENS_DAILY_BUDGET;
  if (raw === undefined) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getBudgetInfo(used: number): BudgetInfo {
  const limit = getBudgetLimit();
  return {
    limit,
    used,
    ratio: limit === null || limit === 0 ? null : used / limit,
  };
}

function getBudgetStatus(ratio: number | null): SidebarItem["status"] {
  if (ratio === null) {
    return "info";
  }

  if (ratio >= 1.0) {
    return "error";
  }

  if (ratio >= 0.8) {
    return "warning";
  }

  return "success";
}

function totalTokens(usage: UsageTotals): number {
  return usage.inp + usage.out + usage.think + usage.cache_r + usage.cache_w;
}

function formatReplyValue(): string {
  if (lastReply === null) {
    return "-";
  }

  const base = `🧠${formatTokens(lastReply.think)} 💬${formatTokens(lastReply.chat)} ⌨️${formatTokens(lastReply.code)}`;
  return lastReply.cache > 0 ? `${base} 📦${formatTokens(lastReply.cache)}` : base;
}

function formatBudgetValue(info: BudgetInfo): string {
  if (info.limit === null || info.ratio === null) {
    return `${formatTokens(info.used)} tok`;
  }

  return `${formatTokens(info.used)} / ${formatTokens(info.limit)} (${(info.ratio * 100).toFixed(0)}%)`;
}

function groupRollups(kind: string, rows: RollupRow[]): RollupRow[] {
  return rows
    .filter((row) => row.kind === kind)
    .sort((left, right) => totalTokens(right) - totalTokens(left));
}

function findTodayTotal(rows: RollupRow[]): UsageTotals {
  const totalRow = rows.find((row) => row.kind === "total" && row.name === "*");

  if (totalRow !== undefined) {
    return totalRow;
  }

  return rows.reduce<UsageTotals>(
    (totals, row) => {
      if (row.kind !== "provider") {
        return totals;
      }

      return {
        inp: totals.inp + row.inp,
        out: totals.out + row.out,
        think: totals.think + row.think,
        chat: totals.chat + row.chat,
        code: totals.code + row.code,
        cache_r: totals.cache_r + row.cache_r,
        cache_w: totals.cache_w + row.cache_w,
        cost: (totals.cost ?? 0) + row.cost,
        count: (totals.count ?? 0) + row.count,
      };
    },
    {
      inp: 0,
      out: 0,
      think: 0,
      chat: 0,
      code: 0,
      cache_r: 0,
      cache_w: 0,
      cost: 0,
      count: 0,
    },
  );
}

function buildProviderItems(rows: RollupRow[], todayTotalTokens: number): SidebarItem[] {
  return groupRollups("provider", rows)
    .slice(0, 2)
    .map((row) => {
      const rowTotal = totalTokens(row);
      const ratio = todayTotalTokens > 0 ? (rowTotal / todayTotalTokens) * 100 : 0;

      return {
        label: row.name,
        value: `${formatTokens(rowTotal)} tok (${ratio.toFixed(0)}%)`,
        status: "info",
      };
    });
}

function buildAgentItems(rows: RollupRow[]): SidebarItem[] {
  return groupRollups("agent", rows)
    .slice(0, 2)
    .map((row) => ({
      label: row.name,
      value: `${formatTokens(totalTokens(row))} tok`,
      status: "info",
    }));
}

function buildBreakdownItems(today: UsageTotals, total: number): SidebarItem[] {
  const cache = today.cache_r + today.cache_w;
  const entries: Array<{ label: string; value: number }> = [
    { label: "🧠 think", value: today.think },
    { label: "💬 chat", value: today.chat },
    { label: "⌨️ code", value: today.code },
    { label: "📥 input", value: today.inp },
    { label: "📦 cache", value: cache },
  ];

  return entries.map((entry) => ({
    label: entry.label,
    value: `${formatTokens(entry.value)} (${total > 0 ? Math.round((entry.value / total) * 100) : 0}%)`,
    status: "info",
  }));
}

function buildRateItem(todayTotalTokens: number): SidebarItem {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const hoursElapsed = Math.max((now.getTime() - midnight.getTime()) / 3_600_000, 1 / 60);
  const rate = todayTotalTokens / hoursElapsed;

  return {
    label: "Rate",
    value: `${formatTokens(Math.round(rate))}/h`,
    status: rate > 50_000 ? "warning" : "info",
  };
}

function buildSessionItem(): SidebarItem {
  const session = currentSessionId === null ? null : getSessionTotals(currentSessionId);
  const total = session === null ? 0 : totalTokens(session);

  return {
    label: "Session",
    value: `${formatTokens(total)} tok`,
    status: "info",
  };
}

function buildQuotaBar(pctUsed: number): string {
  const clamped = Math.min(Math.max(pctUsed, 0), 100);
  const filled = Math.round((clamped / 100) * QUOTA_BAR_WIDTH);
  return `${"█".repeat(filled)}${"░".repeat(QUOTA_BAR_WIDTH - filled)}`;
}

function quotaItemStatus(pctRemaining: number): SidebarItem["status"] {
  if (pctRemaining <= 20) return "error";
  if (pctRemaining <= 40) return "warning";
  return "success";
}

function buildMonthProviderMap(): Map<string, number> {
  return new Map(getMonthProviderRollups().map((r) => [r.name, totalTokens(r)]));
}

function windowsToEntries(quota: ProviderQuota): QuotaWindowEntry[] {
  const { windows } = quota;
  if (windows === undefined) return [];
  const entries: QuotaWindowEntry[] = [];
  if (windows.fiveHour !== undefined)
    entries.push({ icon: "⏱", label: "5h", pct: windows.fiveHour.percentRemaining });
  if (windows.hourly !== undefined)
    entries.push({ icon: "⏱", label: "1h", pct: windows.hourly.percentRemaining });
  if (windows.sevenDay !== undefined)
    entries.push({ icon: "🗓", label: "7d", pct: windows.sevenDay.percentRemaining });
  if (windows.weekly !== undefined) {
    const icon = quota.unit === "credits" ? "💳" : "🗓";
    const label = quota.unit === "requests" ? "mo" : "wk";
    entries.push({ icon, label, pct: windows.weekly.percentRemaining });
  }
  return entries;
}

function tierToEntry(
  provider: string,
  tier: string | undefined,
  monthMap: Map<string, number>,
): QuotaWindowEntry | null {
  if (tier === undefined) return null;
  const estimate = TIER_MONTHLY_ESTIMATE[provider]?.[tier];
  if (estimate === undefined) return null;
  const monthUsed = monthMap.get(provider) ?? 0;
  const pct = Math.max(0, 100 - (monthUsed / estimate) * 100);
  return { icon: "🗓", label: "mo~", pct };
}

function collectWindowEntries(provider: string, monthMap: Map<string, number>): QuotaWindowEntry[] {
  const quota = getLiveQuota(provider);
  if (!quota) return [];
  if (quota.windows !== undefined) return windowsToEntries(quota);
  const entry = tierToEntry(provider, quota.tier, monthMap);
  return entry !== null ? [entry] : [];
}
function buildQuotaNormalItems(): SidebarItem[] {
  const providers = getLiveProviders();
  if (providers.length === 0) return [];
  const items: SidebarItem[] = [];
  const monthMap = buildMonthProviderMap();
  for (const name of providers) {
    const entries = collectWindowEntries(name, monthMap);
    if (entries.length === 0) continue;
    const minPct = Math.min(...entries.map((e) => e.pct));
    const value = entries.map((e) => `${e.icon}${e.label} ${Math.round(e.pct)}%`).join(" · ");
    items.push({ label: name, value, status: quotaItemStatus(minPct) });
  }
  return items;
}
function buildQuotaExtendItems(): SidebarItem[] {
  const providers = getLiveProviders();
  if (providers.length === 0) return [];
  const items: SidebarItem[] = [];
  const monthMap = buildMonthProviderMap();
  for (const name of providers) {
    for (const entry of collectWindowEntries(name, monthMap)) {
      items.push({
        label: `${name} ${entry.icon}${entry.label}`,
        value: `${buildQuotaBar(100 - entry.pct)} ${Math.round(entry.pct)}% left`,
        status: quotaItemStatus(entry.pct),
      });
    }
  }
  return items;
}

export function setCurrentSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

export function setLastReply(data: {
  think: number;
  chat: number;
  code: number;
  cache: number;
  provider: string;
  model: string;
}): void {
  lastReply = data;
}

export function buildSidebarItems(mode: DisplayMode): SidebarItem[] {
  const todayRows = getTodayRollups();
  const today = findTodayTotal(todayRows);
  const todayTotalTokens = totalTokens(today);
  const budget = getBudgetInfo(todayTotalTokens);
  const todayItem: SidebarItem = {
    label: "Today",
    value: mode === "compact" ? formatBudgetValue(budget) : `${formatTokens(todayTotalTokens)} tok`,
    status: getBudgetStatus(budget.ratio),
  };
  const compactItems: SidebarItem[] = [
    { label: "Reply", value: formatReplyValue(), status: "info" },
    buildSessionItem(),
    todayItem,
  ];

  if (mode === "compact") {
    return compactItems;
  }

  const normalItems = [
    ...compactItems.slice(0, 2),
    ...buildProviderItems(todayRows, todayTotalTokens),
    ...buildAgentItems(todayRows),
    todayItem,
    buildRateItem(todayTotalTokens),
  ];

  if (mode === "normal") {
    return [...normalItems, ...buildQuotaNormalItems()];
  }

  const weekTotal = getWeekTotal();
  const monthTotal = getMonthTotal();

  return [
    ...normalItems,
    ...buildBreakdownItems(today, todayTotalTokens),
    {
      label: "This Week",
      value: `${formatTokens(weekTotal === null ? 0 : totalTokens(weekTotal))} tok`,
      status: "info",
    },
    {
      label: "This Month",
      value: `${formatTokens(monthTotal === null ? 0 : totalTokens(monthTotal))} tok`,
      status: "info",
    },
    ...buildQuotaExtendItems(),

    {
      label: "Budget",
      value:
        budget.limit === null
          ? `${formatTokens(todayTotalTokens)} tok`
          : `${formatTokens(todayTotalTokens)}/${formatTokens(budget.limit)} day`,
      status: getBudgetStatus(budget.ratio),
    },
  ];
}
