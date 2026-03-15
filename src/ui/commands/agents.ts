import { computeTotalTokens } from "../../analytics/token-math";
import { getUnitSetting } from "../../config/reader";
import type { RollupRow } from "../../storage/rollup";
import { formatCost } from "../formatter";
import {
  buildSectionRule,
  formatUsageLine,
  LABEL_AREA_MIN,
  maxContentWidth,
  visualWidth,
} from "../render";
import type { DisplayMode } from "../sidebar";

function getAgentCountLabel(row: RollupRow): string {
  return row.count > 1 ? `${row.name} ×${row.count}` : row.name;
}

export function buildAgentSummary(rows: RollupRow[], mode: DisplayMode = "normal"): string {
  const textMode = mode === "text";
  const costMode = getUnitSetting() === "cost";
  const limit = mode === "compact" ? 3 : Number.POSITIVE_INFINITY;
  const agents = rows
    .filter((row) => row.kind === "agent")
    .sort((left, right) => computeTotalTokens(right) - computeTotalTokens(left))
    .slice(0, limit);
  const total = agents.reduce((sum, row) => sum + computeTotalTokens(row), 0);
  const labelWidth = Math.max(
    LABEL_AREA_MIN,
    ...agents.map((row) => visualWidth(getAgentCountLabel(row))),
  );

  const title = "oh-my-tokens — Agent Usage";
  const lines = agents.map((row) => {
    const agentTotal = computeTotalTokens(row);
    const percent = total > 0 ? (agentTotal / total) * 100 : 0;
    const costStr = costMode ? formatCost(row.cost) : undefined;
    return formatUsageLine(
      getAgentCountLabel(row),
      percent,
      agentTotal,
      labelWidth,
      textMode,
      costStr,
    );
  });
  const width = maxContentWidth(title, ...lines);
  const rule = buildSectionRule(width);
  return [title, rule, "AGENTS", ...lines, rule].join("\n");
}
