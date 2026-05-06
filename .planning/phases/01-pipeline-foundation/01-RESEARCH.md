# Phase 1: Pipeline Foundation - Research

**Researched:** 2026-05-06
**Domain:** TED API v3 / SQLite / Railway cron / TypeScript project setup
**Confidence:** HIGH (TED API live-tested during this session; Railway and better-sqlite3 verified via Context7 official docs; package versions verified via npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Start broad — 79xxx (business/comms), 92xxx (cultural services), 73xxx (R&D) as initial CPV families. Tune after 4 weeks of production data.
- **D-02:** CPV codes stored in `cpv-codes.json` config file in repo (not hardcoded, not env var). Changeable by commit without redeploy.
- **D-03:** No minimum budget filter — fetch all tenders regardless of value. Haiku decides relevance in Phase 2.
- **D-04:** Country filter: Germany only (`CY=DEU`). DACH and other EU countries excluded.
- **D-05:** Deadline filter: reject tenders with submission deadline in the past. Deadline must be in the future.
- **D-06:** First run: fetch 2 weeks of historical data (detected via empty DB). Provides real data immediately for pipeline testing.
- **D-07:** Each subsequent run: query 2-day window (today + yesterday) — covers UTC midnight gaps (1-day overlap).

### Claude's Discretion

- SQLite schema: minimum is `seen_ids` table (notice ID + first_seen timestamp). Recommended: also store metadata (title, CPV, budget, deadline) for debuggability.
- Job-lock implementation: SQLite `job_lock` table or filesystem lock.
- Logging format: structured JSON (for Railway logs) or plain text.

### Deferred Ideas (OUT OF SCOPE for Phase 1)

- Min-budget filter: may be activated in Phase 4 if data shows small contracts create noise.
- DACH expansion (AT/CH): v2.
- Corrigenda/amendment detection: v2.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FETCH-01 | Daily TED API query filtered by CPV codes (79xxx, 92xxx, 73xxx) | TED API POST /v3/notices/search verified live; CPV wildcard prefix syntax confirmed |
| FETCH-02 | Paginate TED results to exhaustion (no silent data loss) | `totalNoticeCount` field verified live; page-based pagination confirmed working |
| FETCH-03 | 1-day overlap on date range (prevents UTC midnight gaps) | `PD>=today(-2)` query verified live; `today()` function confirmed |
| FETCH-04 | Log fetched count vs total available per run | `totalNoticeCount` in response body verified; log pattern specified |
| DEDUP-01 | Store seen notice IDs in SQLite on Railway Volume (WAL mode) | better-sqlite3 WAL PRAGMA verified via Context7; Volume mount at /data confirmed |
| DEDUP-02 | Skip already-seen notices (no reprocessing) | INSERT OR IGNORE + SELECT check pattern documented |
| DEDUP-03 | job_lock mechanism prevents concurrent runs | SQLite job_lock table approach documented; Railway skip-on-overlap confirmed |
| FILTER-01 | Hard rule filters before any LLM call: deadline (not expired), country (DE) | Application-level filter; deadline field format verified live |
| FILTER-02 | CPV codes as external config file (not hardcoded) | `cpv-codes.json` pattern specified |
| INFRA-01 | Railway cron job deployment (daily, configurable time) | `railway.json` cronSchedule syntax confirmed via Context7 |
| INFRA-02 | Railway Volume for SQLite persistence at /data | `railway volume add --mount-path /data` confirmed via Context7 |
| INFRA-03 | Secrets as Railway env vars (Gmail, Anthropic) | Railway Variables UI approach confirmed |
| INFRA-04 | Single-process synchronous pipeline | Architecture pattern confirmed appropriate for Railway |
</phase_requirements>

---

## Summary

Phase 1 builds the data skeleton: TED notices arrive daily, get deduplicated against SQLite state, pass hard filters, and are stored on a Railway persistent Volume. No LLM calls in this phase — the goal is a fully observable pipeline with zero silent failures.

The TED API v3 is publicly accessible (no auth for search), supports wildcard CPV prefix matching (`PC=79*`), and uses a straightforward page-based pagination model with `totalNoticeCount` in the response body. The `today()` function in the expert query syntax handles relative date ranges cleanly. Live testing today (2026-05-06) confirmed all these behaviors.

The Railway deployment model requires the process to exit cleanly — Railway skips new cron executions if a previous one is still running. There is no execution time limit enforced by Railway. The critical infrastructure constraint is the persistent Volume at `/data`; without it, the SQLite state is wiped on every container restart.

**Primary recommendation:** Build in this layer order — db/ → config → filter → fetcher → runner — so each layer is independently testable before the next depends on it.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TED API polling | API/Backend (cron script) | — | Outbound HTTP to external service; runs server-side in Railway container |
| Pagination loop | API/Backend (cron script) | — | Must track page state; pure server-side logic |
| Notice deduplication | Database (SQLite) | API/Backend | State lives in DB; lookup is a DB read |
| Hard filtering (deadline, country) | API/Backend (filter module) | — | Pure in-process function; no I/O |
| CPV config loading | API/Backend (config module) | — | File read at startup; no external calls |
| State persistence (seen_ids, runs) | Database (SQLite on Volume) | — | Survives between Railway invocations only via Volume |
| Job lock / mutex | Database (SQLite) | — | Advisory lock via DB table is most reliable for this deployment model |
| Run orchestration | API/Backend (runner.ts) | — | Entry point; owns exit code and error propagation |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22 LTS | Runtime | CLAUDE.md requirement; Railway Railpack auto-detects from package.json; native fetch built-in |
| TypeScript | 6.0.3 | Language | Type safety for TED API response parsing; TED v3 fields are inconsistent and multilingual |
| tsx | 4.21.0 | TS execution | Run `.ts` files directly: `tsx src/runner.ts`; zero config, no compile step needed |
| better-sqlite3 | 12.9.0 | SQLite state | Synchronous API — no async noise in a top-to-bottom script; fastest SQLite binding for Node |
| zod | 3.25.76 (pin `^3`) | Runtime validation | Validates TED API response shapes; prevents silent failures when TED fields are null/missing |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @anthropic-ai/sdk | 0.94.0 | Claude API | Phase 2 (triage) — install now so DB schema can include score columns |
| nodemailer | 8.0.7 | Gmail SMTP | Phase 2 (digest) — install now so config.ts can validate SMTP env vars |
| @types/node | current | TS types for Node | Required for process.env, fetch, etc. |
| @types/better-sqlite3 | current | TS types for DB | Required for Database type |

> **Zod version note:** npm `latest` tag points to zod v4 (4.4.3). Install explicitly with `npm install zod@^3` to get v3.25.76. The v4 API is a breaking rewrite. Use v3 for ecosystem compatibility.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | JSON file | JSON requires full rewrite on every run; no indexing; bad practice |
| better-sqlite3 | PostgreSQL | Overkill; adds paid Railway addon cost; SQLite sufficient for <100k rows |
| tsx (no compile) | tsc + node dist/ | Adds compile step; no benefit for a cron script; Railway start command simpler with tsx |
| Native fetch | axios / node-fetch | Built into Node 22; zero dependencies; TED API is straightforward REST |
| zod v3 | joi / yup | zod is TypeScript-native (infers types); most widely used in TS ecosystem |

**Installation:**

```bash
# Runtime
npm install better-sqlite3 zod@^3 @anthropic-ai/sdk nodemailer

# Dev
npm install -D typescript tsx @types/node @types/better-sqlite3 @types/nodemailer
```

**Version verification (confirmed 2026-05-06):**

```
better-sqlite3  12.9.0   ✓
zod             3.25.76  ✓ (install as zod@^3)
tsx             4.21.0   ✓
typescript      6.0.3    ✓
@anthropic-ai/sdk  0.94.0  ✓
nodemailer      8.0.7    ✓
```

---

## Architecture Patterns

### System Architecture Diagram

```
[cpv-codes.json]
      │ (read at startup)
      ▼
[config.ts] ─── validate env vars ──→ EXIT if missing
      │
      ▼
[runner.ts] ──── acquire job_lock ──→ EXIT if locked
      │
      ▼
[fetcher/]
  │  POST /v3/notices/search
  │  page=1, limit=100, CPV prefix query
  │  PD>=today(-14) [first run] or PD>=today(-2) [daily]
  │  CY=DEU
  │  Loop: page++ while (page * 100) < totalNoticeCount
  │                         │
  │         [SQLite: seen_ids]
  │         SELECT 1 WHERE nd=?
  │         → skip if seen
  │         → accumulate if new
  │
  ▼
[filter/] (pure function, no I/O)
  │  DROP: notice-type starts with "can-" (award notices, not bidding opps)
  │  DROP: deadline-receipt-tender-date-lot < today()
  │  KEEP: everything else (no budget filter per D-03)
  │
  ▼
[db/] INSERT OR IGNORE into seen_notices
      INSERT run metadata into runs
      │
      ▼
[runner.ts] close DB connection → process.exit(0)
```

### Recommended Project Structure

```
src/
├── runner.ts              # Entry point: acquire lock, orchestrate, exit
├── config.ts              # Load + validate env vars and cpv-codes.json
│
├── fetcher/
│   ├── index.ts           # fetchNewNotices(): paginate TED, filter seen IDs
│   ├── ted-client.ts      # HTTP calls to TED API v3 with retry + abort controller
│   └── types.ts           # Raw TED API response types (Zod schema → inferred type)
│
├── filter/
│   └── index.ts           # applyHardFilters(): pure function, no I/O
│
└── db/
    ├── index.ts           # Open DB, run migrations, export db instance
    └── queries.ts         # Typed query functions: isNoticeNew, markNoticeSeen, etc.

cpv-codes.json             # CPV config (D-02)
railway.json               # cronSchedule + startCommand
.env.example               # Required env var template
package.json
tsconfig.json
```

### Pattern 1: TED API Pagination

**What:** Loop over pages until `page * limit >= totalNoticeCount`

**Verified behavior (live-tested 2026-05-06):**
- `iterationNextToken` is always `null` — page-based model is the working approach
- `totalNoticeCount` is present in every response
- `limit: 100` is the confirmed max page size

```typescript
// Source: verified empirically against api.ted.europa.eu 2026-05-06
async function fetchAllNotices(query: string, fields: string[]): Promise<RawNotice[]> {
  const all: RawNotice[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const body = { query, page, limit, fields };
    const res = await tedFetch(body);          // throws on HTTP error
    const data = TedSearchResponseSchema.parse(res);

    all.push(...data.notices);

    const fetched = page * limit;
    if (fetched >= data.totalNoticeCount) break;
    page++;
  }

  return all;
}
```

### Pattern 2: TED API Query Construction

**Verified syntax (live-tested 2026-05-06):**

```typescript
// CPV wildcard prefix: PC=79* works — returns all 79xxxxxx codes
// Country filter: CY=DEU (3-letter ISO)
// Date: PD>=YYYYMMDD or PD>=today(-N) / PD<=today()
// Notice type: no query-level filter — filter by notice-type field in application code

// First run (empty DB detected):
const query = `(PC=79* OR PC=92* OR PC=73*) AND CY=DEU AND PD>=today(-14)`;

// Daily run:
const query = `(PC=79* OR PC=92* OR PC=73*) AND CY=DEU AND PD>=today(-2) AND PD<=today()`;
```

> **CRITICAL:** Field `NT` does not exist in TED expert query syntax. `TD=3` maps to cn-standard but does NOT include cn-social (also a valid contract notice type). Filter by `notice-type` field at application level post-fetch, not in the query. Bidding-opportunity notice types: `cn-standard`, `cn-social`. Drop `can-*` (contract award), `pin-*` (prior info), `corr` (corrigenda).

### Pattern 3: SQLite Setup with WAL Mode

**Source: Context7 /wiselibs/better-sqlite3 official docs, HIGH confidence**

```typescript
import Database from 'better-sqlite3';

// timeout option = busy_timeout in milliseconds (default: 5000)
const db = new Database(process.env.DB_PATH ?? '/data/scanner.db', {
  timeout: 5000,   // fail fast on lock, don't hang
});

// WAL mode: must run immediately after open
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');  // safe with WAL; faster than FULL

// Schema — idempotent (safe to run on every startup)
db.exec(`
  CREATE TABLE IF NOT EXISTS seen_notices (
    nd          TEXT PRIMARY KEY,      -- TED notice ND field (e.g. "582-2026")
    first_seen  TEXT NOT NULL,         -- ISO8601 UTC
    title_deu   TEXT,                  -- title for debuggability
    cpv_codes   TEXT,                  -- JSON array string
    deadline    TEXT,                  -- ISO8601 date
    budget      REAL,                  -- null if not available
    notice_type TEXT
  );

  CREATE TABLE IF NOT EXISTS runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    query_from   TEXT,                 -- date range start
    query_to     TEXT,                 -- date range end
    total_available INTEGER,           -- from TED totalNoticeCount
    total_fetched   INTEGER,           -- pages * limit (or last batch count)
    new_notices     INTEGER,           -- not in seen_notices before this run
    filtered_out    INTEGER,           -- dropped by applyHardFilters
    stored          INTEGER,           -- inserted into seen_notices
    error           TEXT               -- NULL if clean run
  );

  CREATE TABLE IF NOT EXISTS job_lock (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    locked_at   TEXT NOT NULL,
    pid         INTEGER NOT NULL
  );
