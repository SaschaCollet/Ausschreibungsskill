import type Database from 'better-sqlite3';

export interface NoticeRecord {
  nd: string;
  firstSeen: string;
  titleDeu?: string;
  cpvCodes?: string;
  deadline?: string;
  budget?: number | null;
  noticeType?: string;
}

export interface RunStats {
  finishedAt: string;
  totalAvailable: number;
  totalFetched: number;
  newNotices: number;
  filteredOut: number;
  stored: number;
  error?: string;
}

// ── Dedup ──────────────────────────────────────────────────────────────────

export function isNoticeNew(db: Database.Database, nd: string): boolean {
  const row = db.prepare('SELECT 1 FROM seen_notices WHERE nd = ?').get(nd);
  return row === undefined;
}

/**
 * Batch-insert notices into seen_notices using INSERT OR IGNORE.
 * Wrapped in a transaction for performance and atomicity.
 * Uses named parameters — no string interpolation (T-02-01 SQL injection mitigation).
 */
export function markNoticeSeen(db: Database.Database, notices: NoticeRecord[]): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO seen_notices
      (nd, first_seen, title_deu, cpv_codes, deadline, budget, notice_type)
    VALUES
      (@nd, @firstSeen, @titleDeu, @cpvCodes, @deadline, @budget, @noticeType)
  `);

  const insertMany = db.transaction((records: NoticeRecord[]) => {
    for (const r of records) {
      insert.run({
        nd: r.nd,
        firstSeen: r.firstSeen,
        titleDeu: r.titleDeu ?? null,
        cpvCodes: r.cpvCodes ?? null,
        deadline: r.deadline ?? null,
        budget: r.budget ?? null,
        noticeType: r.noticeType ?? null,
      });
    }
  });

  insertMany(notices);
}

// ── Job Lock ───────────────────────────────────────────────────────────────

/**
 * Attempt to acquire the job mutex.
 * Returns true if acquired (this process now owns the lock).
 * Returns false if another process holds it.
 *
 * The job_lock table has CHECK (id = 1) — only one row can ever exist.
 * A concurrent INSERT throws a UNIQUE constraint violation if row exists.
 * This satisfies T-02-02: prevents two cron invocations running simultaneously.
 */
export function acquireJobLock(db: Database.Database): boolean {
  try {
    db.prepare(
      'INSERT INTO job_lock (id, locked_at, pid) VALUES (1, ?, ?)'
    ).run(new Date().toISOString(), process.pid);
    return true;
  } catch {
    const lock = db.prepare('SELECT locked_at, pid FROM job_lock WHERE id = 1').get() as any;
    console.log(`[lock] Job locked since ${lock?.locked_at} by PID ${lock?.pid}`);
    return false;
  }
}

export function releaseJobLock(db: Database.Database): void {
  db.prepare('DELETE FROM job_lock WHERE id = 1').run();
}

// ── Run Logging ────────────────────────────────────────────────────────────

export function createRun(
  db: Database.Database,
  queryFrom: string,
  queryTo: string
): number | bigint {
  const result = db.prepare(
    'INSERT INTO runs (started_at, query_from, query_to) VALUES (?, ?, ?)'
  ).run(new Date().toISOString(), queryFrom, queryTo);
  return result.lastInsertRowid;
}

/**
 * Finalize a run record with fetched counts.
 * Call after pipeline completes (success or error).
 * Logging totalAvailable vs totalFetched satisfies FETCH-04 pagination audit.
 */
export function finalizeRun(
  db: Database.Database,
  runId: number | bigint,
  stats: RunStats
): void {
  db.prepare(`
    UPDATE runs SET
      finished_at     = ?,
      total_available = ?,
      total_fetched   = ?,
      new_notices     = ?,
      filtered_out    = ?,
      stored          = ?,
      error           = ?
    WHERE id = ?
  `).run(
    stats.finishedAt,
    stats.totalAvailable,
    stats.totalFetched,
    stats.newNotices,
    stats.filteredOut,
    stats.stored,
    stats.error ?? null,
    Number(runId)
  );
}
