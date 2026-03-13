import { mkdirSync } from "node:fs";
import path from "node:path";

import type { Database } from "bun:sqlite";

import { getOhMyTokensDataDir } from "../paths";
import { runMigrations } from "./migrations";

const sqliteModule = await import("bun:sqlite");
const DatabaseConstructor = sqliteModule.Database;

const dataDir = getOhMyTokensDataDir();
const dbPath = path.join(dataDir, "oh-my-tokens.db");

let dbSingleton: Database | null = null;

export function getDb(): Database {
  if (dbSingleton !== null) {
    return dbSingleton;
  }

  mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseConstructor(dbPath, {
    create: true,
    readwrite: true,
  });

  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  runMigrations(db);

  dbSingleton = db;
  return dbSingleton;
}

export function closeDb(): void {
  if (dbSingleton === null) {
    return;
  }

  dbSingleton.close();
  dbSingleton = null;
}

export function runInTransaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}

export function queryAll<T>(sql: string, ...params: unknown[]): T[] {
  return getDb()
    .query(sql)
    .all(...params) as T[];
}

export function queryOne<T>(sql: string, ...params: unknown[]): T | null {
  const row = getDb()
    .query(sql)
    .get(...params);
  return row === null || row === undefined ? null : (row as T);
}

export function execute(sql: string, ...params: unknown[]): void {
  getDb()
    .query(sql)
    .run(...params);
}
