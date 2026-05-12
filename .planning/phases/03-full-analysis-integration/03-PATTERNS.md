# Phase 3: Full Analysis Integration - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/analysis/index.ts` | service | request-response (LLM + HTTP) | `src/triage/index.ts` | exact |
| `src/analysis/prompt.ts` | utility | transform | `src/triage/prompt.ts` | exact |
| `src/analysis/config/figures-config.md` | config | — | none (static content file) | no analog |
| `src/analysis/config/portfolio.md` | config | — | none (static content file) | no analog |
| `src/db/queries.ts` | model | CRUD | `src/db/queries.ts` (extend) | exact (self) |
| `src/db/index.ts` | config | CRUD | `src/db/index.ts` (extend) | exact (self) |
| `src/email/smtp.ts` | service | request-response | `src/email/smtp.ts` (extend) | exact (self) |
| `src/email/digest.ts` | utility | transform | `src/email/digest.ts` (extend) | exact (self) |
| `src/runner.ts` | controller | request-response | `src/runner.ts` (extend) | exact (self) |

---

## Pattern Assignments

### `src/analysis/index.ts` (service, request-response)

**Analog:** `src/triage/index.ts`

**Imports pattern** (lines 1–3):
```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { NoticeRecord, TriageRecord } from '../db/queries.js';
import { TRIAGE_SYSTEM_PROMPT, buildNoticePrompt } from './prompt.js';
```
Copy this shape exactly: SDK default import, types from db/queries, prompt constants from sibling prompt.ts. Replace `TriageRecord` with `AnalysisRecord`, prompt imports with `ANALYSIS_SYSTEM_PROMPT` and `buildAnalysisPrompt`.

**Output interface pattern** (lines 20–29):
```typescript
export interface TriageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface TriageOutput {
  records: TriageRecord[];
  stats: TriageStats;
}
```
Mirror as `AnalysisStats` and `AnalysisOutput`. Add `skippedNds: string[]` to `AnalysisOutput` for the hard-cap skip list passed to `buildDigest`.

**Core function signature pattern** (lines 31–35):
```typescript
export async function triageNotices(
  notices: NoticeRecord[],
  apiKey: string,
  runId: number | bigint,
): Promise<TriageOutput> {
```
Mirror as `analyzeNotices(notices: TriageRecord[], apiKey: string, runId: number | bigint): Promise<AnalysisOutput>`. Note: analysis receives `TriageRecord[]` (already scored) not raw `NoticeRecord[]`.

**Sequential loop pattern** (lines 43–73) — CRITICAL: analysis uses sequential `for-of`, NOT the parallel `Promise.allSettled` batch that triage uses:
```typescript
// triage uses batch parallel (lines 44-57):
const BATCH_SIZE = 5;
for (let i = 0; i < notices.length; i += BATCH_SIZE) {
  const batch = notices.slice(i, i + BATCH_SIZE);
  const results = await Promise.allSettled(batch.map(notice => client.messages.create(...)));
  // ...
}

// Analysis MUST use sequential for-of instead:
for (const notice of notices) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildAnalysisPrompt(nd, title, descLot, descProc) }],
      // NO tools — free-form Markdown output
    });
    // Extract text: response.content[0].type === 'text' → response.content[0].text
    totalInputTokens  += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    records.push({ nd, runId, analysisText: response.content[0].text, analysisOk: true });
  } catch (err) {
    // TRIAGE-03 pattern: isolate failures, continue loop
    console.warn(`[analysis] Notice ${nd} failed:`, String(err).slice(0, 120));
    records.push({ nd, runId, analysisText: null, analysisOk: false });
  }
}
```

**Token cost log pattern** (lines 76–84):
```typescript
// Haiku 4.5 pricing: $1.00/MTok input, $5.00/MTok output
const estimatedCostUsd =
  (totalInputTokens  / 1_000_000) * 1.00 +
  (totalOutputTokens / 1_000_000) * 5.00;

console.log(
  `[triage] tokens: in=${totalInputTokens} out=${totalOutputTokens} ` +
  `cost_est=$${estimatedCostUsd.toFixed(4)}`
);
```
Mirror with `[analysis]` prefix and Sonnet pricing: `$3.00/MTok input, $15.00/MTok output`.

---

### `src/analysis/prompt.ts` (utility, transform)

**Analog:** `src/triage/prompt.ts`

