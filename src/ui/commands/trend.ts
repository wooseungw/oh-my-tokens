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
import type { DisplayMode } from "../sidebar";

export function buildTrendSummary(mode: DisplayMode = "normal"): string {
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
  const detailLines = [wowLabel, ...spikeLines];
  const showMix = mode === "extend" || mode === "text";
  const width = maxContentWidth(title, chart, ...(showMix ? mixLines : []), ...detailLines);
  const rule = buildSectionRule(width);
  const lines = [title, rule, "DAILY USAGE", chart];
  if (showMix) {
    lines.push(rule, "TOKEN MIX", ...mixLines);
  }
  if (mode !== "compact") {
    lines.push(rule, ...detailLines);
  }
  return lines.join("\n");
}
