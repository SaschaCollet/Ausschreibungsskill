import type Database from 'better-sqlite3';
import { buildCpvQueryPart } from '../config.js';
import { isNoticeNew } from '../db/queries.js';
import { tedFetch } from './ted-client.js';
import { TedSearchResponseSchema, TED_FIELDS, type RawNotice } from './types.js';

const PAGE_LIMIT = 100; // max confirmed for TED API v3

export interface FetchResult {
  notices: RawNotice[];
  totalAvailable: number;
  totalFetched: number;
  queryFrom: string;
  queryTo: string;
}

/**
 * Build the TED expert query string.
 *
 * First run (isFirstRun=true):  PD>=today(-14)               [D-06: 2-week lookback]
 * Daily run (isFirstRun=false): PD>=today(-2) AND PD<=today() [D-07: 1-day overlap, FETCH-03]
 *
 * CRITICAL: Do NOT add notice-type filter to query string.
 * TD=3 returns 0 results with PD date filter (verified bug). Filter in applyHardFilters().
 * CRITICAL: Do NOT use NT field — does not exist in TED query syntax (QUERY_UNKNOWN_FIELD error).
 */
function buildQuery(isFirstRun: boolean): { query: string; from: string; to: string } {
  const cpv = buildCpvQueryPart();

  if (isFirstRun) {
    return {
      query: `${cpv} AND CY=DEU AND PD>=today(-14)`,
      from: 'today(-14)',
      to: 'today()',
    };
  }

  return {
    query: `${cpv} AND CY=DEU AND PD>=today(-2) AND PD<=today()`,
    from: 'today(-2)',
    to: 'today()',
  };
}

/**
 * Fetch all new TED notices, paginating to exhaustion.
 *
 * Pagination uses page * limit vs totalNoticeCount (NOT notices.length < limit).
 * Pitfall 2 in RESEARCH.md: "Using notices.length < limit stops early on heavy-publication days."
 *
 * Returns only notices not already in seen_notices (dedup check per notice).
 */
export async function fetchNewNotices(
  db: Database.Database,
  isFirstRun: boolean
): Promise<FetchResult> {
  const { query, from, to } = buildQuery(isFirstRun);

  const allNotices: RawNotice[] = [];
  let page = 1;
  let totalAvailable = 0;
  let totalFetched = 0;

  console.log(`[fetcher] Query: ${query}`);

  while (true) {
    const body = {
      query,
      page,
      limit: PAGE_LIMIT,
      fields: [...TED_FIELDS],
    };

    const raw = await tedFetch(body);
    const data = TedSearchResponseSchema.parse(raw); // throws on invalid shape (T-03-01)

    allNotices.push(...data.notices);
    totalAvailable = data.totalNoticeCount;
    totalFetched += data.notices.length;

    console.log(
      `[fetcher] Page ${page}: fetched ${data.notices.length}, ` +
      `running total ${totalFetched}/${totalAvailable}`
    );

    // Pagination termination: compare fetched count against total, not page size
    // Pitfall 2 guard: never use `data.notices.length < PAGE_LIMIT` as break condition
    if (page * PAGE_LIMIT >= totalAvailable) break;
    page++;
  }

  console.log(`[fetcher] Total fetched: ${totalFetched} / Total available: ${totalAvailable}`);

  // Dedup: filter out notices already in seen_notices (DEDUP-02)
  const newNotices = allNotices.filter(n => isNoticeNew(db, n.ND));

  console.log(`[fetcher] New notices (not seen before): ${newNotices.length}`);

  return {
    notices: newNotices,
    totalAvailable,
    totalFetched,
    queryFrom: from,
    queryTo: to,
  };
}
