import { getRootInitiator, getSessionAncestry } from "../storage/sessions";

export interface Attribution {
  agent: string;
  initiator: string;
  depth: number;
}

export function resolveAttribution(
  mode: string,
  sessionId: string,
  _parentSessionId?: string,
): Attribution {
  const ancestry = getSessionAncestry(sessionId);

  return {
    agent: mode,
    initiator: getRootInitiator(sessionId) ?? ancestry.at(-1)?.agent ?? mode,
    depth: Math.max(ancestry.length - 1, 0),
  };
}
