import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { TriageRecord, AnalysisRecord } from '../db/queries.js';
import { saveAnalysis, updateRunSonnetStats } from '../db/queries.js';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompt.js';
import { tedFetch } from '../fetcher/ted-client.js';

// ── Hard cap ───────────────────────────────────────────────────────────────
const ANALYSIS_CAP = 5;

// ── Zod schema for TED full-notice response (RESEARCH.md Pattern 1) ────────
// Separate standalone schema — do NOT modify the existing RawNoticeSchema (Pitfall 5)
const FullNoticeResponseSchema = z.object({
  notices: z.array(z.object({
    ND:                 z.string(),
    TI:                 z.record(z.string()).optional(),
    'description-lot':  z.record(z.array(z.string())).optional(),
    'description-proc': z.record(z.array(z.string())).optional(),
  })),
  totalNoticeCount:   z.number(),
  iterationNextToken: z.string().nullable(),
  timedOut:           z.boolean(),
});

// ── Output types ───────────────────────────────────────────────────────────

export interface AnalysisStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface AnalysisOutput {
  records: AnalysisRecord[];
  stats: AnalysisStats;
  skippedNds: string[]; // NDs beyond the hard cap — passed to buildDigest
}

// ── TED full description fetch ─────────────────────────────────────────────

async function fetchFullDescription(nd: string): Promise<{ descriptionLot: string; descriptionProc: string }> {
  const raw = await tedFetch({
    query: `ND=${nd}`,
    page: 1,
    limit: 1,
    fields: ['ND', 'TI', 'description-lot', 'description-proc'],
  });
  const data = FullNoticeResponseSchema.parse(raw);
  const notice = data.notices[0];
  const descriptionLot  = notice?.['description-lot']?.deu?.[0]  ?? '';
  const descriptionProc = notice?.['description-proc']?.deu?.[0] ?? '';
  if (!descriptionLot && !descriptionProc) {
    console.warn(`[analysis] nd=${nd}: no description text in TED response (description-lot and description-proc both empty)`);
  }
  return { descriptionLot, descriptionProc };
}

// ── Main entry ─────────────────────────────────────────────────────────────

/**
 * Run Sonnet analysis for up to ANALYSIS_CAP Tier-A notices.
 *
 * Input: TriageRecord[] — already filtered to score >= 7 by runner.ts.
 * The caller is responsible for filtering; analyzeNotices() enforces the cap
 * and sort internally to guarantee correct behavior regardless of input order.
 *
 * Sequential for-of loop (not Promise.allSettled) — Sonnet is expensive and
 * slow; parallelism at cap=5 does not justify the rate-limit risk.
 * Error isolation: one notice failure must not abort subsequent analyses (TRIAGE-03 pattern).
 *
 * apiKey is never logged — only model, tokens, nd appear in console output (T-02-02-B).
 */
export async function analyzeNotices(
  tierANotices: TriageRecord[],
  apiKey: string,
  runId: number | bigint,
  db: Database.Database,
): Promise<AnalysisOutput> {
  // D-09: sort desc by score, slice to cap, collect skipped NDs
  const sorted = [...tierANotices].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const toAnalyze = sorted.slice(0, ANALYSIS_CAP);
  const skippedNds = sorted.slice(ANALYSIS_CAP).map(r => r.nd);

  const client = new Anthropic({ apiKey });
  const records: AnalysisRecord[] = [];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;

  for (const notice of toAnalyze) {
    const { nd } = notice;
    try {
      // Fetch full description — standalone TED call (not using bulk fetch schema)
      const { descriptionLot, descriptionProc } = await fetchFullDescription(nd);

      const userPrompt = buildAnalysisPrompt(nd, nd, descriptionLot, descriptionProc);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        // NO tools — free-form Markdown output (anti-pattern: tool use adds unnecessary tokens)
      });

      totalInputTokens  += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlock = response.content.find(b => b.type === 'text');
      const analysisText = textBlock?.type === 'text' ? textBlock.text : null;

      if (analysisText) {
        saveAnalysis(db, nd, runId, analysisText);
        records.push({ runId, nd, analysisText, analysisOk: true });
        console.log(`[analysis] nd=${nd} ok — in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);
      } else {
        console.warn(`[analysis] nd=${nd}: Sonnet returned no text block`);
        records.push({ runId, nd, analysisText: null, analysisOk: false });
      }
    } catch (err) {
      // TRIAGE-03 error isolation: individual failure must not abort the job
      console.warn(`[analysis] nd=${nd} failed:`, String(err).slice(0, 120));
      records.push({ runId, nd, analysisText: null, analysisOk: false });
    }
  }

  // Sonnet pricing: $3/MTok input, $15/MTok output (verified 2026-05-11)
  const estimatedCostUsd =
    (totalInputTokens  / 1_000_000) * 3.00 +
    (totalOutputTokens / 1_000_000) * 15.00;

  console.log(
    `[analysis] tokens: in=${totalInputTokens} out=${totalOutputTokens} ` +
    `cost_est=$${estimatedCostUsd.toFixed(4)} analyses=${records.length} skipped=${skippedNds.length}`,
  );

  updateRunSonnetStats(db, runId, {
    analysisCount:  records.filter(r => r.analysisOk).length,
    inputTokens:    totalInputTokens,
    outputTokens:   totalOutputTokens,
    costUsd:        estimatedCostUsd,
  });

  return {
    records,
    stats: { totalInputTokens, totalOutputTokens, estimatedCostUsd },
    skippedNds,
  };
}
