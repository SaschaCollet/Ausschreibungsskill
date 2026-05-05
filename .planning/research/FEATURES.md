# Feature Landscape: EU Tender Monitoring System

**Domain:** Automated public procurement monitoring and triage
**Project:** Ausschreibungs-Scanner for Figures (design/data viz agency, Berlin)
**Researched:** 2026-05-04
**Confidence note:** WebSearch and WebFetch were denied in this environment. All findings are based on training knowledge of the tender monitoring domain (DTAD, Vergabe24, TenderScout, Evados, Tendersport, EU procurement ecosystem). Confidence levels reflect this. Core EU procurement domain knowledge is HIGH confidence; specific competitor UI details are MEDIUM.

---

## What Existing Products Offer (Competitive Landscape)

### DTAD (Deutsche Tageszeitung Ausschreibungs-Dienst)
The dominant German B2B tender aggregator. Aggregates ~1,000+ sources including TED, DTVP, Vergabe24, regional platforms, and newspaper notices.

Key features:
- Keyword + CPV-code search profiles (saved, run daily)
- Multi-source aggregation (TED + national + regional German platforms)
- Budget range filter (Auftragswert von/bis)
- Deadline filter (Abgabefrist)
- Geography filter (Bundesland, EU country, international)
- Contracting authority type filter (Bund/Land/Kommune/private)
- Contract type filter (Lieferung/Dienstleistung/Bauleistung)
- Email alerts (daily digest or immediate)
- Bookmark / "Merkliste" for saved tenders
- Document download (Vergabeunterlagen where available)
- Colleague sharing / team accounts
- Status tracking (watched/submitted/won/lost)
- Pricing: subscription-based, ~€100-400/month depending on tier

**Confidence:** MEDIUM — feature list from training knowledge of DTAD marketing materials and user reviews on G2/Capterra.

### Vergabe24 / DTVP (Deutsches Vergabeportal)
Primarily a submission platform, not a monitoring tool. Buyers publish there; suppliers register to receive notifications for specific notices they've bookmarked. Less relevant as a comparator — it's a platform, not a scanner.

### TenderScout / Tracker Products (UK/IE market)
TenderScout (Ireland/UK) and similar tools (Tracker, Delta eSourcing, Proactis) represent the anglophone market:
- Keyword search with Boolean operators
- CPV/NUTS code filtering
- Win probability scoring (their differentiator — trained on historical award data)
- Competitor tracking ("who won similar tenders?")
- Bid calendar / pipeline management
- Team collaboration features
- Integration with CRM (Salesforce, HubSpot)
- Document analysis / auto-summary

**Confidence:** MEDIUM — based on training knowledge of UK procurement SaaS landscape.

### Evados / Tenderwatch (DACH)
Smaller German competitors. Similar feature set to DTAD but narrower source coverage. Evados notable for clean UI and keyword-match explanations.

### Common User Complaints (across the category)
These recur in G2, Capterra, and procurement forum discussions:

1. **Too many false positives** — alert profiles are keyword-based; "Kommunikation" matches telco tenders, not design
2. **Duplicate alerts** — same tender appears on multiple sources, user sees it 2-5x
3. **Stale/incorrect budget data** — estimated values often missing or wrong in source XML
4. **PDF-only documents** — tender details buried in PDFs that aren't searchable
5. **Alert fatigue** — daily digest contains 40+ items; users stop reading
6. **No relevance explanation** — tools show matches but not WHY it matched or how relevant it is
7. **No agency-context awareness** — scoring is purely lexical; doesn't know your specialization
8. **Clunky UI for document handling** — downloading and organizing Vergabeunterlagen is manual friction
9. **Slow time-to-inbox** — some tools have 24-48h lag between TED publication and alert

**Confidence:** MEDIUM-HIGH — complaint patterns are consistent across multiple review sources in training data.

---

## Table Stakes

