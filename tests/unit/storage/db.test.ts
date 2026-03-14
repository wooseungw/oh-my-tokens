import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  DatabaseMock,
  databaseConstructorMock,
  mkdirSyncMock,
  mockAll,
  mockClose,
  mockExec,
  mockGet,
  mockRun,
  queryMock,
  runMigrationsMock,
  transactionMock,
} = vi.hoisted(() => {
  const mockAll = vi.fn((..._params: unknown[]): unknown[] => []);
  const mockGet = vi.fn((..._params: unknown[]): unknown | null => null);
  const mockRun = vi.fn((..._params: unknown[]): void => {});
  const mockExec = vi.fn((_sql: string): void => {});
  const mockClose = vi.fn((): void => {});
  const queryMock = vi.fn((_sql: string) => ({
    all: mockAll,
    get: mockGet,
    run: mockRun,
  }));
  const transactionMock = vi.fn((fn: () => unknown) => fn);
  const databaseConstructorMock = vi.fn();

  class MockDatabase {
    constructor(dbPath: string, options: { create: boolean; readwrite: boolean }) {
      databaseConstructorMock(dbPath, options);
    }

    close() {
      return mockClose();
    }

    exec(sql: string) {
      return mockExec(sql);
    }

    query(sql: string) {
      return queryMock(sql);
    }

    transaction<T extends () => unknown>(fn: T): T {
      return transactionMock(fn) as T;
    }
  }

  return {
    DatabaseMock: MockDatabase,
    databaseConstructorMock,
    mkdirSyncMock: vi.fn(),
    mockAll,
    mockClose,
    mockExec,
    mockGet,
    mockRun,
    queryMock,
    runMigrationsMock: vi.fn(),
    transactionMock,
  };
});

vi.mock("bun:sqlite", () => ({
  Database: DatabaseMock,
}));

vi.mock("../../../src/paths", () => ({
  getOhMyTokensDataDir: vi.fn(() => "/tmp/test-db"),
}));

vi.mock("node:fs", () => ({
  mkdirSync: mkdirSyncMock,
}));

vi.mock("../../../src/storage/migrations", () => ({
  runMigrations: runMigrationsMock,
}));

import path from "node:path";

import { closeDb, getDb, queryAll, queryOne } from "../../../src/storage/db";

describe("getDb", () => {
  beforeEach(() => {
    databaseConstructorMock.mockReset();
    mkdirSyncMock.mockReset();
    mockAll.mockReset();
    mockAll.mockReturnValue([]);
    mockClose.mockReset();
    mockExec.mockReset();
    mockGet.mockReset();
    mockGet.mockReturnValue(null);
    mockRun.mockReset();
    queryMock.mockReset();
    queryMock.mockImplementation(() => ({
      all: mockAll,
      get: mockGet,
      run: mockRun,
    }));
    runMigrationsMock.mockReset();
    transactionMock.mockReset();
    transactionMock.mockImplementation((fn: () => unknown) => fn);
  });

  afterEach(() => {
    closeDb();
  });

  it("returns a database instance", () => {
    const db = getDb();

    expect(db).toBeDefined();
  });

  it("returns the same instance on the second call", () => {
    const db1 = getDb();
    const db2 = getDb();

    expect(db1).toBe(db2);
    expect(databaseConstructorMock).toHaveBeenCalledTimes(1);
  });

  it("creates the database directory, enables WAL mode, and runs migrations", () => {
    const db = getDb();

    expect(mkdirSyncMock).toHaveBeenCalledWith("/tmp/test-db", { recursive: true });
    expect(databaseConstructorMock).toHaveBeenCalledWith(
      path.join("/tmp/test-db", "oh-my-tokens.db"),
      {
        create: true,
        readwrite: true,
      },
    );
    expect(mockExec).toHaveBeenNthCalledWith(1, "PRAGMA journal_mode=WAL");
    expect(mockExec).toHaveBeenNthCalledWith(2, "PRAGMA busy_timeout=5000");
    expect(runMigrationsMock).toHaveBeenCalledWith(db);
  });
});

describe("queryAll", () => {
  beforeEach(() => {
    mockAll.mockReset();
    mockAll.mockReturnValue([{ value: 1 }]);
    queryMock.mockReset();
    queryMock.mockImplementation(() => ({
      all: mockAll,
      get: mockGet,
      run: mockRun,
    }));
  });

  afterEach(() => {
    closeDb();
  });

  it("returns all rows for a query", () => {
    const result = queryAll<{ value: number }>("SELECT 1");

    expect(result).toEqual([{ value: 1 }]);
    expect(Array.isArray(result)).toBe(true);
    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
  });
});

describe("queryOne", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockReturnValue(null);
    queryMock.mockReset();
    queryMock.mockImplementation(() => ({
      all: mockAll,
      get: mockGet,
      run: mockRun,
    }));
  });

  afterEach(() => {
    closeDb();
  });

  it("returns null when no row is found", () => {
    const result = queryOne("SELECT 1 WHERE 0");

    expect(result).toBeNull();
    expect(queryMock).toHaveBeenCalledWith("SELECT 1 WHERE 0");
  });
});
