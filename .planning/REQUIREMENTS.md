# Requirements — Ausschreibungs-Scanner

## v1 Requirements

### Data Ingestion (FETCH)

- [ ] **FETCH-01**: System fragt täglich TED API (`api.ted.europa.eu`) nach neuen Ausschreibungen ab, gefiltert nach relevanten CPV-Codes (79xxx, 92xxx, 73100000, 72212000)
- [ ] **FETCH-02**: System paginiert TED-Ergebnisse bis zur Erschöpfung (kein stiller Datenverlust bei >1 Seite)
- [ ] **FETCH-03**: System fragt mit 1-Tag Overlap ab (verhindert UTC-Mitternacht-Lücken)
- [ ] **FETCH-04**: System loggt pro Run: Anzahl gefetchter Notices vs. Gesamtergebnis (Transparenz)

### Deduplication & State (DEDUP)

- [ ] **DEDUP-01**: System speichert bereits verarbeitete TED-Notice-IDs in SQLite (Railway Volume, WAL-Mode)
- [ ] **DEDUP-02**: Bereits gesehene Notices werden übersprungen (kein erneutes Verarbeiten)
- [ ] **DEDUP-03**: System enthält job_lock-Mechanismus (verhindert Doppelausführung bei Railway-Deploy-Cron-Kollision)

### Pre-Filter (FILTER)

- [ ] **FILTER-01**: Harte Regel-Filter laufen vor jedem LLM-Call: Deadline (nicht abgelaufen), Mindestbudget konfigurierbar, Land (DE/EU konfigurierbar)
- [ ] **FILTER-02**: CPV-Codes sind als externe Konfigurationsdatei gepflegt (nicht hardcoded)

### Triage (TRIAGE)

- [ ] **TRIAGE-01**: Claude Haiku bewertet jede gefilterte Ausschreibung mit Score 0–10 + 2-Satz Begründung
- [ ] **TRIAGE-02**: Triage-Prompt enthält explizite Scoring-Rubrik (kalibriert für Figures: Dataviz, Wissenschaftskommunikation, öffentliche Auftraggeber)
- [ ] **TRIAGE-03**: Fehler bei einzelner Triage-Bewertung bricht den gesamten Job nicht ab (catch + continue)
- [ ] **TRIAGE-04**: System loggt Token-Verbrauch und geschätzte Kosten pro Run

### Email Digest (DIGEST)

- [ ] **DIGEST-01**: Täglicher E-Mail-Digest (HTML) wird via Gmail SMTP verschickt
- [ ] **DIGEST-02**: Digest zeigt Tier A (Score ≥7) und Tier B (Score 4–6) visuell getrennt
- [ ] **DIGEST-03**: Pro Ausschreibung: Titel, Score, 2-Satz Begründung, Budget, Deadline, TED-Link
- [ ] **DIGEST-04**: Bei 0 Treffern: Bestätigungs-Mail dass Job gelaufen ist (verhindert stille Ausfälle)
- [ ] **DIGEST-05**: System testet Gmail SMTP-Auth beim Job-Start (Exit wenn Auth fehlschlägt, bevor Pipeline läuft)

### Full Analysis (ANALYSIS)

- [ ] **ANALYSIS-01**: Ausschreibungen mit Score ≥7 erhalten automatisch eine vollständige Analyse via bestehendem Ausschreibungsskill (Claude Sonnet)
- [ ] **ANALYSIS-02**: Maximal 5 Vollanalysen pro Tag (Hard Cap, Kostenkontrolle)
- [ ] **ANALYSIS-03**: Analyse-Output wird als Datei gespeichert und im Digest verlinkt (oder als Anhang)

### Deployment (INFRA)

- [ ] **INFRA-01**: Deployment als Railway Cron-Job (täglich, konfigurierbare Uhrzeit)
- [ ] **INFRA-02**: Railway Volume für SQLite-Persistenz gemountet unter `/data`
- [ ] **INFRA-03**: Alle Secrets (Gmail, Anthropic API Key) als Railway Environment Variables
- [ ] **INFRA-04**: Job läuft als single-process, synchrone Pipeline (kein Queue-System)

---

## v2 Requirements (Deferred)

- Bezahlte Aggregatoren (DTAD, Vergabe24) als zusätzliche Datenquellen
- Web-Dashboard zum Browsen historischer Analysen
- Slack/Notion-Integration
- Multi-User / Team-Features
- Automatisches Scraping von Plattformen ohne API
- Wöchentlicher Zusammenfassungs-Digest

---

## Out of Scope

- **Automatische Bewerbungseinreichung** — bleibt immer manuell
- **DTAD/Vergabe24 in v1** — kein Budget für bezahlte Aggregatoren in erstem Schritt
- **Platform-Scraping** — zu wartungsintensiv, fragil
- **Dashboard/UI** — E-Mail-Digest ist ausreichend für v1
- **Multi-User-Auth** — single-user intern, kein Login nötig
- **Slack/Notion** — E-Mail reicht für v1

---

## Traceability

*(Wird vom Roadmapper ausgefüllt)*

| REQ-ID | Phase |
|--------|-------|
| FETCH-01 – FETCH-04 | Phase 1 |
| DEDUP-01 – DEDUP-03 | Phase 1 |
| FILTER-01 – FILTER-02 | Phase 1 |
| TRIAGE-01 – TRIAGE-04 | Phase 2 |
| DIGEST-01 – DIGEST-05 | Phase 2 |
| ANALYSIS-01 – ANALYSIS-03 | Phase 3 |
| INFRA-01 – INFRA-04 | Phase 1 |
