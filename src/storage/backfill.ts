import { Database as BunDatabase } from "bun:sqlite";

import { getCodeModes } from "../config/reader";
import { findOpenCodeDbPath } from "../paths";
import { classify } from "../tracking/classifier";
import { normalizeDisplayProvider } from "../tracking/normalizer";
import { recordEvent } from "../tracking/recorder";
import { queryOne, runInTransaction } from "./db";

interface LatestTsRow {
  latestTs: number | null;
}

interface OpenCodeMessageRow {
  id: string;
  session_id: string;
  time_created: number;
  time_updated: number | null;
  data: string;
}

interface ParsedMessagePayload {
  role: string;
  providerID?: string;
  modelID?: string;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: {
      read?: number;
      write?: number;
    };
  };
  cost?: number;
  time?: {
    created?: number;
    completed?: number;
  };
  agent?: string;
  mode?: string;
}

function readLatestTs(): number {
  const row = queryOne<LatestTsRow>("SELECT MAX(ts) AS latestTs FROM events");
  return typeof row?.latestTs === "number" ? row.latestTs : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function readNumber(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function parsePayload(raw: string): ParsedMessagePayload | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const tokensValue = parsed.tokens;
  const cacheValue = isRecord(tokensValue) ? tokensValue.cache : undefined;
  const timeValue = parsed.time;

  return {
    role: readString(parsed, "role") ?? "unknown",
    providerID: readString(parsed, "providerID"),
    modelID: readString(parsed, "modelID"),
    tokens: isRecord(tokensValue)
      ? {
          input: readNumber(tokensValue, "input"),
          output: readNumber(tokensValue, "output"),
          reasoning: readNumber(tokensValue, "reasoning"),
          cache: isRecord(cacheValue)
            ? {
                read: readNumber(cacheValue, "read"),
                write: readNumber(cacheValue, "write"),
              }
            : undefined,
        }
      : undefined,
    cost: readNumber(parsed, "cost"),
    time: isRecord(timeValue)
      ? {
          created: readNumber(timeValue, "created"),
          completed: readNumber(timeValue, "completed"),
        }
      : undefined,
    agent: readString(parsed, "agent"),
    mode: readString(parsed, "mode"),
  };
}

let _backfillCodeModes: Set<string> | undefined;

function toolHeuristic(mode: string | undefined): number {
  if (mode === undefined) return 0;
  if (_backfillCodeModes === undefined) {
    _backfillCodeModes = getCodeModes();
  }
  return _backfillCodeModes.has(mode) ? 1 : 0;
}

function openReadOnlyDb(dbPath: string): BunDatabase {
  return new BunDatabase(dbPath, { readonly: true });
}

function readBackfillRows(db: BunDatabase, latestTs: number): OpenCodeMessageRow[] {
  return db
    .query(
      `
        SELECT id, session_id, time_created, time_updated, data
        FROM message
        WHERE time_created > ?
        ORDER BY time_created ASC, id ASC
      `,
    )
    .all(latestTs) as OpenCodeMessageRow[];
}

function safeTokens(tokens: ParsedMessagePayload["tokens"]) {
  const inp = tokens?.input ?? 0;
  const out = tokens?.output ?? 0;
  const reasoning = tokens?.reasoning ?? 0;
  const cache_r = tokens?.cache?.read ?? 0;
  const cache_w = tokens?.cache?.write ?? 0;
  return {
    inp,
    out,
    reasoning,
    cache_r,
    cache_w,
    total: inp + out + reasoning + cache_r + cache_w,
  };
}

function recoverRow(row: OpenCodeMessageRow): boolean {
  const payload = parsePayload(row.data);
  if (payload === null || payload.role !== "assistant") {
    return false;
  }

  const model = payload.modelID ?? "unknown";
  const tok = safeTokens(payload.tokens);
  const toolCount = toolHeuristic(payload.mode);
  const breakdown = classify({
    tokens: { output: tok.out, reasoning: tok.reasoning },
    toolCallCount: toolCount,
  });

  recordEvent({
    key: row.id,
    ts: payload.time?.completed ?? payload.time?.created ?? row.time_updated ?? row.time_created,
    sid: row.session_id,
    provider: normalizeDisplayProvider(payload.providerID, payload.modelID),
    model,
    agent: payload.mode,
    initiator: payload.mode,
    depth: 0,
    inp: tok.inp,
    out: tok.out,
    reasoning: tok.reasoning,
    cache_r: tok.cache_r,
    cache_w: tok.cache_w,
    think: breakdown.think,
    chat: breakdown.chat,
    code: breakdown.code,
    tools: toolCount,
    cost: payload.cost ?? 0,
    total: tok.total,
  });

  return true;
}

export async function runBackfill(): Promise<number> {
  // Defer all sync work (DB init, migrations) past the plugin startup event loop tick
  await Promise.resolve();

  try {
    const latestTs = readLatestTs();
    const dbPath = findOpenCodeDbPath();

    if (dbPath === null) {
      return 0;
    }

    const db = openReadOnlyDb(dbPath);

    try {
      const rows = readBackfillRows(db, latestTs);
      let recovered = 0;

      // Single outer transaction: N rows become N savepoints instead of N full transactions.
      // This is ~30-100x faster for large histories (e.g. 10k rows: 30s → <1s).
      runInTransaction(() => {
        for (const row of rows) {
          recovered += recoverRow(row) ? 1 : 0;
        }
      });

      return recovered;
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("[oh-my-tokens] backfill failed", error);
    return 0;
  }
}
