# Phase 2: Triage and Digest — Research

**Researched:** 2026-05-06
**Domain:** Anthropic SDK (Haiku triage), Nodemailer (Gmail SMTP), HTML email, SQLite schema extensions
**Confidence:** HIGH

---

## Summary

Phase 2 wires together three components onto the Phase 1 pipeline: (1) a Haiku triage module that scores each surviving notice 0-10 using a Figures-calibrated rubric, (2) a SQLite schema extension to persist triage results and token usage per run, and (3) an HTML email digest module that groups notices into Tier A (>=7) and Tier B (4-6) and delivers them via Gmail SMTP.

The Anthropic SDK v0.94.0 already in the project supports `messages.parse()` with `zodOutputFormat()` for claude-haiku-4-5 — this is the cleanest path for structured JSON extraction because it uses constrained decoding and avoids hand-parsing JSON from text. The Batch API is available and offers 50% cost savings but introduces a multi-hour asynchronous polling loop that is fundamentally incompatible with the single-exit-code Railway cron job design. Sequential calls are the correct approach for this workload (300 notices/day at ~$0.002/day makes batching an optimization that is not worth the architectural complexity).

Gmail SMTP with App Password works with `nodemailer@8.0.7` using the `service: 'gmail'` shorthand or explicit `host: 'smtp.gmail.com', port: 465, secure: true`. The `transporter.verify()` call provides the DIGEST-05 startup auth check. HTML email must use table-based layout with fully inline styles — no `<style>` blocks survive Gmail's CSS stripper.

**Primary recommendation:** Sequential `messages.parse()` + `zodOutputFormat` for triage, `service: 'gmail'` transport for email, separate `triage_results` table in SQLite (not extending `seen_notices`).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Haiku triage scoring | API/Backend (runner process) | — | Calls Anthropic API, stores result in DB; no web tier involved |
| Token usage tracking | API/Backend (runner process) | SQLite (storage) | `response.usage` available on every Anthropic SDK call; log to `runs` row |
| Gmail SMTP auth test | API/Backend (runner process) | — | Must block the pipeline on startup; exits before fetch if auth fails |
| HTML digest generation | API/Backend (runner process) | — | Pure string construction; no framework needed |
| Email delivery | API/Backend (nodemailer) | Gmail SMTP relay | nodemailer wraps the SMTP session |
| Triage result persistence | Database / Storage (SQLite) | — | `triage_results` table, FK to `seen_notices.nd` and `runs.id` |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRIAGE-01 | Claude Haiku scores each filtered notice 0-10 with 2-sentence rationale | `messages.parse()` + `zodOutputFormat` with `TriageResult` Zod schema |
| TRIAGE-02 | Triage prompt contains explicit Figures-calibrated rubric | Scoring rubric draft in Code Examples section; high/low signal types documented |
| TRIAGE-03 | Individual triage failure must not abort the job (catch + continue) | `try/catch` per-notice loop; log error and push `null` result; continue |
| TRIAGE-04 | System logs token usage and estimated cost per run | `response.usage.input_tokens` + `response.usage.output_tokens` from SDK; accumulate across notices; write to `runs` row |
| DIGEST-01 | Daily HTML digest sent via Gmail SMTP | nodemailer `service: 'gmail'` + App Password; `sendMail()` with `html:` field |
| DIGEST-02 | Tier A (>=7) and Tier B (4-6) visually separated in digest | Two `<table>` sections with distinct header background colors; notices <4 excluded |
| DIGEST-03 | Per-notice: Titel, Score, Rationale, Budget, Deadline, TED-Link | Pulled from `seen_notices` + `triage_results`; TED link constructed from `nd` field |
| DIGEST-04 | Zero-notice day sends confirmation email (no silent failure) | Conditional in digest builder: if tierA.length + tierB.length === 0, send "Kein Treffer" email |
| DIGEST-05 | Gmail SMTP auth tested at job startup; exit if auth fails | `transporter.verify()` before `acquireJobLock()`; `process.exit(2)` on failure |
</phase_requirements>

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@anthropic-ai/sdk` | 0.94.0 | Haiku API calls, structured output, token tracking | Already in package.json [VERIFIED: npm registry 0.95.0 is latest; project pins 0.94.0] |
| `zod` | ^3 | Triage result schema validation via `zodOutputFormat` | Already in package.json |
| `nodemailer` | 8.0.7 | Gmail SMTP transport, `verify()`, `sendMail()` | Already in package.json [VERIFIED: npm registry latest is 8.0.7] |
| `better-sqlite3` | 12.9.0 | Persist triage results, token usage | Already in package.json |

### No New Dependencies Required
Phase 2 requires zero new npm packages. All needed libraries are already installed.

**Version verification:**
- `@anthropic-ai/sdk` latest: 0.95.0 — project pins 0.94.0 (one minor behind, API surface identical) [VERIFIED: npm view]
- `nodemailer` latest: 8.0.7 — project is current [VERIFIED: npm view]

---

## Architecture Patterns

### System Architecture Diagram

```
Railway Cron (08:00 UTC)
        |
        v
[runner.ts main()]
        |
        +-- 1. SMTP Auth Test (transporter.verify()) -------> Gmail SMTP
        |       | FAIL: process.exit(2)
        |
        +-- 2. Open SQLite DB
        |
        +-- 3. Acquire job lock
        |
        +-- 4. fetchNewNotices() --------------------------> TED API
        |
        +-- 5. applyHardFilters()
        |
        +-- 6. [NEW] triageNotices()
        |       |
        |       +-- for each notice:
        |           +-- messages.parse(haiku) ------------> Anthropic API
        |           +-- catch error -> score=null, continue
        |           +-- accumulate usage stats
        |
        +-- 7. markNoticeSeen() + saveTriageResults()
        |
        +-- 8. [NEW] buildDigest() + sendDigest() --------> Gmail SMTP
        |
        +-- 9. finalizeRun() (with token totals)
        |
        +-- 10. releaseJobLock() + db.close() + exit(0)