**System prompt constant pattern** (lines 1–43):
```typescript
export const TRIAGE_SYSTEM_PROMPT = `Du bist ein Ausschreibungs-Analyst für Figures...
...
Antworte immer mit dem exakt vorgegebenen JSON-Schema.
Schreibe die Begründung in 2 prägnanten Sätzen auf Deutsch.`;
```
Mirror as `export const ANALYSIS_SYSTEM_PROMPT = \`...\`` with figures-config and portfolio embedded via `readFileSync` at module load. Key differences: (1) use `readFileSync` to embed static files, (2) instruct Sonnet to return Markdown (not JSON), (3) include the three-section structure from SKILL.md.

**`readFileSync` at module load pattern** (from RESEARCH.md Pattern 5):
```typescript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIGURES_CONFIG = readFileSync(join(__dirname, 'config/figures-config.md'), 'utf-8');
const PORTFOLIO      = readFileSync(join(__dirname, 'config/portfolio.md'), 'utf-8');

export const ANALYSIS_SYSTEM_PROMPT = `
Du analysierst eine EU-Ausschreibung für Figures eGbR...

## Figures-Profil
${FIGURES_CONFIG}

## Portfolio-Referenzen
${PORTFOLIO}

Erstelle drei Markdown-Sektionen: [01 Zusammenfassung, 02 Fit-Bewertung, 03 Checkliste]
`.trim();
```
Sync reads only — never defer to async at call time.

**User prompt builder pattern** (lines 47–63):
```typescript
export function buildNoticePrompt(notice: NoticeRecord): string {
  const title = notice.titleDeu ?? '(kein Titel)';
  const cpv   = notice.cpvCodes
    ? (JSON.parse(notice.cpvCodes) as string[]).join(', ')
    : '(keine CPV)';
  // ...
  return [
    `Titel: ${title}`,
    `CPV-Codes: ${cpv}`,
    ...
  ].join('\n');
}
```
Mirror as `buildAnalysisPrompt(nd, title, descriptionLot, descriptionProc)`. Use array `.join('\n')` for multi-line prompt assembly. Include `## Ausschreibung: ${nd}` header, `**Titel:** ${title}`, then two description sections with `'(nicht verfügbar)'` fallback.

---

### `src/analysis/config/figures-config.md` and `src/analysis/config/portfolio.md` (config, static)

**No analog in codebase.** These are static Markdown files copied from `ausschreibung-workspace/skill-snapshot-iter1/`. Read the skill-snapshot files to copy; do not modify content. They are consumed only via `readFileSync` in `src/analysis/prompt.ts` at module load.

---

### `src/db/queries.ts` — extend (model, CRUD)

**Analog:** existing `saveTriageResults()` and `updateRunTriageStats()` in same file.

**Named-parameter INSERT pattern** (lines 164–183):
```typescript
export function saveTriageResults(db: Database.Database, records: TriageRecord[]): void {
  if (records.length === 0) return;
  const insert = db.prepare(`
    INSERT INTO triage_results (run_id, nd, score, rationale, triage_ok, created_at)
    VALUES (@runId, @nd, @score, @rationale, @triageOk, @createdAt)
  `);
  const insertMany = db.transaction((recs: TriageRecord[]) => {
    for (const r of recs) {
      insert.run({
        runId: Number(r.runId),
        nd:    r.nd,
        score: r.score ?? null,
        // ...
        createdAt: new Date().toISOString(),
      });
    }
  });
  insertMany(records);
}
```
Copy this pattern for `saveAnalysis()`. Use named `@nd`, `@runId`, `@analysisText`, `@createdAt`. Wrap in transaction. `Number(runId)` cast is required (bigint safety).

**UPDATE runs stats pattern** (lines 189–216):
```typescript
export function updateRunTriageStats(
  db: Database.Database,
  runId: number | bigint,
  stats: { triagedCount: number; okCount: number; inputTokens: number; outputTokens: number; costUsd: number; }
): void {
  db.prepare(`
    UPDATE runs SET
      triage_count        = ?,
      triage_ok_count     = ?,
      haiku_input_tokens  = ?,
      haiku_output_tokens = ?,
      haiku_cost_usd      = ?
    WHERE id = ?
  `).run(
    stats.triagedCount, stats.okCount, stats.inputTokens, stats.outputTokens, stats.costUsd,
    Number(runId)
  );
}
```
Copy for `updateRunSonnetStats()`. Replace positional `?` placeholders with Sonnet-specific column names: `analysis_count`, `sonnet_input_tokens`, `sonnet_output_tokens`, `sonnet_cost_usd`. The `WHERE id = ?` + `Number(runId)` tail is identical.

