---
phase: 3
slug: full-analysis-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^2 |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | ANALYSIS-03 | T-02-01 | Named params in saveAnalysis() INSERT | unit | `npm test -- src/db/queries.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | ANALYSIS-03 | T-02-01 | Named params in updateRunSonnetStats() UPDATE | unit | `npm test -- src/db/queries.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | ANALYSIS-01 | — | analyzeNotices() calls Anthropic for Tier-A notices | unit | `npm test -- src/analysis/index.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | ANALYSIS-01 | — | Prompt contains figures-config and portfolio text | unit | `npm test -- src/analysis/index.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | ANALYSIS-02 | — | Hard cap: only top 5 by score analyzed | unit | `npm test -- src/analysis/index.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-04 | 02 | 1 | ANALYSIS-02 | — | Skipped notices identified, passed to digest | unit | `npm test -- src/analysis/index.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | ANALYSIS-03 | — | sendDigestEmail() passes attachments array to Resend | unit | `npm test -- src/email/smtp.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | ANALYSIS-03 | — | Tier-A card renders badge when hasAnalysis=true | unit | `npm test -- src/email/digest.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-03 | 03 | 2 | ANALYSIS-03 | — | Digest shows "Tageslimit" note for uncapped notices | unit | `npm test -- src/email/digest.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/analysis/index.test.ts` — new test file; stubs for ANALYSIS-01 and ANALYSIS-02 (mock Anthropic SDK using same `vi.mock('@anthropic-ai/sdk')` pattern as triage test)
- [ ] Extend `src/db/queries.test.ts` — add tests for `saveAnalysis()` and `updateRunSonnetStats()` using `:memory:` DB (ANALYSIS-03 DB queries)
- [ ] Extend `src/email/smtp.test.ts` — add test for attachment parameter passthrough (ANALYSIS-03)
- [ ] Extend `src/email/digest.test.ts` — add tests for `hasAnalysis` badge and skipped-notice "Tageslimit" note rendering (ANALYSIS-03)

*Existing infrastructure: vitest.config.ts present, vi.mock patterns established in triage and smtp tests — no framework setup needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| .md attachment opens and contains all 3 sections (Zusammenfassung, Fit-Bewertung, Checkliste) | ANALYSIS-01 | Requires live Sonnet API call + real TED notice + email receipt | Run `railway run sh -c 'DB_PATH=/tmp/t.db npx tsx src/runner.ts'` and check email attachment |
| TED Full Notice text actually appears in Sonnet prompt (description-lot populated) | ANALYSIS-01 | Depends on live TED API response for a specific notice | Check console log `[analysis] nd=... chars_description=N` to confirm > 0 chars |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
