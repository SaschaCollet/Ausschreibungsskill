import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { NoticeRecord, TriageRecord } from '../db/queries.js';
import { TRIAGE_SYSTEM_PROMPT, buildNoticePrompt } from './prompt.js';

const TriageResultSchema = z.object({
  score: z.number().int().min(0).max(10),
  rationale: z.string().max(400),
});

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
      const response = await client.messages.parse({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildNoticePrompt(notice) }],
        output_config: { format: zodOutputFormat(TriageResultSchema) },
      });

      totalInputTokens  += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const parsed = response.parsed_output;
      records.push({
        runId,
        nd: notice.nd,
        score: parsed?.score ?? null,
        rationale: parsed?.rationale ?? null,
        triageOk: parsed != null,
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
