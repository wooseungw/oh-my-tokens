import { getDb, runInTransaction } from "../storage/db";
import { dateKeyFromMs } from "../utils";

export interface EventRecord {
  key: string;
  ts: number;
  sid: string;
  psid?: string;
  pid?: string;
  provider: string;
  model: string;
  agent?: string;
  initiator?: string;
  depth: number;
  inp: number;
  out: number;
  reasoning: number;
  cache_r: number;
  cache_w: number;
  think: number;
  chat: number;
  code: number;
  tools: number;
  cost: number;
}

interface EventSnapshot {
  ts: number;
  provider: string;
  agent: string | null;
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  cost: number;
}

interface RollupDelta {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  cost: number;
  count: number;
}

function isEventSnapshot(value: unknown): value is EventSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.ts === "number" &&
    typeof candidate.provider === "string" &&
    (typeof candidate.agent === "string" || candidate.agent === null) &&
    typeof candidate.inp === "number" &&
    typeof candidate.out === "number" &&
    typeof candidate.think === "number" &&
    typeof candidate.chat === "number" &&
    typeof candidate.code === "number" &&
    typeof candidate.cache_r === "number" &&
    typeof candidate.cache_w === "number" &&
    typeof candidate.cost === "number"
  );
}

function readExistingSnapshot(key: string): EventSnapshot | null {
  const existingRow = getDb()
    .query(
      `
        SELECT ts, provider, agent, inp, out, think, chat, code, cache_r, cache_w, cost
        FROM events
        WHERE key = ?
      `,
    )
    .get(key);

  return isEventSnapshot(existingRow) ? existingRow : null;
}

function readChangeCount(): number {
  const changesRow = getDb().query("SELECT changes() AS changes").get();

  if (
    typeof changesRow === "object" &&
    changesRow !== null &&
    "changes" in changesRow &&
    typeof changesRow.changes === "number"
  ) {
    return changesRow.changes;
  }

  return 0;
}

function buildSnapshot(record: EventRecord): EventSnapshot {
  return {
    ts: record.ts,
    provider: record.provider,
    agent: record.agent ?? null,
    inp: record.inp,
    out: record.out,
    think: record.think,
    chat: record.chat,
    code: record.code,
    cache_r: record.cache_r,
    cache_w: record.cache_w,
    cost: record.cost,
  };
}

function subtractSnapshots(current: EventSnapshot, previous: EventSnapshot): RollupDelta {
  return {
    inp: current.inp - previous.inp,
    out: current.out - previous.out,
    think: current.think - previous.think,
    chat: current.chat - previous.chat,
    code: current.code - previous.code,
    cache_r: current.cache_r - previous.cache_r,
    cache_w: current.cache_w - previous.cache_w,
    cost: current.cost - previous.cost,
    count: 0,
  };
}

function negateSnapshot(snapshot: EventSnapshot): RollupDelta {
  return {
    inp: -snapshot.inp,
    out: -snapshot.out,
    think: -snapshot.think,
    chat: -snapshot.chat,
    code: -snapshot.code,
    cache_r: -snapshot.cache_r,
    cache_w: -snapshot.cache_w,
    cost: -snapshot.cost,
    count: -1,
  };
}

function deltaFromSnapshot(snapshot: EventSnapshot): RollupDelta {
  return {
    inp: snapshot.inp,
    out: snapshot.out,
    think: snapshot.think,
    chat: snapshot.chat,
    code: snapshot.code,
    cache_r: snapshot.cache_r,
    cache_w: snapshot.cache_w,
    cost: snapshot.cost,
    count: 1,
  };
}

function applyRollupDelta(date: string, kind: string, name: string, delta: RollupDelta): void {
  getDb()
    .query(
      `
        INSERT INTO rollups (date, kind, name, inp, out, think, chat, code, cache_r, cache_w, cost, count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, kind, name) DO UPDATE SET
          inp = inp + excluded.inp,
          out = out + excluded.out,
          think = think + excluded.think,
          chat = chat + excluded.chat,
          code = code + excluded.code,
          cache_r = cache_r + excluded.cache_r,
          cache_w = cache_w + excluded.cache_w,
          cost = cost + excluded.cost,
          count = count + excluded.count
      `,
    )
    .run(
      date,
      kind,
      name,
      delta.inp,
      delta.out,
      delta.think,
      delta.chat,
      delta.code,
      delta.cache_r,
      delta.cache_w,
      delta.cost,
      delta.count,
    );
}

function applyEventRollups(snapshot: EventSnapshot, delta: RollupDelta): void {
  const date = dateKeyFromMs(snapshot.ts);
  applyRollupDelta(date, "provider", snapshot.provider, delta);

  if (snapshot.agent !== null && snapshot.agent.length > 0) {
    applyRollupDelta(date, "agent", snapshot.agent, delta);
  }

  applyRollupDelta(date, "total", "*", delta);
}

function applyRollupChanges(previous: EventSnapshot | null, current: EventSnapshot): void {
  if (previous === null) {
    applyEventRollups(current, deltaFromSnapshot(current));
    return;
  }

  const previousDate = dateKeyFromMs(previous.ts);
  const currentDate = dateKeyFromMs(current.ts);

  if (previousDate !== currentDate) {
    applyEventRollups(previous, negateSnapshot(previous));
    applyEventRollups(current, deltaFromSnapshot(current));
    return;
  }

  applyEventRollups(current, subtractSnapshots(current, previous));
}

export function recordEvent(record: EventRecord): void {
  runInTransaction(() => {
    const db = getDb();
    const previous = readExistingSnapshot(record.key);

    db.query(
      `
        INSERT INTO events (key, ts, ver, sid, psid, pid, provider, model, agent, initiator, depth, inp, out, reasoning, cache_r, cache_w, think, chat, code, tools, cost)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          ts = excluded.ts,
          ver = ver + 1,
          inp = excluded.inp,
          out = excluded.out,
          reasoning = excluded.reasoning,
          cache_r = excluded.cache_r,
          cache_w = excluded.cache_w,
          think = excluded.think,
          chat = excluded.chat,
          code = excluded.code,
          tools = excluded.tools,
          cost = excluded.cost
        WHERE excluded.inp + excluded.out + excluded.think + excluded.chat + excluded.code + excluded.cache_r + excluded.cache_w + excluded.reasoning + excluded.cost > inp + out + think + chat + code + cache_r + cache_w + reasoning + cost
      `,
    ).run(
      record.key,
      record.ts,
      record.sid,
      record.psid ?? null,
      record.pid ?? null,
      record.provider,
      record.model,
      record.agent ?? null,
      record.initiator ?? null,
      record.depth,
      record.inp,
      record.out,
      record.reasoning,
      record.cache_r,
      record.cache_w,
      record.think,
      record.chat,
      record.code,
      record.tools,
      record.cost,
    );

    if (readChangeCount() < 1) {
      return;
    }

    applyRollupChanges(previous, buildSnapshot(record));
  });
}
