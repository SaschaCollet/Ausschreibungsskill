---
phase: 01-pipeline-foundation
plan: "02"
subsystem: database
tags: [sqlite, wal, dedup, job-lock, run-logging, tdd]
dependency_graph:
  requires: ["01-01"]
  provides: ["src/db/index.ts", "src/db/queries.ts"]
  affects: ["fetcher", "runner"]
tech_stack:
  added: []
  patterns: ["WAL mode SQLite", "INSERT OR IGNORE dedup", "single-row mutex via CHECK constraint", "transaction batch inserts"]
key_files:
  created:
    - src/db/index.ts
    - src/db/index.test.ts
    - src/db/queries.ts
    - src/db/queries.test.ts
  modified: []
decisions:
  - "WAL test uses temp file DB because SQLite silently ignores WAL pragma on :memory: (returns 'memory' journal mode)"
  - "markNoticeSeen uses named @param syntax (not positional ?) for readability and T-02-01 SQL injection mitigation"
  - "job_lock uses CHECK(id=1) constraint as mutex — single row enforces single concurrent runner"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-07"
  tasks_completed: 2
  tests_added: 15
---

# Phase 1 Plan 02: SQLite Persistence Layer Summary

SQLite persistence layer with WAL mode, idempotent schema migration, dedup via INSERT OR IGNORE, job-lock mutex using CHECK(id=1) constraint, and run logging with totalAvailable vs. totalFetched audit columns.

## What Was Built

**Task 1 — DB factory (`src/db/index.ts`)**

`openDb(dbPath)` opens a SQLite connection, sets WAL + NORMAL synchronous mode, and runs `CREATE TABLE IF NOT EXISTS` for three tables in one idempotent call:

- `seen_notices`: dedup store keyed by TED notice ND number
- `runs`: run audit log with query window, fetched counts, error field
- `job_lock`: single-row mutex table (`CHECK (id = 1)`) for cron safety

**Task 2 — Query functions (`src/db/queries.ts`)**

Six exported functions covering all DB operations:

| Function | Purpose |
|---|---|
| `isNoticeNew(db, nd)` | Check if ND not yet in seen_notices |
| `markNoticeSeen(db, notices[])` | Batch INSERT OR IGNORE with named params |
| `acquireJobLock(db)` | Try to insert lock row, return bool |
| `releaseJobLock(db)` | DELETE lock row |
| `createRun(db, from, to)` | Create run record, return lastInsertRowid |
| `finalizeRun(db, id, stats)` | UPDATE run with fetched counts + error |

## Test Results

```
Test Files  2 passed (2)
Tests       15 passed (15)
  - src/db/index.test.ts  6 tests (openDb behavior + schema + idempotency)
  - src/db/queries.test.ts  9 tests (dedup, job_lock, run logging)
TypeScript  PASS (npx tsc --noEmit)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WAL journal mode test adapted for SQLite in-memory limitation**
- **Found during:** Task 1 GREEN phase
- **Issue:** `PRAGMA journal_mode` returns `'memory'` for `:memory:` databases — SQLite silently ignores WAL mode on in-memory DBs. The plan's test expected `'wal'`.
- **Fix:** WAL test now opens a temp file DB (`mkdtemp`), verifies WAL mode, then cleans up. This correctly validates the behavior that matters in production (file-based Railway Volume DB).
- **Files modified:** `src/db/index.test.ts`
- **Commit:** caf3ca4

## Security Verification (Threat Model)

- **T-02-01** (SQL injection via markNoticeSeen): All inserts use named `@param` parameters. No string interpolation in any query. Grep confirmed.
- **T-02-02** (DoS via concurrent jobs): `CHECK (id = 1)` on job_lock + INSERT exception handling prevents two processes from running simultaneously. Test: `acquireJobLock returns false when lock already held`.
- **T-02-03** (error column disclosure): Accepted — internal tool, no external exposure.

## Commits

| Hash | Task | Description |
|---|---|---|
| caf3ca4 | Task 1 | feat(01-02): DB factory openDb with WAL mode and schema migration |
| 2cf420a | Task 2 | feat(01-02): query functions for dedup, job-lock and run logging |

## Self-Check

- [x] `src/db/index.ts` exists
- [x] `src/db/index.test.ts` exists
- [x] `src/db/queries.ts` exists
- [x] `src/db/queries.test.ts` exists
- [x] Commit caf3ca4 exists
- [x] Commit 2cf420a exists
- [x] 15/15 tests pass
- [x] `npx tsc --noEmit` exits 0

## Self-Check: PASSED
