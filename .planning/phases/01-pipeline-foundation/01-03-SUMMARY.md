---
phase: 01-pipeline-foundation
plan: "03"
subsystem: fetcher
tags: [ted-api, zod, pagination, dedup, tdd]
dependency_graph:
  requires: ["01-01", "01-02"]
  provides: ["src/fetcher/"]
  affects: []
tech_stack:
  added: []
  patterns: ["Zod boundary validation", "AbortController timeout", "page-based pagination", "vitest mocking"]
key_files:
  created:
    - src/fetcher/types.ts
    - src/fetcher/ted-client.ts
    - src/fetcher/index.ts
    - src/fetcher/index.test.ts
  modified: []
decisions:
  - "Pagination uses page * PAGE_LIMIT >= totalAvailable — not notices.length < limit (Pitfall 2 guard)"
  - "TED URL hardcoded — not env-configurable (T-03-04 spoofing mitigation)"
  - "No notice-type filter in query string — TD=3 returns 0 results with date filter (verified bug)"
metrics:
  duration: "15 minutes"
  completed: "2026-05-07"
  tasks_completed: 2
  files_created: 4
---

# Phase 1 Plan 03: TED API Client with Pagination Summary

TED API client module with Zod response validation, 3-attempt exponential-backoff HTTP layer, and page-based exhaustive pagination loop with per-notice dedup filtering.

## What Was Built

**src/fetcher/types.ts** — Zod schemas for `RawNotice` and `TedSearchResponse`, plus `TED_FIELDS` constant. All field names reflect live TED eForms field IDs verified 2026-05-06.

**src/fetcher/ted-client.ts** — `tedFetch()` using Node 22 native fetch with `AbortController` (30s timeout) and exponential backoff (1s, 2s, 4s). URL hardcoded to `https://api.ted.europa.eu/v3/notices/search` — not configurable via env (T-03-04).

**src/fetcher/index.ts** — `fetchNewNotices(db, isFirstRun)` paginates TED results to exhaustion using `page * PAGE_LIMIT >= totalAvailable` termination (not `notices.length < limit`). First run uses `today(-14)` lookback; daily run uses `today(-2)` with 1-day overlap. All queries include `CY=DEU`. Dedup via `isNoticeNew()` filters already-seen notices before returning.

**src/fetcher/index.test.ts** — 7 unit tests using vitest mock of `tedFetch`. No real HTTP calls.

## TDD Gate Compliance

- RED commit: `b2d02f7` — `test(01-03): add failing tests for fetchNewNotices() pagination and dedup`
- GREEN commit: `1e244f2` — `feat(01-03): implement fetchNewNotices() with pagination and dedup`
- Tests: 7 passed, 0 failed

## Deviations from Plan

None — plan executed exactly as written.

## Threat Coverage

All T-03-xx mitigations applied:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-03-01 | `TedSearchResponseSchema.parse(raw)` throws `ZodError` on malformed TED response |
| T-03-02 | `page * PAGE_LIMIT >= totalAvailable` terminates loop; AbortController kills hung requests |
| T-03-03 | Console logs contain only CPV codes — no secrets |
| T-03-04 | `TED_API_URL` hardcoded — not configurable via env |

## Known Stubs

None.

## Self-Check: PASSED

All created files exist:
- src/fetcher/types.ts: FOUND
- src/fetcher/ted-client.ts: FOUND
- src/fetcher/index.ts: FOUND
- src/fetcher/index.test.ts: FOUND

All commits exist:
- d7a80da (Task 1 — types + HTTP client): FOUND
- b2d02f7 (RED — failing tests): FOUND
- 1e244f2 (GREEN — implementation): FOUND
