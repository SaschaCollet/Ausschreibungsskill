# Phase 3: Full Analysis Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 3-full-analysis-integration
**Areas discussed:** Datengrundlage der Analyse, Output-Format, Speicherort, Digest-Integration

---

## Datengrundlage der Analyse

| Option | Description | Selected |
|--------|-------------|----------|
| TED Full Notice XML abrufen | Via TED API /notices/{nd} vollständigen Ausschreibungstext laden. Mehr Kontext für Sonnet — bessere Analyse. Extra API-Call pro Analyse. | ✓ |
| Nur vorhandene TED-Metadaten | Titel, CPV-Codes, Budget, Deadline aus seen_notices. Kein extra API-Call, aber limitierter Kontext. | |

**User's choice:** TED Full Notice XML abrufen

| Option | Description | Selected |
|--------|-------------|----------|
| figures-config.md + portfolio.md einbinden | Als read-only config ins Scanner-Repo kopiert, als statischer Kontext in Sonnet-Prompt eingebettet. | ✓ |
| Ohne Firmenkontext analysieren | Sonnet analysiert nur anhand des TED-Textes. | |

**User's choice:** Ja, als read-only config einbinden

| Option | Description | Selected |
|--------|-------------|----------|
| Nur Phase 1 (Zusammenfassung, Fit-Bewertung, Checkliste) | Phase 2 (Bewerbungspaket) bleibt manuell. | ✓ |
| Phase 1 + vereinfachte Phase 2 | Kostenschätzung und Portfolio-Vorschläge vollautomatisch. | |

**User's choice:** Nur Phase 1

---

## Output-Format

| Option | Description | Selected |
|--------|-------------|----------|
| Alle 3 Skill-Sektionen, eine Datei | Zusammenfassung + Fit-Bewertung + Checkliste in einer Markdown-Datei. | ✓ |
| Nur Fit-Bewertung (kompakt) | Nur Fit-Score, Stärken, Risiken, Empfehlung. | |

**User's choice:** Alle 3 Skill-Sektionen, eine Datei

---

## Speicherort

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite-Tabelle analyses | Neue Tabelle in scanner.db. Konsistent mit bestehendem Muster. | ✓ |
| Dateien auf Railway Volume | /data/analyses/<nd>.md Dateien. | |

**User's choice:** SQLite-Tabelle analyses

| Option | Description | Selected |
|--------|-------------|----------|
| Separate Spalten in runs | sonnet_input_tokens, sonnet_output_tokens, sonnet_cost_usd — parallel zu haiku_* Spalten. | ✓ |
| In analyses-Tabelle speichern | Token-Daten direkt bei der Analyse-Row. | |

**User's choice:** Separate Spalten in runs

---

## Digest-Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Ausklappbarer Block unter Tier-A-Karte | HTML details/summary-Element. | |
| Separater Abschnitt am Ende | Alle Analysen geblockt nach Tier-A/B-Karten. | |
| Als HTML-Anhang | Jede Analyse als .html-Datei im Anhang. | |
| Als .md-Datei-Anhang (Other) | Markdown-Format, leicht abspeicherbar für manuelle Weiterverwendung. | ✓ |

**User's choice:** Als .md-Datei-Anhang — "Ich hätte die Analyse gerne in einem Format, das ich leicht abspeichern kann, z.B. als MD"
**Notes:** Der Nutzer will die Analyse direkt für die manuelle Bewerbung weiternutzen können.

| Option | Description | Selected |
|--------|-------------|----------|
| Kleiner Hinweis-Badge | Karte bleibt kompakt, nur "📎 Vollanalyse angehangen". | ✓ |
| Fit-Score und Empfehlung inline | Fit-Score + Empfehlung direkt in der Karte. | |

**User's choice:** Kleiner Hinweis-Badge

---

## Claude's Discretion

- TED API Endpoint-Details für Full Notice XML (v3 API — Researcher ermittelt konkreten Endpoint)
- Sonnet-Prompt-Struktur (Researcher extrahiert Skill-Prompts aus SKILL.md als Basis)
- Resend `attachments`-Feld Format und Content-Type für .md-Dateien

## Deferred Ideas

- Phase 2 des Ausschreibungsskills (Bewerbungspaket) — bleibt manuell, kein Automatisierungsziel
- Web-Interface zum Browsen gespeicherter Analysen — v2 Scope
