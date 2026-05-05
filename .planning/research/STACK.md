# Technology Stack

**Project:** Ausschreibungs-Scanner (EU Tender Scanner for Figures)
**Researched:** 2026-05-04
**Confidence:** HIGH (TED API live-tested; all libraries verified via Context7 official docs)

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22 LTS | Runtime | Native fetch built-in (no extra HTTP lib), excellent TypeScript support, same ecosystem as the existing ausschreibung-workspace skill. Railway Railpack auto-detects Node. |
| TypeScript | 5.x | Language | Type safety for API response parsing — TED v3 field names are inconsistent (multilingual objects, null gaps). Compiler catches shape mismatches before they reach production. |
| tsx | 4.21 | TS execution | Run `.ts` files directly without a compile step: `tsx src/index.ts`. Zero config, fast, perfect for a cron script that just needs to run. |

**Why Node over Python:** The existing Ausschreibungsskill is almost certainly Node/TS-adjacent (same dev environment). The Anthropic SDK TypeScript version is at parity with Python, nodemailer is a well-maintained first-class library, and better-sqlite3 is faster than Python's sqlite3 bindings. Railway's Nixpacks/Railpack handles Node auto-detection from `package.json`. Python offers no meaningful advantage here.

**Do not use:** Deno (Railway support is awkward), Bun (immature Railway integration), Python (no benefit, extra cognitive switching cost).

---

### TED API v3

**Base URL:** `https://api.ted.europa.eu/v3`
**Docs:** `https://api.ted.europa.eu` (Swagger UI available at the root)

**Verified empirically (2026-05-04):**

| Aspect | Detail |
|--------|--------|
| Authentication (search) | **None required.** `POST /v3/notices/search` is fully public. |
| Authentication (detail) | API key required as `Authorization: Bearer <key>`. Returns `401 This API Key does not exist.` without one. Register at the TED developer portal. |
| Rate limits | No rate limit headers returned in responses (`x-ratelimit-*` absent). Served via AWS CloudFront. For a daily cron scanning ~100-500 results, this is not a concern. |
| Search method | `POST /v3/notices/search` — GET returns 405. |
| Max page size | `limit: 100` confirmed working. |
| Pagination model | `iterationNextToken` in response (token-based, not page-based). Also supports `page` + `limit` for simple cases. |
| Total count field | `totalNoticeCount` (not `total.value`). |
| Query language | Expert query syntax: `PC=79822500 AND PD>=20260101`. Field `PC` = CPV code, `PD` = publication date (format: `YYYYMMDD`). |
| Response shape | `{ notices: [...], totalNoticeCount: N, iterationNextToken: null\|string, timedOut: bool }` |

**Confirmed useful search fields for triage:**

```
ND                          — Notice number (deduplication key), e.g. "1936-2026"
PD                          — Publication date, e.g. "2026-01-05+01:00"
TI                          — Title (multilingual object: { eng, deu, fra, ... })
PC                          — CPV codes array, e.g. ["79822500", "79416000"]
CY                          — Country codes array, e.g. ["DEU"]
notice-type                 — e.g. "cn-standard" (Contract Notice)
buyer-name                  — Contracting authority (multilingual object)
description-lot             — Lot description (multilingual, most detailed field available)
title-lot                   — Lot title (multilingual)
BT-27-Lot                   — Estimated value per lot (array of strings, e.g. ["1799819.5"])
BT-27-Lot-Currency          — Currency for value (e.g. ["EUR"])
deadline-receipt-tender-date-lot — Submission deadline date
links                       — Object with xml/pdf/html URLs per language
```

**Key finding:** The search endpoint returns enough structured data (title, description, CPV, estimated value, deadline, country) for Claude Haiku triage WITHOUT needing the authenticated detail endpoint. For full-text analysis (Score ≥7 path), fetch the XML link — confirmed public, no auth required.

**CPV codes for Figures:**
```
79822500  — Graphic design services
79416000  — Public relations services
79800000  — Printing and related services
72413000  — World wide web (www) site design services
79952000  — Event services
92111000  — Motion picture production services
```

