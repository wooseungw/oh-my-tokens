import {
  detectSpikes,
  formatTrendChart,
  getDailyCosts,
  getDailyTrend,
  getTaskTypeTrend,
  getWowChange,
} from "../../analytics/trends";
import { getUnitSetting } from "../../config/reader";

import { SECTION_RULE } from "../render";

export function buildTrendSummary(): string {
  const points = getDailyTrend();
  const costByDate = getUnitSetting() === "cost" ? getDailyCosts(points.length) : undefined;
  const wow = getWowChange();
  const spikes = detectSpikes(points);
  const taskMix = getTaskTypeTrend();
  const wowLabel =
    wow.changePercent === null
      ? "WoW  n/a (this week vs last week)"
      : `WoW  ${wow.changePercent >= 0 ? "+" : ""}${wow.changePercent.toFixed(1)}% (this week vs last week)`;
  const pctStr = (value: number) => (value === 0 ? "  —" : `${value}%`.padStart(3));
  const mixLines = taskMix.map(
    (point) =>
      `  ${point.date}  🧠 ${pctStr(point.thinkPct)}  💬 ${pctStr(point.chatPct)}  ⌨️ ${pctStr(point.codePct)}`,
  );

  return [
    "oh-my-tokens — 7-Day Trend",
    SECTION_RULE,
    "DAILY USAGE",
    formatTrendChart(points, costByDate),
    SECTION_RULE,
    "TOKEN MIX",
    ...mixLines,
    SECTION_RULE,
    wowLabel,
    ...(spikes.length > 0
      ? spikes.map((spike) => `⚠️ Spike: ${spike.date} (Z=${spike.zScore.toFixed(1)})`)
      : []),
  ].join("\n");
}