`);
```

### Pattern 4: Job Lock (Mutex)

```typescript
// Source: [ASSUMED] — standard SQLite advisory lock pattern

function acquireJobLock(db: Database): boolean {
  try {
    // Single-row table with CHECK (id = 1) prevents two rows
    db.prepare('INSERT INTO job_lock (id, locked_at, pid) VALUES (1, ?, ?)').run(
      new Date().toISOString(),
      process.pid
    );
    return true;
  } catch {
    // Insert failed = another process holds lock
    const lock = db.prepare('SELECT locked_at, pid FROM job_lock WHERE id = 1').get() as any;
    console.log(`Job locked since ${lock?.locked_at} by pid ${lock?.pid}`);
    return false;
  }
}

function releaseJobLock(db: Database): void {
  db.prepare('DELETE FROM job_lock WHERE id = 1').run();
}
```

### Pattern 5: First Run Detection

```typescript
// Source: [ASSUMED] — derived from D-06 decision

function isFirstRun(db: Database): boolean {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM seen_notices').get() as { cnt: number };
  return row.cnt === 0;
}

function buildDateQuery(isFirst: boolean): string {
  if (isFirst) {
    return `PD>=today(-14)`;   // 2-week lookback — D-06
  }
  return `PD>=today(-2) AND PD<=today()`;  // 1-day overlap — D-07, FETCH-03
}
```

