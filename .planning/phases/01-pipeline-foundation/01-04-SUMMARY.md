---
phase: 01-pipeline-foundation
plan: "04"
subsystem: filter-runner
tags: [filter, runner, tdd, pipeline, job-lock]
dependency_graph:
  requires: ["01-02", "01-03"]
  provides: ["applyHardFilters", "runner-entry-point"]
  affects: []
tech_stack:
  added: []
  patterns: [tdd-red-green, pure-function-filter, job-lock-mutex, wal-close-before-exit]
key_files:
  created:
    - src/filter/index.ts
    - src/filter/index.test.ts
    - src/runner.ts
  modified: []
decisions:
  - "No budget filter in Phase 1 (D-03) — Haiku decides relevance in Phase 2"
  - "No deadline field → KEEP (RESEARCH.md Pattern 6: no silent drop)"
  - "top-level RawNotice import in runner.ts (not inline) — cleaner TypeScript"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-07"
  tasks_completed: 2
  files_created: 3
---

# Phase 1 Plan 04: Hard Filters + Pipeline Runner Summary

**One-liner:** TDD-built `applyHardFilters()` (notice type + deadline) wired into `runner.ts` — a job-locked pipeline entry point that paginated 540 TED notices, kept 305 bidding opportunities, and exited 0.

## What Was Built

### Task 1 (TDD): `src/filter/index.ts` + `src/filter/index.test.ts`

Pure function `applyHardFilters(notices: RawNotice[]): FilterResult` with two filter rules:

1. **Notice type filter** — keeps only `cn-standard`, `cn-social`, `cn-desg` (bidding opportunities). Drops contract awards (`can-*`), prior info notices (`pin-*`), corrigenda (`corr`), and unknown types.
2. **Deadline filter** — drops notices where `deadline-receipt-tender-date-lot[0]` is in the past. If the field is absent or empty, the notice is KEPT (RESEARCH.md Pattern 6: no silent drop).

TDD cycle completed: RED (test commit `2ca35cd`) → GREEN (impl commit `52b9162`).

13 tests pass covering all notice-type cases, deadline cases, and mixed batch partitioning.

### Task 2: `src/runner.ts`

Pipeline entry point (`tsx src/runner.ts`):

1. Opens SQLite DB (exits 2 on `SQLITE_CANTOPEN`)
2. Acquires job lock (exits 1 if concurrent run detected)
3. Detects first run (empty `seen_notices`) → 14-day TED lookback on first run
4. Fetches and paginates TED API to exhaustion
5. Applies `applyHardFilters()`
6. Batch-inserts kept notices via `markNoticeSeen()`
7. Finalizes run record with `totalAvailable` vs `totalFetched` (FETCH-04)
8. Releases lock, closes DB (WAL checkpoint), exits 0

## Dry Run Output

```
[runner] Starting — DB: /tmp/scanner-test.db
[runner] First run: true
[fetcher] Query: (PC=79* OR PC=92* OR PC=73* OR PC=72212000 OR PC=80000000) AND CY=DEU AND PD>=today(-14)
[fetcher] Page 1: fetched 100, running total 100/540
[fetcher] Page 2: fetched 100, running total 200/540
[fetcher] Page 3: fetched 100, running total 300/540
[fetcher] Page 4: fetched 100, running total 400/540
[fetcher] Page 5: fetched 100, running total 500/540
[fetcher] Page 6: fetched 40, running total 540/540
[fetcher] Total fetched: 540 / Total available: 540
[fetcher] New notices (not seen before): 540
[runner] After filters: kept=305, dropped=235
[runner] Drop reasons: {"notice-type":235}
[runner] Stored 305 new notices in seen_notices
[runner] Run complete — available=540 fetched=540 new=540 kept=305 dropped=235
[runner] Exiting with code 0
```

All 235 dropped notices were contract awards or non-bidding types — correct behavior.

## Test Results

```
Test Files: 5 passed
Tests:      39 passed (13 new filter tests + 26 prior)
tsc:        0 errors
```

## Commits

| Hash | Message |
|------|---------|
| `2ca35cd` | test(01-04): add failing tests for applyHardFilters() filter function |
| `52b9162` | feat(01-04): implement applyHardFilters() pure function |
| `bb78b5c` | feat(01-04): pipeline runner — job lock, fetch, filter, store, clean exit |

## Deviations from Plan

None — plan executed exactly as written. Minor deviation: `toNoticeRecord()` uses a top-level `import type { RawNotice }` (not inline `import type` in function signature) for TypeScript cleanliness. Semantically identical.

## Known Stubs

None. All data flows from TED API through filter to DB storage. No placeholder values.

## Threat Flags

None. Mitigations from threat model applied as specified:
- T-04-01: `acquireJobLock` returns false immediately if locked (no blocking wait)
- T-04-02: `parseFloat()` with NaN guard — malformed budget stored as null
- T-04-03/04: Accepted (stdout logging, exit codes expose no secrets)

## Self-Check: PASSED

- src/filter/index.ts: EXISTS
- src/filter/index.test.ts: EXISTS
- src/runner.ts: EXISTS
- Commits 2ca35cd, 52b9162, bb78b5c: ALL VERIFIED IN GIT LOG
