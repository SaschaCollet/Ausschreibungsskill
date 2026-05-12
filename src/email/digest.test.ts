import { describe, it, expect } from 'vitest';
import { buildDigest } from './digest.js';
import type { NoticeRecord, TriageRecord } from '../db/queries.js';
import type { TriageStats } from '../triage/index.js';

const makeNotice = (nd: string, title: string, budget?: number): NoticeRecord => ({
  nd,
  firstSeen: '2026-05-06T08:00:00Z',
  titleDeu: title,
  deadline: '2026-06-01+02:00',
  budget: budget ?? null,
});

const makeTriage = (nd: string, score: number | null): TriageRecord => ({
  runId: 1,
  nd,
  score,
  rationale: score != null ? `Satz eins Begründung ${nd}. Satz zwei.` : null,
  triageOk: score != null,
});

const zeroStats: TriageStats = {
  totalInputTokens: 1000,
  totalOutputTokens: 100,
  estimatedCostUsd: 0.0015,
};

const makeInput = (nd: string, score: number | null, title?: string, budget?: number) => ({
  notice: makeNotice(nd, title ?? `Notice ${nd}`, budget),
  triage: makeTriage(nd, score),
});

describe('buildDigest', () => {
  it('DIGEST-02: score>=7 appears in Tier A section', () => {
    const input = [makeInput('100-2026', 8, 'Dataviz Bundesministerium', 50000)];
    const result = buildDigest(input, zeroStats, '2026-05-06');

    expect(result.html).toContain('TIER A');
    expect(result.html).toContain('Dataviz Bundesministerium');
    expect(result.html).not.toContain('TIER B');
    expect(result.subject).toContain('1A + 0B');
  });

  it('DIGEST-02: score 4-6 appears in Tier B section', () => {
    const input = [makeInput('200-2026', 5, 'Webdesign Landesbehörde')];
    const result = buildDigest(input, zeroStats, '2026-05-06');

    expect(result.html).toContain('TIER B');
    expect(result.html).toContain('Webdesign Landesbehörde');
    expect(result.html).not.toContain('TIER A');
    expect(result.subject).toContain('0A + 1B');
  });

  it('DIGEST-02: score<4 is excluded from the digest', () => {
    const input = [makeInput('300-2026', 2, 'Catering Bundesamt')];
    const result = buildDigest(input, zeroStats, '2026-05-06');

    // Zero qualifying notices → confirmation email
    expect(result.html).not.toContain('Catering Bundesamt');
    expect(result.html).toContain('Kein Treffer');
  });

  it('DIGEST-02: null score (failed triage) is excluded', () => {
    const input = [makeInput('400-2026', null, 'Unknown')];
    const result = buildDigest(input, zeroStats, '2026-05-06');
    expect(result.html).toContain('Kein Treffer');
  });

  it('DIGEST-03: notice card contains all 6 required fields', () => {
    const input = [makeInput('500-2026', 9, 'Infografik Forschungsinstitut', 80000)];
    const result = buildDigest(input, zeroStats, '2026-05-06');

    // Title
    expect(result.html).toContain('Infografik Forschungsinstitut');
    // Score
    expect(result.html).toContain('Score 9/10');
    // Rationale
    expect(result.html).toContain('Satz eins Begründung 500-2026. Satz zwei.');
    // Budget
    expect(result.html).toContain('80.000');   // de-DE locale formatting
    // Deadline (date part only)
    expect(result.html).toContain('2026-06-01');
    // TED link
    expect(result.html).toContain('https://ted.europa.eu/en/notice/-/detail/500-2026');
  });

  it('DIGEST-04: zero qualifying notices returns Kein Treffer email', () => {
    const input = [makeInput('600-2026', 1)];
    const result = buildDigest(input, zeroStats, '2026-05-06');

    expect(result.subject).toContain('Kein Treffer');
    expect(result.subject).toContain('2026-05-06');
    expect(result.html).toContain('Score &ge; 4');
    expect(result.html).toContain('0.0015');  // cost in confirmation
    expect(result.text).toContain('Score >= 4');
  });

  it('DIGEST-04: empty input (no notices at all) also returns Kein Treffer', () => {
    const result = buildDigest([], zeroStats, '2026-05-06');
    expect(result.subject).toContain('Kein Treffer');
  });

  it('No <style> block in HTML output', () => {
    const input = [makeInput('700-2026', 8, 'Dataviz Test')];
    const result = buildDigest(input, zeroStats, '2026-05-06');
    expect(result.html).not.toContain('<style');
  });

  it('Both html and text fields are non-empty strings', () => {
    const input = [makeInput('800-2026', 7, 'UX Design')];
    const result = buildDigest(input, zeroStats, '2026-05-06');
    expect(typeof result.html).toBe('string');
    expect(result.html.length).toBeGreaterThan(100);
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(10);
  });
});

function makeNoticeWithTriage(nd: string, score: number): { notice: NoticeRecord; triage: TriageRecord } {
  return {
    notice: { nd, firstSeen: '2026-05-01', titleDeu: `Ausschreibung ${nd}`, cpvCodes: '["79100000"]', deadline: '2026-07-01', budget: 50000 },
    triage: { runId: 1, nd, score, rationale: 'Test Begründung für diesen Score.', triageOk: true },
  };
}

const emptyStats: TriageStats = { totalInputTokens: 0, totalOutputTokens: 0, estimatedCostUsd: 0 };

describe('buildDigest — Phase 3 analysis badge', () => {
  it('ANALYSIS-03: Tier-A card contains "Vollanalyse angehangen" badge when hasAnalysis=true', () => {
    const noticesAndTriage = [makeNoticeWithTriage('500-2026', 9)];
    const analysisMap = new Map([['500-2026', true]]);
    const digest = buildDigest(noticesAndTriage, emptyStats, '2026-05-11', analysisMap, []);
    expect(digest.html).toContain('Vollanalyse angehangen');
  });

  it('ANALYSIS-03: Tier-A card shows Tageslimit note when analysisSkipped=true', () => {
    const noticesAndTriage = [makeNoticeWithTriage('501-2026', 8)];
    const analysisMap = new Map<string, boolean>();
    const skippedNds = ['501-2026'];
    const digest = buildDigest(noticesAndTriage, emptyStats, '2026-05-11', analysisMap, skippedNds);
    expect(digest.html).toContain('Tageslimit');
  });

  it('ANALYSIS-03: Tier-A card shows no badge when hasAnalysis=false and not skipped', () => {
    const noticesAndTriage = [makeNoticeWithTriage('502-2026', 7)];
    const analysisMap = new Map<string, boolean>();
    const digest = buildDigest(noticesAndTriage, emptyStats, '2026-05-11', analysisMap, []);
    expect(digest.html).not.toContain('Vollanalyse angehangen');
    expect(digest.html).not.toContain('Tageslimit');
  });
});