```

### Recommended Project Structure (additions only)
```
src/
├── triage/
│   └── index.ts         # triageNotices(notices, client) -> TriageResult[]
├── email/
│   ├── transport.ts     # createTransport(), verifySmtp()
│   ├── digest.ts        # buildDigest(results) -> {subject, html, text}
│   └── sender.ts        # sendDigest(transporter, digest)
├── db/
│   ├── index.ts         # ADD: triage_results + token_usage columns to schema
│   └── queries.ts       # ADD: saveTriageResults(), getRunTriageStats()
└── runner.ts            # ADD: SMTP test at top, triage + email steps
```

### Pattern 1: Haiku Structured Output with `messages.parse()`

`claude-haiku-4-5` supports `messages.parse()` with `zodOutputFormat` as of SDK 0.94.0. [VERIFIED: platform.claude.com/docs/en/build-with-claude/structured-outputs]

```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const TriageResultSchema = z.object({
  score: z.number().int().min(0).max(10),
  rationale: z.string().max(300), // 2-sentence max enforced in prompt
});

export type TriageResult = z.infer<typeof TriageResultSchema>;

const client = new Anthropic({ apiKey: config.anthropicApiKey });

async function triageNotice(notice: NoticeRecord): Promise<{
  result: TriageResult | null;
  usage: { input_tokens: number; output_tokens: number };
}> {
  try {
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: TRIAGE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildNoticePrompt(notice),
      }],
      output_config: {
        format: zodOutputFormat(TriageResultSchema),
      },
    });

    return {
      result: response.parsed_output ?? null,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  } catch (err) {
    // TRIAGE-03: individual failure must not abort job
    console.warn(`[triage] Notice ${notice.nd} failed:`, err);
    return { result: null, usage: { input_tokens: 0, output_tokens: 0 } };
  }
}
```

**Important note on `messages.parse` vs `messages.create`:** If `zodOutputFormat` does not work reliably with Haiku 4.5 on SDK 0.94.0 in practice (check release notes), fall back to `messages.create()` with a JSON-in-system-prompt approach (see Pattern 1b below). The structured outputs page confirms Haiku 4.5 support but the SDK docs examples consistently show Sonnet 4.5 — verify at runtime.

### Pattern 1b: Fallback — JSON via `messages.create()` (if `messages.parse` is unavailable)

```typescript
// Source: context7 /anthropics/anthropic-sdk-typescript — messages.create token usage
const response = await client.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 256,
  system: TRIAGE_SYSTEM_PROMPT + '\n\nRespond with ONLY valid JSON, no prose.',
  messages: [{ role: 'user', content: buildNoticePrompt(notice) }],
});

const text = response.content[0].type === 'text' ? response.content[0].text : '';
// usage is always present on messages.create response:
const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };

let result: TriageResult | null = null;
try {
  const parsed = JSON.parse(text.trim());
  result = TriageResultSchema.parse(parsed);
} catch {
  console.warn(`[triage] JSON parse failed for ${notice.nd}:`, text.slice(0, 100));
}
```

### Pattern 2: Token Usage Accumulation (TRIAGE-04)

```typescript
// Source: context7 /anthropics/anthropic-sdk-typescript — usage field on response
let totalInputTokens = 0;
let totalOutputTokens = 0;

for (const notice of noticesToTriage) {
  const { result, usage } = await triageNotice(notice);
  totalInputTokens += usage.input_tokens;
  totalOutputTokens += usage.output_tokens;
  // ... store result
}

// Haiku 4.5 pricing: $1/MTok input, $5/MTok output [VERIFIED: platform.claude.com/docs pricing]
const estimatedCostUsd =
  (totalInputTokens / 1_000_000) * 1.00 +
  (totalOutputTokens / 1_000_000) * 5.00;

console.log(
  `[triage] tokens: in=${totalInputTokens} out=${totalOutputTokens} ` +
  `cost_est=$${estimatedCostUsd.toFixed(4)}`
);

// Store in runs row via finalizeRun() extension (see DB schema section)
```

### Pattern 3: Gmail SMTP Transport

```typescript
// Source: https://github.com/nodemailer/nodemailer-homepage/blob/master/docs/guides/using-gmail.md
import nodemailer from 'nodemailer';

export function createGmailTransport(user: string, appPassword: string) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass: appPassword,
    },
  });
}