Features users expect from any tender monitoring system. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes for Figures Build |
|---------|--------------|------------|------------------------|
| CPV-code filtering | Every procurement tool supports this; it's the EU standard taxonomy | Low | Already planned. Use CPV 79xxx, 92xxx, 72xxx as primary filter at API query level |
| Keyword filtering | Core of any search-based alert | Low | Applied as secondary filter post-CPV, pre-LLM |
| Deduplication | Without it, same tender appears daily until deadline | Medium | Track by TED notice ID (ND number) in persistent store; re-processing same notice is wasted LLM spend |
| Daily email digest | The delivery mechanism users expect | Medium | Already planned. Must include title, contracting authority, budget estimate, deadline, score, 2-sentence rationale |
| Deadline visibility | Users need to know how much time they have | Low | Always show submission deadline prominently in digest — this is the highest-urgency field |
| Budget/value visibility | Users filter by this first (is it worth our time?) | Low | Show estimated value range; flag "no value stated" explicitly rather than silently omitting |
| Link to source | Must be able to click through to official notice | Low | Always include direct TED URL (ted.europa.eu/en/notice/{noticeId}) |
| "Already sent" tracking | Not re-alerting on tenders from previous digests | Medium | This is deduplication at the digest level — different from processing dedup |
| Score + rationale | LLM output must be shown, not hidden | Low | The 2-sentence justification is what makes the digest readable — do not omit |

---

## Differentiators

Features that set this system apart from generic tender monitors. Valuable specifically because of the Figures/design-agency context.

| Feature | Value Proposition | Complexity | Priority for v1 |
|---------|-------------------|------------|-----------------|
| Agency-context-aware scoring | Claude scores against Figures' actual specialization (data viz, science comms, public sector clients) — not generic keyword matching | Medium | YES — this is the core LLM value proposition. The prompt must include Figures' profile, past work types, ideal client description |
| Score threshold routing | Score >= 7 auto-triggers full analysis; 4-6 lands in digest for manual review; < 4 silently discarded | Low | YES — already planned. Critical UX decision: the threshold defines signal-to-noise |
| Full analysis auto-generation | For high-relevance tenders, a complete briefing is ready before the team opens their email | High (uses existing Ausschreibungsskill) | YES — planned, and is the key moat |
| Rationale transparency | Every score comes with a 2-sentence explanation of WHY it's relevant or not | Low | YES — this is what prevents the "black box" complaint |
| Silence-on-noise | Days with zero qualifying tenders send no email (or a brief "nothing today") rather than a digest of low-quality matches | Low | YES — prevents alert fatigue, respects inbox |
| Budget-range pre-filter (hard filter) | Eliminate tenders below minimum viable contract size before LLM — saves money and noise | Low | YES — planned. Figures likely has a floor (e.g. > €10k) below which bidding isn't viable |
| CPV + keyword combo filter | CPV narrows to sector, keyword further narrows to relevant sub-topics (e.g. "Datenvizualisierung", "Infografik", "Wissenschaftskommunikation") | Low | YES |
| Region pre-filter | Figures is Berlin-based — EU-wide tenders are possible but German/DACH tenders are more realistic to win | Low | YES — filter by NUTS code (DE = Germany) or configurable. Do NOT Germany-only lock; EU-wide science comms tenders are realistic |
| Configurable score threshold | Allow changing the >= 7 threshold without code change (env var or config file) | Low | NICE-TO-HAVE for v1 — hardcode first, make configurable later |

---

## Anti-Features

Features to deliberately NOT build in v1 (and likely ever, given project scope).

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multi-source aggregation (DTAD-style) | Scraping non-API platforms is maintenance hell; each platform breaks independently | Stick with TED API v3 only. TED covers all EU-threshold contracts — which is the relevant universe for Figures |
| Automatic bid submission | Legal liability, quality risk, fundamentally requires human judgment | Always keep submission manual. The system prepares; humans decide and submit |
| Slack / Notion / Teams integration | Adds integration surface area, auth complexity, platform dependency | Email is sufficient for v1. Add integrations only when users explicitly pull for them |
| Web dashboard / UI | Significant frontend scope for zero additional value over email | Email IS the UI. The digest is the product interface |
| User accounts / multi-user auth | Not needed; this is a single-team internal tool | Single recipient, or a short hardcoded list. No auth layer |
| Win probability scoring | Requires historical award data training — not available without paying for it | Use LLM relevance score instead. Win probability is a different (harder) problem |
| CRM integration | Overkill for v1 | Manual workflow: team reads email, opens tender, decides in their existing process |
| Real-time alerts (sub-daily) | TED publishes batches; real-time adds complexity for no real gain | Daily cron is the right cadence for TED data; new notices appear in morning batch |
| Competitor tracking | Requires historical data on who wins what — not possible from TED API alone | Out of scope |
| Document download / storage | Storing Vergabeunterlagen creates storage costs, legal complexity, stale data risk | Always link to source; let TED/buyer handle document hosting |
| Multi-language scoring | Tenders arrive in language of contracting country — German, French, etc. | Claude handles multilingual input natively; no extra feature needed |
| Feedback loop / ML retraining | Continuous learning requires labeled data collection, training infrastructure | Improve scoring prompt manually based on team feedback instead |