**Interface pattern** (lines 151–157):
```typescript
export interface TriageRecord {
  runId: number | bigint;
  nd: string;
  score: number | null;
  rationale: string | null;
  triageOk: boolean;
}
```
Mirror as `AnalysisRecord` with fields: `runId: number | bigint`, `nd: string`, `analysisText: string | null`, `analysisOk: boolean`.

---

### `src/db/index.ts` — extend (config, CRUD)

**Analog:** existing Phase 2 migration block in same file.

**CREATE TABLE IF NOT EXISTS pattern** (lines 22–65):
```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS triage_results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES runs(id),
    nd          TEXT    NOT NULL REFERENCES seen_notices(nd),
    score       INTEGER,
    rationale   TEXT,
    triage_ok   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_triage_results_nd    ON triage_results(nd);
  CREATE INDEX IF NOT EXISTS idx_triage_results_run   ON triage_results(run_id);
  CREATE INDEX IF NOT EXISTS idx_triage_results_score ON triage_results(score);
`);
```
Copy pattern for `analyses` table inside the same `db.exec()` block. Add two indexes (`idx_analyses_nd`, `idx_analyses_run`).

**Idempotent ALTER TABLE migration pattern** (lines 69–78):
```typescript
const phase2Cols = [
  'ALTER TABLE runs ADD COLUMN triage_count INTEGER',
  'ALTER TABLE runs ADD COLUMN triage_ok_count INTEGER',
  'ALTER TABLE runs ADD COLUMN haiku_input_tokens INTEGER',
  'ALTER TABLE runs ADD COLUMN haiku_output_tokens INTEGER',
  'ALTER TABLE runs ADD COLUMN haiku_cost_usd REAL',
];
for (const stmt of phase2Cols) {
  try { db.exec(stmt); } catch { /* column already exists */ }
}
```
Copy verbatim as `phase3Cols` array with four new column statements: `analysis_count INTEGER`, `sonnet_input_tokens INTEGER`, `sonnet_output_tokens INTEGER`, `sonnet_cost_usd REAL`. Append immediately after the `phase2Cols` block.

---

### `src/email/smtp.ts` — extend (service, request-response)

**Analog:** existing `sendDigestEmail()` in same file.

**Current function signature** (lines 9–12):
```typescript
export async function sendDigestEmail(
  apiKey: string,
  payload: DigestEmailPayload,
): Promise<void> {
```

**Current Resend call** (lines 13–20):
```typescript
const resend = new Resend(apiKey);
const { error } = await resend.emails.send({
  from: 'Ausschreibungs-Scanner <onboarding@resend.dev>',
  to: 'sascha.collet@gmail.com',
  subject: payload.subject,
  html: payload.html,
  text: payload.text,
});
if (error) throw new Error(`Resend error: ${error.message}`);
```

**Extension pattern:** Add optional `attachments` parameter. The `attachments` field is appended to the `resend.emails.send()` call only when the array is non-empty. Follow the existing `if (error) throw` error handling unchanged:
```typescript
export interface AnalysisAttachment {
  filename: string;
  content: Buffer;
  content_type: string;
}

export async function sendDigestEmail(
  apiKey: string,
  payload: DigestEmailPayload,
  attachments?: AnalysisAttachment[],
): Promise<void> {
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: 'Ausschreibungs-Scanner <onboarding@resend.dev>',
    to: 'sascha.collet@gmail.com',
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
```

---

### `src/email/digest.ts` — extend (utility, transform)

**Analog:** existing `renderNoticeCard()` and `buildDigest()` in same file.

**`renderNoticeCard()` current signature** (line 26):
```typescript
function renderNoticeCard(n: NoticeWithTriage, tierColor: string): string {
```

**Extension:** Add two boolean flags as third and fourth parameters:
```typescript
function renderNoticeCard(
  n: NoticeWithTriage,
  tierColor: string,
  hasAnalysis: boolean,
  analysisSkipped: boolean,
): string {
```
After the existing `TED-Ausschreibung ansehen` `<a>` tag (lines 57–60), append the badge paragraph:
```typescript
const badge = hasAnalysis
  ? `<p style="margin:4px 0 0;font-size:12px;">&#128206; Vollanalyse angehangen</p>`
  : analysisSkipped
  ? `<p style="margin:4px 0 0;font-size:12px;color:#888;">Analyse aufgrund des Tageslimits nicht erstellt</p>`
  : '';
// Insert ${badge} before closing </td>
```

**`buildDigest()` current signature** (lines 91–95):
```typescript
export function buildDigest(
  noticesAndTriage: Array<{ notice: NoticeRecord; triage: TriageRecord }>,
  stats: TriageStats,
  dateStr?: string,
): DigestEmailPayload {
```
**Extension:** Add `analysisMap?: Map<string, boolean>` (nd → hasAnalysis) and `skippedNds?: string[]` parameters. Pass `hasAnalysis` and `analysisSkipped` flags through `renderTierSection` → `renderNoticeCard`. The tier-A section map call (line 74) needs to pass the flags:
```typescript
// current (line 74):
const cards = notices.map(n => renderNoticeCard(n, color)).join('');

// extended:
const cards = notices.map(n => renderNoticeCard(
  n,
  color,
  analysisMap?.get(n.notice.nd) ?? false,
  skippedNds?.includes(n.notice.nd) ?? false,
)).join('');
```
`renderTierSection` also needs the two new optional parameters threaded through.

---

### `src/runner.ts` — extend (controller, request-response)

**Analog:** existing triage integration block in same file.

**Current import block** (lines 1–16):
```typescript
import { getConfig } from './config.js';
import { openDb } from './db/index.js';
import {
  acquireJobLock, releaseJobLock,
  markNoticeSeen,
  createRun, finalizeRun,
  saveTriageResults, updateRunTriageStats,
} from './db/queries.js';
import { fetchNewNotices } from './fetcher/index.js';
import { applyHardFilters } from './filter/index.js';
import { sendDigestEmail } from './email/smtp.js';
import { triageNotices } from './triage/index.js';
import { buildDigest } from './email/digest.js';
import type { RawNotice } from './fetcher/types.js';
import type { NoticeRecord } from './db/queries.js';
import type { TriageOutput } from './triage/index.js';
```
**Add to imports:** `saveAnalysis, updateRunSonnetStats` from `./db/queries.js`; `analyzeNotices` from `./analysis/index.js`; `type AnalysisOutput` from `./analysis/index.js`.

**Triage integration block pattern** (lines 136–147):
```typescript
let triageOutput: TriageOutput | null = null;
if (toStore.length > 0) {
  console.log(`[runner] Triaging ${toStore.length} notices with Haiku...`);
  triageOutput = await triageNotices(toStore, config.anthropicApiKey, runId);
  const okCount = triageOutput.records.filter(r => r.triageOk).length;
  console.log(`[runner] Triage complete — ok=${okCount} failed=${toStore.length - okCount}`);

  // Persist triage results
  saveTriageResults(db, triageOutput.records);
} else {
  console.log('[runner] No new notices to triage');
}
```
**Analysis phase insertion** — insert immediately after `saveTriageResults(db, triageOutput.records)` (line 144) and before the `buildDigest` block (line 150):
```typescript
const ANALYSIS_CAP = 5;
let analysisOutput: AnalysisOutput | null = null;

if (triageOutput) {
  const allTierA = triageOutput.records
    .filter(r => r.triageOk && r.score !== null && r.score >= 7);
  const tierAForAnalysis = [...allTierA]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, ANALYSIS_CAP);
  const cappedNds = new Set(tierAForAnalysis.map(r => r.nd));
  const skippedNds = allTierA.filter(r => !cappedNds.has(r.nd)).map(r => r.nd);

  if (tierAForAnalysis.length > 0) {
    console.log(`[runner] Analyzing ${tierAForAnalysis.length} Tier-A notices with Sonnet...`);
    analysisOutput = await analyzeNotices(tierAForAnalysis, config.anthropicApiKey, runId, db);
  }
}
```

**`buildDigest` call extension** (lines 154–161):
```typescript
// current:
const digest = buildDigest(noticesAndTriage, digestStats, new Date().toISOString().slice(0, 10));

// extended:
const analysisMap = new Map(
  (analysisOutput?.records ?? [])
    .filter(r => r.analysisOk)
    .map(r => [r.nd, true] as [string, boolean])
);
const digest = buildDigest(
  noticesAndTriage,
  digestStats,
  new Date().toISOString().slice(0, 10),
  analysisMap,
  analysisOutput?.skippedNds ?? [],
);
```

**`sendDigestEmail` call extension** (line 163):
```typescript
// current:
await sendDigestEmail(config.resendApiKey, digest);

// extended:
const attachments = (analysisOutput?.records ?? [])
  .filter(r => r.analysisOk && r.analysisText)
  .map(r => ({
    filename: `${r.nd}-analyse.md`,
    content: Buffer.from(r.analysisText!, 'utf-8'),
    content_type: 'text/markdown',
  }));
await sendDigestEmail(config.resendApiKey, digest, attachments);
```

**`updateRunSonnetStats` call** — insert after the existing `updateRunTriageStats` block (lines 180–188):
```typescript
if (analysisOutput) {
  updateRunSonnetStats(db, runId, {
    analysisCount:  analysisOutput.records.length,
    inputTokens:    analysisOutput.stats.totalInputTokens,
    outputTokens:   analysisOutput.stats.totalOutputTokens,
    costUsd:        analysisOutput.stats.estimatedCostUsd,
  });
}
```

**Console log extension** (lines 190–199): add `analysed=${analysisOutput?.records.filter(r => r.analysisOk).length ?? 0}` to the final summary log.

---

## Shared Patterns

### Anthropic SDK instantiation
**Source:** `src/triage/index.ts` line 36
**Apply to:** `src/analysis/index.ts`
```typescript
const client = new Anthropic({ apiKey });
```

### Error isolation (TRIAGE-03 pattern)
**Source:** `src/triage/index.ts` lines 69–72
**Apply to:** `src/analysis/index.ts` — each Sonnet call in the sequential for-of loop
```typescript
// individual failure must not abort the job
console.warn(`[triage] Notice ${notice.nd} failed:`, String(result.reason).slice(0, 120));
records.push({ runId, nd: notice.nd, score: null, rationale: null, triageOk: false });
```

### Named-parameter SQL (T-02-01 pattern)
**Source:** `src/db/queries.ts` lines 36–57 and 164–183
**Apply to:** `saveAnalysis()` and `updateRunSonnetStats()` in `src/db/queries.ts`
```typescript
// Named @param style — never string interpolation
insert.run({ nd, runId: Number(r.runId), ... });
```

### Token tracking accumulation
**Source:** `src/triage/index.ts` lines 38–39, 62–63
**Apply to:** `src/analysis/index.ts`
```typescript
let totalInputTokens  = 0;
let totalOutputTokens = 0;
// ...in loop:
totalInputTokens  += response.usage.input_tokens;
totalOutputTokens += response.usage.output_tokens;
```

### Error-safe email send (non-fatal)
**Source:** `src/runner.ts` lines 162–167
**Apply to:** `src/runner.ts` — the extended `sendDigestEmail` call keeps the same try/catch wrapper
```typescript
try {
  await sendDigestEmail(config.resendApiKey, digest);
  console.log(`[runner] Digest sent: "${digest.subject}"`);
} catch (err) {
  console.error('[runner] WARNING: Email send failed (run data preserved):', err);
  // Non-fatal: triage results and run stats are already persisted
}
```

### Vitest mock pattern for Anthropic SDK
**Source:** `src/triage/index.test.ts` lines 5–10
**Apply to:** `src/analysis/index.test.ts`
```typescript
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));
```

### Vitest mock pattern for Resend
**Source:** `src/email/smtp.test.ts` lines 3–7
**Apply to:** extended `src/email/smtp.test.ts`
```typescript
const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));
```

### In-memory DB for query tests
**Source:** `src/db/queries.test.ts` lines 12–13
**Apply to:** new `saveAnalysis` and `updateRunSonnetStats` test blocks
```typescript
beforeEach(() => { db = openDb(':memory:'); });
afterEach(() => { db.close(); });
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/analysis/config/figures-config.md` | config | static | Static content file; copied from skill-snapshot-iter1; no runtime pattern needed |
| `src/analysis/config/portfolio.md` | config | static | Static content file; copied from skill-snapshot-iter1; no runtime pattern needed |

---

## Metadata

**Analog search scope:** `src/triage/`, `src/db/`, `src/email/`, `src/runner.ts`, `src/fetcher/`
**Files scanned:** 10 source files + 5 test files
**Pattern extraction date:** 2026-05-11
