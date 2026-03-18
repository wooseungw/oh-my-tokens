import type { Database } from "bun:sqlite";

const CURRENT_SCHEMA_VERSION = 2;

function isStateRow(value: unknown): value is { value: string | null } {
  return typeof value === "object" && value !== null && "value" in value;
}

function readSchemaVersion(db: Database): number {
  const row = db.query("SELECT value FROM state WHERE key = ?").get("schema_version");

  if (!isStateRow(row) || row.value === null) {
    return 0;
  }

  const version = Number.parseInt(row.value, 10);
  return Number.isNaN(version) ? 0 : version;
}

function applyVersionOne(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      key       TEXT PRIMARY KEY,
      ts        INTEGER NOT NULL,
      ver       INTEGER DEFAULT 1,
      sid       TEXT NOT NULL,
      psid      TEXT,
      pid       TEXT,
      provider  TEXT NOT NULL,
      model     TEXT NOT NULL,
      agent     TEXT,
      initiator TEXT,
      depth     INTEGER DEFAULT 0,
      inp       INTEGER DEFAULT 0,
      out       INTEGER DEFAULT 0,
      reasoning INTEGER DEFAULT 0,
      cache_r   INTEGER DEFAULT 0,
      cache_w   INTEGER DEFAULT 0,
      think     INTEGER DEFAULT 0,
      chat      INTEGER DEFAULT 0,
      code      INTEGER DEFAULT 0,
      tools     INTEGER DEFAULT 0,
      cost      REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_sid ON events(sid);
    CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider);

    CREATE TABLE IF NOT EXISTS rollups (
      date      TEXT NOT NULL,
      kind      TEXT NOT NULL,
      name      TEXT NOT NULL,
      inp       INTEGER DEFAULT 0,
      out       INTEGER DEFAULT 0,
      think     INTEGER DEFAULT 0,
      chat      INTEGER DEFAULT 0,
      code      INTEGER DEFAULT 0,
      cache_r   INTEGER DEFAULT 0,
      cache_w   INTEGER DEFAULT 0,
      cost      REAL DEFAULT 0,
      count     INTEGER DEFAULT 0,
      PRIMARY KEY (date, kind, name)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id             TEXT PRIMARY KEY,
      parent_id      TEXT,
      agent          TEXT,
      compacted_from TEXT,
      status         TEXT DEFAULT 'active'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_compacted ON sessions(compacted_from);

    CREATE TABLE IF NOT EXISTS state (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function applyVersionTwo(db: Database): void {
  db.exec("ALTER TABLE events ADD COLUMN total INTEGER DEFAULT 0");
  db.exec("ALTER TABLE rollups ADD COLUMN total INTEGER DEFAULT 0");
  db.exec("UPDATE events SET total = inp + out + think + cache_r + cache_w WHERE total = 0");
  db.exec("UPDATE rollups SET total = inp + out + think + cache_r + cache_w WHERE total = 0");
}

export function runMigrations(db: Database): void {
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS state (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    let version = readSchemaVersion(db);

    if (version < 1) {
      applyVersionOne(db);
      version = 1;
    }

    if (version < 2) {
      applyVersionTwo(db);
      version = 2;
    }

    db.query(
      `
        INSERT INTO state (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
    ).run("schema_version", String(CURRENT_SCHEMA_VERSION));
  });

  migrate();
}
