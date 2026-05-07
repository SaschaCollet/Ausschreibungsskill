import { describe, it, expect, afterEach } from 'vitest';
import { openDb } from './index.js';
import type Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('openDb', () => {
  let db: Database.Database;

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('opens an in-memory DB without throwing', () => {
    db = openDb(':memory:');
    expect(db).toBeDefined();
  });

  it('sets WAL journal mode on a file-based DB', () => {
    // WAL mode requires a file-based DB — SQLite silently uses 'memory' mode for :memory:.
    const tmpDir = mkdtempSync(join(tmpdir(), 'scanner-test-'));
    const tmpDb = join(tmpDir, 'test.db');
    let fileDb: Database.Database | undefined;
    try {
      fileDb = openDb(tmpDb);
      const row = fileDb.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(row.journal_mode).toBe('wal');
    } finally {
      fileDb?.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates seen_notices table', () => {
    db = openDb(':memory:');
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='seen_notices'"
    ).get();
    expect(row).toBeDefined();
  });

  it('creates runs table', () => {
    db = openDb(':memory:');
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='runs'"
    ).get();
    expect(row).toBeDefined();
  });

  it('creates job_lock table', () => {
    db = openDb(':memory:');
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='job_lock'"
    ).get();
    expect(row).toBeDefined();
  });

  it('is idempotent — calling openDb twice does not throw', () => {
    db = openDb(':memory:');
    db.close();
    db = openDb(':memory:');
    expect(db).toBeDefined();
  });
});
