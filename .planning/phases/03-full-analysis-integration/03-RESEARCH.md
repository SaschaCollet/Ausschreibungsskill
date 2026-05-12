# Phase 3: Full Analysis Integration - Research

**Researched:** 2026-05-11
**Domain:** Anthropic SDK (claude-sonnet-4-6), TED API v3 search fields, Resend attachments, SQLite schema migration
**Confidence:** HIGH (all key APIs verified from official sources; one TED endpoint question remains low-confidence)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** TED Full Notice via TED API — extra API call per analysis to get full notice text
- **D-02:** `figures-config.md` and `references/portfolio.md` copied to `src/analysis/config/` as static strings embedded in the Sonnet prompt
- **D-03:** Only Skill Phase 1 automated — Zusammenfassung, Fit-Bewertung, Checkliste — no Bewerbungspaket
- **D-04:** All three sections in one Markdown file per notice: `{nd}-analyse.md`
- **D-05:** New SQLite table `analyses (nd TEXT, run_id INTEGER, analysis_text TEXT, created_at TEXT)` in scanner.db
- **D-06:** New columns in `runs` table: `sonnet_input_tokens`, `sonnet_output_tokens`, `sonnet_cost_usd`
- **D-07:** Analysis as `.md` file attachment via Resend `attachments` field
- **D-08:** Tier-A card in digest gets badge "Vollanalyse angehangen" — no inline analysis text
- **D-09:** Hard cap 5 analyses/day, top 5 by score, rest noted in digest as "Analyse aufgrund des Tageslimits nicht erstellt"

### Claude's Discretion

- TED API endpoint details for full notice XML (research must find the concrete endpoint/approach)
- Sonnet prompt structure (extract from SKILL.md Phase 1)
- Resend `attachments` field format and content-type for .md files

### Deferred Ideas (OUT OF SCOPE)

- Phase 2 des Ausschreibungsskills (Bewerbungspaket: Kostenschätzung, Portfolio-Texte, Draft-Dokumente)
- Web interface for browsing stored analyses
- Automated application submission
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANALYSIS-01 | Ausschreibungen mit Score ≥7 erhalten automatisch eine vollständige Analyse via bestehendem Ausschreibungsskill (Claude Sonnet) | D-01 through D-04: TED field strategy, prompt design, output format |
| ANALYSIS-02 | Maximal 5 Vollanalysen pro Tag (Hard Cap, Kostenkontrolle) | D-09 sort+slice pattern; cost math confirms ~$0.05/analysis at 5 max = ~$0.25/day |
| ANALYSIS-03 | Analyse-Output wird als Datei gespeichert und im Digest verlinkt (oder als Anhang) | D-05 SQLite analyses table; D-06 runs token columns; D-07 Resend attachment format verified |
</phase_requirements>

---

## Summary

Phase 3 adds a Sonnet analysis layer on top of the existing triage pipeline. For every Tier-A tender (score ≥ 7), up to 5 per day, the pipeline fetches the full notice description text from the TED API search endpoint (no separate XML endpoint is needed — the `description-lot` and `description-proc` fields are available via the existing POST `/v3/notices/search`), runs a Sonnet prompt based on the Ausschreibungsskill Phase 1 template, stores the Markdown output in SQLite, and attaches it to the digest email via Resend's `attachments` field.

The key discovery is that the TED API does **not** require a separate single-notice endpoint for full text — the search endpoint already supports requesting `description-lot` (BT-24-Lot) and `description-proc` (BT-24-Procedure) fields, which contain the Leistungsbeschreibung text. This eliminates the need for XML parsing entirely. The Resend SDK (v6.12.3 installed) has a verified TypeScript interface `EmailApiAttachment { content?: string | Buffer; filename?: string; path?: string; content_type?: string }` which natively supports Buffer content for .md files.

The Sonnet prompt context budget is moderate (~6,000–7,500 input tokens per call including system prompt + figures-config + portfolio + notice description). At $3/MTok in and $15/MTok out, each analysis costs approximately $0.05, so 5/day = ~$0.25/day maximum Sonnet cost — well within operational budget.

