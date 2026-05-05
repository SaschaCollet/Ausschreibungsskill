# Architecture Patterns

**Domain:** Automated EU tender scanner (API polling + LLM triage pipeline)
**Project:** Ausschreibungs-Scanner for Figures
**Researched:** 2026-05-04
**Confidence:** HIGH (Railway constraints from official docs; Anthropic SDK from Context7; patterns from established pipeline architecture)

---

## Recommended Architecture

A single-process, sequential pipeline that runs as a Railway cron job. No queues, no workers, no async hand-offs between phases — the entire pipeline executes top-to-bottom and exits cleanly. This matches Railway's execution model: the process must terminate on completion or subsequent cron runs are skipped.

```
┌─────────────────────────────────────────────────────────────────┐
│  Railway Cron Job (daily, UTC)                                  │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Fetcher │───▶│  Filter  │───▶│  Triage  │───▶│Notifier  │  │
│  │          │    │          │    │(Haiku)   │    │(Digest + │  │
│  │ TED API  │    │ CPV/rule │    │          │    │ Analysis)│  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│        │                                │              │        │
│        ▼                                ▼              ▼        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   SQLite (state.db)                     │   │
│  │  seen_ids | tender_scores | analysis_results | runs     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Input | Output | Communicates With |
|-----------|---------------|-------|--------|-------------------|
| **Fetcher** | Poll TED API v3, deduplicate against seen IDs | CPV codes, date window | Raw tender objects (new only) | TED REST API, SQLite (read seen_ids) |
| **Filter** | Apply hard rules before any LLM call | Raw tender objects | Filtered tender list | Nothing external |
| **Triage** | Score each tender 0–10 with Haiku, one call per tender | Filtered tender list | Scored tender list | Anthropic API (Haiku) |
| **Analyser** | Full analysis with Sonnet for score ≥ 7 | High-score tenders | Structured analysis text | Anthropic API (Sonnet) |
| **Notifier** | Build and send email digest | All scored tenders + analyses | Sent email | Gmail SMTP (Nodemailer) |
| **State** | Persist seen IDs, scores, run history | — | — | SQLite via better-sqlite3 |
| **Runner** | Orchestrate the pipeline, handle top-level errors, exit cleanly | — | Exit code 0 or 1 | All components |

The Filter is pure in-process logic — no I/O. Keep it that way. It is the cheapest gate and should run before any network call to an LLM.

---

## Data Flow (Step by Step)

```
1. Runner starts
   └── State: open SQLite, run WAL pragma

2. Fetcher
   ├── Query TED API v3: /notices/search, filter by CPV codes + publishedDate >= yesterday
   ├── For each result: check seen_ids table
   └── Return only unseen tender objects (raw API response)

3. Filter (pure, synchronous)
   ├── Drop if: estimated value < threshold OR > threshold (if budget filter applies)
   ├── Drop if: deadline < today + minimum lead time (e.g. 14 days)
   ├── Drop if: country not in allowed list (optional)
   └── Return filtered list

4. State: insert all filtered IDs into seen_ids (even those that will be dropped by score)
   └── Reason: prevents re-fetching next day if they somehow reappear

5. Triage (Claude Haiku, sequential per tender)
   ├── For each tender: build prompt with title + description + CPV + budget
   ├── Call Anthropic messages.create with haiku model
   ├── Parse score (0–10) and two-sentence rationale from response
   ├── Persist score + rationale to tender_scores table
   └── Return list sorted by score descending

6. Branching by score:
   ├── score ≥ 7  → queue for full analysis (Analyser)
   ├── score 4–6  → include in digest, no analysis
   └── score < 4  → discard (do not appear in email)

7. Analyser (Claude Sonnet, sequential per high-score tender)
   ├── For each tender with score ≥ 7: call Sonnet with full analysis prompt
   ├── Persist analysis text to analysis_results table
   └── Return analysis keyed by tender ID

8. Notifier
   ├── Build HTML email: header + score ≥ 7 section (with analysis) + score 4–6 section
   ├── Send via Nodemailer / Gmail SMTP
   └── Persist run metadata (timestamp, tender count, email status) to runs table

9. Runner: close DB, process.exit(0)
```

---

## Component Interfaces (TypeScript)

```typescript
// Core domain types
interface Tender {
  id: string;            // TED notice ID (stable dedup key)
  title: string;
  description: string;
  cpvCodes: string[];
  estimatedValue?: number;
  currency?: string;
  deadline?: Date;
  country: string;
  url: string;
  publishedAt: Date;
}

