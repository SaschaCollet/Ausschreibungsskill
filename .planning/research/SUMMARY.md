# Project Research Summary

**Project:** Ausschreibungs-Scanner (EU Tender Scanner for Figures)
**Domain:** Automated public procurement monitoring with LLM triage pipeline
**Researched:** 2026-05-04
**Confidence:** HIGH (TED API live-tested; stack verified via Context7 and npm; pitfalls from established pipeline patterns)

## Executive Summary

The Ausschreibungs-Scanner is a daily cron pipeline that polls the TED EU procurement API, pre-filters notices by CPV code and hard business rules, triages survivors with Claude Haiku (0-10 score + 2-sentence rationale), and delivers a tiered HTML digest via Gmail SMTP. High-scoring notices (≥7) additionally receive a full analysis via the existing Ausschreibungsskill. This is a well-understood problem class — internal monitoring pipelines of this type are straightforward to build correctly if the failure modes are known in advance, and the research identifies all of them concretely.

The recommended approach is a single-process, sequential TypeScript pipeline running as a Railway cron job. No queues, no microservices, no separate workers. The numbers justify this: on a typical day 5-30 notices survive pre-filtering, 1-5 score ≥7, and Sonnet analysis for those 5 takes under 2 minutes total — well within Railway cron constraints. The architecture is explicitly layered (Fetcher → Filter → Triage → Analyser → Notifier) with SQLite on a Railway persistent volume as the only stateful component. The TED search endpoint requires no auth key, returns sufficient triage data (title, description, CPV, value, deadline) in the search response itself, and the API has been live-tested and empirically validated.

The top risks are operational rather than architectural. Failing to paginate TED results silently drops notices on high-volume days. SQLite on a Railway volume without WAL mode will lock and hang after a crash-restart. Haiku prompt miscalibration produces score inflation that floods the Sonnet pipeline with junk, causing cost runaway. Gmail App Password revocation kills email delivery silently. Every one of these has a specific, low-effort prevention that must be built into Phase 1 — none are retrofittable easily once data starts accumulating.

## Key Findings

### Recommended Stack

The stack is Node.js 22 LTS with TypeScript 5.x, executed via `tsx` (zero compile-step). This matches the existing dev environment, has the most mature Railway support, and native `fetch` (Node 22 built-in) means no HTTP client dependency. The Anthropic SDK (`@anthropic-ai/sdk@0.93.0`) handles retries and rate-limit errors automatically. SQLite via `better-sqlite3` (synchronous API, fastest Node binding) is the right persistence choice — PostgreSQL would be overkill for a single-table dedup store with <100k rows. Nodemailer with Gmail App Password is simpler than OAuth2 for an internal single-recipient tool. Zod v3 (3.24.2) validates TED API responses at runtime, preventing silent failures when TED fields are inconsistently populated.

**Core technologies:**
- **Node.js 22 LTS + TypeScript 5.x + tsx**: Runtime and language — native fetch, type safety for inconsistent TED field shapes, zero-config execution
- **@anthropic-ai/sdk 0.93.0**: Claude API — built-in retries, typed errors; use `claude-haiku-4-5` for triage, `claude-sonnet-4-5-20250929` for full analysis
- **better-sqlite3 12.9.0**: Deduplication state — synchronous API, fastest SQLite binding, single file on Railway volume at `/data/state.db`
- **nodemailer 8.0.7**: Gmail SMTP digest — App Password auth (not OAuth2), port 587 + STARTTLS
- **zod 3.24.2**: TED API response validation — runtime type safety for inconsistent multilingual fields
- **Railway cron via `railway.json`**: Native scheduling (`0 8 * * *` UTC), no `node-cron` inside the process

### Expected Features

The feature pipeline is well-defined. The competitive landscape (DTAD, TenderScout, Evados) reveals that generic keyword matching is the primary user complaint — tools produce false positives because they have no agency-context awareness. The LLM triage is the core differentiator: semantic relevance scoring grounded in Figures' actual niche (data visualization, science communication, public health/research/environment clients), not just CPV keyword matching.

