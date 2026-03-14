import {
  detectSpikes,
  formatTrendChart,
  getDailyTrend,
  getWowChange,
} from "../../analytics/trends";

import { SECTION_RULE } from "../render";

export function buildTrendSummary(): string {
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
