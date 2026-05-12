import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Anthropic SDK — same pattern as src/triage/index.test.ts
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Mock tedFetch for fetchFullDescription (called inside analyzeNotices)
vi.mock('../fetcher/ted-client.js', () => ({
  tedFetch: vi.fn().mockResolvedValue({
    notices: [{
      ND: 'MOCK-ND',
      TI: { deu: 'Testausschreibung' },
      'description-lot': { deu: ['Leistungsbeschreibung für Test'] },
      'description-proc': { deu: ['Verfahrensbeschreibung'] },
    }],
    totalNoticeCount: 1,
    iterationNextToken: null,
    timedOut: false,
  }),
}));

import { analyzeNotices } from './index.js';
import type { TriageRecord } from '../db/queries.js';
import { openDb } from '../db/index.js';
import type Database from 'better-sqlite3';

function makeTriageRecord(nd: string, score: number): TriageRecord {
  return { runId: 1, nd, score, rationale: 'test', triageOk: true };
}

describe('analyzeNotices', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '# Analyse\n\n## 01 Zusammenfassung\nTest\n\n## 02 Fit-Bewertung\nTest\n\n## 03 Checkliste\nTest' }],
      usage: { input_tokens: 4500, output_tokens: 1800 },
    });
    // Seed seen_notices + runs rows for FK references
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('100-2026','2026-01-01')`).run();
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('101-2026','2026-01-01')`).run();
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('102-2026','2026-01-01')`).run();
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('103-2026','2026-01-01')`).run();
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('104-2026','2026-01-01')`).run();
    db.prepare(`INSERT INTO seen_notices (nd, first_seen) VALUES ('105-2026','2026-01-01')`).run();
    db.prepare(`INSERT INTO runs (started_at, query_from, query_to) VALUES (?,?,?)`).run('2026-05-01T00:00:00Z', '2026-05-01', '2026-05-02');
  });

  afterEach(() => { db.close(); });

  it('ANALYSIS-01: calls client.messages.create once per notice passed in', async () => {
    const notices = [makeTriageRecord('100-2026', 9), makeTriageRecord('101-2026', 8)];
    await analyzeNotices(notices, 'test-api-key', 1, db);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('ANALYSIS-01: returns analysisOk=true when Sonnet returns text content', async () => {
    const notices = [makeTriageRecord('100-2026', 9)];
    const result = await analyzeNotices(notices, 'test-api-key', 1, db);
    expect(result.records[0].analysisOk).toBe(true);
    expect(result.records[0].analysisText).toContain('# Analyse');
  });

  it('ANALYSIS-02: hard cap — passes only top 5 notices when called with exactly 5', async () => {
    const notices = [
      makeTriageRecord('100-2026', 9),
      makeTriageRecord('101-2026', 8),
      makeTriageRecord('102-2026', 8),
      makeTriageRecord('103-2026', 7),
      makeTriageRecord('104-2026', 7),
    ];
    const result = await analyzeNotices(notices, 'test-api-key', 1, db);
    expect(mockCreate).toHaveBeenCalledTimes(5);
    expect(result.records).toHaveLength(5);
    expect(result.skippedNds).toHaveLength(0);
  });

  it('ANALYSIS-02: skippedNds contains NDs beyond the cap when > 5 notices passed', async () => {
    const notices = [
      makeTriageRecord('100-2026', 10),
      makeTriageRecord('101-2026', 9),
      makeTriageRecord('102-2026', 8),
      makeTriageRecord('103-2026', 8),
      makeTriageRecord('104-2026', 7),
      makeTriageRecord('105-2026', 7), // 6th — must be skipped
    ];
    const result = await analyzeNotices(notices, 'test-api-key', 1, db);
    expect(mockCreate).toHaveBeenCalledTimes(5);
    expect(result.skippedNds).toHaveLength(1);
    expect(result.skippedNds).toContain('105-2026');
  });

  it('ANALYSIS-02: analyzes highest-scoring first when > 5 notices', async () => {
    const notices = [
      makeTriageRecord('100-2026', 7),  // low
      makeTriageRecord('101-2026', 10), // high — must be analyzed
      makeTriageRecord('102-2026', 7),
      makeTriageRecord('103-2026', 8),
      makeTriageRecord('104-2026', 7),
      makeTriageRecord('105-2026', 7),  // low — skipped
    ];
    const result = await analyzeNotices(notices, 'test-api-key', 1, db);
    const analyzedNds = result.records.filter(r => r.analysisOk).map(r => r.nd);
    expect(analyzedNds).toContain('101-2026'); // score=10 must be in
    expect(result.skippedNds.length).toBeGreaterThanOrEqual(1);
  });

  it('ANALYSIS-01: error isolation — single notice failure does not abort loop', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue({
        content: [{ type: 'text', text: '# OK' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });
    const notices = [makeTriageRecord('100-2026', 9), makeTriageRecord('101-2026', 8)];
    const result = await analyzeNotices(notices, 'test-api-key', 1, db);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].analysisOk).toBe(false);
    expect(result.records[1].analysisOk).toBe(true);
  });
});