**Must have (table stakes):**
- CPV-code filtering at query time (79xxx, 92xxx, 72xxx families + boundary codes for R&D and science comms)
- Deduplication via TED notice ID (`ND` field) in SQLite — prevents re-processing and LLM cost waste
- Daily email digest with score, 2-sentence rationale, contracting authority, budget, deadline, direct TED URL
- Deadline visibility prominent in every digest entry (the highest urgency field for any bid decision)
- Score threshold routing: ≥7 → full analysis + Tier A; 4-6 → Tier B manual review; <4 → silent discard
- "Nothing today" confirmation send (1 line) so Figures knows the system ran even on zero-match days

**Should have (differentiators):**
- Agency-context-aware Haiku prompt with explicit scoring rubric (10=exact match, 7-9=strong, 4-6=possible, 1-3=weak, 0=irrelevant) and Figures' profile baked in
- Hard pre-filters at query time: notice type = CN (contract notices only), budget range (if stated), region (DE + EU-wide)
- Full analysis (Ausschreibungsskill) auto-triggered for score ≥7 with daily cap of 5 to prevent Sonnet cost runaway
- HTML digest with tier separation: Tier A visually prominent, Tier B lower weight, footer with run stats (heartbeat)
- Run audit log in SQLite `runs` table with tender counts and error field

**Defer (v2+):**
- Configurable score threshold via env var (hardcode 7 first)
- Amendment/corrigendum detection (treat as new notice for now)
- CPV performance analytics table for data-driven pruning
- Multi-region or multi-agency expansion

**Confirmed anti-features (do not build):**
- Multi-source aggregation beyond TED API
- Web dashboard or UI
- Slack/Notion integration
- Automatic bid submission
- Real-time alerts (daily cadence is correct for TED batch publishing)

### Architecture Approach

Single-process sequential pipeline with clean component boundaries. Each component is a typed function (`Fetcher → Filter → Triage → Analyser → Notifier`). SQLite is the only shared state. The process must exit cleanly after each run (Railway skips the next cron if a prior run is still active). Full analysis runs synchronously within the same cron execution — the numbers (1-5 Sonnet calls at ~10-20s each) do not justify an async queue.

**Major components:**
1. **Fetcher** (`src/fetcher/`) — Polls TED API v3 (`POST /v3/notices/search`), paginates to exhaustion, deduplicates against `seen_ids` table, returns only new `Tender[]`
2. **Filter** (`src/filter/`) — Pure synchronous function, no I/O; applies notice-type whitelist (CN only), budget floor (if stated), deadline lead time, region; runs before any LLM call
3. **Triage** (`src/triage/`) — Sequential Haiku calls per tender, parses `{score, rationale}` JSON, persists to `tender_scores` table; returns `ScoredTender[]` sorted descending
4. **Analyser** (`src/analyser/`) — Sequential Sonnet calls for score ≥7, capped at 5/day; persists to `analysis_results` table
5. **Notifier** (`src/notifier/`) — Builds tiered HTML email (Tier A + Tier B + footer stats), sends via Nodemailer/Gmail SMTP, persists run metadata to `runs` table
6. **State** (`src/db/`) — SQLite with WAL mode, 4 tables: `seen_ids`, `tender_scores`, `analysis_results`, `runs`; only component that touches SQL
7. **Runner** (`src/runner.ts`) — Orchestrates pipeline top to bottom, catches errors at each stage, exits cleanly with code 0 or 1

**Build order (enforced by dependencies):** db/config/filter → fetcher → triage → analyser → notifier → runner

### Critical Pitfalls

1. **Pagination truncation (silent data loss)** — TED returns max 100/page; a naive single-page fetch drops 60-75% of notices on high-volume days with no error signal. Prevention: paginate to exhaustion using `iterationNextToken` or `page+limit` loop; log `totalNoticeCount` vs `fetched` every run; assert equality or alert.

2. **SQLite on Railway volume without WAL mode** — Container crash mid-write leaves an exclusive lock that the next cron run waits on indefinitely. Prevention: `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` on every DB open; idempotent `CREATE TABLE IF NOT EXISTS` migrations.

3. **Haiku score inflation → Sonnet cost runaway** — Without an explicit rubric, Haiku clusters scores at 5-7 (hedged, positive). Everything hits the Sonnet analysis path. At 8,000-12,000 tokens per analysis, 20/day = ~$25-35/month. Prevention: include the numeric rubric in the prompt; cap full analyses at 5/day hardcoded; store `haiku_tokens_used` and `sonnet_tokens_used` per run.

