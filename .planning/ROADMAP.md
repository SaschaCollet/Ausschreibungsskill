# Roadmap: Ausschreibungs-Scanner

## Overview

A four-phase build from raw pipeline plumbing to a fully operational, self-tuning tender scanner. Phase 1 lays the data foundation (TED fetch, dedup, hard filters, Railway infra) without touching LLMs. Phase 2 adds Haiku triage and the tiered HTML email digest — the system becomes operational for Figures at this point. Phase 3 integrates the existing Ausschreibungsskill for full Sonnet analysis on top-scored tenders. Phase 4 uses production data to prune CPV codes, refine the triage rubric, and harden operational durability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions added during execution

- [ ] **Phase 1: Pipeline Foundation** - TED fetch, SQLite dedup, hard filters, and Railway cron — no LLM yet
- [ ] **Phase 2: Triage and Digest** - Haiku triage with calibrated rubric and tiered HTML email via Gmail SMTP
- [ ] **Phase 3: Full Analysis Integration** - Sonnet analysis via Ausschreibungsskill for score >= 7, capped at 5/day
- [ ] **Phase 4: Tuning and Hardening** - CPV pruning, prompt refinement, and configurable thresholds from production data

## Phase Details

### Phase 1: Pipeline Foundation
**Goal**: Real TED notices are fetched daily, deduplicated, hard-filtered, and stored in SQLite on Railway — the full data skeleton runs end-to-end with no silent failures
**Depends on**: Nothing (first phase)
**Requirements**: FETCH-01, FETCH-02, FETCH-03, FETCH-04, DEDUP-01, DEDUP-02, DEDUP-03, FILTER-01, FILTER-02, INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Running the cron job fetches all TED pages (paginated to exhaustion) and logs fetched count vs. total count — no silent truncation
  2. A notice processed in a previous run is skipped on the next run without re-fetching or re-processing
  3. A notice with an expired deadline or excluded country is discarded before any LLM call is made
  4. The Railway cron job starts, completes, and exits cleanly; a second concurrent invocation is blocked by the job-lock
**Plans**: TBD

### Phase 2: Triage and Digest
**Goal**: Every surviving notice is scored by Claude Haiku using an agency-calibrated rubric, and a tiered HTML email digest reaches the inbox daily — Figures can use the system from this point
**Depends on**: Phase 1
**Requirements**: TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04, DIGEST-01, DIGEST-02, DIGEST-03, DIGEST-04, DIGEST-05
**Success Criteria** (what must be TRUE):
  1. Each scored notice in the digest shows its score (0-10), 2-sentence rationale, budget, deadline, and a direct TED link
  2. Tier A entries (score >= 7) and Tier B entries (score 4-6) are visually distinct sections in the HTML email; notices scoring < 4 do not appear
  3. On a day with zero qualifying notices, a confirmation email is sent confirming the job ran (no silent failure)
  4. Gmail SMTP authentication is verified at job startup — the job exits before any API work if auth fails
**Plans**: 5 plans
Plans:
- [ ] 02-01-PLAN.md — DB schema migration (triage_results table) + config validation
- [ ] 02-02-PLAN.md — Haiku triage module (prompt, structured output, error isolation, token tracking)
- [ ] 02-03-PLAN.md — Gmail SMTP transport module (createTransport, verifySmtp, sendDigestEmail)
- [ ] 02-04-PLAN.md — HTML digest builder (tier grouping, notice cards, zero-notice confirmation)
- [ ] 02-05-PLAN.md — Runner integration + end-to-end checkpoint
**UI hint**: yes

### Phase 3: Full Analysis Integration
**Goal**: Tier A tenders automatically receive a full Ausschreibungsskill analysis stored and surfaced in the digest, with Sonnet costs hard-capped and logged per run
**Depends on**: Phase 2
**Requirements**: ANALYSIS-01, ANALYSIS-02, ANALYSIS-03
**Success Criteria** (what must be TRUE):
  1. Every digest entry with score >= 7 includes a link to or attachment of the full Sonnet analysis output
  2. On any day with more than 5 tenders scoring >= 7, exactly 5 analyses run (highest-scoring first) and the remainder are noted in the digest
  3. Each run log records Haiku token usage and Sonnet token usage separately, enabling cost tracking
**Plans**: 3 plans
Plans:
- [ ] 03-01-PLAN.md — DB schema migration (analyses table + runs Phase 3 columns) + Wave 0 test stubs
- [ ] 03-02-PLAN.md — Analysis module (src/analysis/index.ts, prompt.ts, config files) — ANALYSIS-01, ANALYSIS-02
- [ ] 03-03-PLAN.md — Email integration (smtp.ts attachments + digest.ts badge + runner.ts pipeline wiring) — ANALYSIS-03

### Phase 4: Tuning and Hardening
**Goal**: After 4+ weeks of production data, CPV codes, score thresholds, and prompt wording are refined based on observed signal quality — the system is demonstrably more precise than at Phase 3 launch
**Depends on**: Phase 3
**Requirements**: (No new v1 requirements — iterates on FETCH-01, FILTER-01, FILTER-02, TRIAGE-01, TRIAGE-02 using production evidence)
**Success Criteria** (what must be TRUE):
  1. Score distribution data from the SQLite runs table is reviewed and at least one CPV code is added or removed based on observed false-positive or false-negative patterns
  2. The triage rubric prompt has been updated at least once based on production score drift (documented in PROJECT.md Key Decisions)
  3. The score threshold for full analysis is configurable via environment variable without a code change
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pipeline Foundation | 0/? | Not started | - |
| 2. Triage and Digest | 0/5 | Planned | - |
| 3. Full Analysis Integration | 0/3 | Planned | - |
| 4. Tuning and Hardening | 0/? | Not started | - |
