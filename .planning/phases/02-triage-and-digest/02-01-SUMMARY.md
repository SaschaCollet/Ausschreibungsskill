---
phase: 02-triage-and-digest
plan: 01
subsystem: database
tags: [schema, migration, config, triage]
dependency_graph:
  requires: []
  provides: [triage_results-table, TriageRecord-interface, saveTriageResults, updateRunTriageStats, validated-AppConfig]
  affects: [src/db/index.ts, src/db/queries.ts, src/config.ts]
tech_stack:
  added: []
  patterns: [idempotent-schema-migration, ALTER-TABLE-try-catch, parameterized-transaction-insert, fail-fast-config-validation]
key_files:
  created: []
  modified:
    - src/db/index.ts
    - src/db/queries.ts
    - src/config.ts
    - src/config.test.ts
decisions:
  - "Phase 2 env vars (GMAIL_USER, GMAIL_APP_PASSWORD, ANTHROPIC_API_KEY) are now required at startup — getConfig() throws early before any DB or network work"
  - "triage_results table added to openDb() CREATE TABLE IF NOT EXISTS block — idempotent on every startup"
  - "Phase 2 runs columns added via try/catch ALTER TABLE — handles both fresh and existing Railway deployments"
metrics:
  duration: 3 minutes
  completed: 2026-05-07T15:54:12Z
  tasks_completed: 2
  tasks_total: 2
---

# Phase 2 Plan 01: Triage Schema + Config Validation Summary

**One-liner:** SQLite `triage_results` table with 3 indexes, Phase 2 runs-column migration, `saveTriageResults`/`updateRunTriageStats` query functions, and fail-fast `getConfig()` requiring all Phase 2 env vars.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend DB schema and add Phase 2 query functions | 6bab448 | src/db/index.ts, src/db/queries.ts |
| 2 | Harden config validation for Phase 2 required env vars | 6bab448 | src/config.ts, src/config.test.ts |

## What Was Built

### Task 1: DB Schema + Query Functions

`openDb()` now creates `triage_results` in its idempotent `db.exec()` block with columns: `id`, `run_id` (FK → runs), `nd` (FK → seen_notices), `score`, `rationale`, `triage_ok`, `created_at`. Three indexes added: `idx_triage_results_nd`, `idx_triage_results_run`, `idx_triage_results_score`.

After the schema block, five `ALTER TABLE runs ADD COLUMN` statements run wrapped in `try/catch` — handles both fresh DBs and existing Railway deployments where the column already exists.

New exports in `src/db/queries.ts`:
- `TriageRecord` interface (runId, nd, score, rationale, triageOk)
- `saveTriageResults(db, records)` — batch inserts in a transaction using named parameterized statements; `triageOk=false` rows store `score=null`, `rationale=null` (TRIAGE-03 audit trail)
- `updateRunTriageStats(db, runId, stats)` — updates triage_count, triage_ok_count, haiku_input_tokens, haiku_output_tokens, haiku_cost_usd on the matching runs row

### Task 2: Config Validation

`AppConfig` fields `gmailUser`, `gmailAppPassword`, `anthropicApiKey` changed from optional (`string | undefined`) to required (`string`). `getConfig()` now collects all missing var names and throws a single descriptive error listing them — var names only, never values (T-02-01-A threat mitigation).

`src/config.test.ts` updated: all `getConfig()` tests now set the three required vars in `beforeEach` and restore them in `afterEach`. Six new tests added covering: throw on each missing var individually, throw listing all three when all absent, and return of correct field values.

## Verification Results

```
npm run typecheck   -> exit 0 (zero TypeScript errors)
npm test            -> 45 tests passed (39 original + 6 new config tests), 5 test files
```

## Deviations from Plan

None — plan executed exactly as written. The config test update was anticipated by the plan (noted in Task 2 action).

## Known Stubs

None.

## Threat Flags

None — all surfaces are covered by the plan's threat model (T-02-01-A: error message lists var names only; T-02-01-B: parameterized inserts; T-02-01-C: migration runs at startup as process owner).

## Self-Check: PASSED

- src/db/index.ts: FOUND (triage_results table + migration)
- src/db/queries.ts: FOUND (saveTriageResults, updateRunTriageStats, TriageRecord)
- src/config.ts: FOUND (required AppConfig fields, fail-fast getConfig)
- src/config.test.ts: FOUND (Phase 2 env var setup in beforeEach)
- Commit 6bab448: FOUND in git log
- TypeScript: clean (exit 0)
- Tests: 45/45 passed
