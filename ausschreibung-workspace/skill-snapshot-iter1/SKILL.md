---
name: ausschreibung
description: Analysiert Ausschreibungsunterlagen für Figures eGbR und erstellt ein vollständiges Bewerbungspaket. Nutze diesen Skill immer wenn: ein Ordner mit Vergabe- oder Ausschreibungsunterlagen analysiert werden soll, Phrases wie "neue Ausschreibung", "Ausschreibung analysieren", "Ausschreibungsunterlagen prüfen", "Bewerbungsunterlagen erstellen" fallen, PDF-Dokumente mit Leistungsbeschreibung, Angebotsformular, Vergabebedingungen oder ähnlichem vorliegen, oder Figures bei einem Auftrag anbieten möchte.
---

# Ausschreibungs-Workflow für Figures eGbR

Du hilfst Figures eGbR, einem Berliner Design- und Developmentstudio für Datenviz und Wissenschaftskommunikation, dabei Ausschreibungen zu analysieren und Bewerbungsunterlagen zu erstellen.

## Schritt 0: Referenzdokumente laden

Lese zuerst diese zwei Dateien aus dem Skill-Verzeichnis:
1. `config/figures-config.md` — Firmenprofil, Tagessätze, Team-Steckbriefe
2. `references/portfolio.md` — Alle Figures-Projekte als Referenz

Dann lese alle Dokumente im vom Nutzer angegebenen Ausschreibungsordner. Wenn der Ordner einen `Incoming/`-Unterordner hat, lese die Dateien darin. Ansonsten lese alle Dokumente direkt im angegebenen Ordner.

## Phase 1 — Analyse (automatisch, kein User-Input nötig)

Erstelle drei Markdown-Dateien direkt im Ausschreibungsordner:

### 01_zusammenfassung.md

**Sprache: Immer Deutsch.**

Strukturiere in vier Abschnitte:

**## Projekt-Snapshot**
- Auftraggeber: Name und Organisationstyp (z.B. Bundesbehörde, Forschungsinstitut, NGO)
- Was erstellt werden soll: 2-3 Sätze — Hauptprodukt plus wichtigste funktionale Merkmale / Deliverables (z.B. Anzahl Module, Sprachen, Formate, Kernfunktionen wie Filter, User-Accounts, Admin-Bereich)
- Budget / Auftragsvolumen: Falls angegeben; wenn nicht: "Nicht angegeben — grobe Schätzung auf Basis Projektgröße: ca. [X €] netto"
- Abgabefrist: Datum + Uhrzeit
- Bieterfragen möglich bis: Datum falls angegeben, sonst "Nicht spezifiziert"
- Vergabeart: z.B. öffentliche Ausschreibung, beschränkte Ausschreibung, freihändige Vergabe

**## Für den Designer**
- Stil-Anforderungen und Corporate Design-Vorgaben
- Zielgruppe und gewünschte Tonalität
- Kreative Freiheit vs. feste Vorgaben
- Scope: Was gestaltet Figures selbst, was liefert der Auftraggeber? (z.B. "Infografiken vom AG, Figures nur Web-Integration")
- Output-Format: Statisch/Print (Vektor, Druckauflösung), interaktiv (Web), Animation, oder Mixed
- Barrierefreiheits-Anforderungen (WCAG-Stufe, Alternativtexte, Kontraste)
- Lizenzanforderungen (Creative Commons Variante, proprietär, Open Source)

**## Für den Developer**
- Technologie-Anforderungen oder -präferenzen (explizit genannte Tools/Frameworks)
- Integrationen (CMS, Karten, externe APIs, Datenquellen)
- Hosting und Infrastruktur (eigene Server, Cloud, Anbieter-Vorgaben)
- Performance- und Barrierefreiheits-Standards
- Responsive / PWA-Anforderungen
- Mehrsprachigkeit

**## Für den Projektmanager**
- Arbeitspakete und Meilensteine (wie in der Leistungsbeschreibung definiert)
- Kommunikations- und Abstimmungsanforderungen
- Anzahl Feedbackschleifen / Revisionen
- Vergabekriterien: Preis/Qualität-Gewichtung mit Prozentzahlen falls angegeben
- Pitch / Präsentation gefordert? (Ja/Nein, Datum, Format)

Wenn die Ausschreibung zu einem Punkt nichts sagt: schreibe "Nicht spezifiziert" — lass keine Überschrift weg.

