import { execute, queryOne } from "./db";

export interface SessionInfo {
  id: string;
  parentId: string | null;
  agent: string | null;
  compactedFrom: string | null;
  status: string;
}

function getSession(sessionId: string): SessionInfo | null {
  return queryOne<SessionInfo>(
    `
      SELECT
        id,
        parent_id AS parentId,
        agent,
        compacted_from AS compactedFrom,
        status
      FROM sessions
      WHERE id = ?
    `,
    sessionId,
  );
}

export function upsertSession(info: { id: string; parentId?: string; agent?: string }): void {
  execute(
    `
      INSERT INTO sessions (id, parent_id, agent, status)
      VALUES (?, ?, ?, 'active')
      ON CONFLICT(id) DO UPDATE SET
        parent_id = COALESCE(excluded.parent_id, sessions.parent_id),
        agent = COALESCE(excluded.agent, sessions.agent),
        status = 'active'
    `,
    info.id,
    info.parentId ?? null,
    info.agent ?? null,
  );
}

export function markCompacted(oldSessionId: string, newSessionId: string): void {
  const previous = getSession(oldSessionId);

  execute(
    `
      INSERT INTO sessions (id, parent_id, agent, compacted_from, status)
      VALUES (?, ?, ?, ?, 'active')
      ON CONFLICT(id) DO UPDATE SET
        parent_id = COALESCE(sessions.parent_id, excluded.parent_id),
        agent = COALESCE(sessions.agent, excluded.agent),
        compacted_from = COALESCE(sessions.compacted_from, excluded.compacted_from)
    `,
    newSessionId,
    previous?.parentId ?? null,
    previous?.agent ?? null,
    oldSessionId,
  );

  execute(`UPDATE sessions SET status = 'compacted' WHERE id = ?`, oldSessionId);
}

export function getSessionAncestry(sessionId: string): SessionInfo[] {
  const ancestry: SessionInfo[] = [];
  const visited = new Set<string>();
  let currentId: string | null = sessionId;

  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);

    const current = getSession(currentId);
    if (current === null) {
      break;
    }

    ancestry.push(current);
    currentId = current.parentId;
  }

  return ancestry;
}

export function getRootInitiator(sessionId: string): string | null {
  const ancestry = getSessionAncestry(sessionId);

  for (let index = ancestry.length - 1; index >= 0; index -= 1) {
    const agent = ancestry[index]?.agent;
    if (agent !== null && agent !== undefined && agent.length > 0) {
      return agent;
    }
  }

  return null;
}