4. **Gmail App Password revocation silent failure** — Google can silently revoke App Passwords; the digest stops delivering with no alert. Prevention: SMTP auth test at job startup before any API work; include a run heartbeat in the digest footer (`[Run at 09:12 UTC — 47 fetched, 3 triaged, 1 analyzed]`) so absence of the email is itself the alert.

5. **CPV over-narrowing misses miscategorized tenders** — EU contracting authorities frequently miscategorize: science communication tenders land under 73100000 (R&D), data visualization under 72212000 (software). A tight CPV list produces silent misses. Prevention: start wide (core 79xxx codes + boundary codes for R&D, education, environmental awareness); use hard pre-filters for volume reduction, not CPV alone; audit score distribution after 4 weeks and prune based on data.

**Also build in Phase 1 (not optional):**
- Date boundary overlap: query `PD >= yesterday AND <= today`, not just `>= today`, to avoid timezone blind spots. Dedup absorbs the overlap.
- Notice type filter at query time: `notice-type=cn-standard` — do not let CAN (award notices) or corrigenda reach the LLM.
- Railway cron job-lock: a `runs` table row check at startup prevents duplicate-fire corruption if Railway ever fires twice.
- First-run safeguard: on empty `seen_ids` table, query only last 24 hours to avoid mass-processing backlog.

## Implications for Roadmap

### Phase 1: Pipeline Foundation
**Rationale:** All downstream work depends on being able to fetch real TED data, store dedup state, and filter correctly. The entire pipeline value is zero if pagination is wrong or SQLite locks on crash. These are non-negotiable before any LLM work.
**Delivers:** Working end-to-end skeleton — TED fetch → dedup check → hard filter → mark seen → exit. No LLM, no email. Verifiable by inspecting SQLite directly.
**Addresses:** Table stakes (CPV filtering, deduplication, seen-notice tracking)
**Avoids:** Pitfalls 1 (pagination), 2 (SQLite WAL), 6 (Railway cron lock), 8 (SQLite volume), 10 (TED retry logic), 12 (first-run safeguard), 14 (no API key in logs)
**Includes:** `db/`, `config.ts`, `filter/`, `fetcher/`, `railway.json`, `.env.example`

### Phase 2: Triage and Digest
**Rationale:** Once real data flows and dedup is verified with real TED notices, triage prompt calibration can happen against real tenders. The email template needs real scored output to design against. These two components are tightly coupled through the digest format.
**Delivers:** Full daily pipeline — fetch, filter, score, send HTML email with tiered entries and heartbeat footer. The system is operational for Figures from this point.
**Addresses:** LLM triage (Haiku), score threshold routing, HTML digest (Tier A/B), score + rationale display, "nothing today" send, Gmail SMTP with startup auth test
**Avoids:** Pitfalls 4 (score inflation — rubric prompt + calibration on real data), 7 (Gmail auth test), 13 (digest readability cap at 20 entries)
**Uses:** `triage/prompt.ts` with explicit rubric, `notifier/template.ts`, Haiku model

### Phase 3: Full Analysis Integration
**Rationale:** Full Sonnet analysis via Ausschreibungsskill is the premium output. It requires validated triage scores to gate correctly. Build it after Phase 2 confirms triage calibration is reasonable — otherwise cap logic is set against an uncalibrated threshold.
**Delivers:** Tier A digest entries include auto-generated full analysis; Sonnet cost is capped and logged per run.
**Addresses:** Full analysis auto-trigger for score ≥7, daily cap of 5 analyses, cost logging (`haiku_tokens_used`, `sonnet_tokens_used`)
**Avoids:** Pitfall 11 (Sonnet cost runaway via hard cap + token logging)
**Implements:** `analyser/` component, integration with existing `ausschreibung-workspace/` skill

### Phase 4: Tuning and Hardening
**Rationale:** After 4 weeks of production data, score distribution and CPV performance are observable. This phase applies data-driven refinements and adds operational durability.
**Delivers:** Pruned CPV list based on actual score distributions, refined triage prompt based on false-positive/negative patterns, configurable threshold via env var, "nothing today" confirmation email, amendment detection (corrigenda flagged as updates).
**Addresses:** CPV performance audit (Pitfall 3), configurable threshold (deferred from v1), amendment/corrigendum handling
**Avoids:** Ongoing CPV over-narrowing and score drift via structured review

### Phase Ordering Rationale