### 02_fit-bewertung.md

**Sprache: Immer Deutsch.**

Vergleiche die Ausschreibungsanforderungen mit dem Figures-Portfolio und den Kernkompetenzen aus der config-Datei. Sei ehrlich — die Fit-Bewertung ist ein echtes Entscheidungsinstrument.

**## Fit-Score: [Hoch / Mittel / Niedrig]**

Bestimme den Score nach diesen Kriterien:
- **Hoch**: Figures hat direkte Referenzprojekte im selben Bereich, alle gefragten Services passen zu den Kernkompetenzen, realistische Projektgröße
- **Mittel**: Überschneidung in Teilen, aber Lücken oder unbekannte Anforderungen; oder Projekt ist grenzwertig groß/klein
- **Niedrig**: Figures hat kaum relevante Referenzen, oder die Anforderungen fallen außerhalb der Kernkompetenzen (z.B. reine Printprodukte, Marketing ohne Wissenschaftsbezug)

Prüfe auch die **Komplexität und Projektgröße**: Ein Projekt über ~60 Tage Gesamtaufwand ist für das 4-Personen-Team kritisch — bewerte explizit ob es neben laufenden Projekten bewältigbar erscheint. Wenn Projektgröße unbekannt: schätze auf Basis der Deliverables.

**## Stärken unserer Bewerbung**
- Was Figures besonders gut kann für dieses Projekt
- Nenne konkrete Projekte aus references/portfolio.md die thematisch oder technisch ähnlich sind (Projektname + warum relevant)

**## Risiken / Lücken**
- Anforderungen die Figures nicht oder nur eingeschränkt erfüllt
- Bereiche mit Unsicherheit
- Potenzielle Nachteile gegenüber dem Wettbewerb

**## Wettbewerbssituation**
- Einschätzung falls erkennbar: Öffentliche Ausschreibung (viele Bieter) vs. direkter Auftrag, Anzahl angefragter Bieter falls angegeben

**## Empfehlung**
[Bewerben / Mit Vorbehalt bewerben / Nicht bewerben]

**Begründung:** 2-3 Sätze die die Empfehlung begründen.

### 03_checkliste.md

**Sprache: Immer Deutsch.**

Extrahiere aus allen Ausschreibungsunterlagen alle einzureichenden Dokumente. Schau besonders in: Checkliste der einzureichenden Unterlagen, Bewerbungsbedingungen, Angebotsaufforderung.

```
## Einzureichende Dokumente

| Dokument | Was zu tun ist | Deadline | Notizen |
|---|---|---|---|
| [Dokumentname] | [Ausfüllen / Erstellen / Auswählen / Unterschreiben] | [Datum] | [Format, Seitenanzahl, Besonderheiten] |

## Wichtige Fristen
- Abgabefrist: [Datum + Uhrzeit]
- Abgabeweg: [Portal-URL / E-Mail / physisch]
- Bieterfragen möglich bis: [Datum falls angegeben]
- Pitch/Präsentation: [Datum + Format, falls gefordert]

## Technische Abgabe-Informationen
- Dateiformat: [z.B. PDF, signiert, max. Dateigröße]
- Besonderheiten: [z.B. qualifizierte elektronische Signatur nötig]
```

## Checkpoint

Zeige nach Fertigstellung der drei Dateien:

> **Analyse abgeschlossen.** Fit-Bewertung: **[Score]** — [1-Satz aus der Empfehlung].
> Soll ich den vollständigen Bewerbungsentwurf erstellen?

Warte auf Bestätigung. Wenn der Nutzer ablehnt oder abbricht: belasse es bei den drei Analyse-Dateien.

## Phase 2 — Bewerbungspaket (nur nach Bestätigung)

Erstelle einen `Outgoing/`-Unterordner im Ausschreibungsordner und lege dort folgende Dateien ab.

**Sprache der Outgoing-Dateien:** Erkenne die Sprache der Leistungsbeschreibung. Ist sie Deutsch: alle Outgoing-Dokumente auf Deutsch. Ist sie Englisch: auf Englisch.

### 04_kosteneinschätzung.md

Wähle das Format basierend auf dem, was die Leistungsbeschreibung fordert:

**Tagessätze** (Standard wenn nichts anderes gefordert):
```
## Kostenschätzung

| Phase | Tage | Tagessatz | Summe |
|---|---|---|---|
| Konzept | [N] | [€/Tag] | [€] |
| Design | [N] | [€/Tag] | [€] |
| Development | [N] | [€/Tag] | [€] |
| Projektmanagement | [N] | [€/Tag] | [€] |
| **Gesamt (netto)** | | | **[€]** |
| MwSt. 19% | | | [€] |
| **Gesamt (brutto)** | | | **[€]** |

## Annahmen und Unsicherheiten
- [Was wurde geschätzt und warum]
- [Wo ist Spielraum nach oben/unten]
```

**Arbeitspakete** (wenn die LB explizit Arbeitspakete definiert): Schlüssle die Kosten nach den in der LB definierten Arbeitspaketen auf, mit Netto + Brutto pro AP und als Gesamtsumme.

**Orientierungswerte für die Schätzung:**
- Einzelne statische Grafiken / Infografiken: 3-8 Tage gesamt
- Animierte Einzelvisualisierung: 5-12 Tage gesamt
- Scrollytelling-Microsite (einfach): 15-25 Tage gesamt
- Scrollytelling-Microsite (komplex, 3D): 25-50 Tage gesamt
- Website-Relaunch (mittel): 30-60 Tage gesamt
- Progressive Web App / komplexe Web-App: 60-120 Tage gesamt

Passe die Schätzung an die konkreten Anforderungen der Leistungsbeschreibung an.

### 05_portfolio-texte.md

Diese Datei liefert Texte die direkt ins Figures-Portfolio-Dokument eingefügt werden können.

**## Firmenvorstellung**
Passe die Standardbeschreibung aus config/figures-config.md thematisch auf das Projekt an. Betone die Expertise die für dieses Projekt besonders relevant ist. Bleibe im Stil des Originals. Länge: ca. 100-150 Wörter.

**## Team-Steckbriefe**
Für alle vier Teammitglieder. Qualifikationen (fest aus config). Aufgaben im Projekt: projektspezifisch formuliert (präzise Bullet-Points, zeigen dass wir das Projekt durchdacht haben). Nicht generisch — zeige dass die Person konkret an diesem Projekt gearbeitet hat.

**## Konzept / Idee**
Projektspezifischer Konzepttext:
- Unser Verständnis des Projekts und der Zielgruppe
- Unser Ansatz und die Kernidee
- Grobe Informationsarchitektur oder Visualisierungskonzept

Länge: 200-400 Wörter. Direkt einfügbar. Überzeugend und konkret — zeige dass wir das Thema verstehen.

**## Empfohlene Referenzprojekte**
3 Projekte aus references/portfolio.md. Für jedes:
- Projektname + Auftraggeber
- Kurzbeschreibung (1-2 Sätze)
- Warum dieses Projekt für die aktuelle Ausschreibung relevant ist (1 Satz)

Wähle Projekte die thematisch oder technisch am nächsten sind. Dabei gilt:
- **Nie mehr als 1 Projekt vom selben Auftraggeber** — Referenzvielfalt zeigt Breite, nicht nur eine Kundenbeziehung
- **Output-Format beachten**: Für statische/Print-Grafiken (Vektordateien, Druckformate) bevorzuge Trendreport oder Acatech Jahresberichte; für interaktive Web-Projekte bevorzuge Scrollytelling/App-Referenzen
- Erkläre den konkreten Bezug: technische Überschneidung UND thematische Relevanz

### Draft-Dokumente

Für jedes in 03_checkliste.md aufgeführte Dokument das erstellt oder ausgefüllt werden muss:

- Erstelle eine eigene Datei im `Outgoing/`-Ordner
- Dateiname = Dokumentname aus der Ausschreibung (z.B. `Konzept.md`)
- Fülle Firmendaten aus config/figures-config.md bereits ein
- Schreibe echte Entwürfe — kein "TBD" oder Lückentexte
- Markiere Stellen die Figures selbst ausfüllen muss mit: `[AUSFÜLLEN: Beschreibung]`
- Bei Konzepten: Schreibe einen vollständigen Erstentwurf basierend auf der Leistungsbeschreibung und den portfolio-texte aus 05_portfolio-texte.md

**Hinweis:** Angebotsformulare sind oft ausfüllbare PDFs — der Skill erstellt in diesem Fall ein Markdown-Draft mit allen Feldern und Werten als Vorlage zum manuellen Ausfüllen.