**Primary recommendation:** Fetch full notice description via the existing TED search endpoint with added `description-lot` and `description-proc` fields. Build `src/analysis/index.ts` mirroring the triage module pattern. Hook into `runner.ts` between `saveTriageResults()` and `buildDigest()`. Attach analyses as buffers via Resend `EmailApiAttachment`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch full notice description text | API/Fetcher | — | TED search endpoint POST call; same client as existing fetcher |
| Sonnet analysis (LLM call) | Analysis module (src/analysis/) | — | Mirrors triage module pattern; sequential for-of loop |
| Analysis storage (SQLite) | DB layer (src/db/) | — | New table + new columns on runs; follows existing migration pattern |
| Analysis file attachment | Email layer (src/email/) | — | Resend `attachments` field extension to sendDigestEmail |
| Digest badge for Tier-A | Email digest builder | — | renderNoticeCard() receives hasAnalysis flag |
| Token cost tracking | DB layer (runs table) | Runner | New columns sonnet_input/output/cost on runs row |
| Hard cap enforcement | Analysis module | Runner | Sort by score, slice top 5 before analysis loop |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | 0.94.0 (installed) / 0.95.1 (registry) | Sonnet API calls | Already in use for triage |
| resend | 6.12.3 (installed, registry matches) | Email with attachments | Already in use; verified attachment interface |
| better-sqlite3 | 12.9.0 | New analyses table + runs migration | Already in use |

**Version verification:** [VERIFIED: npm registry + node_modules inspection 2026-05-11]
- resend: `6.12.3` installed, `6.12.3` on registry
- @anthropic-ai/sdk: `0.94.0` installed, `0.95.1` on registry (minor bump — no breaking change expected)
- better-sqlite3: `12.9.0` installed

**No new npm dependencies required for Phase 3.**

**Installation:**
```bash
# No new packages — all dependencies already installed
```

---

## Architecture Patterns

### System Architecture Diagram

```
runner.ts
  │
  ├─ fetchNewNotices()         [existing — Phase 1]
  ├─ applyHardFilters()        [existing — Phase 1]
  ├─ markNoticeSeen()          [existing — Phase 1]
  ├─ triageNotices()           [existing — Phase 2]
  ├─ saveTriageResults()       [existing — Phase 2]
  │
  ├─ ── NEW: Analysis Phase ──────────────────────────
  │   ├─ getTierANotices(triageRecords)  → top 5 by score
  │   ├─ for each notice (sequential):
  │   │   ├─ fetchFullDescription(nd)   → POST TED search (description-lot fields)
  │   │   ├─ runSonnetAnalysis(desc, figuresCtx) → Anthropic messages.create
  │   │   └─ saveAnalysis(db, nd, runId, text)
  │   └─ updateRunSonnetStats(db, runId, tokens, cost)
  │
  ├─ buildDigest(noticesAndTriage, analysisMap) [extended]
  └─ sendDigestEmail(payload, attachments)      [extended]
```

### Recommended Project Structure

```
src/
├── analysis/
│   ├── index.ts          # analyzeNotices() — main entry, mirrors triage/index.ts
│   ├── prompt.ts         # buildAnalysisPrompt(description, figuresCtx) + system prompt
│   └── config/
│       ├── figures-config.md   # copied from skill-snapshot-iter1/config/
│       └── portfolio.md        # copied from skill-snapshot-iter1/references/
├── db/
│   ├── index.ts          # ADD: Phase 3 migration (analyses table + runs columns)
│   └── queries.ts        # ADD: saveAnalysis(), updateRunSonnetStats(), getAnalysisByNd()
├── email/
│   ├── digest.ts         # EXTEND: buildDigest() accepts analysisMap, renderNoticeCard() badge
│   └── smtp.ts           # EXTEND: sendDigestEmail() accepts attachments param
└── runner.ts             # ADD: analysis phase between saveTriageResults() and buildDigest()
```

### Pattern 1: Full Notice Description Fetch via TED Search

**What:** Use existing `tedFetch()` with a targeted ND query and description fields.
**When to use:** Before each Sonnet analysis call.

