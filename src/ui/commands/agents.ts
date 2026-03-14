import { computeTotalTokens } from "../../analytics/token-math";
import { getUnitSetting } from "../../config/reader";
import type { RollupRow } from "../../storage/rollup";
import { formatCost } from "../formatter";
import { formatUsageLine, LABEL_AREA_MIN, SECTION_RULE, visualWidth } from "../render";

function getAgentCountLabel(row: RollupRow): string {
  return row.count > 1 ? `${row.name} ×${row.count}` : row.name;
}

export function buildAgentSummary(rows: RollupRow[], textMode = false): string {
  const costMode = getUnitSetting() === "cost";
  const agents = rows
    .filter((row) => row.kind === "agent")
    .sort((left, right) => computeTotalTokens(right) - computeTotalTokens(left));
  const total = agents.reduce((sum, row) => sum + computeTotalTokens(row), 0);
  const labelWidth = Math.max(
    LABEL_AREA_MIN,
    ...agents.map((row) => visualWidth(getAgentCountLabel(row))),
  );

  return [
    "oh-my-tokens — Agent Usage",
    SECTION_RULE,
    "AGENTS",
    ...agents.map((row) => {
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
    }),
    SECTION_RULE,
  ].join("\n");
}
