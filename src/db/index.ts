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

    CREATE TABLE IF NOT EXISTS triage_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      INTEGER NOT NULL REFERENCES runs(id),
      nd          TEXT    NOT NULL REFERENCES seen_notices(nd),
      score       INTEGER,
      rationale   TEXT,
      triage_ok   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_triage_results_nd    ON triage_results(nd);
    CREATE INDEX IF NOT EXISTS idx_triage_results_run   ON triage_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_triage_results_score ON triage_results(score);

    CREATE TABLE IF NOT EXISTS analyses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nd            TEXT    NOT NULL REFERENCES seen_notices(nd),
      run_id        INTEGER NOT NULL REFERENCES runs(id),
      analysis_text TEXT    NOT NULL,
      created_at    TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_nd  ON analyses(nd);
    CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id);
  `);

  // Migration for existing DBs: add Phase 2 columns to runs table.
  // Each ALTER TABLE is wrapped in try/catch — throws if column already exists.
  const phase2Cols = [
    'ALTER TABLE runs ADD COLUMN triage_count INTEGER',
    'ALTER TABLE runs ADD COLUMN triage_ok_count INTEGER',
    'ALTER TABLE runs ADD COLUMN haiku_input_tokens INTEGER',
    'ALTER TABLE runs ADD COLUMN haiku_output_tokens INTEGER',
    'ALTER TABLE runs ADD COLUMN haiku_cost_usd REAL',
  ];
  for (const stmt of phase2Cols) {
    try { db.exec(stmt); } catch { /* column already exists */ }
  }

  // Migration for existing DBs: add Phase 3 columns to runs table.
  const phase3Cols = [
    'ALTER TABLE runs ADD COLUMN analysis_count INTEGER',
    'ALTER TABLE runs ADD COLUMN sonnet_input_tokens INTEGER',
    'ALTER TABLE runs ADD COLUMN sonnet_output_tokens INTEGER',
    'ALTER TABLE runs ADD COLUMN sonnet_cost_usd REAL',
  ];
  for (const stmt of phase3Cols) {
    try { db.exec(stmt); } catch { /* column already exists */ }
  }

  return db;
}