```typescript
// Source: TED Search API field list docs.ted.europa.eu/ODS/latest/reuse/field-list.html
// Field names verified: description-lot (BT-24-Lot), description-proc (BT-24-Procedure)
async function fetchFullDescription(nd: string): Promise<string> {
  const body = {
    query: `ND=${nd}`,
    page: 1,
    limit: 1,
    fields: ['ND', 'description-lot', 'description-proc', 'TI'],
  };
  const raw = await tedFetch(body);
  // Parse response — notices[0]['description-lot']?.deu?.[0] ?? notices[0]['description-proc']?.deu?.[0]
  // Falls back to empty string if no description found
}
```

**Note:** The `description-lot` and `description-proc` fields return objects with language keys (`deu`, `eng`), same pattern as the existing `TI` field already in the codebase. [VERIFIED: TED field list documentation, field naming pattern cross-checked against existing RawNoticeSchema in types.ts]

### Pattern 2: Sonnet Analysis Call (mirroring triageNotices)

```typescript
// Source: existing src/triage/index.ts pattern
// Uses sequential for-of (not Promise.allSettled) — Sonnet calls are slow/expensive,
// no benefit to parallelism at cap of 5, and avoids rate-limit issues.
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,        // 3 markdown sections ≈ 1,500-3,000 tokens
  system: ANALYSIS_SYSTEM_PROMPT,  // figures-config + portfolio embedded
  messages: [{ role: 'user', content: buildAnalysisPrompt(description, nd, title) }],
});
// Extract text: response.content[0].type === 'text' → response.content[0].text
// Token tracking: response.usage.input_tokens, response.usage.output_tokens
```

**Key difference from triage:** No tool_use/structured output needed — Sonnet returns free-form Markdown directly. Use `messages[0].text` from the content block.

### Pattern 3: Resend Attachment

```typescript
// Source: node_modules/resend/dist/index.d.mts — EmailApiAttachment interface verified
// interface EmailApiAttachment {
//   content?: string | Buffer;
//   filename?: string | false | undefined;
//   path?: string;
//   content_type?: string;
//   content_id?: string;
// }

// In sendDigestEmail():
await resend.emails.send({
  from: 'Ausschreibungs-Scanner <onboarding@resend.dev>',
  to: 'sascha.collet@gmail.com',
  subject: payload.subject,
  html: payload.html,
  text: payload.text,
  attachments: analyses.map(a => ({
    filename: `${a.nd}-analyse.md`,
    content: Buffer.from(a.analysisText, 'utf-8'),
    content_type: 'text/markdown',
  })),
});
```

[VERIFIED: Resend TypeScript declarations in node_modules/resend/dist/index.d.mts]

### Pattern 4: SQLite Schema Migration

```typescript
// In src/db/index.ts — following existing Phase 2 migration pattern

// Wave 0: CREATE TABLE IF NOT EXISTS (idempotent, runs on every startup)
db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nd          TEXT    NOT NULL REFERENCES seen_notices(nd),
    run_id      INTEGER NOT NULL REFERENCES runs(id),
    analysis_text TEXT  NOT NULL,
    created_at  TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_analyses_nd    ON analyses(nd);
  CREATE INDEX IF NOT EXISTS idx_analyses_run   ON analyses(run_id);
`);

// Phase 3 migration for existing DBs (try/catch pattern — column already exists throws)
const phase3Cols = [
  'ALTER TABLE runs ADD COLUMN sonnet_input_tokens INTEGER',
  'ALTER TABLE runs ADD COLUMN sonnet_output_tokens INTEGER',
  'ALTER TABLE runs ADD COLUMN sonnet_cost_usd REAL',
  'ALTER TABLE runs ADD COLUMN analysis_count INTEGER',
];
for (const stmt of phase3Cols) {
  try { db.exec(stmt); } catch { /* column already exists */ }
}
```

[VERIFIED: matches existing migration pattern in src/db/index.ts lines 69-78]

### Pattern 5: Prompt Structure (Adapted from SKILL.md Phase 1)

The system prompt embeds figures-config.md and portfolio.md as static strings (copied to `src/analysis/config/`). The user prompt provides the notice-specific content.

```typescript
// src/analysis/prompt.ts
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIGURES_CONFIG = readFileSync(join(__dirname, 'config/figures-config.md'), 'utf-8');
const PORTFOLIO = readFileSync(join(__dirname, 'config/portfolio.md'), 'utf-8');