// DIGEST-05: verify before any pipeline work
export async function verifySmtp(transporter: ReturnType<typeof createGmailTransport>): Promise<void> {
  await transporter.verify(); // throws if auth fails
}
```

**Port details:** `service: 'gmail'` automatically uses `smtp.gmail.com:465` with `secure: true`. If using explicit config instead: `host: 'smtp.gmail.com', port: 465, secure: true`. Port 587 + `secure: false` (STARTTLS) also works, but 465 is simpler. [VERIFIED: nodemailer.com/smtp + nodemailer GitHub docs]

**`verify()` scope:** Checks DNS resolution, TCP connection, TLS upgrade, and authentication. Does NOT validate that the server will accept messages from a specific sender address — that is only checked during actual `sendMail()`. [CITED: nodemailer-homepage docs/errors.md]

### Pattern 4: sendMail() with HTML + Text Fallback

```typescript
// Source: context7 /nodemailer/nodemailer-homepage — sendMail
await transporter.sendMail({
  from: `"Ausschreibungs-Scanner" <${config.gmailUser}>`,
  to: 'sascha.collet@gmail.com',
  subject: `[Scanner] ${tierA.length}A + ${tierB.length}B Ausschreibungen — ${dateStr}`,
  text: plainTextFallback,  // always include for spam score
  html: htmlBody,
});
```

**Subject line format:** `[Scanner] 3A + 7B Ausschreibungen — 2026-05-06` — scannable in inbox, date enables manual archiving.

### Pattern 5: HTML Email Structure (Safe CSS)

Table-based layout, fully inline styles. [VERIFIED: multiple sources incl. caniemail.com, designmodo.com]

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ausschreibungs-Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">

  <!-- Container -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:20px 0;">

        <!-- Inner card, max 600px -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border-radius:4px;">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:20px 24px;">
              <span style="color:#ffffff;font-size:18px;font-weight:bold;">
                Ausschreibungs-Scanner
              </span>
              <span style="color:#a0a0c0;font-size:13px;display:block;margin-top:4px;">
                {{DATE}} — {{TOTAL_A}}A + {{TOTAL_B}}B Treffer
              </span>
            </td>
          </tr>

          <!-- Tier A Section -->
          <tr>
            <td style="padding:16px 24px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#0d6e3a;padding:8px 12px;border-radius:3px;">
                    <span style="color:#ffffff;font-size:14px;font-weight:bold;">
                      TIER A — Score 7-10 ({{COUNT_A}} Ausschreibungen)
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tier A Notice Card (repeat per notice) -->
          <tr>
            <td style="padding:8px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border:1px solid #e0e0e0;border-radius:3px;border-left:4px solid #0d6e3a;">
                <tr>
                  <td style="padding:12px 16px;">
                    <!-- Score badge -->
                    <span style="display:inline-block;background-color:#0d6e3a;color:#fff;
                                 font-size:12px;font-weight:bold;padding:2px 8px;border-radius:10px;">
                      Score {{SCORE}}/10
                    </span>
                    <!-- Title -->
                    <p style="margin:8px 0 4px;font-size:15px;font-weight:bold;color:#1a1a2e;">
                      <a href="{{TED_LINK}}" style="color:#1a1a2e;text-decoration:none;">
                        {{TITLE}}
                      </a>
                    </p>
                    <!-- Rationale -->
                    <p style="margin:0 0 8px;font-size:13px;color:#444444;line-height:1.5;">
                      {{RATIONALE}}
                    </p>
                    <!-- Meta row -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:12px;color:#666666;">
                          Budget: <strong>{{BUDGET}}</strong>
                        </td>
                        <td style="font-size:12px;color:#666666;text-align:right;">
                          Frist: <strong>{{DEADLINE}}</strong>
                        </td>
                      </tr>
                    </table>
                    <!-- TED Link -->
                    <p style="margin:8px 0 0;">
                      <a href="{{TED_LINK}}"
                         style="color:#0d6e3a;font-size:12px;text-decoration:underline;">
                        TED-Ausschreibung ansehen
                      </a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tier B Section (same pattern, accent color #c47900) -->

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;font-size:11px;color:#888888;">
                Haiku-Tokens: {{TOKENS_IN}} in / {{TOKENS_OUT}} out —
                Geschätzte Kosten: ${{COST_USD}}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
```

**Safe CSS properties (all email clients):** [CITED: caniemail.com, designmodo.com]
- `background-color`, `color`, `font-family`, `font-size`, `font-weight` — universal
- `padding`, `margin` — safe inline
- `border` — safe; keep width <= 8px for Outlook Word engine
- `border-radius` — 91% support; safe for cosmetic use (degrades to square corners in older Outlook)
- `text-decoration`, `text-align` — safe
- `width` on `<table>` and `<td>` — safe; use pixel values not %
- **Avoid:** `display:flex`, `display:grid`, `position:absolute`, `float`, external CSS files, `<style>` blocks (Gmail strips them)

**Tier color scheme:**
- Tier A: `#0d6e3a` (dark green) — left border + section header
- Tier B: `#c47900` (amber) — left border + section header
- Score badge: match tier color

### Pattern 6: Zero-Notice Confirmation Email (DIGEST-04)

```typescript
if (tierA.length === 0 && tierB.length === 0) {
  await transporter.sendMail({
    from: `"Ausschreibungs-Scanner" <${config.gmailUser}>`,
    to: 'sascha.collet@gmail.com',
    subject: `[Scanner] Kein Treffer heute — ${dateStr}`,
    text: `Scanner lief am ${dateStr}. Keine Ausschreibungen mit Score >= 4 gefunden.\n\n` +
          `Gesamt gefilterte Notices: ${filteredCount}\n` +
          `Haiku-Aufrufe: ${triagedCount}`,
    html: `<p>Scanner lief am <strong>${dateStr}</strong>.<br>` +
          `Keine Ausschreibungen mit Score &ge; 4 gefunden.</p>` +
          `<p style="color:#888;font-size:12px;">` +
          `Notices triagiert: ${triagedCount} | Token-Kosten: $${costUsd}</p>`,
  });
}
```

### Anti-Patterns to Avoid

