import Anthropic from '@anthropic-ai/sdk';
import type { NoticeRecord, TriageRecord } from '../db/queries.js';
import { TRIAGE_SYSTEM_PROMPT, buildNoticePrompt } from './prompt.js';

const SCORE_TOOL: Anthropic.Tool = {
  name: 'score_notice',
  description: 'Score a tender notice for design-agency relevance',
  input_schema: {
    type: 'object',
    properties: {
      score:     { type: 'integer', minimum: 0, maximum: 10 },
      rationale: { type: 'string' },
    },
    required: ['score', 'rationale'],
  },
};

interface ScoreInput { score: number; rationale: string }

export interface TriageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface TriageOutput {
  records: TriageRecord[];
  stats: TriageStats;
}

export async function triageNotices(
  notices: NoticeRecord[],
  apiKey: string,
  runId: number | bigint,
): Promise<TriageOutput> {
  const client = new Anthropic({ apiKey });
  const records: TriageRecord[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const notice of notices) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildNoticePrompt(notice) }],
        tools: [SCORE_TOOL],
        tool_choice: { type: 'tool', name: 'score_notice' },
      });

      totalInputTokens  += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const toolBlock = response.content.find(b => b.type === 'tool_use');
      const raw = toolBlock ? toolBlock.input as ScoreInput : null;

      records.push({
        runId,
        nd: notice.nd,
        score: raw?.score ?? null,
        rationale: raw?.rationale ?? null,
        triageOk: raw != null,
      });
    } catch (err) {
      // TRIAGE-03: individual failure must not abort the job
      console.warn(`[triage] Notice ${notice.nd} failed:`, String(err).slice(0, 120));
      records.push({
        runId,
        nd: notice.nd,
        score: null,
        rationale: null,
        triageOk: false,
      });
    }
  }

  // Haiku 4.5 pricing: $1.00/MTok input, $5.00/MTok output
  const estimatedCostUsd =
    (totalInputTokens  / 1_000_000) * 1.00 +
    (totalOutputTokens / 1_000_000) * 5.00;

  console.log(
    `[triage] tokens: in=${totalInputTokens} out=${totalOutputTokens} ` +
    `cost_est=$${estimatedCostUsd.toFixed(4)}`
  );

  return {
    records,
    stats: { totalInputTokens, totalOutputTokens, estimatedCostUsd },
  };
}
