import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventRecord } from "../../src/tracking/recorder";

const { getDbMock, runInTransactionMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  runInTransactionMock: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("../../src/storage/db", () => ({
  getDb: getDbMock,
  runInTransaction: runInTransactionMock,
}));

import { recordEvent } from "../../src/tracking/recorder";

interface MockStatement {
  get: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

function buildRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    key: "session-1:msg-1",
    ts: new Date("2026-03-12T10:00:00").getTime(),
    sid: "session-1",
    psid: "parent-session",
    pid: "project-1",
    provider: "anthropic",
    model: "claude-sonnet-4",
    agent: "builder",
    initiator: "builder",
    depth: 1,
    inp: 100,
    out: 40,
    reasoning: 8,
    cache_r: 5,
    cache_w: 2,
    think: 8,
    chat: 0,
    code: 40,
    tools: 2,
    cost: 0.42,
    total: 155,
    ...overrides,
  };
}

function createDb(options: {
  existingRow?: unknown;
  changesRow?: unknown;
  queryLog?: string[];
  rollupRuns?: unknown[][];
  eventRuns?: unknown[][];
}) {
  const queryLog = options.queryLog ?? [];
  const rollupRuns = options.rollupRuns ?? [];
  const eventRuns = options.eventRuns ?? [];

  return {
    query(sql: string): MockStatement {
      queryLog.push(sql);

      if (sql.includes("FROM events") && sql.includes("WHERE key = ?")) {
        return {
          get: vi.fn(() => options.existingRow ?? null),
          run: vi.fn(),
        };
      }

      if (sql.includes("INSERT INTO events")) {
        return {
          get: vi.fn(),
          run: vi.fn((...params: unknown[]) => {
            eventRuns.push(params);
          }),
        };
      }

      if (sql.includes("SELECT changes() AS changes")) {
        return {
          get: vi.fn(() => options.changesRow ?? { changes: 1 }),
          run: vi.fn(),
        };
      }

      if (sql.includes("INSERT INTO rollups")) {
        return {
          get: vi.fn(),
          run: vi.fn((...params: unknown[]) => {
            rollupRuns.push(params);
          }),
        };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

describe("recordEvent", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    runInTransactionMock.mockClear();
  });

  it("records a new event and writes provider, agent, and total rollups", () => {
    const rollupRuns: unknown[][] = [];
    const eventRuns: unknown[][] = [];
    const db = createDb({ rollupRuns, eventRuns });

    getDbMock.mockReturnValue(db);

    recordEvent(buildRecord());

    expect(runInTransactionMock).toHaveBeenCalledTimes(1);
    expect(eventRuns).toHaveLength(1);
    expect(rollupRuns).toHaveLength(3);
    expect(rollupRuns).toEqual([
      ["2026-03-12", "provider", "anthropic", 100, 40, 8, 0, 40, 5, 2, 0.42, 155, 1],
      ["2026-03-12", "agent", "builder", 100, 40, 8, 0, 40, 5, 2, 0.42, 155, 1],
      ["2026-03-12", "total", "*", 100, 40, 8, 0, 40, 5, 2, 0.42, 155, 1],
    ]);
  });

  it("applies only the delta to rollups when an event is updated", () => {
    const rollupRuns: unknown[][] = [];
    const existingRow = {
      ts: new Date("2026-03-12T09:55:00").getTime(),
      provider: "anthropic",
      agent: "builder",
      inp: 90,
      out: 30,
      think: 5,
      chat: 0,
      code: 30,
      cache_r: 3,
      cache_w: 1,
      cost: 0.3,
      total: 129,
    };
    const db = createDb({ existingRow, rollupRuns, changesRow: { changes: 1 } });

    getDbMock.mockReturnValue(db);

    recordEvent(buildRecord());

    expect(rollupRuns).toEqual([
      ["2026-03-12", "provider", "anthropic", 10, 10, 3, 0, 10, 2, 1, 0.12, 26, 0],
      ["2026-03-12", "agent", "builder", 10, 10, 3, 0, 10, 2, 1, 0.12, 26, 0],
      ["2026-03-12", "total", "*", 10, 10, 3, 0, 10, 2, 1, 0.12, 26, 0],
    ]);
  });

  it("skips rollup updates when the upsert does not change the event", () => {
    const rollupRuns: unknown[][] = [];
    const existingRow = {
      ts: new Date("2026-03-12T09:55:00").getTime(),
      provider: "anthropic",
      agent: "builder",
      inp: 100,
      out: 40,
      think: 8,
      chat: 0,
      code: 40,
      cache_r: 5,
      cache_w: 2,
      cost: 0.42,
      total: 155,
    };
    const db = createDb({ existingRow, rollupRuns, changesRow: { changes: 0 } });

    getDbMock.mockReturnValue(db);

    recordEvent(buildRecord());

    expect(rollupRuns).toHaveLength(0);
  });

  it("updates rollups when reasoning-only changes (inp=0, out=0, reasoning increases)", () => {
    const rollupRuns: unknown[][] = [];
    const existingRow = {
      ts: new Date("2026-03-12T09:55:00").getTime(),
      provider: "anthropic",
      agent: "builder",
      inp: 0,
      out: 0,
      think: 0,
      chat: 0,
      code: 0,
      cache_r: 0,
      cache_w: 0,
      cost: 0,
      total: 0,
    };
    const db = createDb({ existingRow, rollupRuns, changesRow: { changes: 1 } });

    getDbMock.mockReturnValue(db);

    recordEvent(
      buildRecord({
        inp: 0,
        out: 0,
        reasoning: 100,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        total: 0,
      }),
    );

    expect(rollupRuns).toEqual([
      ["2026-03-12", "provider", "anthropic", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ["2026-03-12", "agent", "builder", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ["2026-03-12", "total", "*", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
  });

  it("updates rollups when cache-only changes (inp=0, out=0, cache_r increases)", () => {
    const rollupRuns: unknown[][] = [];
    const existingRow = {
      ts: new Date("2026-03-12T09:55:00").getTime(),
      provider: "anthropic",
      agent: "builder",
      inp: 0,
      out: 0,
      think: 0,
      chat: 0,
      code: 0,
      cache_r: 0,
      cache_w: 0,
      cost: 0,
      total: 0,
    };
    const db = createDb({ existingRow, rollupRuns, changesRow: { changes: 1 } });

    getDbMock.mockReturnValue(db);

    recordEvent(
      buildRecord({
        inp: 0,
        out: 0,
        reasoning: 0,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 500,
        cache_w: 0,
        cost: 0,
        total: 500,
      }),
    );

    expect(rollupRuns).toEqual([
      ["2026-03-12", "provider", "anthropic", 0, 0, 0, 0, 0, 500, 0, 0, 500, 0],
      ["2026-03-12", "agent", "builder", 0, 0, 0, 0, 0, 500, 0, 0, 500, 0],
      ["2026-03-12", "total", "*", 0, 0, 0, 0, 0, 500, 0, 0, 500, 0],
    ]);
  });
});