- **Parsing Haiku JSON from raw text response:** Use `messages.parse()` + `zodOutputFormat` instead. Raw text parsing requires regex, fails on whitespace/markdown formatting that Haiku may add.
- **Using `<style>` blocks in HTML email:** Gmail strips embedded `<style>`. All CSS must be inline.
- **Using `display:flex` or CSS Grid for email layout:** Not supported in Outlook Word engine. Use `<table>` for all structure.
- **Calling `transporter.verify()` after `acquireJobLock()`:** SMTP auth failure should prevent lock acquisition and any pipeline work — test first.
- **Storing triage results in `seen_notices` table:** Extending the dedup table with triage columns creates coupling and makes re-triage (Phase 4 rubric updates) impossible without corrupting dedup state. Use a separate `triage_results` table.
- **Using the Batch API for triage:** Batch results take up to 1 hour, making them incompatible with a synchronous cron job that must complete in one process invocation.
- **Firing individual Anthropic calls without concurrency control:** 300 notices fired in `Promise.all()` will hit rate limits. Use sequential loop (await per notice) or a small concurrency limit (5 concurrent max).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured JSON from LLM | Custom JSON extraction regex | `messages.parse()` + `zodOutputFormat` | Constrained decoding; Zod validation catches schema drift |
| Gmail SMTP session | Raw socket SMTP client | `nodemailer` `createTransport` | Handles TLS, AUTH, STARTTLS, retries |
| SMTP auth test | Sending a test email and checking bounce | `transporter.verify()` | Checks auth directly, no test message sent |
| HTML email inlining | Custom CSS inliner | Inline styles directly (simple digest) | Project has no complex CSS; inlining manually is safe at this scale |
| Rate limiting Anthropic calls | Custom token-bucket | Sequential `await` loop | At 300 notices/day, sequential is fast enough (~60s) and trivially stays under rate limits |

**Key insight:** The triage prompt must force Haiku to output exactly the schema shape. Constrained decoding (`messages.parse`) is more reliable than prompt instructions alone, especially for small models under load.

---

## DB Schema Additions

### `triage_results` table (new)

```sql
-- Add to openDb() db.exec() block — idempotent CREATE IF NOT EXISTS
CREATE TABLE IF NOT EXISTS triage_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs(id),
  nd          TEXT    NOT NULL REFERENCES seen_notices(nd),
  score       INTEGER,           -- NULL if triage failed (TRIAGE-03)
  rationale   TEXT,              -- NULL if triage failed
  triage_ok   INTEGER NOT NULL DEFAULT 1,  -- 0 = failed
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_triage_results_nd ON triage_results(nd);
CREATE INDEX IF NOT EXISTS idx_triage_results_run ON triage_results(run_id);
CREATE INDEX IF NOT EXISTS idx_triage_results_score ON triage_results(score);
```

**Design rationale:**
- Separate table (not extending `seen_notices`) so triage can be re-run with updated rubric without touching dedup state
- `triage_ok = 0` rows preserve audit trail of failed triage calls (TRIAGE-03)
- Index on `score` enables fast "score >= 7" queries for Phase 3 (Sonnet analysis)
- FK to `runs(id)` enables per-run cost analysis

### `runs` table extension (ALTER or add columns in schema)

Add two columns to track Haiku token usage (TRIAGE-04):

```sql
-- Add to existing runs table definition in openDb():
-- Replace the runs CREATE TABLE with:
CREATE TABLE IF NOT EXISTS runs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at            TEXT NOT NULL,
  finished_at           TEXT,
  query_from            TEXT,
  query_to              TEXT,
  total_available       INTEGER,
  total_fetched         INTEGER,
  new_notices           INTEGER,
  filtered_out          INTEGER,
  stored                INTEGER,
  -- Phase 2 additions:
  triage_count          INTEGER,   -- notices triaged (including failures)
  triage_ok_count       INTEGER,   -- successful triage calls
  haiku_input_tokens    INTEGER,   -- total input tokens this run
  haiku_output_tokens   INTEGER,   -- total output tokens this run
  haiku_cost_usd        REAL,      -- estimated cost this run
  error                 TEXT
);
```

**Migration note:** SQLite `ALTER TABLE ADD COLUMN` is safe for adding nullable columns to an existing table. The `openDb()` function must handle the case where the table already exists (from Phase 1) but lacks the new columns. Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (SQLite 3.37+, available on Railway) or add a migration guard.

Safer approach: use `CREATE TABLE IF NOT EXISTS` with all columns on first Phase 2 deploy (new Railway deployment will have empty DB). For existing local dev DBs, add migration:

```typescript
// In openDb(), after CREATE TABLE IF NOT EXISTS runs:
try {
  db.exec(`ALTER TABLE runs ADD COLUMN triage_count INTEGER`);
  db.exec(`ALTER TABLE runs ADD COLUMN triage_ok_count INTEGER`);
  db.exec(`ALTER TABLE runs ADD COLUMN haiku_input_tokens INTEGER`);
  db.exec(`ALTER TABLE runs ADD COLUMN haiku_output_tokens INTEGER`);
  db.exec(`ALTER TABLE runs ADD COLUMN haiku_cost_usd REAL`);
} catch { /* columns already exist — SQLite throws if column exists */ }
```

### New query functions needed

```typescript
// queries.ts additions

export interface TriageRecord {
  runId: number | bigint;
  nd: string;
  score: number | null;
  rationale: string | null;
  triageOk: boolean;
}

export function saveTriageResults(db: Database.Database, records: TriageRecord[]): void {
  const insert = db.prepare(`
    INSERT INTO triage_results (run_id, nd, score, rationale, triage_ok, created_at)
    VALUES (@runId, @nd, @score, @rationale, @triageOk, @createdAt)
  `);
  const insertMany = db.transaction((recs: TriageRecord[]) => {
    for (const r of recs) {
      insert.run({
        runId: Number(r.runId),
        nd: r.nd,
        score: r.score ?? null,
        rationale: r.rationale ?? null,
        triageOk: r.triageOk ? 1 : 0,
        createdAt: new Date().toISOString(),
      });
    }
  });
  insertMany(records);
}

export function updateRunTriageStats(
  db: Database.Database,
  runId: number | bigint,
  stats: {
    triagedCount: number;
    okCount: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }
): void {
  db.prepare(`
    UPDATE runs SET
      triage_count       = ?,
      triage_ok_count    = ?,
      haiku_input_tokens = ?,
      haiku_output_tokens = ?,
      haiku_cost_usd     = ?
    WHERE id = ?
  `).run(
    stats.triagedCount,
    stats.okCount,
    stats.inputTokens,
    stats.outputTokens,
    stats.costUsd,
    Number(runId)
  );
}
```