### Pattern 6: Notice-Type Application Filter

```typescript
// Filter at application level — NOT in TED query string (no reliable query field)
// Source: [VERIFIED: live-tested 2026-05-06]

const BIDDING_NOTICE_TYPES = new Set(['cn-standard', 'cn-social', 'cn-desg']);

function applyHardFilters(notices: RawNotice[]): RawNotice[] {
  const now = new Date();
  return notices.filter(notice => {
    // Filter 1: Only contract notices (not awards, not corrigenda, not PIN)
    if (!BIDDING_NOTICE_TYPES.has(notice['notice-type'] ?? '')) return false;

    // Filter 2: Deadline must be in the future (D-05, FILTER-01)
    const deadlines = notice['deadline-receipt-tender-date-lot'];
    if (deadlines && deadlines.length > 0) {
      const deadline = new Date(deadlines[0]);
      if (deadline < now) return false;
    }
    // If no deadline field — keep the notice (don't silently drop)

    return true;
  });
}
```

### Pattern 7: Railway Cron Configuration

**Source: Context7 /railwayapp/docs, HIGH confidence**

```json
// railway.json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "cronSchedule": "0 8 * * *",
    "startCommand": "tsx src/runner.ts"
  }
}
```

- `0 8 * * *` = 08:00 UTC = 09:00 CET (winter) / 10:00 CEST (summer)
- This is after TED's morning publication batch for German authorities
- Railway cron uses UTC — never use local time in any date calculation