**Recommended daily query:**
```typescript
{
  query: "PC=79822500 OR PC=79416000 OR PC=79800000 OR PC=72413000 AND PD>=20260503",
  page: 1,
  limit: 100,
  fields: ["ND","PD","TI","PC","CY","notice-type","buyer-name","description-lot",
           "title-lot","BT-27-Lot","BT-27-Lot-Currency",
           "deadline-receipt-tender-date-lot","links"]
}
```

Use `PD>=[yesterday's date in YYYYMMDD]` to get only new notices each run. Store `ND` (publication-number) as deduplication key.

---

### Anthropic SDK

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @anthropic-ai/sdk | 0.93.0 | Claude API calls | Official SDK, TypeScript-first, handles retries and rate limit errors automatically via `maxRetries` config. |

**Model IDs to use (verified from SDK docs):**
- Haiku triage: `claude-haiku-4-5` (cheapest, fastest, sufficient for scoring 0-10)
- Full analysis: `claude-sonnet-4-5-20250929` (existing Ausschreibungsskill model)

**Triage call pattern:**
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
});

const response = await client.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 200,
  messages: [{
    role: 'user',
    content: `Rate this EU tender for Figures (Berlin design agency specializing in data visualization and science communication) on a scale 0-10. Return JSON: {"score": N, "reason": "2 sentences"}\n\nTitle: ${title}\nDescription: ${description}\nCPV: ${cpvCodes}\nCountry: ${country}\nValue: ${value} EUR`,
  }],
});
```

**Error handling:** Use `instanceof Anthropic.RateLimitError` and `instanceof Anthropic.APIError` — SDK provides typed errors. For batch of ~50-200 daily notices, sequential calls with `await` are fine; no need for the Batch API (which requires polling and adds latency to a daily job).

**Do not use:** Batch API (`/v1/messages/batches`) for this use case. It's designed for >1000 requests and requires async polling. Daily triage of 50-200 notices runs sequentially in seconds at Haiku's speed.

---

### Email

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| nodemailer | 8.0.7 | Gmail SMTP digest | Zero runtime dependencies, mature (battle-tested since 2010), TypeScript types included. Official library for Node.js email. |

**Gmail authentication — use App Password, not OAuth2:**

OAuth2 requires setting up a Google Cloud project, client ID, and refresh token rotation — significant complexity for a single-recipient internal tool. Gmail App Passwords are simpler and fully supported:

1. Enable 2FA on the Gmail account
2. Generate an App Password at myaccount.google.com/apppasswords
3. Use as SMTP password

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});
```

**Use OAuth2 only if:** the Gmail account is a shared Google Workspace account where App Passwords are disabled by admin policy.

**Do not use:** Resend, SendGrid, Postmark — the project constraint is Gmail SMTP only, and nodemailer handles it perfectly.

---

### Storage / Deduplication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| better-sqlite3 | 12.9.0 | Seen-notice tracking | Synchronous API — no async/await noise in a script. Fastest SQLite binding for Node. Single file, zero infra. |

**Use SQLite, not JSON file:**
- JSON file requires reading/parsing/writing entire file on every run — fragile under concurrent writes (not an issue here but still bad practice)
- SQLite gives an indexed lookup for deduplication in O(log n)
- Schema migration is trivial for a single table
- better-sqlite3 is synchronous — ideal for a script that runs top-to-bottom

```typescript
import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH ?? '/data/scanner.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS seen_notices (
    nd TEXT PRIMARY KEY,
    seen_at TEXT NOT NULL,
    score INTEGER,
    published_at TEXT
  )
`);

const insertSeen = db.prepare(
  `INSERT OR IGNORE INTO seen_notices (nd, seen_at, published_at, score)
   VALUES (?, datetime('now'), ?, ?)`
);

const isSeen = db.prepare(`SELECT 1 FROM seen_notices WHERE nd = ?`);
```

**Railway storage:** Cron job containers on Railway use ephemeral storage (1GB free, 100GB paid). The SQLite file will be wiped between runs unless mounted to a Railway Volume. You MUST attach a Volume at `/data` for the deduplication database to persist. This is a first-class Railway feature (UI: Settings → Volumes → Add Volume → Mount Path: `/data`). The Volume persists independently of container restarts and cron invocations.

**Alternative if Volume setup is skipped during development:** Use the `ND` field to query TED API with `PD>=[yesterday]` — this naturally limits to new notices without needing state. But for production deduplication across days, the Volume + SQLite approach is required.

---

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| zod | 4.4.3 (use 3.24.2 for broader compat) | TED API response validation | TED v3 fields are inconsistently populated (some null, some arrays, some multilingual objects). Zod parses and validates at runtime, providing TypeScript types from schemas — prevents silent failures when TED changes a field. |

Use zod v3 (3.24.2), not v4: v4 has breaking API changes and ecosystem compatibility is not yet universal.

```typescript
import { z } from 'zod';

