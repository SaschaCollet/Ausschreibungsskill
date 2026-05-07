import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openDb } from '../db/index.js';
import { markNoticeSeen } from '../db/queries.js';
import { fetchNewNotices } from './index.js';
import type Database from 'better-sqlite3';

// Mock tedFetch so tests make no real HTTP calls
vi.mock('./ted-client.js', () => ({
  tedFetch: vi.fn(),
}));

import { tedFetch } from './ted-client.js';
const mockTedFetch = vi.mocked(tedFetch);

function makeMockResponse(notices: object[], total: number) {
  return {
    notices,
    totalNoticeCount: total,
    iterationNextToken: null,
    timedOut: false,
  };
}

function makeNotice(nd: string, overrides: object = {}) {
  return {
    ND: nd,
    'notice-type': 'cn-standard',
    'deadline-receipt-tender-date-lot': [
      new Date(Date.now() + 30 * 86400 * 1000).toISOString(), // 30 days from now
    ],
    CY: ['DEU'],
    ...overrides,
  };
}

describe('fetchNewNotices', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
    mockTedFetch.mockReset();
  });

  afterEach(() => { db.close(); });

  it('fetches a single page when totalNoticeCount <= 100', async () => {
    mockTedFetch.mockResolvedValue(
      makeMockResponse([makeNotice('001-2026'), makeNotice('002-2026')], 2)
    );

    const result = await fetchNewNotices(db, false);

    expect(mockTedFetch).toHaveBeenCalledTimes(1);
    expect(result.notices).toHaveLength(2);
    expect(result.totalAvailable).toBe(2);
  });

  it('fetches two pages when totalNoticeCount=150 (pagination to exhaustion)', async () => {
    // Page 1: 100 notices, total=150
    const page1Notices = Array.from({ length: 100 }, (_, i) => makeNotice(`${i + 1}-2026`));
    // Page 2: 50 notices, total=150
    const page2Notices = Array.from({ length: 50 }, (_, i) => makeNotice(`${i + 101}-2026`));

    mockTedFetch
      .mockResolvedValueOnce(makeMockResponse(page1Notices, 150))
      .mockResolvedValueOnce(makeMockResponse(page2Notices, 150));

    const result = await fetchNewNotices(db, false);

    expect(mockTedFetch).toHaveBeenCalledTimes(2);
    expect(result.notices).toHaveLength(150);
    expect(result.totalAvailable).toBe(150);
  });

  it('skips already-seen notices (DEDUP-02)', async () => {
    markNoticeSeen(db, [{ nd: '001-2026', firstSeen: new Date().toISOString() }]);

    mockTedFetch.mockResolvedValue(
      makeMockResponse([makeNotice('001-2026'), makeNotice('002-2026')], 2)
    );

    const result = await fetchNewNotices(db, false);

    expect(result.notices).toHaveLength(1);
    expect(result.notices[0].ND).toBe('002-2026');
  });

  it('uses today(-14) in query for first run (D-06)', async () => {
    mockTedFetch.mockResolvedValue(makeMockResponse([], 0));

    await fetchNewNotices(db, true);

    const callBody = JSON.parse(JSON.stringify(mockTedFetch.mock.calls[0][0]));
    expect(callBody.query).toContain('today(-14)');
    expect(callBody.query).not.toContain('today(-2)');
  });

  it('uses today(-2) in query for daily run (D-07, FETCH-03)', async () => {
    mockTedFetch.mockResolvedValue(makeMockResponse([], 0));

    await fetchNewNotices(db, false);

    const callBody = JSON.parse(JSON.stringify(mockTedFetch.mock.calls[0][0]));
    expect(callBody.query).toContain('today(-2)');
    expect(callBody.query).toContain('today()');
  });

  it('includes CY=DEU in query (D-04 country filter)', async () => {
    mockTedFetch.mockResolvedValue(makeMockResponse([], 0));

    await fetchNewNotices(db, false);

    const callBody = JSON.parse(JSON.stringify(mockTedFetch.mock.calls[0][0]));
    expect(callBody.query).toContain('CY=DEU');
  });

  it('reports totalFetched correctly (FETCH-04)', async () => {
    const notices = Array.from({ length: 50 }, (_, i) => makeNotice(`${i}-2026`));
    mockTedFetch.mockResolvedValue(makeMockResponse(notices, 50));

    const result = await fetchNewNotices(db, false);

    expect(result.totalFetched).toBe(50);
    expect(result.totalAvailable).toBe(50);
  });
});