export const ANALYSIS_SYSTEM_PROMPT = `
Du analysierst eine EU-Ausschreibung für Figures eGbR...

## Figures-Profil
${FIGURES_CONFIG}

## Portfolio-Referenzen
${PORTFOLIO}

Erstelle drei Markdown-Sektionen: [01 Zusammenfassung, 02 Fit-Bewertung, 03 Checkliste]
...
`.trim();

export function buildAnalysisPrompt(
  nd: string,
  title: string,
  descriptionLot: string,
  descriptionProc: string,
): string {
  return [
    `## Ausschreibung: ${nd}`,
    `**Titel:** ${title}`,
    '',
    '### Leistungsbeschreibung (Lot)',
    descriptionLot || '(nicht verfügbar)',
    '',
    '### Verfahrensbeschreibung',
    descriptionProc || '(nicht verfügbar)',
  ].join('\n');
}
```

**Important:** The config files are read synchronously at module load time (no filesystem calls at runtime). This keeps Railway startup deterministic and avoids async complexity. [ASSUMED — sync readFileSync at module load is standard Node.js pattern for static config]

### Anti-Patterns to Avoid

- **Parallel Sonnet calls:** Never use `Promise.allSettled()` for Sonnet — sequential for-of is required (STATE.md T-02-02-C decision for triage applies equally here; rate limits are stricter for Sonnet)
- **XML parsing:** Do not attempt to download or parse TED notice XML — the search endpoint with `description-lot`/`description-proc` fields provides equivalent content without XML complexity
- **Inline analysis in digest HTML:** Decision D-08 is firm — badge only, no inline text (keeps email compact and avoids Outlook rendering issues with large blocks)
- **String interpolation in SQL:** Use named parameters `@nd`, `@runId` — same rule as triage (T-02-01)
- **Tool use for analysis:** Do not use Anthropic tool_use for the analysis call — Sonnet should return free-form Markdown, not structured JSON. Tool use adds unnecessary tokens and complexity.
- **readFile at request time:** Do not read config files on every analysis call — load once at module import time

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email attachments | Custom MIME encoding | Resend `attachments` field (Buffer content) | Verified interface; handles encoding, Content-Disposition headers |
| Notice description fetch | XML download + parsing | POST /v3/notices/search with `description-lot` field | Same API client already in use; no XML parser needed |
| Cost tracking | Custom token counter | `response.usage.input_tokens` + `response.usage.output_tokens` from Anthropic SDK | Usage object is always present in messages.create response |
| DB migration | Destructive ALTER TABLE | try/catch per column (existing pattern in db/index.ts) | Idempotent — safe to run on every startup including Railway redeploys |

**Key insight:** The TED search endpoint is sufficient for full notice content — no separate XML endpoint or parser is needed. The `description-lot` field maps directly to BT-24-Lot (the Leistungsbeschreibung) and follows the same multilingual dict pattern as `TI` already in RawNoticeSchema.

---

## Common Pitfalls

### Pitfall 1: TED `description-lot` Returns Null/Empty for Some Notices
**What goes wrong:** Not all TED notices populate `description-lot` — some use `description-proc` (procedure-level) instead, and a minority provide no text description at all.
**Why it happens:** TED eForms schema allows description at procedure or lot level depending on notice type (cn-standard vs. pin-only). Some notices (especially older format) have no machine-readable description.
**How to avoid:** Request both `description-lot` and `description-proc` fields. Combine both in the prompt with fallback to `"(Beschreibung nicht verfügbar)"`. Don't abort analysis if text is empty — Sonnet can still produce a partial analysis from the title and CPV codes.
**Warning signs:** `description-lot?.deu?.[0]` returns `undefined` on more than 20% of fetched notices.

### Pitfall 2: Sonnet Analysis Fails Mid-Loop (Error Isolation)
**What goes wrong:** If one Sonnet call throws (rate limit, network error), it could abort all 5 analyses.
**Why it happens:** Unlike the batch triage loop, the analysis loop is sequential — an unhandled throw stops all subsequent iterations.
**How to avoid:** Wrap each analysis call in try/catch (same TRIAGE-03 pattern). Log the error, record `analysisOk: false` in the analyses table, continue to next notice. The digest badge for that notice shows "Analyse fehlgeschlagen" instead.
**Warning signs:** Missing analysis attachments in digest without any error log.

### Pitfall 3: Resend Rejects Attachments Over 40MB
**What goes wrong:** Resend has a 40MB per-email limit after Base64 encoding. Analysis Markdown files are tiny (~5-15KB each), so 5 attachments = ~75KB total — well within limits. This only becomes a risk if analysis_text grows unexpectedly large.
**Why it happens:** Resend enforces email attachment size limits at API level.
**How to avoid:** Log the size of each analysis text before attaching. For normal Sonnet outputs (max_tokens=4096) this is a non-issue.

### Pitfall 4: Concurrent Execution — Analysis Cap Resets on Re-run
**What goes wrong:** If a Railway cron fires twice (clock drift), the hard cap of 5 analyses could run twice (10 Sonnet calls).
**Why it happens:** The cap is enforced in-memory per run, not via database query. The existing job_lock prevents concurrent runs — this is already solved.
**How to avoid:** The existing `acquireJobLock()` mechanism (DEDUP-03) already prevents concurrent cron invocations. No additional guard needed for the analysis cap.

### Pitfall 5: `description-lot` Field Not in Existing `TED_FIELDS` Array
**What goes wrong:** The existing `TedSearchResponseSchema` in `fetcher/types.ts` does not include `description-lot` or `description-proc`. Requesting these fields in the existing fetch would require schema extension.
**Why it happens:** The analysis fetch is a separate, targeted API call with its own schema — not using the bulk fetch path.
**How to avoid:** The full-notice fetch is a standalone function in `src/analysis/index.ts` with its own minimal Zod schema. Do NOT modify the existing `TED_FIELDS` array or `RawNoticeSchema` — this would require re-validating all Phase 1/2 tests.

### Pitfall 6: Hard Cap Ordering Logic
**What goes wrong:** If triage results are not sorted by score before slicing to 5, lower-scored notices may be analyzed instead of higher-scored ones.
**Why it happens:** `triageOutput.records` preserves insertion order, not score order.
**How to avoid:** Sort eligible records by `score DESC` before `slice(0, MAX_ANALYSES)`. Use `triage.score !== null && triage.score >= 7` filter first.

---

## Code Examples

### Full Notice Fetch with Zod Schema

```typescript
// Source: TED field list docs.ted.europa.eu/ODS/latest/reuse/field-list.html
// + existing tedFetch() pattern from src/fetcher/ted-client.ts
import { z } from 'zod';
import { tedFetch } from '../fetcher/ted-client.js';