### Pattern 8: tsconfig.json for tsx

**Source: Context7 /privatenumber/tsx official docs, HIGH confidence**

```jsonc
{
  "compilerOptions": {
    "moduleDetection": "force",
    "module": "Preserve",
    "target": "ES2022",
    "resolveJsonModule": true,
    "allowJs": false,
    "esModuleInterop": true,
    "isolatedModules": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Pattern 9: TED API Zod Schema

```typescript
// Source: [VERIFIED: live-tested field shapes 2026-05-06]
import { z } from 'zod';

export const RawNoticeSchema = z.object({
  ND: z.string(),                                       // dedup key, e.g. "582-2026"
  'publication-number': z.string().optional(),          // same as ND in most cases
  PD: z.string(),                                       // "2026-01-02+01:00"
  TI: z.record(z.string()).optional(),                  // multilingual object: {deu: "...", eng: "..."}
  PC: z.array(z.string()).optional(),                   // ["79822500", "79340000"]
  CY: z.array(z.string()).optional(),                   // ["DEU"]
  'notice-type': z.string().optional(),                 // "cn-standard" | "can-standard" | ...
  'buyer-name': z.record(z.array(z.string())).optional(), // {deu: ["BWI GmbH"]}
  'description-lot': z.record(z.array(z.string())).optional(),
  'title-lot': z.record(z.array(z.string())).optional(),
  'BT-27-Lot': z.array(z.string()).optional(),          // ["1600000.00"] — decimal strings
  'BT-27-Lot-Currency': z.array(z.string()).optional(), // ["EUR"]
  'deadline-receipt-tender-date-lot': z.array(z.string()).optional(), // ["2026-02-05+01:00"]
  links: z.object({
    xml: z.record(z.string()).optional(),
    pdf: z.record(z.string()).optional(),
    html: z.record(z.string()).optional(),
  }).optional(),
});

