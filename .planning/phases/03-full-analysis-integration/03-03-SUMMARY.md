---
phase: 03-full-analysis-integration
plan: 03
subsystem: email-runner
tags: [email, smtp, digest, runner, analysis, attachments]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [full-pipeline-with-analysis]
  affects: [src/email/smtp.ts, src/email/digest.ts, src/runner.ts]
tech_stack:
  added: []
  patterns: [optional-parameter-spread, analysisMap-pass-through, buffer-attachment]
key_files:
  modified:
    - src/email/smtp.ts
    - src/email/digest.ts
    - src/runner.ts
decisions:
  - "D-07: .md attachment per analysis via Buffer.from(analysisText, utf-8) with content_type: text/markdown"
  - "D-08: Tier-A badge is small <p> element only — no inline analysis text in digest HTML"
  - "D-09: Hard cap enforced inside analyzeNotices(); runner passes all Tier-A, module slices top 5"
  - "runner.ts updateRunSonnetStats skipped if analysisOutput is null (no Tier-A notices)"
metrics:
  duration: ~5 minutes
  completed: 2026-05-11
  tasks_completed: 2
  files_modified: 3
---

# Phase 3 Plan 3: Email and Runner Integration Summary

**One-liner:** Extended smtp.ts with AnalysisAttachment + optional attachments parameter, digest.ts with Tier-A badge and Tageslimit note, and wired analyzeNotices() into runner.ts between saveTriageResults() and buildDigest().

## What Was Built

### Task 1: smtp.ts and digest.ts extensions

**src/email/smtp.ts:**
- Added `AnalysisAttachment` interface (filename, content: Buffer, content_type)
- Extended `sendDigestEmail()` with optional third parameter `attachments?: AnalysisAttachment[]`
- Resend call uses spread pattern: attachments passed only when array is non-empty

**src/email/digest.ts:**
- Extended `renderNoticeCard()` with `hasAnalysis: boolean` and `analysisSkipped: boolean` parameters (both default false for backward compat)
- Badge logic: "Vollanalyse angehangen" when hasAnalysis=true; "Analyse aufgrund des Tageslimits nicht erstellt" when analysisSkipped=true; no badge otherwise
- Extended `renderTierSection()` with optional `analysisMap?: Map<string, boolean>` and `skippedNds?: string[]` parameters
- Extended `buildDigest()` signature with same two optional parameters; passed to Tier-A section only (Tier-B never gets analysis per D-09)

### Task 2: runner.ts pipeline wiring

- Added imports: `updateRunSonnetStats` from db/queries, `analyzeNotices` and `type AnalysisOutput` from analysis/index
- Inserted analysis phase between `saveTriageResults()` and `buildDigest()`: filters Tier-A notices (score >= 7), passes to `analyzeNotices()`, logs ok/failed/skipped counts
- Extended `buildDigest()` call: builds `analysisMap` from successful analysis records, passes `skippedNds` from `analysisOutput`
- Extended `sendDigestEmail()` call: maps successful analysis records to Buffer attachments with filename `{nd}-analyse.md`
- Added `updateRunSonnetStats()` call guarded by `if (analysisOutput)` null check
- Extended final summary log to include `analysed=` and `cost_sonnet=` fields

## Test Results

All 76 tests pass across 9 test files. The 3 Wave 0 RED stubs turned GREEN:
- `smtp.test.ts`: "ANALYSIS-03: passes attachments array to resend.emails.send when provided"
- `smtp.test.ts`: "ANALYSIS-03: does not include attachments key when attachments array is empty"
- `digest.test.ts`: "ANALYSIS-03: Tier-A card contains Vollanalyse angehangen badge when hasAnalysis=true"
- `digest.test.ts`: "ANALYSIS-03: Tier-A card shows Tageslimit note when analysisSkipped=true"
- `digest.test.ts`: "ANALYSIS-03: Tier-A card shows no badge when hasAnalysis=false and not skipped"

## Deviations from Plan

None — plan executed exactly as written.

The plan's acceptance criterion for `grep -c "AnalysisAttachment" src/email/smtp.ts` states "outputs 1 (interface defined)". The actual count is 2 (interface definition on line 9 + usage in function parameter on line 18). This is correct behavior — both definition and usage are present. All tests pass.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced beyond what the plan's threat model covers. The `anthropicApiKey` is passed to `analyzeNotices()` as a function argument and never appears in any console.log (T-03-03-01 mitigated as planned).

## Self-Check: PASSED

- src/email/smtp.ts exists and exports AnalysisAttachment
- src/email/digest.ts exists with Vollanalyse badge and Tageslimit note
- src/runner.ts wires analyzeNotices() between saveTriageResults() and buildDigest()
- npm test: 76/76 tests passing
- npx tsc --noEmit: exits 0 (no TypeScript errors)