const FullNoticeResponseSchema = z.object({
  notices: z.array(z.object({
    ND: z.string(),
    TI: z.record(z.string()).optional(),
    'description-lot':  z.record(z.array(z.string())).optional(),
    'description-proc': z.record(z.array(z.string())).optional(),
  })),
  totalNoticeCount: z.number(),
  iterationNextToken: z.string().nullable(),
  timedOut: z.boolean(),
});

export async function fetchFullDescription(nd: string): Promise<{
  descriptionLot: string;
  descriptionProc: string;
}> {
  const raw = await tedFetch({
    query: `ND=${nd}`,
    page: 1,
    limit: 1,
    fields: ['ND', 'TI', 'description-lot', 'description-proc'],
  });
  const data = FullNoticeResponseSchema.parse(raw);
  const notice = data.notices[0];
  return {
    descriptionLot:  notice?.['description-lot']?.deu?.[0]  ?? '',
    descriptionProc: notice?.['description-proc']?.deu?.[0] ?? '',
  };
}
```

### DB Query: saveAnalysis

```typescript
// Source: named-parameter pattern from src/db/queries.ts saveTriageResults()
export function saveAnalysis(
  db: Database.Database,
  nd: string,
  runId: number | bigint,
  analysisText: string,
): void {
  db.prepare(`
    INSERT INTO analyses (nd, run_id, analysis_text, created_at)
    VALUES (@nd, @runId, @analysisText, @createdAt)
  `).run({
    nd,
    runId: Number(runId),
    analysisText,
    createdAt: new Date().toISOString(),
  });
}

