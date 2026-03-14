import { computeTotalTokens } from "../../analytics/token-math";
import { getTopSessions } from "../../storage/rollup";
import { formatTokens } from "../formatter";
import { buildSectionRule, LABEL_AREA_MIN, maxContentWidth, visualWidth } from "../render";

const SESSIONS_TITLE = "oh-my-tokens — Top Sessions";

export function buildSessionsSummary(): string {
  const sessions = getTopSessions(7, 15);
  const emptyRule = buildSectionRule();

  if (sessions.length === 0) {
    return [SESSIONS_TITLE, emptyRule, "No sessions recorded.", emptyRule].join("\n");
  }

  const labelWidth = Math.max(
    LABEL_AREA_MIN,
    ...sessions.map((session) => visualWidth(session.sid.slice(0, 8))),
  );
  const lines = sessions.map((session) => {
    const label = session.sid.slice(0, 8);
    const total = computeTotalTokens(session);
    return `  ${label.padEnd(labelWidth)}  ${session.date}  ${formatTokens(total).padStart(7)} tok`;
  });
  const width = maxContentWidth(SESSIONS_TITLE, ...lines);
  const rule = buildSectionRule(width);
  return [SESSIONS_TITLE, rule, "SESSIONS (last 7 days)", ...lines, rule].join("\n");
}
