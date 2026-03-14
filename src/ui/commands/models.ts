import { computeTotalTokens } from "../../analytics/token-math";
import { getModelRollups } from "../../storage/rollup";
import { formatUsageLine, LABEL_AREA_MIN, SECTION_RULE, visualWidth } from "../render";

const MODELS_TITLE = "oh-my-tokens — Model Usage";

export function buildModelsSummary(textMode = false): string {
  const models = getModelRollups();

  if (models.length === 0) {
    return [MODELS_TITLE, SECTION_RULE, "No model data recorded.", SECTION_RULE].join("\n");
  }

  const total = models.reduce((sum, row) => sum + computeTotalTokens(row), 0);
  const labelWidth = Math.max(LABEL_AREA_MIN, ...models.map((row) => visualWidth(row.name)));

  return [
    MODELS_TITLE,
    SECTION_RULE,
    "MODELS",
    ...models.map((row) => {
      const tok = computeTotalTokens(row);
      const percent = total > 0 ? (tok / total) * 100 : 0;
      return formatUsageLine(row.name, percent, tok, labelWidth, textMode);
    }),
    SECTION_RULE,
  ].join("\n");
}
