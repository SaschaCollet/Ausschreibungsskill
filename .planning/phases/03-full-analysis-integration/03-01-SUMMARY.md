---
phase: 03-full-analysis-integration
plan: 01
subsystem: db + test-stubs
tags: [sqlite, migration, tdd, wave-0, analysis]
dependency_graph:
  requires: []
  provides: [analyses-table, phase3-runs-columns, saveAnalysis, updateRunSonnetStats, wave0-test-stubs]
  affects: [src/db/index.ts, src/db/queries.ts, src/analysis/index.test.ts, src/email/smtp.test.ts, src/email/digest.test.ts]
tech_stack:
  added: []
  patterns: [named-parameter-sql, idempotent-alter-table-migration, vitest-wave0-red-stubs]
key_files:
  created:
    - src/analysis/index.test.ts
  modified:
    - src/db/index.ts
    - src/db/queries.ts
    - src/db/queries.test.ts
    - src/email/smtp.test.ts
    - src/email/digest.test.ts
decisions:
  - "Named parameter INSERT (@nd, @runId, @analysisText, @createdAt) for saveAnalysis() — T-03-01-01 SQL injection mitigation"
  - "Positional UPDATE for updateRunSonnetStats() with Number(runId) cast — T-03-01-02 mitigation"
  - "Wave 0 RED stubs reference not-yet-existing modules (analysis/index.ts, extended smtp/digest) — expected import-error failures until Plans 03-02 and 03-03"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-11"
  tasks_completed: 2
  files_modified: 5
---

# Phase 3 Plan 01: DB Schema Migration + Wave 0 Test Stubs Summary

**One-liner:** SQLite analyses table, 4 new runs columns, saveAnalysis()/updateRunSonnetStats() query functions, and Wave 0 RED test stubs covering ANALYSIS-01, ANALYSIS-02, ANALYSIS-03.

## What Was Done

### Task 1: DB Schema Migration + Query Functions

**src/db/index.ts** — Added:
- `analyses` table (`id`, `nd REFERENCES seen_notices(nd)`, `run_id REFERENCES runs(id)`, `analysis_text`, `created_at`) inside the existing `db.exec()` block
- Two indexes: `idx_analyses_nd` and `idx_analyses_run`
- `phase3Cols` migration block (try/catch ALTER TABLE pattern) for 4 new `runs` columns: `analysis_count INTEGER`, `sonnet_input_tokens INTEGER`, `sonnet_output_tokens INTEGER`, `sonnet_cost_usd REAL`

**src/db/queries.ts** — Appended Phase 3 section:
- `AnalysisRecord` interface: `{ runId, nd, analysisText: string | null, analysisOk: boolean }`
- `saveAnalysis(db, nd, runId, analysisText)` — named-parameter INSERT into `analyses` table
- `updateRunSonnetStats(db, runId, stats)` — positional UPDATE on `runs` with Sonnet token stats

### Task 2: Wave 0 Test Stubs

**src/db/queries.test.ts** — Extended with 3 new tests:
- `Phase 3: saveAnalysis` — 2 tests: row retrieval by nd, SQL injection safety with special chars
- `Phase 3: updateRunSonnetStats` — 1 test: analysis_count, token fields, cost_usd all set correctly
- Result: 12/12 tests GREEN

**src/analysis/index.test.ts** (new file) — 6 RED stub tests for ANALYSIS-01 and ANALYSIS-02:
- `client.messages.create` called once per notice
- `analysisOk=true` when Sonnet returns text
- Hard cap: exactly 5 notices → 5 calls, 0 skipped
- Cap enforcement: 6 notices → 5 calls, skippedNds contains the 6th ND
- Score ordering: highest-scoring notice always in analyzed set
- Error isolation: single notice failure does not abort loop
- Status: FAILS with import error (expected RED — `src/analysis/index.ts` created in Plan 03-02)

**src/email/smtp.test.ts** — Extended with 2 RED stub tests for ANALYSIS-03:
- Attachments array passes through to `resend.emails.send` when provided
- Attachments key absent when array is empty
- Status: 1 test FAILS (expected RED — `sendDigestEmail` extended in Plan 03-03)

**src/email/digest.test.ts** — Extended with 3 RED stub tests for ANALYSIS-03:
- Tier-A card contains "Vollanalyse angehangen" badge when `hasAnalysis=true`
- Tier-A card shows "Tageslimit" note when `analysisSkipped=true`
- No badge when neither `hasAnalysis` nor `analysisSkipped`
- Status: 2 tests FAIL (expected RED — `buildDigest` extended in Plan 03-03)

## Test Summary

| File | Tests | Status |
|------|-------|--------|
| src/db/queries.test.ts | 12/12 | GREEN |
| src/analysis/index.test.ts | 0/6 | RED (import error — expected) |
| src/email/smtp.test.ts | 5/6 | 1 RED (expected — sendDigestEmail not extended) |
| src/email/digest.test.ts | 10/12 | 2 RED (expected — buildDigest not extended) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan creates stubs intentionally as Wave 0 RED tests. The stubs reference:
- `src/analysis/index.ts` — to be created in Plan 03-02
- Extended `sendDigestEmail(apiKey, payload, attachments?)` signature — to be implemented in Plan 03-03
- Extended `buildDigest(..., analysisMap, skippedNds)` signature — to be implemented in Plan 03-03

## Threat Flags

None — no new network endpoints or auth paths introduced. SQL injection mitigations applied as required by threat register T-03-01-01 and T-03-01-02.

## Self-Check: PASSED

All files verified present:
- FOUND: src/db/index.ts
- FOUND: src/db/queries.ts
- FOUND: src/db/queries.test.ts
- FOUND: src/analysis/index.test.ts
- FOUND: src/email/smtp.test.ts
- FOUND: src/email/digest.test.ts
- FOUND: .planning/phases/03-full-analysis-integration/03-01-SUMMARY.md

DB tests: 12/12 GREEN. Wave 0 RED stubs confirmed failing for not-yet-implemented modules (expected).