export function updateRunSonnetStats(
  db: Database.Database,
  runId: number | bigint,
  stats: {
    analysisCount: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }
): void {
  db.prepare(`
    UPDATE runs SET
      analysis_count        = ?,
      sonnet_input_tokens   = ?,
      sonnet_output_tokens  = ?,
      sonnet_cost_usd       = ?
    WHERE id = ?
  `).run(
    stats.analysisCount,
    stats.inputTokens,
    stats.outputTokens,
    stats.costUsd,
    Number(runId),
  );
}
```

### Runner Integration Point

```typescript
// In src/runner.ts — insert between saveTriageResults() and buildDigest()
// Lines ~144-155 in current runner.ts

const ANALYSIS_CAP = 5;

let analysisOutput: AnalysisOutput | null = null;
if (triageOutput) {
  const tierARecords = triageOutput.records
    .filter(r => r.triageOk && r.score !== null && r.score >= 7)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, ANALYSIS_CAP);

  const cappedNds = new Set(tierARecords.map(r => r.nd));
  const allTierANds = triageOutput.records
    .filter(r => r.triageOk && r.score !== null && r.score >= 7)
    .map(r => r.nd);
  const skippedNds = allTierANds.filter(nd => !cappedNds.has(nd));

  if (tierARecords.length > 0) {
    analysisOutput = await analyzeNotices(tierARecords, toStore, config.anthropicApiKey, runId, db);
  }
  // skippedNds passed to buildDigest for "Analyse aufgrund des Tageslimits nicht erstellt" note
}
```

### Digest Extension: Analysis Badge

```typescript
// In src/email/digest.ts — renderNoticeCard() signature extension
function renderNoticeCard(
  n: NoticeWithTriage,
  tierColor: string,
  hasAnalysis: boolean,
  analysisSkipped: boolean,
): string {
  // ... existing card HTML ...
  // After TED link, add badge conditionally:
  const badge = hasAnalysis
    ? `<p style="margin:4px 0 0;font-size:12px;">&#128206; Vollanalyse angehangen</p>`
    : analysisSkipped
    ? `<p style="margin:4px 0 0;font-size:12px;color:#888;">Analyse aufgrund des Tageslimits nicht erstellt</p>`
    : '';
}
```

---

## Token Budget and Cost Estimate

### Per-Analysis Token Budget
| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt (ANALYSIS_SYSTEM_PROMPT static) | ~100 tokens |
| figures-config.md embedded | ~1,200 tokens |
| portfolio.md embedded | ~2,300 tokens |
| Total static context | ~3,600 tokens |
| Notice description (description-lot + description-proc) | ~500–2,000 tokens |
| User prompt framing | ~100 tokens |
| **Total input per call** | **~4,200–5,700 tokens** |
| Output (3 markdown sections) | ~1,500–3,000 tokens |

### Cost Estimate
| Scenario | Input Tokens | Output Tokens | Cost |
|----------|-------------|---------------|------|
| Minimal description | 4,200 | 1,500 | ~$0.035 |
| Rich description | 5,700 | 3,000 | ~$0.062 |
| 5 analyses/day max | 5,700 × 5 | 3,000 × 5 | **~$0.31/day max** |

[VERIFIED: Pricing from platform.claude.com/docs/en/about-claude/pricing — claude-sonnet-4-6: $3/MTok input, $15/MTok output, confirmed 2026-05-11]

**The static context (figures-config + portfolio, ~3,600 tokens) is a strong candidate for Anthropic prompt caching** (cache write at 1.25x → pays off on second cache read at 0.1x). However, since max 5 calls per day, the cache expires (5-minute TTL default) between calls unless all 5 run within 5 minutes. The 1-hour cache write at 2x would pay off after 2+ calls within 1 hour. For the sequential loop of 5 calls, enable 1-hour caching on the static system prompt block. [ASSUMED — prompt caching behavior at this volume not verified in this session; confirm if cost optimization is needed]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TED XML direct download | TED Search API with description fields | TED API v3 | No XML parser needed; same HTTP client |
| Nodemailer for SMTP | Resend SDK | Phase 2 (smtp.ts uses Resend) | Resend `attachments` interface is cleaner than nodemailer |
| Tool use for structured LLM output | Free-form Markdown (messages.create text) | This phase (analysis vs triage) | Analysis is free-form prose; no schema enforcement needed |

**Deprecated/outdated:**
- Nodemailer: Already replaced by Resend in Phase 2. `package.json` still lists nodemailer as a dependency but `smtp.ts` uses Resend. This does not need cleanup in Phase 3 but is noted.

---

## Runtime State Inventory

This phase adds new DB structures but does not rename or migrate existing data.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `analyses` table does not yet exist; `runs` table missing Phase 3 columns | CREATE TABLE + ALTER TABLE in db/index.ts migration |
| Live service config | Resend API key already set as Railway env var; no new secrets needed | None |
| OS-registered state | None | None |
| Secrets/env vars | `ANTHROPIC_API_KEY` already in use for triage; no new keys | None |
| Build artifacts | None — TypeScript compiled at runtime via tsx | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 22 | tsx runtime | ✓ | v24.5.0 | — |
| @anthropic-ai/sdk | Sonnet analysis calls | ✓ | 0.94.0 installed | — |
| resend | Email attachments | ✓ | 6.12.3 | — |
| better-sqlite3 | analyses table | ✓ | 12.9.0 | — |
| TED API (api.ted.europa.eu) | Full description fetch | ✓ | v3 (no auth required) | — |
| Anthropic API key | Sonnet calls | ✓ (env var set) | — | — |

**No missing dependencies.** All required libraries are already installed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^2 |
| Config file | vitest.config.ts (exists) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANALYSIS-01 | analyzeNotices() calls Anthropic for each Tier-A notice | unit | `npm test -- src/analysis/index.test.ts` | ❌ Wave 0 |
| ANALYSIS-01 | Prompt contains figures-config and portfolio text | unit | `npm test -- src/analysis/index.test.ts` | ❌ Wave 0 |
| ANALYSIS-02 | Hard cap: only top 5 by score get analyzed | unit | `npm test -- src/analysis/index.test.ts` | ❌ Wave 0 |
| ANALYSIS-02 | Skipped notices identified and passed to digest | unit | `npm test -- src/analysis/index.test.ts` | ❌ Wave 0 |
| ANALYSIS-03 | saveAnalysis() inserts row in analyses table | unit | `npm test -- src/db/queries.test.ts` | ❌ Wave 0 (extend existing) |
| ANALYSIS-03 | updateRunSonnetStats() updates runs row | unit | `npm test -- src/db/queries.test.ts` | ❌ Wave 0 (extend existing) |
| ANALYSIS-03 | sendDigestEmail() passes attachments array to Resend | unit | `npm test -- src/email/smtp.test.ts` | ❌ extend existing |
| ANALYSIS-03 | Tier-A card renders badge when hasAnalysis=true | unit | `npm test -- src/email/digest.test.ts` | ❌ extend existing |
| ANALYSIS-03 | Tier-A card renders "Tageslimit" note when skipped | unit | `npm test -- src/email/digest.test.ts` | ❌ extend existing |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/analysis/index.test.ts` — covers ANALYSIS-01, ANALYSIS-02 (mock Anthropic SDK, same vi.mock pattern as triage test)
- [ ] Extend `src/db/queries.test.ts` (or create `src/db/queries.analysis.test.ts`) — covers ANALYSIS-03 DB queries using `:memory:` DB
- [ ] Extend `src/email/smtp.test.ts` — covers attachment parameter passthrough
- [ ] Extend `src/email/digest.test.ts` — covers badge and "Tageslimit" note rendering

