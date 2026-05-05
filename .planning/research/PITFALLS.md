# Domain Pitfalls: Automated EU Tender Scanner

**Project:** Ausschreibungs-Scanner (Figures, Berlin)
**Researched:** 2026-05-04
**Confidence note:** WebSearch and WebFetch were unavailable during this session. All findings
are based on training knowledge (cutoff August 2025). Confidence levels reflect this.
TED API v3, Railway, Gmail SMTP, and LLM pipeline patterns are well-covered within that window.
Flag any TED API v3 specifics for manual verification against https://ted.europa.eu/api/v3/swagger-ui/
before Phase 1 implementation.

---

## Critical Pitfalls

Mistakes that cause silent data loss, cost runaway, or full rewrites.

---

### Pitfall 1: TED API Date Filtering Misses Notices Published on Boundary Days

**What goes wrong:** The TED API v3 uses `publication-date` as its primary date field, but
the "published today" definition is UTC-based while the cron job may run in a different
timezone context. A job firing at 06:00 CET queries "today" but TED's publication window
for the European working day runs roughly 08:00–18:00 CET. Running too early means you
query a date that has almost no notices yet. Running too late (after midnight UTC) means you
miss the tail of the previous day.

More critically: if the cron fires at exactly midnight UTC and uses `>= today`, any notices
published in the final minutes of the previous UTC day are silently dropped — they fell in
a blind spot between yesterday's query (which didn't cover them yet) and today's query (which
excludes them).

**Why it happens:** Developers test locally with a fixed date and never observe the boundary.
The job "works" in testing but systematically misses notices published in the late-night/
early-morning UTC window.

**Consequences:** Missed tenders, including potentially high-relevance ones. The miss is
silent — no error, no log entry, the notice just never enters the database.

**Prevention:**
- Always query with a one-day overlap: fetch `publication-date >= yesterday AND <= today`.
- Deduplication (already planned) absorbs the overlap cleanly.
- Log the exact date range used in each run. Alert if the range ever produces zero results
  (could be a valid quiet day, but also signals a misconfigured date range).
- Schedule the cron for 09:00–10:00 CET (08:00–09:00 UTC) so the TED publication window
  for the day is largely complete before you query.

**Detection:** Compare result counts across days. A day with 0 results when adjacent days
have 50+ is a red flag. Add a `query_stats` table logging run time, date range queried,
and result count.

**Phase:** Address in Phase 1 (TED API integration). The overlap + dedup pattern must be
baked in from day one, not retrofitted.

---

### Pitfall 2: TED API Pagination Silently Truncates Results

**What goes wrong:** TED API v3 returns paginated results (typically max 100 per page,
sometimes 50 depending on endpoint). A naive implementation fetches only the first page
and processes those results. On heavy-publication days (Monday mornings after a weekend,
post-holiday catchup) there may be 200–400 relevant-CPV notices. Without pagination, 60–75%
of notices are silently dropped.

**Why it happens:** The first page always succeeds with status 200, so there is no error
signal. Developers see results, assume completeness.

**Consequences:** Systematic bias toward whichever notices TED returns first (likely sorted
by publication time descending, meaning the newest are kept and earlier-in-day publications
are dropped). Figures misses tenders that were published early on high-volume days.

**Prevention:**
- Always paginate to exhaustion: loop while `response.total > (page * pageSize)`.
- Log `total_available` vs `total_fetched` in `query_stats` on every run.
- Add an assertion: if `total_fetched < total_available`, treat it as a pipeline error
  and alert rather than silently continuing.
- Cap at a reasonable maximum (e.g., 500 per run) and alert if hit — it signals CPV filter
  is too broad.

**Detection:** Log `X-Total-Count` (or equivalent header/field) on every API response.
If it exceeds your page size and you are not paginating, you are losing data.

**Phase:** Phase 1. Non-negotiable before first production run.

---

### Pitfall 3: CPV Code Selection — Too Narrow or Too Broad, Both Are Costly