- Phase 1 before Phase 2: You cannot calibrate a triage prompt without real TED data. You cannot trust email output if dedup is broken. The fetcher and filter must be verified with real data before any LLM spend.
- Phase 2 before Phase 3: Full analysis is gated on score ≥7 being meaningful. If triage is miscalibrated in Phase 2, Phase 3 would invoke Sonnet on junk. Validate the gate before enabling the expensive path.
- Phase 4 is post-launch: Calibration improvements require production data. Configurable threshold adds no v1 value.

### Research Flags

Phases needing no additional research (patterns are fully documented):
- **Phase 1:** TED API is live-tested, Railway docs are official, SQLite WAL patterns are deterministic
- **Phase 2:** Nodemailer Gmail App Password pattern is well-documented; HTML email design is straightforward
- **Phase 3:** Anthropic SDK integration is HIGH confidence from Context7; Ausschreibungsskill interface is known internally

Phases that may need scoping during planning:
- **Phase 3:** Confirm the exact interface contract of the existing `ausschreibung-workspace/` skill before designing the Analyser component. Its input format, output format, and any network calls it makes affect the Analyser implementation and cost estimate.
- **Phase 4:** CPV boundary code selection (R&D, education, environmental) benefits from 4 weeks of real data before finalizing. Do not over-invest in these during Phase 1.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | TED API live-tested 2026-05-04; all package versions verified via `npm view`; Railway config from official docs via Context7 |
| Features | MEDIUM-HIGH | TED API filter fields HIGH; competitor feature set MEDIUM (training data only, no live research); email digest recommendations MEDIUM |
| Architecture | HIGH | Railway cron behavior from official docs; better-sqlite3 WAL from official benchmarks; Anthropic SDK from Context7; pipeline patterns well-established |
| Pitfalls | HIGH (LLM/SQLite/Gmail) / MEDIUM (TED behavior) | LLM pipeline and SQLite patterns are deterministic; exact TED API v3 field names and Railway timeout limits need verification against current docs |

**Overall confidence:** HIGH for Phase 1 and Phase 2. The architecture is solid and the critical decisions are well-supported. Phase 3 depends on the Ausschreibungsskill interface contract which was not researched here.

### Gaps to Address

- **Ausschreibungsskill interface:** The existing `ausschreibung-workspace/` skill is referenced as the Phase 3 engine but its input/output contract is not defined in any research file. Must be read and understood before building the Analyser component.
- **Railway timeout limits:** PITFALLS.md notes ~15 minutes for hobby-tier cron jobs but flags this as needing verification. Confirm at https://docs.railway.com/reference/cron-jobs before Phase 1 deployment.
- **TED API v3 exact field names:** STACK.md empirically verified the core fields (`ND`, `PD`, `TI`, `PC`, `CY`), but the full field list should be cross-checked at https://api.ted.europa.eu/swagger-ui/ before writing the Zod schema.
- **CPV boundary code effectiveness:** The extended CPV list (73100000 R&D, 72212000 software, 80xxx education) is recommended but its signal-to-noise ratio for Figures is unverified. Budget 4 weeks of production data to audit before Phase 4 pruning.

## Sources

### Primary (HIGH confidence — live-tested or official docs)
- TED API v3: Live-tested at `https://api.ted.europa.eu/v3/notices/search` (2026-05-04) — response shape, auth model, pagination, field names
- Context7 `/railwayapp/docs` — cron scheduling, volume mounts, execution model
- Context7 `/anthropics/anthropic-sdk-typescript` — SDK error handling, retry config, model IDs
- Context7 `/nodemailer/nodemailer-homepage` — Gmail App Password SMTP config
- Context7 `/wiselibs/better-sqlite3` — WAL mode, synchronous API, performance characteristics

### Secondary (MEDIUM confidence — training knowledge, stable standards)
- EU CPV taxonomy (2008 base, 2023 revisions) — CPV code families for design/comms agencies
- TED eForms standard (mandatory from October 2023) — notice structure, field availability
- Gmail SMTP limits and App Password behavior — stable, well-documented
- Competitor feature sets (DTAD, TenderScout, Evados) — training data from marketing materials and Capterra/G2 reviews

### Tertiary (LOW confidence — needs implementation-time validation)
- Railway hobby-tier cron timeout limits — change with tier pricing; verify before deployment
- CPV boundary codes (73100000, 72212000, 80xxx) for Figures' niche — needs production data to validate signal quality

---
*Research completed: 2026-05-04*
*Ready for roadmap: yes*
