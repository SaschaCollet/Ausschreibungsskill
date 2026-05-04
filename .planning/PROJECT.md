# Ausschreibungs-Scanner

## What This Is

Ein automatisiertes System, das täglich öffentliche Ausschreibungsplattformen (zunächst TED API) nach relevanten Ausschreibungen für Figures durchsucht. Neue Treffer werden nach Relevanz bewertet und als E-Mail-Digest verschickt — hochrelevante Ausschreibungen erhalten automatisch eine vollständige Analyse über den bestehenden Ausschreibungsskill.

## Core Value

Figures verpasst keine relevante öffentliche Ausschreibung mehr — die Pipeline läuft täglich ohne manuellen Aufwand.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] TED API täglich nach neuen Ausschreibungen abfragen (CPV-Codes: Design, Grafik, Kommunikation)
- [ ] Triage: Claude Haiku bewertet jede neue Ausschreibung mit Score 0–10 + 2 Sätze Begründung
- [ ] Harte Filter: Budget-Range, Deadline, Region vor dem LLM-Call
- [ ] Triage-Ergebnisse als täglicher E-Mail-Digest (via Gmail SMTP)
- [ ] Vollständige Analyse (bestehender Ausschreibungsskill) für Ausschreibungen mit Score ≥ 7
- [ ] Deduplication: bereits gesehene Ausschreibungen nicht erneut verarbeiten
- [ ] Deployment auf Railway als Cron-Job (täglich, cloud-basiert)

### Out of Scope

- Bezahlte Aggregatoren (DTAD, Vergabe24) — in erstem Schritt nur TED API
- Scraping von Plattformen ohne API — zu wartungsintensiv
- Automatische Bewerbungseinreichung — bleibt manuell
- Slack/Notion-Integration — E-Mail reicht für v1

## Context

- Figures ist eine Berliner Designagentur, spezialisiert auf Datenvizualisierung und Wissenschaftskommunikation
- Der bestehende Ausschreibungsskill (`ausschreibung-workspace/`) analysiert Vergabeunterlagen bereits vollständig — dieser Skill wird als Engine für die vollständige Analyse genutzt
- TED API v3 ist kostenlos und deckt alle EU-weiten Ausschreibungen ab Schwellenwert ab
- Relevante CPV-Codes: 79xxx (Kommunikation, Grafik, Druck), 92xxx (Kultur, Medien), 72xxx (IT/Web wenn relevant)
- Triage-Schwellenwert: Score ≥ 7 → vollständige Analyse; 4–6 → im Digest zur manuellen Entscheidung; < 4 → verworfen (kein E-Mail-Eintrag)

## Constraints

- **Stack**: Node.js oder Python — je nachdem was die TED API Clients am besten unterstützt
- **Budget**: Kein bezahlter Datenaggregator in v1 — nur TED API (kostenlos)
- **Hosting**: Railway (free/hobby tier für Cron-Jobs)
- **E-Mail**: Gmail SMTP (kein zusätzlicher Mail-Dienst)
- **Claude API**: Haiku für Triage (günstig), Sonnet für vollständige Analyse

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TED API als einzige Datenquelle in v1 | Kostenlos, stabil, offizielle REST API | — Pending |
| Claude Haiku für Triage | Günstig, schnell genug für batch processing | — Pending |
| Railway für Deployment | Einfachstes Cloud-Hosting für Cron-Jobs ohne eigenen Server | — Pending |
| Gmail SMTP statt Resend/SendGrid | Kein neuer Dienst nötig | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-04 after initialization*
