import { getConfig } from './config.js';
import { openDb } from './db/index.js';
import {
  acquireJobLock, releaseJobLock,
  markNoticeSeen,
  createRun, finalizeRun,
  saveTriageResults, updateRunTriageStats,
} from './db/queries.js';
import { fetchNewNotices } from './fetcher/index.js';
import { applyHardFilters } from './filter/index.js';
import { sendDigestEmail } from './email/smtp.js';
import { triageNotices } from './triage/index.js';
import { buildDigest } from './email/digest.js';
import type { RawNotice } from './fetcher/types.js';
import type { NoticeRecord } from './db/queries.js';
import type { TriageOutput } from './triage/index.js';

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
 * Flow: SMTP auth → acquire lock → detect first run → fetch → filter →
 *       triage → store → email → finalize run → release lock → exit(0)
 *
 * Exit codes:
 *   0 — clean run (success or empty result)
 *   1 — job already locked (concurrent run blocked — Railway will retry next schedule)
 *   2 — unrecoverable error (SMTP auth failure, DB open failure, pipeline error)
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

    // Phase: Triage — score each surviving notice with Haiku (TRIAGE-01 through TRIAGE-04)
    let triageOutput: TriageOutput | null = null;
    if (toStore.length > 0) {
      console.log(`[runner] Triaging ${toStore.length} notices with Haiku...`);
      triageOutput = await triageNotices(toStore, config.anthropicApiKey, runId);
      const okCount = triageOutput.records.filter(r => r.triageOk).length;
      console.log(`[runner] Triage complete — ok=${okCount} failed=${toStore.length - okCount}`);

      // Persist triage results
      saveTriageResults(db, triageOutput.records);
    } else {
      console.log('[runner] No new notices to triage');
    }

    // Phase: Email digest (DIGEST-01 through DIGEST-04)
    const noticesAndTriage = triageOutput
      ? toStore.map((notice, i) => ({ notice, triage: triageOutput!.records[i] }))
      : [];

    const emptyStats = { totalInputTokens: 0, totalOutputTokens: 0, estimatedCostUsd: 0 };
    const digestStats = triageOutput?.stats ?? emptyStats;
    const digest = buildDigest(
      noticesAndTriage,
      digestStats,
      new Date().toISOString().slice(0, 10),
    );

    try {
      await sendDigestEmail(config.resendApiKey, digest);
      console.log(`[runner] Digest sent: "${digest.subject}"`);
    } catch (err) {
      console.error('[runner] WARNING: Email send failed (run data preserved):', err);
      // Non-fatal: triage results and run stats are already persisted
    }

    // Finalize run record with Phase 2 token stats
    finalizeRun(db, runId, {
      finishedAt: new Date().toISOString(),
      totalAvailable: fetchResult.totalAvailable,
      totalFetched: fetchResult.totalFetched,
      newNotices: fetchResult.notices.length,
      filteredOut: filterResult.dropped.length,
      stored: toStore.length,
    });

    if (triageOutput) {
      updateRunTriageStats(db, runId, {
        triagedCount: triageOutput.records.length,
        okCount: triageOutput.records.filter(r => r.triageOk).length,
        inputTokens: triageOutput.stats.totalInputTokens,
        outputTokens: triageOutput.stats.totalOutputTokens,
        costUsd: triageOutput.stats.estimatedCostUsd,
      });
    }

    console.log(
      `[runner] Run complete — ` +
      `available=${fetchResult.totalAvailable} ` +
      `fetched=${fetchResult.totalFetched} ` +
      `new=${fetchResult.notices.length} ` +
      `kept=${toStore.length} ` +
      `dropped=${filterResult.dropped.length} ` +
      `triaged=${triageOutput?.records.length ?? 0} ` +
      `cost=$${triageOutput?.stats.estimatedCostUsd.toFixed(4) ?? '0.0000'}`
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
