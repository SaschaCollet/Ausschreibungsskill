import Database from 'better-sqlite3';

/**
 * Open SQLite DB at the given path, configure WAL mode, and run idempotent schema migration.
 *
 * CRITICAL: WAL pragma must be first statement after open (before any reads/writes).
 * CRITICAL: Never call with '/data/scanner.db' in tests — use ':memory:'.
 */
export function openDb(dbPath: string): Database.Database {
  if (dbPath === '/data/scanner.db' && process.env.NODE_ENV !== 'production') {
    // Safety guard: remind executor to use DB_PATH=/tmp/scanner.db for local dev
    console.warn('[db] Opening /data/scanner.db — ensure Railway Volume is mounted at /data');
  }

  const db = new Database(dbPath, { timeout: 5000 });

  // WAL mode — must be first (prevents lock hang on crash restart)
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Idempotent schema — safe to run on every startup
  db.exec(`
    CREATE TABLE IF NOT EXISTS seen_notices (
      nd          TEXT PRIMARY KEY,
      first_seen  TEXT NOT NULL,
      title_deu   TEXT,
      cpv_codes   TEXT,
      deadline    TEXT,
      budget      REAL,
      notice_type TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at       TEXT NOT NULL,
      finished_at      TEXT,
      query_from       TEXT,
      query_to         TEXT,
      total_available  INTEGER,
      total_fetched    INTEGER,
      new_notices      INTEGER,
      filtered_out     INTEGER,
      stored           INTEGER,
      error            TEXT
    );

    CREATE TABLE IF NOT EXISTS job_lock (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      locked_at  TEXT NOT NULL,
      pid        INTEGER NOT NULL
    );
  `);

  return db;
}
