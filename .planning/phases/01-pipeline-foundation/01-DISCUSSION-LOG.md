# Phase 1: Pipeline Foundation — Discussion Log

**Date:** 2026-05-06
**Areas discussed:** CPV-Code Auswahl, Filter-Schwellenwerte, Erster Run / Historische Daten

---

## Area 1: CPV-Code Auswahl

**Q: Wie breit anfangen mit CPV-Codes?**
Options: Breit starten (79xxx+92xxx+73xxx) / Nur Kern-Codes / Eigene Liste
→ **Breit starten** — mehr Treffer, Eingrenzung nach Produktionsdaten in Phase 4

**Q: Wie sollen die CPV-Codes konfiguriert werden?**
Options: JSON-Datei / Environment Variable
→ **JSON-Datei** — per Commit änderbar, kein Redeploy nötig

---

## Area 2: Filter-Schwellenwerte

**Q: Min-Budget-Filter?**
Options: Kein Filter / < 10.000 € / < 30.000 €
→ **Kein Min-Budget-Filter** — Haiku entscheidet in Phase 2

**Q: Länder-Filter?**
Options: Nur DE / DACH + EU / Kein Filter
→ **Nur Deutschland (DE)** — weniger Noise

---

## Area 3: Erster Run / Historische Daten

**Q: Beim allerersten Run wie weit zurück?**
Options: 4 Wochen / 2 Wochen / Nur ab heute
→ **2 Wochen zurück** — genug echte Daten für sofortigen Pipeline-Test

**Q: Folge-Runs wie weit zurück?**
Options: 2 Tage (mit 1-Tag Overlap) / 1 Tag
→ **2 Tage** — deckt UTC-Mitternacht-Lücken ab

---

## Deferred Ideas

- Min-Budget-Filter → Phase 4 (Tuning) wenn Produktionsdaten vorliegen
- DACH-Erweiterung → v2
- Korrigenda-Erkennung → v2

## Claude's Discretion

- SQLite-Schema Details (Planer entscheidet)
- Job-Lock-Implementierungsdetail (Planer entscheidet)
- Logging-Format (Planer entscheidet)
