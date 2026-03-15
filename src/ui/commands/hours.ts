import { getHourlyTotals } from "../../storage/rollup";
import { formatTokens } from "../formatter";
import { buildSectionRule, maxContentWidth } from "../render";
import type { DisplayMode } from "../sidebar";

const CHART_BAR_WIDTH = 12;

function buildHourBar(tokens: number, maxTokens: number): string {
  if (maxTokens <= 0 || tokens <= 0) {
    return "░".repeat(CHART_BAR_WIDTH);
  }
  const filled = Math.max(1, Math.round((tokens / maxTokens) * CHART_BAR_WIDTH));
  return `${"█".repeat(filled)}${"░".repeat(CHART_BAR_WIDTH - filled)}`;
}

export function buildHoursSummary(mode: DisplayMode = "normal"): string {
  const hourlyData = getHourlyTotals();
  const maxTokens = Math.max(0, ...Array.from(hourlyData.values()));

  const lines: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const tokens = hourlyData.get(hour) ?? 0;
    if (mode === "compact" && tokens <= 0) {
      continue;
    }
    const hourLabel = `${String(hour).padStart(2, "0")}:xx`;
    const bar = buildHourBar(tokens, maxTokens);
    const tokStr = formatTokens(tokens).padStart(7);
    lines.push(`  ${hourLabel}  ${bar}  ${tokStr}`);
  }

  const title = "oh-my-tokens — Hourly Usage";
  const width = maxContentWidth(title, ...lines);
  const rule = buildSectionRule(width);
  return [title, rule, "TODAY BY HOUR", ...lines, rule].join("\n");
}