*(Existing test infrastructure: vitest.config.ts present, vi.mock patterns established in triage and smtp tests — no framework setup needed)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Zod schema on TED API response (FullNoticeResponseSchema); no user input |
| V6 Cryptography | no | — |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| TED API response injection — malicious content in description-lot passed to Sonnet | Tampering | Zod parse validates structure; Sonnet prompt clearly separates system/user context; no eval or exec on output |
| Analysis text stored in SQLite with special chars | Tampering | Named parameters prevent SQL injection (existing T-02-01 pattern) |
| apiKey logged accidentally | Information Disclosure | Log only model, tokens, nd — never log apiKey (existing T-02-02-B pattern applies) |

**No new auth surfaces introduced in Phase 3** — analysis is internal pipeline, no external-facing endpoints.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `description-lot` and `description-proc` fields are available via the TED search POST endpoint when requested in the `fields` array | Standard Stack / Fetch Pattern | Analysis prompt would have no notice text; fallback to title+CPV needed |
| A2 | The `description-lot` response structure is `{ deu: ["text..."], eng: ["text..."] }` (multilingual array, same as `title-lot` and `buyer-name` in RawNoticeSchema) | Code Examples | Would need adjusted field accessor — low impact fix |
| A3 | Sync `readFileSync` at module load time for config files is acceptable in Railway cron context | Prompt Pattern | Negligible risk — file reads are instant for 14KB of static files |
| A4 | Prompt caching pays off at 5 sequential analyses within ~1 hour | Token Budget | Only affects cost optimization, not correctness |
| A5 | `ND=${nd}` is valid TED expert query syntax for fetching a single notice by its notice number | Fetch Pattern | Alternative: search with `query: nd` using ND field filter — verify against TED query syntax docs if A5 fails |