interface ScoredTender extends Tender {
  score: number;         // 0–10
  rationale: string;     // Two-sentence Haiku output
}

interface AnalysedTender extends ScoredTender {
  analysis: string;      // Full Sonnet analysis text
}

// Component contracts
type Fetcher   = () => Promise<Tender[]>;
type Filter    = (tenders: Tender[]) => Tender[];
type Triage    = (tenders: Tender[]) => Promise<ScoredTender[]>;
type Analyser  = (tenders: ScoredTender[]) => Promise<AnalysedTender[]>;
type Notifier  = (scored: ScoredTender[], analysed: AnalysedTender[]) => Promise<void>;
```

These interfaces enforce the boundary contract. Each component is a function — no classes needed, no shared mutable state outside the DB.

---

## State Management: What Needs to Persist

SQLite is the right choice (one file, no server, survives Railway deployments if mounted on a volume). Use `better-sqlite3` (synchronous API, fastest SQLite driver for Node.js).

```sql
-- Run WAL mode once on open
PRAGMA journal_mode = WAL;

-- Deduplication: every tender we have ever seen (regardless of score)
CREATE TABLE IF NOT EXISTS seen_ids (
  ted_id      TEXT PRIMARY KEY,
  first_seen  TEXT NOT NULL  -- ISO8601
);

-- Triage results (score + rationale)
CREATE TABLE IF NOT EXISTS tender_scores (
  ted_id     TEXT PRIMARY KEY,
  score      INTEGER NOT NULL,
  rationale  TEXT NOT NULL,
  scored_at  TEXT NOT NULL
);

-- Full analysis results (Sonnet output)
CREATE TABLE IF NOT EXISTS analysis_results (
  ted_id      TEXT PRIMARY KEY,
  analysis    TEXT NOT NULL,
  analysed_at TEXT NOT NULL
);

-- Run audit log
CREATE TABLE IF NOT EXISTS runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  fetched      INTEGER,
  filtered     INTEGER,
  scored       INTEGER,
  emailed      INTEGER,
  error        TEXT        -- NULL if clean run
);
```

**Railway volume note:** SQLite must be stored on a Railway persistent volume, not in the container filesystem (which is ephemeral — wiped on each deployment). Mount the volume at `/data` and set `DB_PATH=/data/state.db`.

What persists: `seen_ids` is the critical table. Without it the pipeline re-scores every tender every day and hammers the Haiku budget. `tender_scores` and `analysis_results` are nice-to-have audit trails. `runs` enables alerting on consecutive failures.

---

## Railway Cron Constraints and Implications

Source: Railway official docs (via Context7, confidence HIGH)

**Critical behaviour:** If a previous cron execution is still running (status `Active`) when the next scheduled run fires, Railway **skips** the new execution entirely. It does not queue it.

**Implications for this pipeline:**

1. The process MUST exit cleanly. Close the SQLite connection explicitly before exiting. If `process.exit()` is called before DB close, WAL data may not be checkpointed.

2. There is no hard execution time limit enforced by Railway for cron jobs. The limit is practical: if Haiku calls take ~1s each and there are 50 new tenders on a given day, triage alone takes ~50s. Sonnet calls for 5 high-scorers at ~10s each add ~50s. Total: under 5 minutes, well within safe range for a daily job.

3. Minimum cron frequency is 5 minutes. Daily (`0 8 * * *` UTC) is fine.

4. Memory: Railway's default is 512MB RAM for hobby tier. This pipeline processes tenders sequentially (never holds all LLM responses in memory simultaneously). Peak memory is ~50–100MB for a normal run.

5. The `cronSchedule` goes in `railway.json` or via the dashboard, not in the application code. No `node-cron` or similar library is needed — Railway IS the scheduler.

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "cronSchedule": "0 7 * * *",
    "startCommand": "node dist/runner.js"
  }
}
```

---

## Error Handling Patterns

### TED API failures

```typescript
// Pattern: retry with exponential backoff, hard timeout, partial result acceptable
async function fetchWithRetry(url: string, opts: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000); // 30s timeout
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status === 429) {
        await sleep(2 ** attempt * 1000); // backoff on rate limit
        continue;
      }
      throw new Error(`TED API ${res.status}`);
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep(2 ** attempt * 1000);
    }
  }
  throw new Error('Exhausted retries');
}
```

If the TED API is completely down: catch at the Runner level, log error to `runs.error`, send a brief failure notification email, exit cleanly. The next daily run will pick up from where deduplication left off (tenders from a missed day will appear the following day if TED backdates, or be missed — acceptable for v1).