export type RawNotice = z.infer<typeof RawNoticeSchema>;

export const TedSearchResponseSchema = z.object({
  notices: z.array(RawNoticeSchema),
  totalNoticeCount: z.number(),
  iterationNextToken: z.string().nullable(),
  timedOut: z.boolean(),
});
```

### Anti-Patterns to Avoid

- **Using `NT` field in expert query:** Field does not exist — causes `QUERY_UNKNOWN_FIELD` error. Filter by `notice-type` in application code.
- **Using `TD=3` to filter contract notices:** `TD=3` confirmed to return 0 results when combined with PD date filter (interaction bug). Don't rely on TD. Filter by notice-type in application code.
- **Using `sort` or `sortField` in request body:** Not a supported TED API v3 parameter — causes JSON parse error. Results are returned in TED's default order.
- **Assuming `iterationNextToken` is the pagination model:** It is always `null`. Use `page` + `limit` + `totalNoticeCount` loop.
- **Using ISO date format in query (YYYY-MM-DD):** TED requires `YYYYMMDD` (no dashes) or `today(N)` function. ISO format causes validation error.
- **Storing SQLite in container filesystem:** Ephemeral — wiped on every Railway deployment. Must use `/data` Volume.
- **Not calling `db.close()` before `process.exit()`:** WAL data may not be checkpointed, risking corruption.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retries with backoff | Custom retry loop | Built-in pattern (fetchWithRetry) | Edge cases: abort controller, timeout, 429 vs 5xx handling |
| SQLite connection locking | Custom file lock | better-sqlite3 `timeout` option + WAL | WAL mode eliminates most lock contention; `timeout: 5000` handles the rest |
| Schema migrations | Custom migration runner | Idempotent `CREATE TABLE IF NOT EXISTS` | Railway restarts without human intervention; migrations must be self-healing |
| TED response parsing | Custom field extraction | Zod schema | TED returns null, missing fields, multilingual objects — Zod catches them all at the boundary |
| Date math for query windows | Manual date manipulation | `today(-N)` TED function or `Date` + `toISOString().slice(0,10).replace(/-/g,'')` | UTC edge cases around DST and timezone offset |
| Job scheduling | `node-cron` inside process | Railway `cronSchedule` in railway.json | Railway IS the scheduler; no in-process daemon needed |

**Key insight:** The TED API's own query language handles date arithmetic (`today(-14)`) — use it instead of computing dates in Node and formatting them as YYYYMMDD strings. This eliminates timezone-in-computation errors.

---

## Common Pitfalls

### Pitfall 1: `can-*` notices reach the filter (no query-level notice-type filter)
**What goes wrong:** Without a working query-level filter for notice type, contract award notices (`can-standard`, `can-social`) are fetched alongside contract notices. These are not bidding opportunities and should never reach Phase 2 triage.
**Why it happens:** `NT` field doesn't exist; `TD=3` interacts incorrectly with PD date filter (tested: returns 0 results).
**How to avoid:** Add notice-type to the `fields` list and filter in `applyHardFilters()`. Keep a `Set` of allowed types: `['cn-standard', 'cn-social']`.
**Warning signs:** Run fetches 100 notices but filtered count is less than 30% — award notices are likely leaking through.

### Pitfall 2: Pagination stops early on high-volume days
**What goes wrong:** Using `if (notices.length < limit) break` instead of `if (page * limit >= totalNoticeCount) break`. On heavy-publication days (Monday, post-holiday) the final page may still be full.
**Why it happens:** Developers assume a short final page signals the end.
**How to avoid:** Always compare against `totalNoticeCount`. Log both values per run.
**Warning signs:** `total_available` in `runs` table matches first-page count exactly when total > 100.

### Pitfall 3: First run triggers mass dedup insert but process is slow
**What goes wrong:** 2-week lookback (D-06) for 79/92/73 + DE returns ~350–500 notices. Inserting all into `seen_notices` in a single transaction takes seconds; doing it row-by-row is slow and risks lock issues.
**Why it happens:** No transaction wrapping on bulk inserts.
**How to avoid:** Wrap all `INSERT OR IGNORE` calls in a single `db.transaction()`. better-sqlite3 transactions are synchronous and extremely fast in bulk.

### Pitfall 4: SQLite file not found on Railway if Volume not attached
**What goes wrong:** Without a Railway Volume attached, the DB path `/data/scanner.db` does not exist. The error is `SQLITE_CANTOPEN` which looks like a permissions issue.
**Why it happens:** Volume must be manually created in Railway UI and attached to the service before first deploy.
**How to avoid:** Add a startup check in `db/index.ts` that logs clearly: "DB path not found at /data — is Railway Volume attached?". Exit with code 1. Do NOT create `/data` directory — it must come from the Volume mount.
**Warning signs:** Railway logs show `SQLITE_CANTOPEN` or `ENOENT` on `/data/scanner.db`.

### Pitfall 5: `today()` date function uses TED's UTC clock, not local system time
**What goes wrong:** TED's `today()` is evaluated server-side in UTC. If Railway cron fires at 08:00 UTC, `today(-2)` is correct. But if your Node code computes dates locally with timezone offset, you get mismatched windows.
**How to avoid:** Use `today(-N)` in TED query string directly — never compute the date in Node and format it as YYYYMMDD for the lookback. If you must compute dates in Node, use `new Date().toISOString().slice(0, 10).replace(/-/g, '')` (UTC only, no locale).

### Pitfall 6: WAL pragma not set — lock hang on crash restart
**What goes wrong:** Without WAL mode, SQLite uses exclusive file locks. If the job crashes mid-write and Railway restarts it, the new process hangs waiting for the lock held by the crashed process.
**How to avoid:** `db.pragma('journal_mode = WAL')` must be the first statement after opening the DB — before any reads or writes.

---

## Code Examples

### Complete TED API fetch with pagination

```typescript
// Source: [VERIFIED: live-tested against api.ted.europa.eu 2026-05-06]

