/// <reference path="../../src/bun-sqlite.d.ts" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let hasNodeSqlite = false;
try {
  await import("node:sqlite");
  hasNodeSqlite = true;
} catch {}

vi.unmock("bun:sqlite");

const { findOpenCodeDbPathMock } = vi.hoisted(() => ({
  findOpenCodeDbPathMock: vi.fn(() => null),
}));

vi.mock("bun:sqlite", async () => {
  const { DatabaseSync } = await import("node:sqlite");

  type TransactionFn = (...args: unknown[]) => unknown;
  type PreparedStatement = {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };

  class Database {
    readonly #database: {
      close(): void;
      exec(sql: string): void;
      prepare(sql: string): PreparedStatement;
    };

    constructor(filename: string, options?: { readonly?: boolean }) {
      this.#database = new DatabaseSync(filename, {
        open: true,
        readOnly: options?.readonly ?? false,
      });
    }

    query(sql: string) {
      return this.#database.prepare(sql);
    }

    exec(sql: string): void {
      this.#database.exec(sql);
    }

    close(): void {
      this.#database.close();
    }

    transaction<T extends TransactionFn>(fn: T): T {
      return ((...args: Parameters<T>): ReturnType<T> => {
        this.#database.exec("BEGIN");

        try {
          const result = fn(...args);
          this.#database.exec("COMMIT");
          return result as ReturnType<T>;
        } catch (error) {
          this.#database.exec("ROLLBACK");
          throw error;
        }
      }) as T;
    }
  }

  return { Database };
});

let db: Database | null = null;

function getTestDb(): Database {
  if (db === null) {
    throw new Error("Test database not initialized");
  }

  return db;
}

vi.mock("../../src/paths", () => ({
  findOpenCodeDbPath: findOpenCodeDbPathMock,
}));

vi.mock("../../src/storage/db", () => ({
  getDb: () => getTestDb(),
  runInTransaction: <T>(fn: () => T): T => getTestDb().transaction(fn)(),
  queryAll: <T>(sql: string, ...params: unknown[]): T[] =>
    getTestDb()
      .query(sql)
      .all(...params) as T[],
  queryOne: <T>(sql: string, ...params: unknown[]): T | null => {
    const row = getTestDb()
      .query(sql)
      .get(...params);
    return row === null || row === undefined ? null : (row as T);
  },
}));

import { Database } from "bun:sqlite";

import { runBackfill } from "../../src/storage/backfill";
import { runMigrations } from "../../src/storage/migrations";
import { getTodayRollups } from "../../src/storage/rollup";
import { recordEvent } from "../../src/tracking/recorder";

const describeIf = hasNodeSqlite ? describe : describe.skip;

describeIf("storage integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T12:00:00"));
    findOpenCodeDbPathMock.mockReset();
    findOpenCodeDbPathMock.mockReturnValue(null);
    db = new Database(":memory:");
  });

  afterEach(() => {
    db?.close();
    db = null;
    vi.useRealTimers();
  });

  it("migrates an empty database to schema version 1", () => {
    runMigrations(getTestDb());

    const tables = getTestDb()
      .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const schemaVersion = getTestDb()
      .query("SELECT value FROM state WHERE key = ?")
      .get("schema_version") as {
      value: string;
    } | null;

    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(["events", "rollups", "sessions", "state"]),
    );
    expect(schemaVersion?.value).toBe("1");
  });

  it("records an event and returns matching today rollups", () => {
    runMigrations(getTestDb());

    recordEvent({
      key: "evt-1",
      ts: new Date("2026-03-14T09:30:00").getTime(),
      sid: "sess-1",
      provider: "anthropic",
      model: "claude-3",
      agent: "builder",
      initiator: "builder",
      depth: 0,
      inp: 100,
      out: 50,
      reasoning: 25,
      cache_r: 5,
      cache_w: 2,
      think: 25,
      chat: 0,
      code: 50,
      tools: 1,
      cost: 0.125,
    });

    expect(getTodayRollups()).toEqual([
      {
        date: "2026-03-14",
        kind: "total",
        name: "*",
        inp: 100,
        out: 50,
        think: 25,
        chat: 0,
        code: 50,
        cache_r: 5,
        cache_w: 2,
        cost: 0.125,
        count: 1,
      },
      {
        date: "2026-03-14",
        kind: "provider",
        name: "anthropic",
        inp: 100,
        out: 50,
        think: 25,
        chat: 0,
        code: 50,
        cache_r: 5,
        cache_w: 2,
        cost: 0.125,
        count: 1,
      },
      {
        date: "2026-03-14",
        kind: "agent",
        name: "builder",
        inp: 100,
        out: 50,
        think: 25,
        chat: 0,
        code: 50,
        cache_r: 5,
        cache_w: 2,
        cost: 0.125,
        count: 1,
      },
    ]);
  });

  it("returns 0 from backfill when no OpenCode database exists", async () => {
    runMigrations(getTestDb());

    await expect(runBackfill()).resolves.toBe(0);
    expect(findOpenCodeDbPathMock).toHaveBeenCalledTimes(1);
    expect(getTestDb().query("SELECT COUNT(*) AS count FROM events").get()).toEqual({ count: 0 });
  });
});