---

## Filtering Capabilities: What's Standard vs. What Matters Here

### Standard filters in the category (all major tools have these)
- CPV code (exact or subtree match)
- Keyword in title/description (plain text, sometimes Boolean)
- Country / region (NUTS codes for EU)
- Contract value / budget range (estimated value)
- Submission deadline range
- Notice type (contract notice, prior information notice, design contest, etc.)
- Contracting authority country / type

### TED API v3 specifically supports (HIGH confidence — TED API documentation)
- `cpvCodes` — filter by CPV code, supports wildcard prefix matching (e.g. `79*` matches all 79xxx codes)
- `publicationDateRange` — date range for when notice was published (use for daily delta queries)
- `countryOfBuyer` — ISO country code
- `nutsCode` — NUTS geographic code
- `estimatedValueFrom` / `estimatedValueTo` — budget range filter (note: often missing in source data)
- `noticeType` — filter to `cn` (contract notice) vs `pin` (prior information) etc.
- Full-text search across notice fields
- `sortBy` — sort by publication date descending (essential for daily delta pattern)

### The "already seen" / deduplication pattern
The correct approach for a daily-polling system:

1. **Notice-level dedup**: Store `noticeId` (TED's ND number, globally unique) in a persistent store (SQLite or simple JSON file). Before any processing, check if `noticeId` already exists. If yes, skip entirely.
2. **Digest-level dedup**: A notice that scored 5 last week should NOT reappear in this week's digest unless the notice was updated (TED publishes corrigenda with new noticeIds or amendment flags).
3. **Amendment handling**: TED issues corrigenda (amendments) as new notices with their own ND numbers but referencing the original. These SHOULD be processed and flagged as "update to previously seen tender."

---

## Email Digest: Format Recommendations

### What works (based on email digest best practices + domain knowledge)

**Format: HTML email, but minimal and scannable**
- Plain text fails for digest-style content because structure matters (score badges, color coding)
- But avoid heavy HTML — render on mobile, dark mode support essential
- Single-column layout, no multi-column complexity

**Structure per tender entry:**

```
[SCORE: 8/10] Infografik-Paket für Bundesgesundheitsministerium
Auftraggeber: Bundesministerium für Gesundheit
Budget: ~€45.000 (geschätzt)
Frist: 2026-06-15 (42 Tage)
CPV: 79340000 – Werbe- und Marketingdienstleistungen

Warum relevant: Das BMG sucht eine Agentur für datengestützte
Kommunikationsgrafiken zur Gesundheitsberichterstattung —
direkter Match mit Figures' Wissenschaftskommunikations-Kompetenz.

[Vollständige Analyse ansehen] [Auf TED öffnen]
```

**Section structure for the full digest:**

1. **Header**: Date, total matches today, count by score tier
2. **Tier A (Score 7-10)**: "Hohe Relevanz — Analyse bereit" — full analysis link prominent
3. **Tier B (Score 4-6)**: "Prüfenswert" — shorter entry, less visual weight
4. **Footer**: "0 Ausschreibungen unter Score 4 aussortiert" — shows the filter is working

**What to always show per entry:**
- Score (visually prominent — this is the triage value)
- Score rationale (2 sentences from Claude — the unique value)
- Contracting authority name
- Estimated budget (or "nicht angegeben" explicitly)
- Submission deadline + days remaining
- CPV code + label
- Direct TED link
- "Vollständige Analyse" link (for score >= 7 entries)

**What to NOT show in digest:**
- Full notice text (too long, defeats the purpose)
- Raw CPV codes without label
- Internal processing metadata (score timestamps, API response fields)
- "Click to unsubscribe" footers (this is internal tooling, not a marketing email)

**Send behavior:**
- Only send if there are entries in Tier A or Tier B
- On zero-match days: either skip entirely, or send a 1-line "Heute keine relevanten Ausschreibungen gefunden" — the latter is better because it confirms the system ran

---

## What Makes Good Triage for a Design Agency Context

This is the core intellectual challenge of the system. Standard keyword matching produces terrible signal-to-noise for Figures because:

- "Kommunikation" matches telco and IT tenders (noise)
- "Grafik" matches print shops and generic design work (noise)
- "Datenvizualisierung" rarely appears verbatim in notice titles (misses true matches)
- The actual relevant tenders often use bureaucratic language: "Erstellung von Informationsmaterialien", "Entwicklung visueller Konzepte", "Wissenschaftliche Kommunikationsleistungen"

**What the LLM triage must do:**
1. Read the full notice title + description (in whatever EU language it's in)
2. Apply Figures' profile: data visualization, science communication, public health/research/environment clients
3. Score 0-10 against fit — not just keyword match but semantic relevance
4. Produce a rationale that references the specific match reason

**Scoring rubric for the LLM prompt (recommendation):**
- 9-10: Direct match — the notice description exactly fits Figures' capabilities and likely client type
- 7-8: Strong match — clearly in the domain, some uncertainty about scope or fit
- 4-6: Possible match — adjacent domain, worth a human look
- 1-3: Weak match — technically in CPV range but unlikely to be a real opportunity
- 0: Irrelevant — CPV hit was a false positive

**Critical prompt engineering requirement:**
The triage prompt MUST include a concrete description of Figures' work. Generic prompts produce generic scores. Include:
- Specific past project types (if available)
- Ideal client profile (Bundesministerien, Forschungsinstitute, NGOs, EU agencies)
- Anti-examples (print shops, telco, generic web development)
- The scoring rubric above

---

## Feature Dependencies

```
TED API polling
  → CPV/keyword/region pre-filter (hard filter, no LLM cost)
    → Budget/deadline pre-filter (hard filter, no LLM cost)
      → Deduplication check (skip if seen)
        → LLM triage (Haiku, score 0-10 + rationale)
          → Score routing:
              >= 7 → Full analysis (Ausschreibungsskill) + Tier A digest entry
              4-6  → Tier B digest entry only
              < 4  → Discard (no digest entry)
          → Digest assembly
            → Email send (Gmail SMTP)
              → Mark all processed noticeIds as seen
```

---

## MVP Recommendation

**Build exactly these, in this order:**

1. TED API poller with CPV + date-range filter (get data flowing)
2. SQLite-based seen-notices store with dedup check (prevent LLM waste)
3. Hard pre-filters: budget floor, deadline ceiling, region (reduce LLM call volume)
4. Haiku triage with score + rationale + rubric prompt (core intelligence)
5. HTML email digest with tier separation (the deliverable)
6. Full analysis trigger via Ausschreibungsskill for score >= 7 (the premium feature)
7. Railway cron deployment (the operational wrapper)

**Defer these to post-v1:**
- Configurable threshold (hardcode 7 first; externalize to env var in v2)
- Amendment/corrigendum detection (handle as new notice for now; refine later)
- "Nothing today" email vs. silence (start with silence; add confirmation email if team wants it)
- Multi-region expansion (start with DE + EU-wide; add country config later)

---

## Sources

Note: WebSearch and WebFetch were denied in this research session. All findings are from training knowledge.

| Claim | Confidence | Basis |
|-------|------------|-------|
| DTAD feature set | MEDIUM | Training data from DTAD marketing materials and user reviews (Capterra, G2) |
| User complaints about tender tools | MEDIUM-HIGH | Recurring patterns in procurement community discussions in training data |
| TED API v3 filter fields | HIGH | TED API documentation was well-represented in training data; field names should be verified against live API docs at api.ted.europa.eu |
| Email digest format recommendations | MEDIUM | Based on email UX best practices + domain knowledge of B2B digest tools |
| CPV code landscape for design agencies | HIGH | EU CPV taxonomy is a stable, official standard |
| Deduplication pattern (notice ID based) | HIGH | Standard pattern; TED notice IDs are globally unique and stable |
| Scoring rubric recommendation | MEDIUM | Based on LLM prompting best practices; validate with actual Figures team feedback |

**Verify before building:**
- Confirm exact TED API v3 field names at: https://api.ted.europa.eu/swagger-ui/index.html
- Confirm CPV subtree filtering syntax (does `79*` work or must you enumerate child codes?)
- Confirm whether TED API v3 returns corrigenda as new notices or as flags on existing notices