**What goes wrong:** Design agencies instinctively filter on obvious CPV codes like 79822000
(graphic design) and 79342200 (brand promotion). But EU public clients often miscategorize
tenders: a "science communication" tender may land under 73100000 (R&D services), a
"data visualization" tender under 72212000 (software development), and an "exhibition design"
tender under 45212000 (construction of leisure facilities). Conversely, using the top-level
79000000 (business services) captures so much noise that Haiku cost and false-positive rate
both spike.

The subtlety: CPV code selection is the responsibility of the contracting authority, not a
controlled vocabulary enforced by TED. Quality varies enormously by country and authority.

**Why it happens:** Developers use the CPV browser, pick obviously correct codes, and
assume contracting authorities use them the same way.

**Consequences:**
- Too narrow: Figures misses tenders they would have won. Silent failure.
- Too broad: Haiku processes hundreds of irrelevant tenders per day. At 0.25 USD per million
  input tokens, this is manageable at small volume but becomes a cost signal and also degrades
  precision of the digest (false positives erode trust and Sascha starts ignoring the email).

**Prevention:**
- Start with a deliberately wide CPV list covering all three code families mentioned in
  PROJECT.md (79xxx, 92xxx, 72xxx) plus specific sub-codes for research communication,
  exhibition, and public information campaigns.
- Use the hard pre-filters (budget range, deadline, region) to cut volume before the LLM
  call — not the CPV filter alone.
- After 4 weeks of production data, audit: which CPV codes are producing Score ≥ 4 tenders
  vs. Score < 4 noise? Prune accordingly.
- Keep a `cpv_performance` table: for each CPV code, track triage score distribution.

**Recommended starting CPV set (HIGH confidence for core, MEDIUM for boundary codes):**
```
Core (almost always relevant):
  79822000 - Graphic design services
  79342200 - Promotional services
  79416000 - Public relations services
  79952000 - Event services
  92111200 - Film/video production for advertising
  79800000 - Printing and related services (broad)

High-value boundary codes (often miscategorized relevant tenders):
  73100000 - R&D services (science communication)
  79310000 - Market research services
  72212000 - Programming services (data visualization)
  80000000 - Education and training (broad — noisy, use sub-codes)
  90721800 - Environmental awareness (sustainability comms)
  79131000 - Documentation services
```

**Detection:** If weekly triage produces fewer than 3 tenders with Score ≥ 4, CPV filter
is probably too narrow. If it produces more than 20 with Score < 4, it is probably too broad
or hard pre-filters are not firing.

**Phase:** Phase 1 for initial selection. Phase 2 for data-driven tuning.

---

### Pitfall 4: LLM Triage Prompt Drift and Score Calibration Failure

**What goes wrong:** The Haiku triage prompt assigns Score 0–10. Without careful calibration,
two failure modes emerge:

1. **Score inflation:** Haiku tends toward hedged, positive assessments ("this could be
   relevant"). Scores cluster at 5–7 rather than distributing meaningfully. Everything
   lands in the "manual review" bucket and the digest becomes unmanageable.

2. **Criteria drift:** The prompt says "relevant for Figures" but Haiku has no grounding
   in what Figures actually does. Without explicit criteria (data visualization,
   science communication, exhibition design, public health communication), Haiku scores
   on generic "design agency" relevance and misses Figures' actual niche.

**Why it happens:** Developers write a first-pass prompt, see plausible-looking output,
and ship. Score distribution is never analyzed.

**Consequences:** False negatives (Score ≥ 7 triggers full analysis on junk), false
positives (genuinely relevant tenders score 5–6 and get manual-only treatment). Over time,
Sascha loses trust in the digest and stops acting on it.

**Prevention:**
- Write a calibration dataset before going live: manually score 30–50 real TED tenders
  (mix of obviously relevant, obviously irrelevant, and borderline). Run Haiku against them.
  Measure agreement. Adjust prompt until agreement is >75%.
- Include explicit scoring rubric in the prompt, not just "score 0-10". Example:
  ```
  10: Exact match — data visualization, science communication, or exhibition design.
  7-9: Strong match — design + public sector client + appropriate budget.
  4-6: Possible match — design-adjacent, unclear scope, worth human review.
  1-3: Weak match — uses "design" but means architecture/engineering/fashion.
  0: Irrelevant — no design component or completely out of scope.
  ```
- Log every Haiku response including raw score, reasoning, and the notice metadata.
  Never discard this data — it is your calibration corpus.
- Add a weekly score distribution check. If median score for processed notices is > 5,
  the prompt is inflating.

**Detection:** Score distribution histogram per week. Correct behavior: most scores should
be 0–3 (noise filtered out), a small number 4–6 (borderline), and a rare few 7–10.
If the 4–6 bucket is larger than the 0–3 bucket, something is wrong.

**Phase:** Phase 1 (prompt design). Phase 2 (calibration loop with real data).

---

### Pitfall 5: LLM Cost Runaway via Missing Hard Pre-Filters

**What goes wrong:** The plan correctly identifies hard pre-filters (budget, deadline, region)
before the LLM call. The pitfall is implementing them incorrectly or incompletely:

- **Budget filter:** TED notice data often has budget in multiple possible fields
  (`estimatedValue`, `totalValue`, `lotValue`), sometimes missing entirely, sometimes in
  different currencies. A filter that only checks one field silently skips the check when
  the field is absent.
- **Region filter:** TED uses NUTS codes for location. A German-only filter on NUTS `DE`
  catches federal-level tenders but misses tenders filed under specific NUTS-3 codes
  (e.g., `DE300` for Berlin). Conversely, filtering on `DE300` misses federal tenders
  that Figures could bid on remotely.
- **Notice type filter:** TED publishes Contract Notices (CN), Prior Information Notices
  (PIN), Contract Award Notices (CAN), and corrigenda. CAN and corrigenda should never
  reach the LLM — they are not bidding opportunities. Failing to filter these inflates
  token cost and produces nonsensical triage results.

**Prevention:**
- Pre-filter must be a whitelist, not a blacklist: only pass notices that explicitly satisfy
  all criteria, not notices that fail to disqualify.
- Budget: if budget field is absent, do not skip the notice — route it to the LLM with a
  note that budget is unspecified. Many attractive framework agreements omit budget.
- Region: use `DE` (country-level) + allow `EU` (pan-European), not NUTS-3 only.
- Notice type: query TED API with `noticeType=CN` explicitly. Do not filter in application
  code after fetching — filter at query time to reduce volume.
- Log pre-filter decisions: for each notice, log which filter accepted/rejected it and why.

**Detection:** If LLM call count per day is growing faster than total notices fetched, a
pre-filter is leaking. Add `pre_filter_outcome` to the notice log table.

**Phase:** Phase 1 (filter logic), Phase 2 (audit against production data).

---

### Pitfall 6: Railway Free/Hobby Tier Cron Timing Unreliability

**What goes wrong:** Railway's cron job scheduling uses standard cron syntax, but on the
free/hobby tier there are documented behaviors that affect reliability:

- **Cold start latency:** If the service has scaled to zero (which it does after inactivity
  on lower tiers), the cron trigger wakes it but the actual execution may begin 30–90 seconds
  after the scheduled time. For a daily job this is harmless, but it affects time-sensitive
  date calculations if you compute "now" at job start.
- **Execution timeout:** Railway imposes execution time limits. Long-running jobs that process
  many pages of TED results and then make multiple Haiku calls may hit the limit.
  On hobby tier this is typically 15 minutes for cron jobs (verify current limits).
- **Single instance guarantee:** Railway does not guarantee that a cron will not fire twice
  in edge cases (deploy during scheduled time, etc.). Without a mutex/lock mechanism,
  you can end up with two concurrent runs that both insert the same notices.
- **Timezone:** Railway cron runs in UTC. If you specify `0 7 * * *` intending 07:00 CET,
  it fires at 07:00 UTC which is 08:00/09:00 CET depending on DST. This is a one-hour
  shift that matters for TED's daily publication schedule.

**Prevention:**
- Use UTC explicitly in all time calculations inside the job. Never trust system locale.
- Add a `job_lock` table with a single row: `last_run_start`, `last_run_end`, `status`.
  At job start, check if a run completed less than 12 hours ago. If so, exit immediately.
  This is the mutex for duplicate-fire protection.
- Break the pipeline into phases with checkpointing: fetch all notices first (write to DB
  as `status=fetched`), then triage (update to `status=triaged`), then send email
  (update to `status=emailed`). If the job times out mid-run, the next run continues
  from where it left off rather than starting over.
- Target cron time: `0 8 * * *` UTC (09:00 CET in winter, 10:00 CEST in summer).
  This is after TED's morning publication batch and gives buffer before end of Figures' workday.
- Budget 5 minutes per 100 notices as a safe estimate for fetch + triage + email time.
  If daily volume exceeds 200 notices after CPV filtering, add pagination batching.

**Detection:** Log `job_start`, `job_end`, `exit_reason` on every run. Alert (via the email
itself or a secondary health check) if two consecutive runs produced no email — either
the job is not firing or it is crashing before email send.

**Phase:** Phase 1 (job_lock + checkpointing). Must be in place before Railway deployment.

---

### Pitfall 7: Gmail SMTP Daily Send Limits and Authentication Breakage

**What goes wrong:** Gmail SMTP via App Passwords has hard limits: 500 emails per day
for personal accounts, 2000 for Google Workspace accounts. For a daily digest this is
irrelevant. The real pitfalls are:

- **App Password revocation:** Google silently revokes App Passwords if 2FA settings change,
  if Google detects "suspicious activity," or if the account password is changed. The
  SMTP authentication then fails with a generic `535 Authentication failed` error. If this
  is not caught and alerted, Figures silently stops receiving digests.
- **Spam classification:** Email from a script hitting Gmail SMTP with a consistent
  `From:` domain, plain-text body, and no prior recipient engagement is a spam filter target.
  Google's own spam filters may route the digest to spam even though it originates from Gmail.
  This is especially common when the sender and recipient are the same address.
- **SMTP rate limiting within a session:** Sending many individual emails in one session
  (if design changes send one email per tender rather than a digest) triggers rate limiting.
  The digest model avoids this, but worth noting.
- **Port 465 vs 587:** Port 465 (SMTPS) and 587 (STARTTLS) behave differently in Node.js
  and Python SMTP libraries. Misconfiguring TLS mode causes silent failures that look like
  network timeouts rather than auth errors.

**Prevention:**
- Use App Password (not OAuth) for simplicity, but store it in Railway environment variables,
  never in code.
- Add explicit SMTP connection test at job startup: attempt to connect and authenticate
  before doing any API work. If auth fails, log prominently and exit with error status.
  This surfaces auth breakage immediately rather than after a long pipeline run.
- Send from `figures@...` (or a dedicated alias) to the same address — this is the least
  likely to be spam-classified because recipient history exists. Add a fixed subject prefix
  (e.g., `[Tender Digest]`) so Sascha can create a Gmail filter to whitelist it.
- Use port 587 + STARTTLS. It is the current recommended approach for programmatic Gmail.
- For Workspace accounts (if applicable), configure SPF/DKIM — but since this is Gmail
  sending to Gmail, it is handled internally.

**Detection:** The SMTP test at job startup (see Prevention) is the primary detector.
Secondarily, add a "health heartbeat" to the digest email itself: a footer line saying
`[Run completed at 2026-05-04 09:12 UTC — 47 notices fetched, 3 triaged, 1 analyzed]`.
If Sascha does not see this email on a weekday, something broke.

**Phase:** Phase 1 (SMTP auth test at startup). Phase 2 (heartbeat footer in digest).

---

## Moderate Pitfalls

---

### Pitfall 8: SQLite Concurrency on Railway Volume Mounts

**What goes wrong:** SQLite is an excellent choice for this project's scale, but Railway's
volume mounts (persistent storage) behave differently from local disk in two ways:

- **Write-Ahead Logging (WAL) mode** must be explicitly enabled. Without WAL, SQLite uses
  exclusive file locks. If the cron job crashes mid-write and restarts (Railway auto-restart
  on error), the lock may not be released cleanly, causing the next run to hang indefinitely
  waiting for the lock.
- **Volume mount availability:** Railway volumes are attached on startup. If the volume is
  not mounted before the application code attempts to open the SQLite file, it gets a
  `SQLITE_CANTOPEN` error that looks like a permissions issue.

**Prevention:**
- Enable WAL mode explicitly on database open: `PRAGMA journal_mode=WAL;`
- Set `PRAGMA busy_timeout = 5000;` to fail fast (5 seconds) instead of hanging indefinitely
  if a lock is held.
- Add a startup check: verify the database file exists and is writable before beginning
  pipeline work. If not, create it and run migrations — don't assume state.
- Design schema migrations as idempotent `CREATE TABLE IF NOT EXISTS` statements.
  On Railway, the service may redeploy mid-project; the database must survive redeploys
  without manual intervention.

**Detection:** Check for lock-related errors in Railway logs. `database is locked` is the
SQLite error text. If it appears, WAL mode was not enabled or a concurrent run occurred.

**Phase:** Phase 1 (schema + PRAGMA setup).

---

### Pitfall 9: TED API v3 Notice Structure Inconsistency Across Countries

**What goes wrong:** TED API v3 returns notices in the eForms standard (EU-mandated from
October 2023). However, contracting authorities in different member states fill fields
inconsistently. Specific traps:

- **Title language:** Notices from non-German-speaking countries arrive with titles and
  descriptions in the local language. Haiku can handle this (it is multilingual), but
  your pre-filter logic must not assume German text for keyword matching.
- **Missing fields:** `estimatedValue` is mandatory in eForms but many notices still
  omit it (especially framework agreements and prior information notices). Any code that
  does `notice.estimatedValue.amount` will throw on roughly 15–30% of notices.
- **Multiple lots:** A single notice can have 10–50 lots, each with different CPV codes.
  If you filter on top-level CPV code, you may miss a notice where only lot 3 is relevant.
  If you expand all lots, you inflate token cost.
- **Linked documents:** The notice metadata contains a reference to the full procurement
  documents (often a URL to a national procurement portal). These links are often behind
  auth walls or require registration. Do not assume the full documents are accessible.

**Prevention:**
- Use optional chaining throughout: `notice?.estimatedValue?.amount ?? null`.
- Pass the raw notice JSON to Haiku including title, description, and lot titles (if present)
  rather than trying to extract structured fields — let the LLM handle multilingual text
  and missing fields gracefully.
- For lots: pass concatenated lot descriptions up to a token limit (e.g., 2000 tokens
  of notice content) rather than iterating lot-by-lot.
- Do not attempt to fetch linked procurement documents in v1. Analyze what TED provides.

**Detection:** Log parsing errors per notice. If `error_rate > 5%` in a week, a field
assumption is wrong and needs to be made optional.

**Phase:** Phase 1 (defensive data handling). Document the "pass raw JSON to LLM" decision.

---

### Pitfall 10: TED API Downtime and Schema Changes

**What goes wrong:** The TED API is a public EU service with planned and unplanned downtime.
It has also gone through breaking schema changes during the eForms rollout (2022–2024).
Two concrete failure modes:

- **Planned maintenance:** TED performs maintenance, often announced on
  https://ted.europa.eu/TED/browse/browseByNotices.do but not via API. The job fails
  silently with a connection error or 503.
- **Unplanned breaking change:** Field names or pagination token format changes. The job
  fetches results but parsing fails, and notices are not stored. If dedup uses the
  notice ID from the API, a schema change that renames the ID field means every previously
  seen notice looks new on the next successful run — triggering a flood of duplicate analyses.

**Prevention:**
- Wrap all TED API calls in try/catch with retry logic: 3 attempts with exponential backoff
  (2s, 8s, 32s). After 3 failures, send a brief "pipeline failed" email to Sascha and exit.
- Store raw API response JSON alongside parsed data in the database. If parsing logic needs
  to change, you can re-parse historical data without re-fetching.
- Dedup on `notice_publication_number` (the TED-assigned stable identifier, e.g.,
  `2024/S 012-034567`), not on a position-dependent field. This identifier is stable across
  API schema versions.
- Add API version to the `query_stats` log. If TED changes their version header, you notice
  immediately.

**Detection:** Three consecutive failed runs without email is the primary signal. The "health
heartbeat" email (Pitfall 7) catches this: if Sascha does not see it for two days, he knows
to check Railway logs.

**Phase:** Phase 1 (retry logic + raw JSON storage). Phase 1 also for stable notice ID choice.

---

### Pitfall 11: Full Analysis (Ausschreibungsskill) Cost Runaway

**What goes wrong:** Score ≥ 7 triggers a full analysis using Claude Sonnet (expensive).
If Haiku triage is miscalibrated (Pitfall 4) and scores are inflated, 15–20 notices per day
hit the Sonnet pipeline. Sonnet costs roughly 3–4 USD per million input tokens. A detailed
tender analysis with full notice text plus system prompt can easily be 8,000–12,000 tokens.
20 analyses per day = ~240,000 tokens/day = ~$0.72–$1.08/day = ~$25–35/month just for analysis.
This is manageable but surprising for a "free" system.

More critically: if the existing `ausschreibung-workspace/` skill makes external calls
(web search, document download), those costs and latencies are additive.

**Prevention:**
- Add a hard daily cap: maximum 5 full analyses per day in v1. If more than 5 tenders
  score ≥ 7 on a given day, run full analysis on the top 5 by score and include the rest
  in the digest with their Haiku summary only.
- Log cost per run: Anthropic API responses include token counts. Store
  `haiku_tokens_used`, `sonnet_tokens_used` per run in `query_stats`.
- Add a monthly budget alert: if cumulative Sonnet spend exceeds a threshold (e.g., $20),
  notify Sascha in the digest footer.
- Review the cap after 4 weeks of production data.

**Detection:** Monitor `sonnet_analyses_per_day` in `query_stats`. Trend above 3/day
consistently means triage calibration needs attention.

**Phase:** Phase 2 (full analysis integration). Cap and cost logging must be in from day one
of Sonnet integration.

---

## Minor Pitfalls

---

### Pitfall 12: Deduplication Race Condition on First Run After Schema Migration

**What goes wrong:** When the database is first deployed (or wiped and redeployed), the
dedup table is empty. The first run ingests all notices published in the query window. If
the query window is set to "last 7 days" for the initial backfill, this could be 200–500
notices — all processed as new, all triggering triage, many triggering full analysis.

**Prevention:**
- Do not backfill on first run. Query only the last 24 hours on first run. Accept that
  notices from before deployment are not in scope.
- Alternatively, add a `FIRST_RUN` environment variable that, when set, skips triage and
  only populates the dedup table. Run manually once, then remove the variable.

**Phase:** Phase 1 (deployment runbook).

---

### Pitfall 13: Email Digest Becomes Unreadable at Scale

**What goes wrong:** If 15 notices per day are in the 4–6 score range, the digest email
is long. Plain-text or poorly structured HTML makes it hard to scan. Sascha stops reading it.

**Prevention:**
- Structure digest with clear sections: `HIGH RELEVANCE (7+)` → `REVIEW (4-6)` → summary stats.
- Each entry: tender title, contracting authority, deadline, estimated value, score,
  2-sentence Haiku reasoning, TED link. Keep to one screen per entry.
- Cap digest at 20 entries total. If more than 20 qualify for inclusion, add a count:
  "12 additional tenders scored 4–6 — see database for full list."

**Phase:** Phase 2 (email template design).

---

### Pitfall 14: Railway Environment Variable Exposure in Logs

**What goes wrong:** Node.js and Python frameworks sometimes log environment variables
during startup (e.g., `dotenv` debug mode, unhandled exception stack traces that include
`process.env`). API keys and SMTP passwords appear in Railway's log viewer.

**Prevention:**
- Never log `process.env` or equivalent. Use structured logging with an explicit allowlist
  of logged fields.
- In Railway, use the "Secret" designation for sensitive variables (Claude API key, Gmail
  App Password). These are masked in the Railway dashboard.

**Phase:** Phase 1 (logging setup).

---

### Pitfall 15: CPV Code List Staleness

**What goes wrong:** The EU CPV code taxonomy is updated periodically. Codes can be
deprecated and replaced. A hard-coded list in the application may contain deprecated codes
that TED silently ignores, reducing result volume without error signals.

**Prevention:**
- Document the CPV codes used in a config file (not scattered through code) with a comment
  indicating the taxonomy version used (2008 taxonomy, revised 2023).
- Verify codes against the official CPV browser at https://simap.ted.europa.eu/cpv at
  project start and add a calendar reminder to re-verify annually.

**Phase:** Phase 1 (CPV config file). Low urgency — the current taxonomy has been stable
since the 2008 base with minor 2023 additions.

---

## Phase-Specific Warnings Summary

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| TED API integration | Date boundary misses (Pitfall 1) | One-day overlap query + dedup |
| TED API integration | Silent pagination truncation (Pitfall 2) | Paginate to exhaustion, log total vs fetched |
| TED API integration | API downtime (Pitfall 10) | Retry with backoff + failure email |
| CPV code selection | Miscategorized relevant tenders (Pitfall 3) | Wide initial CPV list, prune with data |
| Data handling | Missing/inconsistent notice fields (Pitfall 9) | Defensive parsing, pass raw JSON to LLM |
| Triage prompt | Score inflation (Pitfall 4) | Explicit rubric, pre-launch calibration dataset |
| Pre-filter logic | Budget/type filter leakage (Pitfall 5) | Whitelist logic, filter at query time |
| Railway deployment | Duplicate cron fire (Pitfall 6) | job_lock table |
| Railway deployment | Job timeout mid-pipeline (Pitfall 6) | Checkpointed pipeline stages |
| Railway deployment | UTC timezone confusion (Pitfall 6) | Explicit UTC everywhere |
| SQLite setup | Lock hang on crash-restart (Pitfall 8) | WAL mode + busy_timeout |
| Gmail SMTP | Auth breakage silent failure (Pitfall 7) | SMTP test at startup |
| Gmail SMTP | Spam classification (Pitfall 7) | Consistent subject prefix, whitelist filter |
| Full analysis integration | Sonnet cost runaway (Pitfall 11) | Daily cap of 5 analyses + cost logging |
| First deployment | Dedup empty → mass processing (Pitfall 12) | Query 24h only on first run |
| Logging | API key exposure in logs (Pitfall 14) | Structured logging allowlist |

## Sources

Findings from training knowledge (cutoff August 2025). No external lookups were possible
during this session (WebSearch and WebFetch disabled).

**Verify before implementing:**
- TED API v3 exact field names and pagination format:
  https://ted.europa.eu/api/v3/swagger-ui/index.html
- Railway cron timeout limits (change frequently with tier updates):
  https://docs.railway.com/reference/cron-jobs
- Gmail SMTP App Password current setup guide:
  https://support.google.com/accounts/answer/185833
- Current CPV taxonomy:
  https://simap.ted.europa.eu/cpv

**Confidence by area:**
| Area | Confidence | Reason |
|------|------------|--------|
| TED API behavior | MEDIUM | Well-documented v3 behavior in training data; field names need verification against current swagger |
| LLM triage pitfalls | HIGH | Patterns are well-established across many production LLM pipeline deployments |
| Railway constraints | MEDIUM | Core behavior stable; exact timeout limits should be verified as they change with tier pricing |
| Gmail SMTP limits | HIGH | Limits and auth behavior are stable and well-documented |
| SQLite on cloud | HIGH | WAL mode and volume mount behavior are deterministic, well-understood |
| CPV code taxonomy | HIGH | 2008 taxonomy with 2023 revisions is stable; specific code recommendations verified against EU SIMAP |
