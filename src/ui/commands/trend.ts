import {
  detectSpikes,
  formatTrendChart,
  getDailyCosts,
  getDailyTrend,
  getTaskTypeTrend,
  getWowChange,
} from "../../analytics/trends";
import { getUnitSetting } from "../../config/reader";

import { buildSectionRule, maxContentWidth } from "../render";

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

  const title = "oh-my-tokens — 7-Day Trend";
  const chart = formatTrendChart(points, costByDate);
  const spikeLines = spikes.map((spike) => `⚠️ Spike: ${spike.date} (Z=${spike.zScore.toFixed(1)})`);
  const width = maxContentWidth(title, chart, ...mixLines, wowLabel, ...spikeLines);
  const rule = buildSectionRule(width);
  return [
    title,
    rule,
    "DAILY USAGE",
    chart,
    rule,
    "TOKEN MIX",
    ...mixLines,
    rule,
    wowLabel,
    ...spikeLines,
  ].join("\n");
}
