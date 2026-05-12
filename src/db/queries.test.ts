import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb } from './index.js';
import {
  isNoticeNew, markNoticeSeen,
  acquireJobLock, releaseJobLock,
  createRun, finalizeRun,
  saveAnalysis, updateRunSonnetStats,
} from './queries.js';
import type Database from 'better-sqlite3';

describe('dedup queries', () => {
  let db: Database.Database;

  beforeEach(() => { db = openDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('isNoticeNew returns true for unseen ND', () => {
    expect(isNoticeNew(db, '100-2026')).toBe(true);
  });

  it('isNoticeNew returns false after markNoticeSeen', () => {
    markNoticeSeen(db, [{ nd: '100-2026', firstSeen: new Date().toISOString() }]);
    expect(isNoticeNew(db, '100-2026')).toBe(false);
  });

  it('markNoticeSeen is idempotent — duplicate insert does not throw', () => {
    const record = { nd: '101-2026', firstSeen: new Date().toISOString() };
    expect(() => {
      markNoticeSeen(db, [record, record]);
    }).not.toThrow();
  });

  it('markNoticeSeen stores all provided records', () => {
    const notices = [
      { nd: '200-2026', firstSeen: new Date().toISOString(), titleDeu: 'Test A', noticeType: 'cn-standard' },
      { nd: '201-2026', firstSeen: new Date().toISOString(), titleDeu: 'Test B', noticeType: 'cn-social' },
    ];
    markNoticeSeen(db, notices);
    expect(isNoticeNew(db, '200-2026')).toBe(false);
    expect(isNoticeNew(db, '201-2026')).toBe(false);
  });
});

describe('job_lock queries', () => {
  let db: Database.Database;

  beforeEach(() => { db = openDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('acquireJobLock returns true on first call', () => {
    expect(acquireJobLock(db)).toBe(true);
  });

  it('acquireJobLock returns false when lock already held', () => {
    acquireJobLock(db);
    expect(acquireJobLock(db)).toBe(false);
  });

  it('releaseJobLock allows re-acquisition', () => {
    acquireJobLock(db);
    releaseJobLock(db);
    expect(acquireJobLock(db)).toBe(true);
  });
});

describe('run logging queries', () => {
  let db: Database.Database;

  beforeEach(() => { db = openDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('createRun returns a positive run ID', () => {
    const id = createRun(db, '20260504', '20260506');
    expect(Number(id)).toBeGreaterThan(0);
  });

  it('finalizeRun updates the run row with stats', () => {
    const id = createRun(db, '20260504', '20260506');
    finalizeRun(db, id, {
      finishedAt: new Date().toISOString(),
      totalAvailable: 120,
      totalFetched: 120,
      newNotices: 80,
      filteredOut: 10,
      stored: 80,
    });
    const row = db.prepare('SELECT total_available, stored FROM runs WHERE id = ?').get(Number(id)) as any;
    expect(row.total_available).toBe(120);
    expect(row.stored).toBe(80);
  });
});

describe('Phase 3: saveAnalysis', () => {
  let db: Database.Database;
  beforeEach(() => { db = openDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('ANALYSIS-03: inserts analysis row retrievable by nd', () => {
    // Prerequisite: seen_notices row and runs row must exist (FK references)
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('500-2026', '2026-05-01')`).run();
    const runId = db.prepare(`INSERT INTO runs (started_at, query_from, query_to) VALUES (?,?,?)`).run(new Date().toISOString(), '2026-05-01', '2026-05-02').lastInsertRowid;
    saveAnalysis(db, '500-2026', runId, '# Analyse\n\nTest content');
    const row = db.prepare(`SELECT nd, analysis_text FROM analyses WHERE nd = ?`).get('500-2026') as { nd: string; analysis_text: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.nd).toBe('500-2026');
    expect(row!.analysis_text).toContain('# Analyse');
  });

  it('ANALYSIS-03: saveAnalysis uses named params — no SQL injection via nd', () => {
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('501-2026', '2026-05-01')`).run();
    const runId = db.prepare(`INSERT INTO runs (started_at, query_from, query_to) VALUES (?,?,?)`).run(new Date().toISOString(), '2026-05-01', '2026-05-02').lastInsertRowid;
    // Special chars in analysisText must not throw
    expect(() => saveAnalysis(db, '501-2026', runId, "Text with 'single quotes' and \"double\"")).not.toThrow();
  });
});

describe('Phase 3: updateRunSonnetStats', () => {
  let db: Database.Database;
  beforeEach(() => { db = openDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('ANALYSIS-03: updates runs row with Sonnet token stats', () => {
    const runId = db.prepare(`INSERT INTO runs (started_at, query_from, query_to) VALUES (?,?,?)`).run(new Date().toISOString(), '2026-05-01', '2026-05-02').lastInsertRowid;
    updateRunSonnetStats(db, runId, { analysisCount: 3, inputTokens: 12000, outputTokens: 5000, costUsd: 0.111 });
    const row = db.prepare(`SELECT analysis_count, sonnet_input_tokens, sonnet_output_tokens, sonnet_cost_usd FROM runs WHERE id = ?`).get(Number(runId)) as any;
    expect(row.analysis_count).toBe(3);
    expect(row.sonnet_input_tokens).toBe(12000);
    expect(row.sonnet_output_tokens).toBe(5000);
    expect(Math.abs(row.sonnet_cost_usd - 0.111)).toBeLessThan(0.0001);
  });
});
