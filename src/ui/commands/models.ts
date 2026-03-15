import { computeTotalTokens } from "../../analytics/token-math";
import { getModelRollups } from "../../storage/rollup";
import {
  buildSectionRule,
  formatUsageLine,
  LABEL_AREA_MIN,
  maxContentWidth,
  visualWidth,
} from "../render";
import type { DisplayMode } from "../sidebar";

const MODELS_TITLE = "oh-my-tokens — Model Usage";

export function buildModelsSummary(mode: DisplayMode = "normal"): string {
  const textMode = mode === "text";
  const limit = mode === "compact" ? 3 : Number.POSITIVE_INFINITY;
  const models = getModelRollups().slice(0, limit);
  const emptyRule = buildSectionRule();

  if (models.length === 0) {
    return [MODELS_TITLE, emptyRule, "No model data recorded.", emptyRule].join("\n");
  }

  const total = models.reduce((sum, row) => sum + computeTotalTokens(row), 0);
  const labelWidth = Math.max(LABEL_AREA_MIN, ...models.map((row) => visualWidth(row.name)));
  const lines = models.map((row) => {
    const tok = computeTotalTokens(row);
    const percent = total > 0 ? (tok / total) * 100 : 0;
    return formatUsageLine(row.name, percent, tok, labelWidth, textMode);
  });
  const width = maxContentWidth(MODELS_TITLE, ...lines);
  const rule = buildSectionRule(width);
  return [MODELS_TITLE, rule, "MODELS", ...lines, rule].join("\n");
}