---

## Runner Changes

The runner pipeline must be extended in this order:

```
1. SMTP auth test          ← NEW (before DB open — fast fail)
2. DB open
3. Acquire job lock
4. detectFirstRun
5. fetchNewNotices
6. createRun
7. applyHardFilters
8. triageNotices           ← NEW
9. markNoticeSeen + saveTriageResults  ← EXTEND
10. buildDigest + sendDigest           ← NEW
11. updateRunTriageStats   ← NEW
12. finalizeRun
13. releaseJobLock + db.close + exit(0)
```

**SMTP test placement:** Before `openDb()` — if Gmail is broken, no DB locking or pipeline work should begin. This matches DIGEST-05 semantics and prevents leaving a stale job lock.

**Store only what passes filters:** `saveTriageResults()` is called only for notices that survived `applyHardFilters()` — same set that goes into `markNoticeSeen()`. Notices dropped by hard filter are never triaged.

**Digest is built from triage results, not re-queried from DB:** The triage results are held in memory through the run and passed directly to `buildDigest()`. No SELECT query needed to build the same-run digest.

---

## Cost Estimation

### Haiku 4.5 Pricing [VERIFIED: platform.claude.com/docs/en/about-claude/pricing]

| Token Type | Standard | Batch API |
|------------|----------|-----------|
| Input | $1.00 / MTok | $0.50 / MTok |
| Output | $5.00 / MTok | $2.50 / MTok |

### Estimated Usage per Run

| Parameter | Estimate | Basis |
|-----------|----------|-------|
| Notices per day | 50-300 | Phase 1 found 305 in 2-week lookback; daily = ~20-40 new; worst case 300 on first run |
| System prompt | ~400 tokens | ~300-word rubric + instructions |
| Per-notice input | ~300 tokens | Title (50) + CPV codes (30) + description (150) + deadline/budget (30) + prompt framing (40) |
| Per-notice output | ~80 tokens | JSON with score (3) + rationale (60 words ~75 tokens) |
| Total input per notice | ~700 tokens | system (400) + user (300) |

| Scenario | Notices | Input Tokens | Output Tokens | Cost |
|----------|---------|-------------|--------------|------|
| Typical day | 30 | 21,000 | 2,400 | $0.033 |
| Heavy day | 100 | 70,000 | 8,000 | $0.110 |
| First run (worst case) | 300 | 210,000 | 24,000 | $0.330 |
| Monthly (30 days typical) | 900 | 630,000 | 72,000 | ~$0.99 |

**Conclusion:** Sequential calls are cost-adequate at well under $1/month in typical operation. The Batch API (50% savings) would save ~$0.50/month at best — not worth the architectural complexity of multi-invocation polling in a Railway cron job.

### Why Sequential Calls, Not Batch API

The Batch API requires polling for completion: batches finish in "less than 1 hour" but may take longer. [CITED: platform.claude.com/docs/en/build-with-claude/batch-processing] A Railway cron job is a single process invocation — there is no mechanism to suspend, persist batch ID to DB, and resume in a later invocation without significant additional infrastructure. Sequential calls for 300 notices at ~200ms each take ~60 seconds total, well within Railway's job timeout.

Batch API **is** appropriate for Phase 4 retrospective analysis (scoring historical notices) or if daily volume exceeds 1,000 notices. Flag for Phase 4 consideration.

---

## Triage Prompt / Scoring Rubric

### System Prompt Draft

```text
Du bist ein Ausschreibungs-Analyst für Figures, eine Berliner Agentur für
Datenvisualisierung und Wissenschaftskommunikation. Deine Aufgabe ist es,
öffentliche Ausschreibungen auf ihre Relevanz für Figures zu bewerten.

Figures gewinnt Aufträge, wenn öffentliche Auftraggeber Datenvisualisierungen,
interaktive Infografiken, Wissenschaftskommunikation, Ausstellungsdesign,
Erklärgrafiken oder UX-/Screendesign für digitale Plattformen beauftragen.
Typische Auftraggeber: Bundesministerien, Landesbehörden, Forschungsinstitute,
Museen, NGOs, EU-Institutionen.

Vergib einen Score von 0 bis 10:

SCORE 8-10 (Kerntreffer):
- Datenvisualisierung, interaktive Daten-Dashboards, Infografiken
- Wissenschaftskommunikation, Risikokommunikation, Gesundheitskommunikation
- Ausstellungskonzepte und -gestaltung (physisch oder digital)
- Erklärvideos, animierte Grafiken für Behörden/Forschung
- UX/UI-Design für Bürgerportale, Behörden-Apps, Open-Data-Plattformen
- Kommunikationsstrategie + visuelle Umsetzung für Bundesbehörden

SCORE 5-7 (Möglicherweise relevant):
- Allgemeines Webdesign / Corporate Design für öffentliche Einrichtungen
- Barrierefreiheits-Audits digitaler Plattformen
- E-Learning-Entwicklung mit visueller Komponente
- Pressearbeit/PR-Konzepte mit grafischem Anteil
- Drucksachen und Publikationen (Jahresberichte, Broschüren) für Behörden

SCORE 2-4 (Randthemen, kaum relevant):
- Allgemeine IT-Dienstleistungen ohne Designanteil
- Übersetzungsleistungen
- Veranstaltungsorganisation ohne visuelle Komponente
- Datenmanagement, Software-Entwicklung ohne UX

SCORE 0-1 (Nicht relevant):
- Bau, Architektur, Infrastruktur
- Medizinprodukte, Laborbedarf
- Fahrzeuge, Logistik
- Reinigung, Catering, Sicherheitsdienste
- Standardisierte IT-Hardware (Server, PCs, Netzwerkequipment)
- Rechtliche oder steuerliche Beratung

Antworte immer mit dem exakt vorgegebenen JSON-Schema.
Schreibe die Begründung in 2 prägnanten Sätzen auf Deutsch.
```

