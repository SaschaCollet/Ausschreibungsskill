import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NoticeRecord } from '../db/queries.js';

// --- Mock Anthropic SDK ---
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { triageNotices } from './index.js';

const makeNotice = (nd: string): NoticeRecord => ({
  nd,
  firstSeen: '2026-05-06T08:00:00Z',
  titleDeu: 'Datenvisualisierung für Bundesministerium',
  cpvCodes: JSON.stringify(['79822500']),
  deadline: '2026-06-01',
  budget: 50000,
});

function makeToolResponse(score: number, rationale: string, inputTokens: number, outputTokens: number) {
  return {
    content: [{ type: 'tool_use', id: 'tu_1', name: 'score_notice', input: { score, rationale } }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

describe('triageNotices', () => {
  beforeEach(() => { mockCreate.mockReset(); });

  it('TRIAGE-01: returns score and rationale for a successful call', async () => {
    mockCreate.mockResolvedValueOnce(makeToolResponse(8, 'Passt perfekt. Hohe Relevanz.', 700, 80));
    const result = await triageNotices([makeNotice('100-2026')], 'test-key', 1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].score).toBe(8);
    expect(result.records[0].rationale).toBe('Passt perfekt. Hohe Relevanz.');
    expect(result.records[0].triageOk).toBe(true);
  });

  it('TRIAGE-03: API error produces null result without throwing', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'));
    const result = await triageNotices([makeNotice('200-2026')], 'test-key', 1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].score).toBeNull();
    expect(result.records[0].triageOk).toBe(false);
  });

  it('TRIAGE-03: error on one notice does not stop processing of subsequent notices', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValueOnce(makeToolResponse(3, 'Wenig relevant. IT-Dienst.', 600, 70));
    const result = await triageNotices(
      [makeNotice('300-2026'), makeNotice('301-2026')], 'test-key', 1,
    );
    expect(result.records).toHaveLength(2);
    expect(result.records[0].triageOk).toBe(false);
    expect(result.records[1].triageOk).toBe(true);
    expect(result.records[1].score).toBe(3);
  });

  it('TRIAGE-04: accumulates token usage across multiple notices', async () => {
    mockCreate
      .mockResolvedValueOnce(makeToolResponse(7, 'Relevant. Webdesign.', 700, 80))
      .mockResolvedValueOnce(makeToolResponse(2, 'Kaum relevant. Bau.', 650, 75));
    const result = await triageNotices(
      [makeNotice('400-2026'), makeNotice('401-2026')], 'test-key', 1,
    );
    expect(result.stats.totalInputTokens).toBe(1350);
    expect(result.stats.totalOutputTokens).toBe(155);
    expect(result.stats.estimatedCostUsd).toBeCloseTo(
      (1350 / 1_000_000) * 1.00 + (155 / 1_000_000) * 5.00, 8,
    );
  });

  it('TRIAGE-02: prompt module exports rubric keywords', async () => {
    const { TRIAGE_SYSTEM_PROMPT } = await import('./prompt.js');
    expect(TRIAGE_SYSTEM_PROMPT).toContain('Datenvisualisierung');
    expect(TRIAGE_SYSTEM_PROMPT).toContain('SCORE 8-10');
    expect(TRIAGE_SYSTEM_PROMPT).toContain('SCORE 5-7');
    expect(TRIAGE_SYSTEM_PROMPT).toContain('SCORE 2-4');
    expect(TRIAGE_SYSTEM_PROMPT).toContain('SCORE 0-1');
    expect(TRIAGE_SYSTEM_PROMPT).toContain('Wissenschaftskommunikation');
  });
});
