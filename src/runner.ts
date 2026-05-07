import { getConfig } from './config.js';
import { openDb } from './db/index.js';
import {
  acquireJobLock, releaseJobLock,
  markNoticeSeen,
  createRun, finalizeRun,
} from './db/queries.js';
import { fetchNewNotices } from './fetcher/index.js';
import { applyHardFilters } from './filter/index.js';
import type { RawNotice } from './fetcher/types.js';
import type { NoticeRecord } from './db/queries.js';

/**
 * Detect first run by checking if seen_notices is empty.
 * D-06: first run uses 14-day lookback.
 */
function detectFirstRun(db: ReturnType<typeof openDb>): boolean {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM seen_notices').get() as { cnt: number };
  return row.cnt === 0;
}

/**
 * Convert a RawNotice to a NoticeRecord for DB storage.
 * Extracts German title (TI.deu), CPV code array, first deadline, budget.
 */
function toNoticeRecord(notice: RawNotice): NoticeRecord {
  const titleDeu =
    notice.TI?.deu ??
    (notice['title-lot'] as Record<string, string[]> | undefined)?.deu?.[0] ??
    undefined;

  const cpvCodes = notice.PC ? JSON.stringify(notice.PC) : undefined;
  const deadline = notice['deadline-receipt-tender-date-lot']?.[0];
  const budgetStr = notice['BT-27-Lot']?.[0];
  const budget = budgetStr ? parseFloat(budgetStr) : null;

  return {
    nd: notice.ND,
    firstSeen: new Date().toISOString(),
    titleDeu,
    cpvCodes,
    deadline,
    budget: isNaN(budget as number) ? null : budget,
    noticeType: notice['notice-type'],
  };
}

/**
 * Main pipeline entry point.
 *
 * Flow: acquire lock → detect first run → fetch → filter → store → finalize run → release lock → exit(0)
 *
 * Exit codes:
 *   0 — clean run (success or empty result)
 *   1 — job already locked (concurrent run blocked — Railway will retry next schedule)
 *   2 — unrecoverable error (DB open failure, pipeline error)
 *
 * CRITICAL: db.close() MUST be called before process.exit() to checkpoint WAL data.
 */
async function main(): Promise<void> {
  const config = getConfig();

  console.log(`[runner] Starting — DB: ${config.dbPath}`);
  console.log(`[runner] PID: ${process.pid}, UTC: ${new Date().toISOString()}`);

  // Open DB — will throw SQLITE_CANTOPEN if /data Volume not mounted
  let db: ReturnType<typeof openDb>;
  try {
    db = openDb(config.dbPath);
  } catch (err) {
    console.error('[runner] FATAL: Cannot open DB:', err);
    console.error('[runner] If path is /data/scanner.db — is Railway Volume mounted at /data?');
    process.exit(2);
  }

  // Acquire job lock — prevents concurrent Railway cron executions (DEDUP-03)
  const locked = acquireJobLock(db);
  if (!locked) {
    console.log('[runner] Another job is already running. Exiting without processing.');
    db.close();
    process.exit(1);
  }

  const isFirstRun = detectFirstRun(db);
  console.log(`[runner] First run: ${isFirstRun}`);

  let runId: number | bigint = 0;
  let exitCode = 0;

  try {
    // Phase: Fetch
    const fetchResult = await fetchNewNotices(db, isFirstRun);

    runId = createRun(db, fetchResult.queryFrom, fetchResult.queryTo);

    // Phase: Filter
    const filterResult = applyHardFilters(fetchResult.notices);

    console.log(
      `[runner] After filters: kept=${filterResult.kept.length}, dropped=${filterResult.dropped.length}`
    );

    // Log drop reasons (condensed)
    const dropSummary: Record<string, number> = {};
    for (const { reason } of filterResult.dropped) {
      const key = reason.split(':')[0].trim();
      dropSummary[key] = (dropSummary[key] ?? 0) + 1;
    }
    if (Object.keys(dropSummary).length > 0) {
      console.log('[runner] Drop reasons:', JSON.stringify(dropSummary));
    }

    // Phase: Store — batch insert new notices into seen_notices
    const toStore = filterResult.kept.map(toNoticeRecord);
    if (toStore.length > 0) {
      markNoticeSeen(db, toStore);
      console.log(`[runner] Stored ${toStore.length} new notices in seen_notices`);
    }

    // Finalize run record (FETCH-04: log totalAvailable vs totalFetched)
    finalizeRun(db, runId, {
      finishedAt: new Date().toISOString(),
      totalAvailable: fetchResult.totalAvailable,
      totalFetched: fetchResult.totalFetched,
      newNotices: fetchResult.notices.length,
      filteredOut: filterResult.dropped.length,
      stored: toStore.length,
    });

    console.log(
      `[runner] Run complete — ` +
      `available=${fetchResult.totalAvailable} ` +
      `fetched=${fetchResult.totalFetched} ` +
      `new=${fetchResult.notices.length} ` +
      `kept=${toStore.length} ` +
      `dropped=${filterResult.dropped.length}`
    );

  } catch (err) {
    console.error('[runner] Pipeline error:', err);

    // Attempt to record error in runs table
    if (runId) {
      try {
        finalizeRun(db, runId, {
          finishedAt: new Date().toISOString(),
          totalAvailable: 0,
          totalFetched: 0,
          newNotices: 0,
          filteredOut: 0,
          stored: 0,
          error: String(err),
        });
      } catch { /* ignore secondary failure */ }
    }

    exitCode = 2;
  } finally {
    // Release job lock so next Railway cron can run
    try { releaseJobLock(db); } catch { /* ignore */ }

    // CRITICAL: close DB before exit to checkpoint WAL (anti-pattern: not closing before exit)
    try { db.close(); } catch { /* ignore */ }
  }

  console.log(`[runner] Exiting with code ${exitCode}`);
  process.exit(exitCode);
}

main();
