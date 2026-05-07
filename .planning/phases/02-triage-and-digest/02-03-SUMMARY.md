---
phase: 02-triage-and-digest
plan: "03"
subsystem: email
tags: [smtp, nodemailer, gmail, vitest, mocking]
dependency_graph:
  requires: ["02-01"]
  provides: ["src/email/smtp.ts — createGmailTransport, verifySmtp, sendDigestEmail"]
  affects: ["02-04", "02-05"]
tech_stack:
  added: []
  patterns: ["vi.hoisted for mock variables in vitest", "service:gmail shorthand (auto TLS port 465)"]
key_files:
  created:
    - src/email/smtp.ts
    - src/email/smtp.test.ts
  modified: []
decisions:
  - "Used vi.hoisted() instead of top-level const mocks — required because vi.mock factory is hoisted before variable initializers run"
  - "verifySmtp() takes GmailTransporter parameter (not raw credentials) — cleaner separation, lets runner.ts create one transporter and reuse"
  - "Recipient hardcoded to sascha.collet@gmail.com — single-user internal tool, not configurable"
metrics:
  duration: "5 minutes"
  completed: "2026-05-07"
  tasks_completed: 1
  files_created: 2
---

# Phase 2 Plan 03: Gmail SMTP Transport Summary

Gmail SMTP transport module using nodemailer service:gmail shorthand with vi.hoisted mocked tests — 4 tests pass, no real SMTP connections.

## What Was Built

`src/email/smtp.ts` provides three exports consumed by plans 04 and 05:

- `createGmailTransport(user, appPassword)` — returns a nodemailer Transporter configured with `service: 'gmail'` (auto-resolves smtp.gmail.com:465 with TLS)
- `verifySmtp(transporter)` — awaits `transporter.verify()`, propagates any error to caller (DIGEST-05 startup gate: runner.ts exits process before DB opens if this throws)
- `sendDigestEmail(transporter, config, payload)` — sends to hardcoded `sascha.collet@gmail.com` with from set to authenticated gmailUser

`src/email/smtp.test.ts` tests all three functions with fully mocked nodemailer — no network calls during test runs.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Implement SMTP module and tests | c40f178 | Done |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.hoisted required for mock variable access in vi.mock factory**

- **Found during:** Task 1 (first test run)
- **Issue:** The plan's test code used top-level `const mockVerify = vi.fn()` before `vi.mock(...)`. Vitest hoists `vi.mock` factories to the top of the file, so those variables are not yet initialized when the factory runs — `ReferenceError: Cannot access 'mockCreateTransport' before initialization`
- **Fix:** Wrapped mock variable definitions in `vi.hoisted(() => {...})` which runs synchronously before the mock factory, making variables available
- **Files modified:** `src/email/smtp.test.ts`
- **Commit:** c40f178 (same commit — fixed during implementation)

## Known Stubs

None — no placeholder data or TODOs that affect runtime behavior.

## Threat Surface Scan

No new network endpoints or auth paths beyond what the plan's threat model covers. The `sascha.collet@gmail.com` recipient hardcoding is intentional and documented in the plan.

## Self-Check

- [x] `src/email/smtp.ts` exists and exports all required symbols
- [x] `src/email/smtp.test.ts` exists with 4 passing tests
- [x] Commit `c40f178` exists in git log
- [x] `service: 'gmail'` used (not explicit host/port)
- [x] `verifySmtp` has no catch block — errors propagate
- [x] Recipient hardcoded to `sascha.collet@gmail.com`
- [x] TypeScript clean for email module (pre-existing triage error in 02-02 is out of scope)
