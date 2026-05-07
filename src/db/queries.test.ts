import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb } from './index.js';
import {
  isNoticeNew, markNoticeSeen,
  acquireJobLock, releaseJobLock,
  createRun, finalizeRun,
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