### Claude API failures (Haiku/Sonnet)

The Anthropic TypeScript SDK provides automatic retries (2 by default) with exponential backoff on rate limits and transient errors. Configure explicitly:

```typescript
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 60_000, // 60s per request
});
```

If Haiku triage fails for a specific tender: catch the error, log it, assign a sentinel score of `-1` (meaning "triage failed"), skip that tender from the digest. Do not abort the whole pipeline.

If Sonnet analysis fails for a high-score tender: include the tender in the digest with its triage score and rationale, but without the full analysis. Note "Analysis unavailable" inline.

If the entire Claude API is down: fall back to sending the digest with triage scores only (populated from Haiku calls that succeeded before the outage). This is always better than sending nothing.

### Email sending failures

Wrap the Nodemailer call. If it fails: log the rendered HTML to a file (`/data/digest-YYYY-MM-DD.html`) so the content is not lost, write error to `runs.error`, exit with code 1. Railway does not retry on non-zero exit for cron jobs, so this approach is "best effort with evidence preservation."

### Concurrency / overlapping runs

Because Railway skips overlapping cron executions, the application does not need its own advisory lock. However, if you ever run the job manually while the cron is active, use an advisory lock via SQLite:

```typescript
// Optimistic lock at pipeline start
const lock = db.prepare('INSERT INTO runs (started_at) VALUES (?)').run(new Date().toISOString());
// On clean exit: UPDATE runs SET finished_at = ? WHERE id = ?
// On error:      UPDATE runs SET error = ? WHERE id = ?
```

---

## Full Analysis Trigger: Sync, Same Job

**Decision: synchronous, within the same cron execution.**

Async hand-off (e.g., writing high-score IDs to a queue and processing them in a separate Railway job) adds significant complexity: a second service, inter-service state sharing, and a dependency on Railway's persistent volume being accessible to two services simultaneously.

The numbers do not justify it. In a realistic daily run:
- Expected new tenders per day in scope: 5–30
- Expected score ≥ 7: 1–5
- Sonnet analysis time: ~10–20s each
- Worst case: 5 × 20s = 100s for all analyses

100 seconds of Sonnet calls is perfectly fine within a single cron execution. If this assumption ever breaks (e.g. 20+ high-score tenders per day), reconsider — but do not over-engineer for a problem that does not yet exist.

The Batch Messages API (async Anthropic feature) is NOT appropriate here either: it can take up to 24 hours to complete, which defeats the purpose of a daily digest.

---

## File and Folder Structure

```
ausschreibungs-scanner/
├── src/
│   ├── runner.ts              # Entry point: orchestrates pipeline, handles exit
│   ├── config.ts              # Env var validation (API keys, CPV codes, thresholds)
│   │
│   ├── fetcher/
│   │   ├── index.ts           # fetchNewTenders(): calls TED API, deduplicates
│   │   ├── ted-client.ts      # TED API v3 HTTP client (auth, pagination, retry)
│   │   └── types.ts           # Raw TED API response types
│   │
│   ├── filter/
│   │   └── index.ts           # applyHardFilters(): pure function, no I/O
│   │
│   ├── triage/
│   │   ├── index.ts           # triageTenders(): loops, calls Haiku, returns scored list
│   │   └── prompt.ts          # Haiku prompt template
│   │
│   ├── analyser/
│   │   ├── index.ts           # analyseTenders(): calls Sonnet for score ≥ 7
│   │   └── prompt.ts          # Sonnet analysis prompt template
│   │
│   ├── notifier/
│   │   ├── index.ts           # sendDigest(): builds and sends email
│   │   └── template.ts        # HTML email template builder
│   │
│   └── db/
│       ├── index.ts           # Open DB, run migrations, export db instance
│       ├── migrations.sql     # CREATE TABLE IF NOT EXISTS statements
│       └── queries.ts         # Typed query functions (getSeenIds, insertScore, etc.)
│
├── data/                      # Mounted Railway volume (gitignored)
│   └── state.db               # SQLite database (runtime only)
│
├── railway.json               # Cron schedule + start command
├── .env.example               # Template for required env vars
├── package.json
├── tsconfig.json
└── Dockerfile                 # Optional: if Railway can't detect Node/TS automatically
```

**Why this structure:**
- One folder per component = one import boundary. The Runner imports each component once, composes them, and nothing else crosses folder boundaries.
- `db/queries.ts` is the only place that touches SQL. Components receive typed objects, not raw DB handles.
- `config.ts` validates all env vars at startup and throws early — never discover a missing API key mid-pipeline.
- Prompts in separate files: easy to iterate on without touching business logic.

