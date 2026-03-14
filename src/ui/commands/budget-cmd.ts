import { checkBudget, getBudgetConfig } from "../../analytics/budget";

import { formatTokens } from "../formatter";
import { buildBar, buildSectionRule, maxContentWidth } from "../render";

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

export function buildBudgetSummary(textMode = false): string {
  const config = {
    daily: getDailyBudget() ?? undefined,
    weekly: getPeriodBudget("weekly") ?? undefined,
    monthly: getPeriodBudget("monthly") ?? undefined,
  };
  const statuses = checkBudget(config);

  const title = "oh-my-tokens — Budget Status";

  if (statuses.length === 0) {
    const msg =
      "No budgets configured. Set OMT_DAILY_BUDGET_TOKENS, OMT_WEEKLY_BUDGET_TOKENS, or OMT_MONTHLY_BUDGET_TOKENS.";
    return [title, buildSectionRule(), msg].join("\n");
  }

  const lines = statuses.map((status) => {
    const percent = status.ratio * 100;
    const mark = status.exceeded ? "!" : status.ratio >= 0.8 ? "~" : "✓";
    if (textMode) {
      return `  ${status.period.padEnd(7)} ${`${percent.toFixed(1)}%`.padStart(6)}  ${formatTokens(status.used).padStart(7)} / ${formatTokens(status.limit).padStart(7)} ${mark}`;
    }
    return `  ${status.period.padEnd(7)} ${buildBar(percent)} ${`${percent.toFixed(1)}%`.padStart(6)}  ${formatTokens(status.used).padStart(7)} / ${formatTokens(status.limit).padStart(7)} ${mark}`;
  });
  const width = maxContentWidth(title, ...lines);
  const rule = buildSectionRule(width);
  return [title, rule, ...lines, rule].join("\n");
}
