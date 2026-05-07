import type { RawNotice } from '../fetcher/types.js';

/** Notice types that represent bidding opportunities (not awards, not PIN, not corrigenda) */
const BIDDING_NOTICE_TYPES = new Set(['cn-standard', 'cn-social', 'cn-desg']);

export interface FilterResult {
  kept: RawNotice[];
  dropped: { notice: RawNotice; reason: string }[];
}

/**
 * Apply hard pre-LLM filters to a batch of raw TED notices.
 *
 * Pure function — no DB access, no async, no side effects.
 * Safe to call with an empty array.
 *
 * Rules (in order):
 *   1. Notice type MUST be in BIDDING_NOTICE_TYPES (cn-standard, cn-social, cn-desg).
 *      Drops: can-* (contract awards), pin-* (prior info notices), corr (corrigenda).
 *      Source: RESEARCH.md Pattern 6 — filter in application code, NOT in TED query string.
 *
 *   2. Deadline (deadline-receipt-tender-date-lot[0]) MUST be in the future (D-05, FILTER-01).
 *      Exception: if the field is absent or empty array — KEEP (no silent drop).
 *      Field format: "2026-02-05+01:00" (ISO 8601 with timezone offset).
 *
 *   3. No budget filter (D-03: Haiku decides relevance in Phase 2).
 *   4. Country filter was applied at TED query level (CY=DEU) — not re-checked here.
 */
export function applyHardFilters(notices: RawNotice[]): FilterResult {
  const now = new Date();
  const kept: RawNotice[] = [];
  const dropped: { notice: RawNotice; reason: string }[] = [];

  for (const notice of notices) {
    // Rule 1: Notice type check
    const noticeType = notice['notice-type'];
    if (!noticeType || !BIDDING_NOTICE_TYPES.has(noticeType)) {
      dropped.push({
        notice,
        reason: `notice-type: ${noticeType ?? 'missing'} not a bidding opportunity`,
      });
      continue;
    }

    // Rule 2: Deadline check
    const deadlines = notice['deadline-receipt-tender-date-lot'];
    if (deadlines && deadlines.length > 0) {
      const deadline = new Date(deadlines[0]);
      if (deadline < now) {
        dropped.push({
          notice,
          reason: `deadline expired: ${deadlines[0]}`,
        });
        continue;
      }
    }
    // No deadline field or empty array → keep (no silent drop per RESEARCH.md Pattern 6)

    kept.push(notice);
  }

  return { kept, dropped };
}