---

## Build Order (Component Dependencies)

Build in this order. Each layer is fully testable before the next depends on it.

```
Layer 1 — No external dependencies
  db/         (SQLite schema and query functions)
  config.ts   (env var validation)
  filter/     (pure function, no I/O)

Layer 2 — External I/O, no LLM
  fetcher/    (depends on db/ for seen_ids)

Layer 3 — LLM calls
  triage/     (depends on fetcher output shape)
  analyser/   (depends on triage output shape)

Layer 4 — Notification
  notifier/   (depends on triage + analyser output)

Layer 5 — Orchestration
  runner.ts   (depends on all of the above)
```

**Rationale for this order:**
- Build the DB and filter first so you have a working dedup layer before touching external APIs.
- Build the fetcher second so you can run it once against TED and inspect real data before writing prompts.
- Build triage before analyser because the score threshold logic must be validated on real tender data.
- Build notifier before runner so the email format is validated before the full pipeline runs end-to-end.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Async Queue for Full Analysis
**What:** Write high-score IDs to a file/queue, trigger a second Railway service to process them.
**Why bad:** Adds a second service, shared-volume access between services, retry complexity, and delayed email. The numbers do not justify it.
**Instead:** Do it synchronously in the same job. Revisit only if Sonnet analysis takes > 5 minutes per run.

### Anti-Pattern 2: Holding All API Responses in Memory
**What:** Fetch all TED results into a single array, then pass the entire array through each stage.
**Why bad:** For 200+ results this is fine, but it makes streaming/partial failures harder.
**Instead:** Process in small batches (e.g. 10 at a time through Haiku) so a crash partway through still logs partial scores to the DB.

### Anti-Pattern 3: Re-Processing Seen Tenders
**What:** Skipping `seen_ids` check and letting the filter/score logic handle duplicates.
**Why bad:** Every duplicate that reaches Haiku costs money. The CPV codes for design/communication return dozens of results daily, many of which appeared in previous days.
**Instead:** Deduplicate via `seen_ids` in the Fetcher, before any filtering or LLM call.

### Anti-Pattern 4: Storing SQLite in the Container Filesystem
**What:** Writing `state.db` to the project directory without a Railway volume.
**Why bad:** The container filesystem is ephemeral. Each Railway deployment wipes it. You lose all `seen_ids` and re-process everything from scratch.
**Instead:** Mount a Railway persistent volume at `/data`, set `DB_PATH=/data/state.db` in env vars.

### Anti-Pattern 5: Logging to stdout Only
**What:** Relying on Railway's log viewer to see what happened.
**Why bad:** Railway logs are capped and rotate. A pipeline that ran fine 3 days ago leaves no trace.
**Instead:** Write run metadata (tender counts, errors) to the `runs` table in SQLite. This gives you a queryable audit trail that persists as long as the volume does.

---

## Scalability Notes

This architecture handles the current scope (daily, one CPV cluster, one agency). If scope expands:

| Concern | Now | At 5 agencies / 10 CPV clusters |
|---------|-----|----------------------------------|
| Triage API cost | Haiku, ~$0.01/run | Still Haiku, add configurable agency profile per prompt |
| Execution time | < 5 min | Parallelize Haiku calls with `Promise.all` (within Anthropic rate limits) |
| Multi-tenant | Not needed | Add `agency_id` column to all DB tables, run one pipeline loop per agency config |
| Data sources | TED only | Fetcher abstraction (`Fetcher` type) already supports multiple sources |

Do not build for these scenarios now. The interface contracts make the evolution straightforward when needed.

---

## Sources

- Railway cron job behaviour (exit requirement, skip-on-overlap): https://docs.railway.com/cron-jobs (via Context7 `/railwayapp/docs`, HIGH confidence)
- Railway `cronSchedule` config-as-code: https://railway.com/railway.schema.json reference (via Context7, HIGH confidence)
- `better-sqlite3` WAL mode and transactions: https://github.com/wiselibs/better-sqlite3/blob/master/docs/performance.md (via Context7, HIGH confidence)
- Anthropic TypeScript SDK error handling and retries: https://context7.com/anthropics/anthropic-sdk-typescript (via Context7, HIGH confidence)
- Anthropic Message Batches API (async, up to 24h): https://github.com/anthropics/anthropic-sdk-typescript/blob/main/api.md (via Context7, HIGH confidence)
- Nodemailer Gmail App Password auth: https://github.com/nodemailer/nodemailer-homepage/blob/master/docs/guides/using-gmail.md (via Context7, HIGH confidence)
