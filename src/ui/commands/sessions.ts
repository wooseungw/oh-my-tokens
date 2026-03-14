import { computeTotalTokens } from "../../analytics/token-math";
import { getTopSessions } from "../../storage/rollup";
import { formatTokens } from "../formatter";
import { LABEL_AREA_MIN, SECTION_RULE, visualWidth } from "../render";

const SESSIONS_TITLE = "oh-my-tokens — Top Sessions";

export function buildSessionsSummary(): string {
  const sessions = getTopSessions(7, 15);

  if (sessions.length === 0) {
    return [SESSIONS_TITLE, SECTION_RULE, "No sessions recorded.", SECTION_RULE].join("\n");
  }

  const labelWidth = Math.max(
    LABEL_AREA_MIN,
    ...sessions.map((session) => visualWidth(session.sid.slice(0, 8))),
  );

  return [
    SESSIONS_TITLE,
    SECTION_RULE,
    "SESSIONS (last 7 days)",
    ...sessions.map((session) => {
      const label = session.sid.slice(0, 8);
      const total = computeTotalTokens(session);
      return `  ${label.padEnd(labelWidth)}  ${session.date}  ${formatTokens(total).padStart(7)} tok`;
    }),
    SECTION_RULE,
  ].join("\n");
}