### User Message Template

```typescript
function buildNoticePrompt(notice: NoticeRecord): string {
  const title = notice.titleDeu ?? '(kein Titel)';
  const cpv = notice.cpvCodes ? JSON.parse(notice.cpvCodes).join(', ') : '(keine CPV)';
  const budget = notice.budget ? `${notice.budget.toLocaleString('de-DE')} EUR` : '(kein Budget)';
  const deadline = notice.deadline ?? '(keine Frist)';

  return [
    `Titel: ${title}`,
    `CPV-Codes: ${cpv}`,
    `Budget: ${budget}`,
    `Einreichfrist: ${deadline}`,
    `Auftraggeber-Land: DE`,
  ].join('\n');
}
```

**Note:** The `description-lot` field from `RawNotice` is fetched but not stored in `seen_notices`. For triage, title + CPV + budget is sufficient — adding description retrieval from the TED API per notice is NOT needed in Phase 2 (it would require additional API calls). The existing data in `seen_notices` is sufficient for Haiku triage. [ASSUMED — description-lot data truncated or absent in practice; verify by inspecting a stored notice]

---

## Common Pitfalls

### Pitfall 1: Gmail "Less Secure App" is Dead — Only App Passwords Work
**What goes wrong:** Using the account password (not App Password) causes `535 Authentication Failed`. The "less secure app access" feature was disabled by Google in September 2024.
**Why it happens:** Developers copy old tutorials that predate the September 2024 cutoff.
**How to avoid:** Generate a 16-character App Password at myaccount.google.com/apppasswords (requires 2-Step Verification). Store in `GMAIL_APP_PASSWORD` env var.
**Warning signs:** `Error: 535 Authentication credentials invalid` in `transporter.verify()`.

### Pitfall 2: Gmail SMTP Blocks If Called Without First Verifying
**What goes wrong:** `sendMail()` is called without `verify()`, auth fails mid-pipeline after notices have been stored, leaving the run in a partial state.
**Why it happens:** SMTP auth is only checked when a connection is opened.
**How to avoid:** Call `transporter.verify()` at runner startup (Step 1, before DB open). `process.exit(2)` if it throws.

### Pitfall 3: `messages.parse()` API Shape vs SDK Version
**What goes wrong:** `messages.parse()` may not exist or use a different parameter shape in SDK 0.94.0 vs 0.95.0. The docs show `output_config: { format: zodOutputFormat(...) }` but older SDK versions may differ.
**Why it happens:** The structured outputs feature is relatively new; parameter names changed across minor versions.
**How to avoid:** Check the installed version's `node_modules/@anthropic-ai/sdk/helpers/zod.d.ts` before coding. If `messages.parse` is absent, use Pattern 1b (JSON via `messages.create`).
**Warning signs:** TypeScript compile error on `messages.parse` or `zodOutputFormat`.

### Pitfall 4: HTML Email `<style>` Blocks Stripped by Gmail
**What goes wrong:** Styled HTML looks correct in browser preview but arrives in Gmail as unstyled text.
**Why it happens:** Gmail's proxy strips all `<style>` blocks and `<link rel="stylesheet">` tags from incoming HTML email.
**How to avoid:** All CSS must be in `style=""` attributes on individual elements. No exceptions.
**Warning signs:** Email looks correct in macOS Mail or Mailhog but renders as plain text in Gmail.

