# Phase 3: Full Analysis Integration - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Für jede Tier-A-Ausschreibung (Score ≥ 7) läuft automatisch eine vollständige Sonnet-Analyse auf Basis des TED Full Notice XML. Das Ergebnis (3 Markdown-Sektionen: Zusammenfassung, Fit-Bewertung, Checkliste) wird als .md-Datei-Anhang an den täglichen Digest geschickt. Hard Cap: maximal 5 Analysen pro Tag. Haiku- und Sonnet-Token-Kosten werden getrennt geloggt.

Phase 2 des Ausschreibungsskills (Bewerbungspaket erstellen) bleibt manuell — die automatisierte Pipeline liefert nur Analyse-Grundlagen.

</domain>

<decisions>
## Implementation Decisions

### Datengrundlage der Analyse
- **D-01:** TED Full Notice XML via TED API `/notices/{nd}` (oder gleichwertiger Endpoint) abrufen — ein extra API-Call pro Analyse, liefert vollständigen Ausschreibungstext für Sonnet-Kontext.
- **D-02:** `figures-config.md` und `references/portfolio.md` aus `ausschreibung-workspace/skill-snapshot-iter1/` werden ins Scanner-Repo als read-only Kontext-Dateien kopiert (z.B. `src/analysis/config/`) und als statischer String in den Sonnet-Prompt eingebettet.
- **D-03:** Nur Skill Phase 1 wird automatisiert — Zusammenfassung, Fit-Bewertung, Checkliste. Kein Bewerbungspaket (Phase 2 des Skills), das erfordert menschliche Entscheidung.

### Output-Format
- **D-04:** Alle drei Sektionen (01_zusammenfassung, 02_fit-bewertung, 03_checkliste) werden in einer einzigen Markdown-Datei pro Notice produziert. Dateiname: `{nd}-analyse.md`.

### Speicherort
- **D-05:** Neue SQLite-Tabelle `analyses` in der bestehenden `scanner.db`: Spalten `nd TEXT, run_id INTEGER, analysis_text TEXT, created_at TEXT`. Konsistent mit dem bestehenden Muster (seen_notices, triage_results, runs).
- **D-06:** Sonnet-Token-Verbrauch wird in neuen Spalten der `runs`-Tabelle geloggt: `sonnet_input_tokens`, `sonnet_output_tokens`, `sonnet_cost_usd` — parallel zu den bestehenden `haiku_*` Spalten (ANALYSIS-03).

### Digest-Integration
- **D-07:** Jede Vollanalyse wird als `.md`-Datei-Anhang (`{nd}-analyse.md`) an den Digest-E-Mail angehängt (via Resend `attachments`-Feld).
- **D-08:** Die Tier-A-Karte im Digest erhält einen kleinen Hinweis-Badge ("📎 Vollanalyse angehangen"). Die Karte selbst bleibt kompakt — kein Analyse-Text inline.

### Hard Cap & Reihenfolge
- **D-09:** Maximal 5 Sonnet-Analysen pro Tag (ANALYSIS-02). Bei mehr als 5 Tier-A-Notices: die 5 mit dem höchsten Score bekommen eine Analyse, der Rest wird im Digest mit einer Notiz versehen ("Analyse aufgrund des Tageslimits nicht erstellt").

### Claude's Discretion
- TED API Endpoint-Details für Full Notice XML (v3 API — Researcher soll konkreten Endpoint ermitteln)
- Sonnet-Prompt-Struktur (Researcher soll Skill-Prompts aus SKILL.md als Basis extrahieren)
- Resend `attachments`-Feld Format und Content-Type für .md-Dateien

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ausschreibungsskill (Analyse-Vorlage)
- `ausschreibung-workspace/skill-snapshot-iter1/SKILL.md` — Vollständiger Skill-Workflow: Phase 1 Analyse-Sektionen (01_zusammenfassung, 02_fit-bewertung, 03_checkliste), Prompt-Struktur, Bewertungskriterien für Fit-Score

### Bestehende Patterns im Scanner
- `src/triage/index.ts` — Pattern für Anthropic SDK-Nutzung, Token-Tracking, Batch-Verarbeitung
- `src/triage/prompt.ts` — Prompt-Aufbau (system prompt + notice-spezifischer user prompt)
- `src/email/digest.ts` — Digest-Builder, Tier-A-Karte `renderNoticeCard()`, E-Mail-Payload-Struktur
- `src/email/smtp.ts` — `sendDigestEmail()` via Resend — Anhang-Erweiterung hier nötig
- `src/db/queries.ts` — Named-Parameter INSERT-Patterns, Transaktions-Wrapper
- `src/db/index.ts` — DB-Schema-Migration-Pattern (WAL mode, CREATE TABLE IF NOT EXISTS)
- `src/runner.ts` — Pipeline-Integration: wo Analysis-Phase nach Triage eingeklinkt wird

### Requirements
- `.planning/REQUIREMENTS.md` §ANALYSIS — ANALYSIS-01, ANALYSIS-02, ANALYSIS-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `triageNotices()` in `src/triage/index.ts`: Zeigt das genaue Pattern für Anthropic SDK-Aufrufe mit Token-Tracking — Analysis-Modul soll gleiches Muster folgen
- `sendDigestEmail()` in `src/email/smtp.ts`: Braucht Erweiterung um `attachments?: Array<{filename, content}>` Parameter
- `renderNoticeCard()` in `src/email/digest.ts`: Muss Badge für "Vollanalyse angehangen" bekommen wenn `hasAnalysis: true`

### Established Patterns
- DB-Queries mit Named Parameters (`@nd`, `@runId`) — kein String-Interpolation (T-02-01)
- Triage-Fehler isoliert: einzelner Notice-Fehler bricht nicht den gesamten Job (TRIAGE-03 Pattern) — Analysis-Modul soll gleiches Error-Isolation-Pattern verwenden
- Sequentielle for-of-Schleife für API-Calls (verhindert concurrent Anthropic requests — T-02-02-C Pattern aus STATE.md)

### Integration Points
- Analysis-Phase wird in `src/runner.ts` nach der Triage-Phase eingeklinkt (zwischen `saveTriageResults()` und E-Mail-Versand)
- `finalizeRun()` in `src/db/queries.ts` braucht neue Sonnet-Token-Felder
- `buildDigest()` in `src/email/digest.ts` braucht zusätzliche Parameter für `analysisAttachments`

</code_context>

<specifics>
## Specific Ideas

- Analyse-Datei soll direkt weiterverwendbar sein für manuelle Bewerbung — daher .md Format (leicht abspeichern und bearbeiten)
- Die Tier-A-Karte im Digest soll kompakt bleiben — kein Analyse-Text inline, nur der Badge
- Figures-Config-Dateien aus dem Skill sollen kopiert und eingebettet werden (kein symlink, kein Runtime-Read) damit der Railway-Container eigenständig ist

</specifics>

<deferred>
## Deferred Ideas

- Phase 2 des Ausschreibungsskills (Bewerbungspaket: Kostenschätzung, Portfolio-Texte, Draft-Dokumente) — bleibt manuell
- Web-Interface zum Browsen gespeicherter Analysen — v2 Scope (REQUIREMENTS.md v2)
- Automatische Bewerbungseinreichung — explizit Out of Scope

</deferred>

---

*Phase: 3-full-analysis-integration*
*Context gathered: 2026-05-11*
