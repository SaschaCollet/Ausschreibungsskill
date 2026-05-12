---
phase: 03-full-analysis-integration
plan: 02
subsystem: analysis
tags: [anthropic-sdk, sonnet, ted-api, zod, sqlite, analysis]
dependency_graph:
  requires: [03-01]
  provides: [analyzeNotices, AnalysisOutput, AnalysisStats, ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt]
  affects: [03-03]
tech_stack:
  added: [claude-sonnet-4-6]
  patterns: [sequential-for-of, error-isolation, zod-validation, module-level-readFileSync]
key_files:
  created:
    - src/analysis/index.ts
    - src/analysis/prompt.ts
    - src/analysis/config/figures-config.md
    - src/analysis/config/portfolio.md
  modified: []
decisions:
  - "Sequential for-of loop (no Promise.allSettled) prevents concurrent Sonnet calls — rate-limit safety"
  - "ANALYSIS_CAP=5 hard-coded constant (not env var) — consistent with plan spec"
  - "FullNoticeResponseSchema is standalone Zod schema — does not extend RawNoticeSchema"
  - "apiKey passed to Anthropic constructor only — never in console.log or console.warn (T-02-02-B)"
  - "readFileSync at module load (not per-call) — config files embedded once at startup"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 3 Plan 02: Full Analysis Module Summary

**One-liner:** Sonnet analysis module with TED full-description fetch, sequential for-of loop, hard cap of 5/day, Zod-validated TED response, and DB persistence via saveAnalysis/updateRunSonnetStats.

## What Was Built

### Task 1: Config files + prompt.ts

**src/analysis/config/figures-config.md** — Copied verbatim from `ausschreibung-workspace/skill-snapshot-iter1/config/figures-config.md` (114 lines). Contains Figures eGbR profile, team bios, day rates, and exclusion criteria.

**src/analysis/config/portfolio.md** — Copied verbatim from `ausschreibung-workspace/skill-snapshot-iter1/references/portfolio.md` (182 lines). Contains 19 portfolio projects with type, theme, services, and references.

**src/analysis/prompt.ts** — Exports:
- `ANALYSIS_SYSTEM_PROMPT`: Template string embedding both config files via `readFileSync` at module load. Contains the three analysis section instructions (01 Zusammenfassung, 02 Fit-Bewertung, 03 Checkliste).
- `buildAnalysisPrompt(nd, title, descriptionLot, descriptionProc)`: Builds the per-notice user prompt with TED description fields.

### Task 2: src/analysis/index.ts

Exports `analyzeNotices(tierANotices, apiKey, runId, db)` which:
1. Sorts input by score descending, slices to ANALYSIS_CAP=5, collects `skippedNds`
2. For each notice in the top slice (sequential for-of):
   - Calls `fetchFullDescription(nd)` — TED POST search with `ND={nd}` and description fields
   - Parses TED response with `FullNoticeResponseSchema` (Zod) before field access
   - Calls `client.messages.create` with `claude-sonnet-4-6`, no tools (free-form Markdown)
   - Accumulates token counts; calls `saveAnalysis()` on success
   - Error isolation: one failure pushes `analysisOk: false` and continues
3. Calculates cost at $3/MTok input + $15/MTok output
4. Calls `updateRunSonnetStats()` once with accumulated totals
5. Returns `AnalysisOutput { records, stats, skippedNds }`

## Test Results

Wave 0 RED tests from Plan 03-01 (`src/analysis/index.test.ts`) — all 6 tests now GREEN:

| Test | Result |
|------|--------|
| ANALYSIS-01: calls create once per notice | PASS |
| ANALYSIS-01: returns analysisOk=true on success | PASS |
| ANALYSIS-02: hard cap — 5 notices analyzed when exactly 5 | PASS |
| ANALYSIS-02: skippedNds when > 5 notices | PASS |
| ANALYSIS-02: highest-scoring analyzed first | PASS |
| ANALYSIS-01: error isolation — loop continues after single failure | PASS |

Pre-existing Wave 0 RED tests for Plan 03-03 (`smtp.test.ts`, `digest.test.ts`) remain RED as expected — they test functionality not yet implemented.

**Full suite:** 73 tests passing, 3 RED (all 03-03 scope).

## Deviations from Plan

None — plan executed exactly as written. The implementation code in the plan was used verbatim with one minor simplification: the `const title = notice.rationale ? ...` conditional was replaced by directly using `nd` as the title fallback (since `TriageRecord` does not have a `title` field). The `buildAnalysisPrompt` call still passes `nd` as the title parameter as the plan specified.

## Threat Flags

None. All threat mitigations from the threat register are implemented:
- T-03-02-01: `FullNoticeResponseSchema.parse()` validates TED response before field access
- T-03-02-03: `apiKey` only in `new Anthropic({ apiKey })` — not in any console output

## Self-Check: PASSED

- src/analysis/index.ts: FOUND
- src/analysis/prompt.ts: FOUND
- src/analysis/config/figures-config.md: FOUND (114 lines)
- src/analysis/config/portfolio.md: FOUND (182 lines)
- npm test -- src/analysis/index.test.ts: 6/6 PASSED