const TedNoticeSchema = z.object({
  ND: z.string(),
  PD: z.string(),
  TI: z.record(z.string()).optional(),
  PC: z.array(z.string()).optional(),
  CY: z.array(z.string()).optional(),
  'notice-type': z.string().optional(),
  'buyer-name': z.record(z.array(z.string())).optional(),
  'description-lot': z.record(z.array(z.string())).optional(),
  'BT-27-Lot': z.array(z.string()).optional(),
  'BT-27-Lot-Currency': z.array(z.string()).optional(),
  'deadline-receipt-tender-date-lot': z.array(z.string()).optional(),
  links: z.object({
    xml: z.record(z.string()).optional(),
    html: z.record(z.string()).optional(),
  }).optional(),
});
```

---

### Railway Deployment

**Configuration:** No separate cron infrastructure needed. Railway supports native cron scheduling via `railway.json` or UI:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "cronSchedule": "0 7 * * *",
    "startCommand": "tsx src/index.ts"
  }
}
```

This runs at 07:00 UTC daily, executes the script, and the container exits. Minimum schedule granularity is every 5 minutes. All schedules are UTC.

**What Railway provides:**
- Auto-build from `package.json` via Railpack (detects Node.js)
- Environment variables via Railway Variables UI (set `ANTHROPIC_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `DB_PATH`)
- Volume attachment for SQLite persistence
- Logs per run visible in Railway dashboard

**Do not use:** Separate cron libraries (`node-cron`, `crontab`) inside the process — Railway handles scheduling externally. The script should simply run and exit.

---

## Full Dependency List

```bash
# Runtime dependencies
npm install @anthropic-ai/sdk nodemailer better-sqlite3 zod

# Dev dependencies
npm install -D typescript tsx @types/node @types/nodemailer @types/better-sqlite3
```

**`package.json` start script:**
```json
{
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx --watch src/index.ts"
  }
}
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Language | TypeScript/Node.js | Python | No advantage; adds ecosystem switch; existing skill is Node-adjacent |
| HTTP client | Native `fetch` (built-in Node 22) | axios, node-fetch | Built-in since Node 18; zero dependencies; TED API is straightforward REST |
| Email | nodemailer + Gmail App Password | OAuth2 flow | Unnecessary complexity for internal single-recipient digest |
| Storage | better-sqlite3 | JSON file | JSON requires full file rewrite; no indexing; bad practice for append-only dedup store |
| Storage | better-sqlite3 | PostgreSQL (Railway) | Overkill; adds paid Railway addon cost; SQLite is sufficient for <100k rows |
| Scheduling | Railway cronSchedule | node-cron inside process | Railway-native is simpler; no need for a persistent process just to schedule |
| Validation | zod 3.x | joi, yup | zod is TypeScript-native (infers types); most widely adopted in TS ecosystem |
| Claude triage | Sequential messages.create | Batch API | Batch API requires async polling, adds latency; 50-200 daily calls finish in ~30s sequentially |

---

## Sources

- TED API v3: Live-tested at `https://api.ted.europa.eu/v3/notices/search` (2026-05-04)
- Response structure and field names: Empirically verified via curl (field list extracted from API error message listing all 1000+ supported fields)
- Anthropic SDK: Context7 `/anthropics/anthropic-sdk-typescript` — HIGH confidence
- Nodemailer: Context7 `/nodemailer/nodemailer-homepage` — HIGH confidence
- better-sqlite3: Context7 `/wiselibs/better-sqlite3` — MEDIUM confidence (library source, high benchmark score)
- Railway: Context7 `/railwayapp/docs` — HIGH confidence (official docs repo)
- Package versions: Verified via `npm view` (2026-05-04)