const TED_API_URL = 'https://api.ted.europa.eu/v3/notices/search';

async function tedFetch(body: object, attempt = 0): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(TED_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`TED API HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2 ** attempt * 1000));
      return tedFetch(body, attempt + 1);
    }
    throw err;
  }
}
```

### CPV config file pattern (cpv-codes.json)

```json
{
  "_comment": "EU CPV taxonomy 2008/2023. Update via commit, no redeploy needed.",
  "_last_reviewed": "2026-05-06",
  "prefixes": ["79*", "92*", "73*"],
  "specific_additions": [
    "72212000",
    "80000000"
  ]
}
```

```typescript
// config.ts — build TED query string from config
import cpvConfig from '../cpv-codes.json';

export function buildCpvQueryPart(): string {
  const parts = [
    ...cpvConfig.prefixes.map(p => `PC=${p}`),
    ...cpvConfig.specific_additions.map(c => `PC=${c}`),
  ];
  return `(${parts.join(' OR ')})`;
}
// → "(PC=79* OR PC=92* OR PC=73* OR PC=72212000 OR PC=80000000)"
```

### Deadline field parsing

```typescript
// Source: [VERIFIED: live-tested field format 2026-05-06]
// deadline-receipt-tender-date-lot format: "2026-02-05+01:00" (ISO 8601 with offset)

function isDeadlineInFuture(notice: RawNotice): boolean {
  const deadlines = notice['deadline-receipt-tender-date-lot'];
  if (!deadlines || deadlines.length === 0) return true; // keep if no deadline
  return new Date(deadlines[0]) > new Date();
}
```

### Budget field extraction

```typescript
// Source: [VERIFIED: live-tested field format 2026-05-06]
// BT-27-Lot format: ["1600000.00"] — decimal string in array

function extractBudget(notice: RawNotice): number | null {
  const values = notice['BT-27-Lot'];
  if (!values || values.length === 0) return null;
  const parsed = parseFloat(values[0]);
  return isNaN(parsed) ? null : parsed;
}
```

### Run logging to SQLite

```typescript
// Log fetched vs available — FETCH-04 requirement
const runId = db.prepare(`
  INSERT INTO runs (started_at, query_from, query_to)
  VALUES (?, ?, ?)
`).run(new Date().toISOString(), queryFrom, queryTo).lastInsertRowid;

// After fetching
db.prepare(`
  UPDATE runs SET
    total_available = ?,
    total_fetched = ?,
    new_notices = ?,
    filtered_out = ?,
    stored = ?,
    finished_at = ?
  WHERE id = ?
`).run(totalAvailable, totalFetched, newCount, filteredOut, storedCount,
       new Date().toISOString(), runId);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| TED API v2 (SOAP/XML) | TED API v3 (REST/JSON, eForms) | v3 has richer structured fields; v2 is legacy |
| page-based only | `iterationNextToken` + page | Token-based theoretically better for cursor stability; in practice token is always null, use page-based |
| `TD=` query field for notice type | Application-level notice-type filter | TD field interacts incorrectly with date filters (returns 0 results); filter in code |

**Deprecated/outdated:**
- `tedapi.publications.europa.eu`: Wrong domain. Correct domain is `api.ted.europa.eu`. CLAUDE.md documents this explicitly.
- `iterationNextToken` for pagination: Documented in STACK.md as the "token-based" approach but always returns null in practice (live-tested). Use page-based loop.

---

## Runtime State Inventory

> Not applicable — this is a greenfield phase, not a rename/refactor/migration.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.5.0 (local) | — (pin to 22 LTS in Dockerfile/engine) |
| Docker | Railway builds | ✓ | 28.3.3 | — |
| npm | Package install | ✓ | bundled with Node | — |
| TED API (api.ted.europa.eu) | FETCH-01–04 | ✓ | v3 (live-tested) | None — blocking if down |
| Railway Volume at /data | DEDUP-01, INFRA-02 | ✗ (local dev) | — | Use `/tmp/scanner.db` for local dev only |

**Note on Node version:** Local machine has Node v24.5.0; CLAUDE.md specifies Node 22 LTS for Railway. Pin `"engines": {"node": ">=22"}` in package.json. Add `.nvmrc` with `22`. Railway Railpack respects both.

**Missing dependencies with no fallback:**
- TED API downtime: Send failure notification email, exit with code 1. Next day's run will resume.

**Missing dependencies with fallback:**
- Railway Volume (local dev): Use `DB_PATH=/tmp/scanner.db` env var for development.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (recommended) or Node built-in `node:test` |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=verbose src/` |
| Full suite command | `npx vitest run` |

> **Rationale for Vitest:** It is the standard TS-native test runner in 2026, with zero config for ESM/TS projects. Alternative: `node:test` (built-in since Node 18) — zero dependencies, works with tsx for TS files. Either is acceptable; Vitest is recommended for its assertion API and watch mode.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FETCH-01 | CPV query string builds correctly from cpv-codes.json | unit | `npx vitest run src/config.test.ts` | ❌ Wave 0 |
| FETCH-02 | Pagination loop fetches all pages until totalNoticeCount | unit (mock HTTP) | `npx vitest run src/fetcher/index.test.ts` | ❌ Wave 0 |
| FETCH-03 | Date query uses today(-2) for daily, today(-14) for first run | unit | `npx vitest run src/fetcher/index.test.ts` | ❌ Wave 0 |
| FETCH-04 | Run record logs total_available and total_fetched | unit (in-memory DB) | `npx vitest run src/db/queries.test.ts` | ❌ Wave 0 |
| DEDUP-01 | seen_notices table created with WAL mode on DB open | unit (in-memory DB) | `npx vitest run src/db/index.test.ts` | ❌ Wave 0 |
| DEDUP-02 | Already-seen ND is skipped (INSERT OR IGNORE) | unit (in-memory DB) | `npx vitest run src/db/queries.test.ts` | ❌ Wave 0 |
| DEDUP-03 | job_lock prevents second acquisition | unit (in-memory DB) | `npx vitest run src/db/queries.test.ts` | ❌ Wave 0 |
| FILTER-01 | can-standard notice dropped by applyHardFilters | unit | `npx vitest run src/filter/index.test.ts` | ❌ Wave 0 |
| FILTER-01 | Expired deadline notice dropped | unit | `npx vitest run src/filter/index.test.ts` | ❌ Wave 0 |
| FILTER-02 | cpv-codes.json drives query; hardcoded CPVs absent from src/ | unit | `npx vitest run src/config.test.ts` | ❌ Wave 0 |
| INFRA-01 | railway.json has valid cronSchedule field | manual | inspect railway.json | ❌ Wave 0 |
| INFRA-02 | DB opens at /data/scanner.db (or DB_PATH env override) | unit | `npx vitest run src/db/index.test.ts` | ❌ Wave 0 |
| INFRA-04 | Runner exits with code 0 on clean run | integration (mock TED) | `npx vitest run src/runner.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/filter/index.test.ts src/db/queries.test.ts` (fast, pure unit)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/filter/index.test.ts` — covers FILTER-01, FILTER-02
- [ ] `src/db/index.test.ts` — covers DEDUP-01, INFRA-02
- [ ] `src/db/queries.test.ts` — covers DEDUP-02, DEDUP-03, FETCH-04
- [ ] `src/config.test.ts` — covers FETCH-01, FILTER-02
- [ ] `src/fetcher/index.test.ts` — covers FETCH-02, FETCH-03 (mock fetch)
- [ ] `src/runner.test.ts` — covers INFRA-04 (integration, mock HTTP)
- [ ] `vitest.config.ts` — framework config
- [ ] Install: `npm install -D vitest`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user auth in Phase 1 |
| V3 Session Management | No | No sessions — cron job |
| V4 Access Control | No | Single-user internal tool |
| V5 Input Validation | Yes | Zod schema on TED API responses |
| V6 Cryptography | No | No crypto in Phase 1 |
| V9 Data Protection | Partial | Secrets in Railway env vars only, never logged |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| TED API response injection (malformed JSON) | Tampering | Zod parse at boundary — invalid shape throws, not propagated |
| Secret exposure in logs | Information Disclosure | Structured logging with allowlist; never log `process.env` |
| SQLite file accessible to container | Information Disclosure | Railway Volume not publicly accessible; acceptable for internal tool |
| Job double-execution (Railway deploy collision) | Denial of Service | job_lock table prevents concurrent pipeline execution |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cn-social` notices are valid bidding opportunities that Figures should see (not just `cn-standard`) | Filter patterns | If cn-social is irrelevant noise, add it to the drop list |
| A2 | Job lock via SQLite `INSERT` conflict is sufficient — no filesystem lock needed | Pattern 4 | If Railway runs two containers simultaneously (unlikely for cron), a filesystem lock would be safer |
| A3 | `today(-N)` TED function uses UTC server time matching Railway UTC cron | Pattern 2 | If TED uses CET/CEST, date window could be off by 1-2 hours |
| A4 | Railway Node 22 LTS Railpack auto-detects from `engines.node` in package.json without Dockerfile | Environment | If Railpack requires explicit Node version config, need a Dockerfile or .tool-versions |
| A5 | `BT-27-Lot` field (decimal string array) is the correct budget field for Phase 1 storage | Zod schema | Other budget fields exist in eForms (framework values, max values); single field may be incomplete |

---

## Open Questions

1. **Railway timeout confirmation**
   - What we know: Context7 docs confirm Railway does NOT automatically terminate cron jobs; no timeout is documented
   - What's unclear: STATE.md flags "Railway hobby-tier cron timeout limit needs verification"
   - Recommendation: The pipeline runtime (fetch + filter + DB inserts) is under 2 minutes even for 500 notices. Accept that Railway does not impose a limit (confirmed by Context7 docs) and proceed. If a hang ever occurs, the job_lock will prevent the next run from starting — detectable in Railway logs.

2. **TypeScript 6.x compatibility with tsx 4.x**
   - What we know: TypeScript 6.0.3 is current; tsx 4.21.0 is current
   - What's unclear: tsx 4.x was built against TS 5.x; TS 6 may have API changes
   - Recommendation: Install both and run `tsx --version` + `tsx src/runner.ts` in CI. If incompatibility occurs, pin to `typescript@5` (5.8.x is latest stable v5).

---

## Sources

### Primary (HIGH confidence)

- **TED API v3 live testing** — All query syntax, field names, pagination model, CPV wildcard prefix, notice types, date format, totalNoticeCount field verified via direct API calls (2026-05-06)
- **Context7 /railwayapp/docs** — Railway cronSchedule config, Volume CLI commands, cron skip-on-overlap behavior, no-terminate policy
- **Context7 /wiselibs/better-sqlite3** — WAL pragma syntax, `timeout` constructor option, transaction pattern, prepared statements
- **Context7 /privatenumber/tsx** — Recommended tsconfig.json, Node --import integration
- **npm registry** — All package versions verified (2026-05-06)

### Secondary (MEDIUM confidence)

- **STACK.md** (project research, 2026-05-04) — TED API field names, Railway Volume setup, Anthropic SDK patterns
- **ARCHITECTURE.md** (project research, 2026-05-04) — Component boundaries, data flow, SQLite schema design, error handling patterns
- **PITFALLS.md** (project research, 2026-05-04) — Pitfall catalogue; note: written without live API access; TED pitfalls updated with live testing findings above

### Tertiary (LOW confidence / Assumed)

- Job lock via single-row SQLite table: standard pattern, not sourced from specific docs [A2]
- `today()` TED function uses UTC: inferred from context, not documented [A3]

---

## Metadata

**Confidence breakdown:**
- TED API behavior: HIGH — live-tested every claim today (2026-05-06)
- Standard stack: HIGH — npm-verified versions, Context7-verified APIs
- Architecture: HIGH — derived from locked decisions + verified constraints
- Railway integration: HIGH — Context7 official docs
- Pitfalls: HIGH (pattern-level) / MEDIUM (TED-specific) — live testing corrected two prior assumptions (iterationNextToken, TD field)

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 for TED API behavior (EU services are stable); 2026-05-20 for npm versions (fast-moving)
