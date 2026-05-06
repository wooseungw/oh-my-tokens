import type { Database as DatabaseType } from "bun:sqlite";
import { describe, expect, it, vi } from "vitest";

import { runMigrations } from "../../../src/storage/migrations";

function makeMockDb(): DatabaseType {
  return {
    exec: vi.fn(),
    query: vi.fn(() => ({
      get: vi.fn(() => null),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
    transaction: vi.fn((fn: () => void) => fn),
    close: vi.fn(),
  } as unknown as DatabaseType;
}

describe("runMigrations", () => {
  it("does not throw on empty database", () => {
    const db = makeMockDb();
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("is a function", () => {
    expect(typeof runMigrations).toBe("function");
  });
});

describe("runMigrations schema version 3", () => {
  function makeTrackedDb(initialVersion: number): {
    db: DatabaseType;
    execs: string[];
    runs: Array<unknown[]>;
    recordedVersion: () => string | null;
  } {
    const execs: string[] = [];
    const runs: Array<unknown[]> = [];
    let recordedVersion: string | null = initialVersion === 0 ? null : String(initialVersion);

    const runFn = vi.fn((...params: unknown[]) => {
      runs.push(params);
      if (params[0] === "schema_version") recordedVersion = params[1] as string;
    });
    const getFn = vi.fn(() =>
      recordedVersion === null ? null : ({ value: recordedVersion } as { value: string | null }),
    );

    const db = {
      exec: vi.fn((sql: string) => execs.push(sql)),
      query: vi.fn(() => ({ get: getFn, run: runFn, all: vi.fn(() => []) })),
      transaction: vi.fn((fn: () => void) => fn),
      close: vi.fn(),
    } as unknown as DatabaseType;

    return { db, execs, runs, recordedVersion: () => recordedVersion };
  }

  it("records schema_version=3 after a fresh migration run", () => {
    const { db, recordedVersion } = makeTrackedDb(0);
    runMigrations(db);
    expect(recordedVersion()).toBe("3");
  });

  it("applies applyVersionThree on a v2 database (creates verifications table)", () => {
    const { db, execs, recordedVersion } = makeTrackedDb(2);
    runMigrations(db);
    const allSql = execs.join("\n");
    expect(allSql).toContain("CREATE TABLE IF NOT EXISTS verifications");
    expect(allSql).toContain("session_id");
    expect(allSql).toContain("recorded_cost");
    expect(allSql).toContain("checked_at");
    expect(recordedVersion()).toBe("3");
  });

  it("skips applyVersionThree when the DB is already at v3", () => {
    const { db, execs } = makeTrackedDb(3);
    runMigrations(db);
    const allSql = execs.join("\n");
    expect(allSql).not.toContain("CREATE TABLE IF NOT EXISTS verifications");
  });

  it("creates indexes on the verifications table during the v3 upgrade", () => {
    const { db, execs } = makeTrackedDb(2);
    runMigrations(db);
    const allSql = execs.join("\n");
    expect(allSql).toContain("idx_verifications_session");
    expect(allSql).toContain("idx_verifications_provider");
    expect(allSql).toContain("idx_verifications_checked_at");
  });
});