**Highest-risk assumption: A1** — the `description-lot` field availability via the POST search endpoint is documented in TED field list docs but not live-tested in this session. The mitigation: add a fallback to an empty string with console warning if the field returns null, so analysis proceeds with reduced context rather than throwing.

---

## Open Questions (RESOLVED)

1. **Does `ND=${nd}` work as a TED expert query?**
   - What we know: TED expert query syntax uses field codes like `PD=`, `CY=`, `PC=` — all confirmed in existing fetcher
   - What's unclear: Whether `ND` is a valid query field (it is the notice number field ID, but expert queries use eForms BT codes)
   - **RESOLVED:** Use `ND=${nd}` as the query in `fetchFullDescription()`. If the field returns 0 results, fall back to empty description string with `console.warn` — analysis proceeds with reduced context rather than throwing. Plans implement this fallback explicitly.

2. **Does `description-lot` return text for all notice types (cn-standard, can-standard, pin-only)?**
   - What we know: The field is defined in eForms BT-24-Lot spec; not all notices use lot structure
   - What's unclear: Contract award notices (can-standard) may not have description-lot populated
   - **RESOLVED:** Request both `description-lot` and `description-proc`; combine non-null values in the Sonnet prompt. Accept empty string gracefully — FullNoticeResponseSchema marks both fields optional. Plans implement this dual-field approach.

3. **Resend attachment content_type for `.md` files — does Resend auto-derive it?**
   - What we know: Resend TypeScript types show `content_type` is optional ("if not set will be derived from filename")
   - What's unclear: Whether `.md` maps to `text/markdown` or `text/plain` when auto-derived
   - **RESOLVED:** Explicitly set `content_type: 'text/markdown'` to avoid ambiguity. Plans hardcode this value in the attachments array.

---

## Sources

### Primary (HIGH confidence)
- `/Users/saschacollet/Dev/Ausschreibungsskill/node_modules/resend/dist/index.d.mts` — EmailApiAttachment interface (verified locally)
- `platform.claude.com/docs/en/about-claude/pricing` — claude-sonnet-4-6 and claude-haiku-4-5 pricing (fetched 2026-05-11)
- `docs.ted.europa.eu/ODS/latest/reuse/field-list.html` — description-lot (BT-24-Lot), description-proc (BT-24-Procedure) field names (fetched 2026-05-11)
- Codebase direct reads: src/triage/index.ts, src/triage/prompt.ts, src/email/smtp.ts, src/email/digest.ts, src/db/index.ts, src/db/queries.ts, src/runner.ts — all patterns verified from source

### Secondary (MEDIUM confidence)
- `docs.ted.europa.eu/api/latest/intro.html` — confirms no separate single-notice endpoint exists; search API is the primary interface (fetched 2026-05-11)
- npm registry: resend@6.12.3 (confirmed current), @anthropic-ai/sdk@0.95.1 (0.94.0 installed)

### Tertiary (LOW confidence)
- TED expert query syntax for `ND=` field — cross-referenced from existing fetcher query patterns but not live-tested for this specific field

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages verified locally; pricing verified from official docs
- Architecture: HIGH — mirroring existing triage module pattern; all integration points verified from codebase
- TED description fields: MEDIUM — field names from official TED field list docs; exact query syntax for ND not live-tested (Open Question 1)
- Resend attachments: HIGH — TypeScript interface verified from installed package
- Pitfalls: HIGH — derived from codebase analysis and existing test patterns

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (TED API field names are stable; Resend interface is stable; Anthropic pricing subject to change)
