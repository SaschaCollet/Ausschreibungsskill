# Phase 1: Pipeline Foundation - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

TED API täglich abfragen, Ergebnisse paginiert fetchen, dedupen, hart filtern (Land + Deadline) und in SQLite auf Railway persistieren. Kein LLM-Call, keine E-Mail in dieser Phase — die Datenskelett läuft end-to-end ohne stille Fehler.

</domain>

<decisions>
## Implementation Decisions

### CPV-Code Auswahl
- **D-01:** Breit starten — 79xxx (Unternehmensdienstleistungen / Kommunikation), 92xxx (Kulturelle Dienstleistungen), 73xxx (Forschung & Entwicklung) als Startmenge. Nach 4 Wochen Produktionsdaten anpassen.
- **D-02:** CPV-Codes werden in einer `cpv-codes.json`-Datei im Repo konfiguriert (nicht hardcoded, nicht als Env-Var). Änderbar per Commit ohne Redeploy.

### Filter-Schwellenwerte
- **D-03:** Kein Min-Budget-Filter — alle Ausschreibungen fetchen unabhängig vom Volumen. Haiku entscheidet in Phase 2 ob relevant.
- **D-04:** Länder-Filter: nur Deutschland (`DE`). Österreich, Schweiz und andere EU-Länder werden nicht berücksichtigt.
- **D-05:** Deadline-Filter: Ausschreibungen mit bereits abgelaufener Einreichungsfrist werden verworfen (Deadline muss in der Zukunft liegen).

### Erster Run / Historische Daten
- **D-06:** Beim allerersten Run werden 2 Wochen historische Daten gefetcht (erkannt über leere `seen_ids`-Tabelle oder `--initial` Flag). Gibt sofort echte Daten um Pipeline zu testen.
- **D-07:** Jeder Folge-Run fragt 2 Tage zurück (heute + gestern) — deckt UTC-Mitternacht-Lücken ab (Research-Empfehlung: 1-Tag Overlap).

### Claude's Discretion
- SQLite-Schema: Planer entscheidet was gespeichert wird. Minimum: `seen_ids` Tabelle (Notice-ID, first_seen timestamp). Empfohlen: auch Metadaten (Titel, CPV, Budget, Deadline) für spätere Debug-Fähigkeit.
- Job-Lock-Implementierung: SQLite `job_lock`-Tabelle oder Filesystem-Lock — Planer entscheidet.
- Logging-Format: Strukturiertes JSON-Logging (für Railway-Logs) oder plain text — Planer entscheidet.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext
- `.planning/PROJECT.md` — Projektziele, Constraints, Key Decisions
- `.planning/REQUIREMENTS.md` — Phase-1-Requirements: FETCH-01..04, DEDUP-01..03, FILTER-01..02, INFRA-01..04
- `.planning/ROADMAP.md` — Phase-1 Success Criteria (4 Kriterien)

### Technische Recherche
- `.planning/research/STACK.md` — Stack-Empfehlungen inkl. verifizierter TED-API-Domain, Railway-Volume-Setup, better-sqlite3-Konfiguration
- `.planning/research/ARCHITECTURE.md` — Komponenten-Grenzen, Pipeline-Struktur, Railway-Cron-Constraints
- `.planning/research/PITFALLS.md` — Kritische Pitfalls: Paginierung, SQLite-WAL, Railway-Volume, Datum-Overlap

### Kritische technische Fakten (aus Research)
- TED API: `api.ted.europa.eu/v3/notices/search` (POST, kein Auth erforderlich)
- Railway SQLite MUSS auf Volume unter `/data` liegen (Container-Filesystem ist ephemeral)
- Paginierung bis zur Erschöpfung ist Pflicht — `total_available` vs `total_fetched` loggen

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ausschreibung-workspace/` — bestehender Ausschreibungsskill (Phase 3 wird darauf aufbauen, Phase 1 muss die Input-Struktur noch nicht kennen)

### Established Patterns
- Kein bestehendes Code-Skeleton — Greenfield. Planer erstellt Projektstruktur.

### Integration Points
- Phase 2 baut auf dem SQLite-Schema auf (triage-Status, score werden hinzugefügt)
- Phase 3 liest Notice-Metadaten aus SQLite für den Ausschreibungsskill-Call

</code_context>

<specifics>
## Specific Ideas

- `cpv-codes.json` als separate Config-Datei (nicht in code hardcoded)
- Erster Run: 2-Wochen-Lookback über leere DB erkennbar (kein manuelles Flag nötig)
- Logs sollen `total_fetched` vs `total_available` pro Run ausgeben (FETCH-04 Requirement)

</specifics>

<deferred>
## Deferred Ideas

- Min-Budget-Filter: könnte in Phase 4 (Tuning) aktiviert werden wenn Daten zeigen dass Kleinstaufträge Noise erzeugen
- DACH-Erweiterung (AT/CH): v2
- Korrigenda/Amendment-Erkennung: v2

</deferred>

---

*Phase: 1-Pipeline-Foundation*
*Context gathered: 2026-05-06*