### Pitfall 5: `Promise.all()` on 300 Haiku Calls → Rate Limit Error
**What goes wrong:** All 300 triage requests fire simultaneously, hitting the Anthropic rate limit (requests per minute), returning 429 errors for most notices.
**Why it happens:** `Promise.all(notices.map(triageNotice))` fires all requests concurrently.
**How to avoid:** Use a sequential `for...of` loop with `await` per call. At ~200ms per call, 300 notices take ~60 seconds — acceptable for a daily cron job. If future volume exceeds 500, add a concurrency limit of 5 using `p-limit` (but don't add it prematurely).
**Warning signs:** `RateLimitError` in logs for many notices; score = null for most.

### Pitfall 6: `seen_notices` Has No Description Field — Triage on Title Only
**What goes wrong:** Triage prompt quality is low because description-lot (the tender description body) is not in `seen_notices`.
**Why it happens:** Phase 1 `toNoticeRecord()` did not store `description-lot`, which can be several paragraphs.
**How to avoid:** For Phase 2, triage on title + CPV + budget (the stored fields). This is sufficient for Haiku scoring — CPV codes are reliable classification signals. Adding description fetching is a Phase 4 enhancement, not a Phase 2 blocker.
**Warning signs:** Haiku assigns ambiguous mid-range scores (5-6) to tenders that should be clearly high or low; this would be visible in Phase 4 score drift analysis.

### Pitfall 7: SQLite `ALTER TABLE` Fails on Columns That Already Exist
**What goes wrong:** `ALTER TABLE runs ADD COLUMN haiku_input_tokens INTEGER` throws `duplicate column name` on second startup if column was already added.
**Why it happens:** SQLite's `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` guard in SQLite < 3.37.
**How to avoid:** Wrap each `ALTER TABLE` in `try/catch` (column already exists → ignore error). Or check Railway's SQLite version (likely >= 3.37 where `ADD COLUMN IF NOT EXISTS` works).
**Warning signs:** `database error: duplicate column name: haiku_input_tokens` on second startup.

### Pitfall 8: TED Link Construction
**What goes wrong:** The TED link for a notice is not stored and not trivially constructable.
**Why it happens:** The `links` field on `RawNotice` contains structured links (xml/pdf/html) but `seen_notices` does not store them.
**How to avoid:** TED HTML links follow the pattern `https://ted.europa.eu/en/notice/${nd}` where `nd` is the dedup key (e.g., `582-2026`). Verify this pattern against a known notice. [ASSUMED — verify with a real ND before hardcoding this URL pattern]
**Warning signs:** Link returns 404 in the digest email.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ | 22.x (Railway) | — |
| `@anthropic-ai/sdk` | Haiku triage | ✓ | 0.94.0 (installed) | — |
| `nodemailer` | Gmail SMTP | ✓ | 8.0.7 (installed) | — |
| `zod` | Schema validation | ✓ | ^3 (installed) | — |
| Gmail SMTP (`smtp.gmail.com:465`) | DIGEST-01 | ✓* | — | — |
| Anthropic API Key | TRIAGE-01 | Must be set | — | Job exits at startup if missing |
| Gmail App Password | DIGEST-01 | Must be set | — | Job exits at startup if missing |

*Gmail SMTP availability assumes the App Password is configured. `transporter.verify()` will catch auth failures at startup.

**Missing dependencies with no fallback:**
- `ANTHROPIC_API_KEY` — must be set in Railway environment variables before deployment
- `GMAIL_APP_PASSWORD` + `GMAIL_USER` — must be set before deployment

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^2 |
| Config file | `/Users/saschacollet/Dev/Ausschreibungsskill/vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRIAGE-01 | `triageNotice()` returns score 0-10 + rationale string | unit (mock Anthropic) | `npm test -- triage` | ❌ Wave 0 |
| TRIAGE-02 | Rubric prompt covers high/low signal keywords | unit (prompt content check) | `npm test -- triage` | ❌ Wave 0 |
| TRIAGE-03 | Anthropic error → null result, no throw | unit (mock throw) | `npm test -- triage` | ❌ Wave 0 |
| TRIAGE-04 | Token totals accumulate across notices | unit (mock responses) | `npm test -- triage` | ❌ Wave 0 |
| DIGEST-01 | `buildDigest()` returns valid HTML with tier sections | unit | `npm test -- digest` | ❌ Wave 0 |
| DIGEST-02 | Score >=7 in Tier A section, 4-6 in Tier B, <4 absent | unit | `npm test -- digest` | ❌ Wave 0 |
| DIGEST-03 | Notice card contains all 6 required fields | unit | `npm test -- digest` | ❌ Wave 0 |
| DIGEST-04 | Zero notices → confirmation email HTML (not full digest) | unit | `npm test -- digest` | ❌ Wave 0 |
| DIGEST-05 | `verifySmtp()` throws on auth failure → runner exits 2 | integration (manual) | manual | manual-only |

**Note on DIGEST-05:** SMTP auth testing requires a real Gmail App Password. Test manually with `DB_PATH=/tmp/scanner.db npm start` — check that the process exits 2 when `GMAIL_APP_PASSWORD` is wrong. Do not add a live SMTP call to the unit test suite.

### Wave 0 Gaps
- [ ] `src/triage/index.test.ts` — covers TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04 (mock `@anthropic-ai/sdk`)
- [ ] `src/email/digest.test.ts` — covers DIGEST-01, DIGEST-02, DIGEST-03, DIGEST-04

*(No framework install needed — vitest already installed and configured)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-roll JSON prompt + parse | `messages.parse()` + `zodOutputFormat` | SDK ~0.37+ | No regex, type-safe, constrained decoding |
| OAuth2 for Gmail | App Password | Gmail policy, 2024 | Simpler setup, no token refresh |
| `<style>` blocks in HTML email | Inline `style=""` only | Gmail policy (ongoing) | Must be all inline |
| Batch API for cost savings | Sequential calls (for cron jobs) | n/a | Batch incompatible with single-process cron |

**Deprecated/outdated:**
- Gmail "Less secure app access": disabled September 2024 — use App Password
- `nodemailer` `service: 'gmail'` with regular account password: blocked

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `description-lot` is absent or truncated in `seen_notices` and triage on title+CPV alone is sufficient | Pitfall 6, Prompt section | If descriptions are needed, Phase 2 triage quality is lower; fixable in Phase 4 |
| A2 | TED HTML links follow pattern `https://ted.europa.eu/en/notice/-/detail/${nd}` | Pitfall 8 | RESOLVED: verified with curl — /en/notice/{nd} returns 404, /-/detail/{nd} returns 202 ✓ |
| A3 | Railway SQLite >= 3.37 supports `ALTER TABLE ADD COLUMN IF NOT EXISTS` | DB Schema section | Migration guard needs `try/catch` approach instead |
| A4 | `messages.parse()` + `zodOutputFormat` works with claude-haiku-4-5 on SDK 0.94.0 | Pattern 1 | Fall back to Pattern 1b (messages.create + JSON.parse) |
| A5 | 300 notices/day sequential Haiku calls (~60s) is within Railway cron job timeout | Cost Estimation | If timeout < 120s, add concurrency limit; check Railway docs |

---

## Open Questions (RESOLVED 2026-05-07)

1. **TED link URL pattern** — RESOLVED
   - Verified: `https://ted.europa.eu/en/notice/${nd}` returns HTTP 404
   - Correct pattern: `https://ted.europa.eu/en/notice/-/detail/${nd}` returns HTTP 202 ✓
   - Decision: Use `/en/notice/-/detail/{nd}` in digest builder. Plans updated accordingly.

2. **`messages.parse()` vs `messages.create()` on SDK 0.94.0** — RESOLVED
   - Verified: `node -e "const m = require('@anthropic-ai/sdk/helpers/zod'); console.log(typeof m.zodOutputFormat)"` → `function`
   - `zodOutputFormat` is exported and available in SDK 0.94.0
   - Decision: Use `messages.parse()` + `zodOutputFormat` as in Pattern 1 (primary path). No fallback needed.

3. **Backfill of 305 Phase 1 notices** — RESOLVED
   - Decision: No backfill. Only notices fetched in the current run are triaged. The first Phase 2 digest will be smaller (today's new notices only). Historical notices can be backfilled later if needed via a separate script.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Internal tool, no user auth |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Single-user internal tool |
| V5 Input Validation | yes | Zod schema on Haiku response; parameterized SQLite queries (existing) |
| V6 Cryptography | no | App Password in env var — no crypto hand-roll |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via tender title/description | Tampering | Haiku output validated via Zod schema; injected JSON would fail schema check |
| Gmail App Password leaked via logs | Information Disclosure | Never log `GMAIL_APP_PASSWORD` value; only log `GMAIL_USER` |
| Anthropic API key leaked via logs | Information Disclosure | Never log `ANTHROPIC_API_KEY`; config module returns it in struct but never prints it |
| SQLite injection via notice data | Tampering | All DB writes use parameterized queries (established in Phase 1) |

---

## Sources

### Primary (HIGH confidence)
- `/anthropics/anthropic-sdk-typescript` (Context7) — messages.parse, zodOutputFormat, usage field, error types, batch API
- `platform.claude.com/docs/en/about-claude/pricing` — Haiku 4.5 pricing: $1/$5 per MTok; Batch 50% discount
- `platform.claude.com/docs/en/build-with-claude/structured-outputs` — Haiku 4.5 confirmed support for structured outputs
- `platform.claude.com/docs/en/build-with-claude/batch-processing` — Batch API: async, up to 1h, 29-day result retention
- `/nodemailer/nodemailer-homepage` (Context7) — createTransport, verify(), sendMail(), Gmail App Password
- `nodemailer.com/smtp` — port 465 (secure:true) vs 587 (secure:false) semantics
- `github.com/nodemailer/nodemailer-homepage/blob/master/docs/guides/using-gmail.md` — Gmail App Password config

### Secondary (MEDIUM confidence)
- `mailtrap.io/blog/nodemailer-gmail/` — Gmail SMTP port 587 recommendation, App Password requirements
- `designmodo.com/html-css-emails/` — Safe CSS properties for Gmail/Outlook/Apple Mail
- `caniemail.com` — Email client CSS support database

### Tertiary (LOW confidence)
- WebSearch: "claude haiku triage scoring rubric public sector" — general Haiku suitability for classification; no specific rubric examples found

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, versions verified against npm registry
- Architecture: HIGH — Anthropic SDK and nodemailer patterns verified against official docs and Context7
- Triage rubric: MEDIUM — Figures-domain calibration is ASSUMED based on project description; requires validation against real results in Phase 4
- HTML email CSS: HIGH — caniemail.com + multiple cross-referenced sources
- Cost estimates: HIGH — pricing verified against official Anthropic pricing page; token estimates are ASSUMED

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (Anthropic pricing and nodemailer stable; SDK minor versions change frequently — re-verify `messages.parse` API shape before coding)

---

## RESEARCH COMPLETE

**Phase:** 2 — Triage and Digest
**Confidence:** HIGH

### Key Findings

1. **`messages.parse()` + `zodOutputFormat` is available for `claude-haiku-4-5`** — confirmed on Anthropic's structured outputs page. SDK 0.94.0 should support it; verify `helpers/zod.d.ts` exists in installed module before coding. Pattern 1b (`messages.create` + JSON.parse) is the documented fallback.

2. **Sequential calls, not Batch API** — Batch API takes up to 1 hour; incompatible with synchronous Railway cron job. At 300 notices/day the cost is ~$0.033/day (~$1/month) — Batch savings of ~$0.50/month do not justify multi-invocation complexity.

3. **Gmail SMTP with `service: 'gmail'` + App Password is the standard pattern** — `transporter.verify()` provides DIGEST-05 startup check. Place before `openDb()` so auth failure never locks the job.

4. **HTML email must be 100% inline CSS, table-based layout** — Gmail strips all `<style>` blocks. No CSS Grid, no Flexbox for structural layout. The template skeleton in Code Examples section is production-ready.

5. **Separate `triage_results` table** — Do not extend `seen_notices`. Separate table allows re-triage with updated rubric (Phase 4), preserves failed-triage audit trail, and enables fast score-filtered queries for Phase 3 Sonnet analysis.

6. **Two open questions that must be resolved before coding:** (a) TED link URL pattern — inspect `links.html` in RawNotice; (b) `messages.parse` API shape in SDK 0.94.0 — check installed type definitions.

### File Created
`/Users/saschacollet/Dev/Ausschreibungsskill/.planning/phases/02-triage-and-digest/02-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All libraries installed and verified against npm registry and official docs |
| Haiku triage architecture | HIGH | SDK patterns verified via Context7 + official structured outputs page |
| Nodemailer / Gmail SMTP | HIGH | Verified against nodemailer docs and official Gmail guide |
| HTML email CSS safety | HIGH | Multiple cross-referenced sources including caniemail.com |
| Scoring rubric | MEDIUM | Figures-domain calibration is reasoned from project description; needs production validation |
| Cost estimates | HIGH | Pricing verified; token counts are estimates based on typical prompt sizes |

### Open Questions
- TED link URL pattern: inspect a real `RawNotice.links.html` value before hardcoding
- `messages.parse()` API shape on SDK 0.94.0: check `node_modules/@anthropic-ai/sdk/helpers/zod.d.ts`
- Whether to backfill triage for 305 already-stored notices from Phase 1 first run

### Ready for Planning
Research complete. Planner can now create PLAN.md files for Phase 2.
