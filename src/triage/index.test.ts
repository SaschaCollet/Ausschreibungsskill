import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NoticeRecord } from '../db/queries.js';

// --- Mock Anthropic SDK ---
const mockParse = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { parse: mockParse },
  })),
}));
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: vi.fn().mockReturnValue({ type: 'zod' }),
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

describe('triageNotices', () => {
  beforeEach(() => { mockParse.mockReset(); });

  it('TRIAGE-01: returns score and rationale for a successful call', async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { score: 8, rationale: 'Passt perfekt. Hohe Relevanz.' },
      usage: { input_tokens: 700, output_tokens: 80 },
    });
    const result = await triageNotices([makeNotice('100-2026')], 'test-key', 1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].score).toBe(8);
    expect(result.records[0].rationale).toBe('Passt perfekt. Hohe Relevanz.');
    expect(result.records[0].triageOk).toBe(true);
  });

  it('TRIAGE-03: API error produces null result without throwing', async () => {
    mockParse.mockRejectedValueOnce(new Error('Rate limit exceeded'));
    const result = await triageNotices([makeNotice('200-2026')], 'test-key', 1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].score).toBeNull();
    expect(result.records[0].triageOk).toBe(false);
  });

  it('TRIAGE-03: error on one notice does not stop processing of subsequent notices', async () => {
    mockParse
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValueOnce({
        parsed_output: { score: 3, rationale: 'Wenig relevant. IT-Dienst.' },
        usage: { input_tokens: 600, output_tokens: 70 },
      });
    const result = await triageNotices(
      [makeNotice('300-2026'), makeNotice('301-2026')], 'test-key', 1,
    );
    expect(result.records).toHaveLength(2);
    expect(result.records[0].triageOk).toBe(false);
    expect(result.records[1].triageOk).toBe(true);
    expect(result.records[1].score).toBe(3);
  });

  it('TRIAGE-04: accumulates token usage across multiple notices', async () => {
    mockParse
      .mockResolvedValueOnce({
        parsed_output: { score: 7, rationale: 'Relevant. Webdesign.' },
        usage: { input_tokens: 700, output_tokens: 80 },
      })
      .mockResolvedValueOnce({
        parsed_output: { score: 2, rationale: 'Kaum relevant. Bau.' },
        usage: { input_tokens: 650, output_tokens: 75 },
      });
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
