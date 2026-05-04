# Design Spec: Ausschreibungs-Skill für Figures

**Datum:** 2026-04-30  
**Status:** Approved  
**Auftraggeber:** Sascha Collet, Figures eGbR

---

## Überblick

Ein Claude-Skill, der den vollständigen Workflow der Ausschreibungsbearbeitung für Figures unterstützt — von der ersten Analyse bis zum fertigen Bewerbungspaket. Der Skill folgt einem gestuften Workflow mit einem Checkpoint nach der Fit-Bewertung.

---

## Kontext: Figures eGbR

Figures ist ein Design- und Developmentstudio (Berlin) spezialisiert auf:
- **Visualisierung**: Interaktive Charts, Animationen, 3D, Infografiken
- **Data Storytelling**: Scrollytelling-Microsites mit interaktiven Charts
- **Web Applications**: Websites mit CMS, Blogs, Mediatheken, Login-Bereiche

**Team:**
- Sascha Collet — Projektleitung, Konzeption (MA Soziologie, Projektmanagement GPM)
- Corinna Päffgen — Projektkoordination, Office Management
- David von Buseck — Kreativleitung, Design, Datenvisualisierung (BA Interface Design)
- Samed Kavak — Technische Umsetzung, Frontend Development (BSc Medizinische Informatik)

**Tagessätze** (konfigurierbar in `config/figures-config.md`):
- Konzept/Projektmanagement
- Design
- Development

---

## Workflow-Übersicht

```
Nutzer gibt Ordnerpfad → Phase 1 (automatisch) → Checkpoint → Phase 2 (nach Bestätigung)
```

### Phase 1 — Automatisch (kein User-Input nötig)

1. Alle Dokumente im Incoming-Ordner lesen
2. Drei Ausgabedateien erstellen:
   - `01_zusammenfassung.md`
   - `02_fit-bewertung.md`
   - `03_checkliste.md`
3. Fit-Score präsentieren und fragen, ob Phase 2 gestartet werden soll

### Checkpoint

Der Skill zeigt den Fit-Score mit kurzer Begründung und fragt:
> "Fit-Bewertung: **[Hoch/Mittel/Niedrig]** — [1-Satz-Begründung]. Soll ich den vollständigen Bewerbungsentwurf erstellen?"

### Phase 2 — Nach Bestätigung

Weitere Ausgabedateien im `Outgoing/`-Unterordner:
- `04_kosteneinschätzung.md`
- `05_portfolio-texte.md`
- Ein Draft-Dokument pro angefordertem Bewerbungsdokument

---

## Ausgabedateien — Detailformat

### `01_zusammenfassung.md`

```markdown
## Projekt-Snapshot
- Auftraggeber: [Name, Typ der Organisation]
- Thema: [Was soll erstellt werden]
- Budget/Rahmen: [falls angegeben]
- Abgabefrist: [Datum + Uhrzeit]
- Vergabeart: [öffentlich/freihändig/...]

## Für den Designer
- Stil-Anforderungen / Corporate Design
- Zielgruppe und Tonalität
- Kreative Freiheit vs. Vorgaben
- Barrierefreiheits-Anforderungen
- Lizenzen (CC, proprietär...)

## Für den Developer
- Technologie-Anforderungen / Präferenzen
- Integrationen (CMS, Karten, externe APIs)
- Hosting und Infrastruktur
- Performance / Barrierefreiheits-Standards (WCAG)
- Responsive / PWA-Anforderungen

## Für den Projektmanager
- Arbeitspakete und Meilensteine
- Kommunikations- und Abstimmungsanforderungen
- Anzahl Feedbackschleifen / Revisionen
- Vergabekriterien (Preis/Qualität-Gewichtung)
- Pitch / Präsentation gefordert?
```

### `02_fit-bewertung.md`

```markdown
## Fit-Score: [Hoch / Mittel / Niedrig]

## Stärken unserer Bewerbung
- [Was Figures besonders gut kann für dieses Projekt]
- [Referenzprojekte die gut passen]

## Risiken / Lücken
- [Anforderungen die wir nicht vollständig erfüllen]
- [Bereiche mit Unsicherheit]

## Wettbewerbssituation
- [Einschätzung der Konkurrenzsituation falls erkennbar]

## Empfehlung
[Bewerben / Mit Vorbehalt bewerben / Nicht bewerben]

**Begründung:** [2-3 Sätze]
```

### `03_checkliste.md`

```markdown
## Einzureichende Dokumente

| Dokument | Was zu tun ist | Deadline | Notizen |
|---|---|---|---|
| Angebotsformular | Ausfüllen + unterschreiben | [Datum] | PDF liegt vor |
| Eigenerklärung | Ausfüllen | [Datum] | ... |
| Konzept | Erstellen | [Datum] | Max. X Seiten |
| 3 Referenzprojekte | Aus Portfolio auswählen | [Datum] | Thema: ... |
| Preisblatt | Berechnen | [Datum] | Format: Netto+Brutto |
| Lebensläufe | Aktualisieren | [Datum] | Beteiligte Personen |

## Wichtige Fristen
- Abgabefrist: [Datum + Uhrzeit + Ort/Portal]
- Bieterfragen bis: [falls angegeben]
- Pitch/Präsentation: [Datum, falls gefordert]

## Technische Abgabe-Infos
- Abgabeweg: [Portal / E-Mail / physisch]
- Dateiformat: [PDF, signiert, ...]
- Besonderheiten: [...]
```

### `04_kosteneinschätzung.md`

Das Format passt sich flexibel an die Anforderungen der Leistungsbeschreibung an:

- Wenn **Tagessätze** gefordert: Tabelle mit Phase / Tage / Tagessatz / Summe
- Wenn **Stundensätze** gefordert: Tabelle mit Tätigkeit / Stunden / Stundensatz / Summe
- Wenn **Arbeitspakete** gefordert: Aufschlüsselung nach AP mit Gesamtpreis
- Wenn **Pauschalpreis** gefordert: Gesamtpreis mit interner Aufschlüsselung als Anhang

Immer enthalten:
- Annahmen und Unsicherheiten (was wurde geschätzt, wo ist Spielraum)
- Netto + Brutto (19% MwSt.)
- Hinweis auf optionale Positionen falls sinnvoll

**Phasen für die Schätzung:**
1. Konzept (Briefing, Ideenentwicklung, Informationsarchitektur)
2. Design (UI/UX, Datenvisualisierungen, Animationskonzepte)
3. Development (Frontend, Integrationen, Testing, Deployment)
4. Projektmanagement (Koordination, Kommunikation, Qualitätssicherung)
5. Bugfixing (falls separat sinnvoll)

### `05_portfolio-texte.md`

```markdown
## Firmenvorstellung
[Angepasster Einleitungstext, der Figures' Expertise und
 Relevanz für dieses spezifische Projekt hervorhebt.
 Im Stil der bestehenden Firmenvorstellung, aber thematisch
 auf das Projekt abgestimmt.]

## Team-Steckbriefe
[Für jede beteiligte Person:
 - Name + Qualifikationen (fest)
 - Rolle im Projekt (projektspezifisch formuliert)
 - Konkrete Aufgaben für dieses Projekt (im ZeStuR-Stil:
   Bullet-Points, spezifisch und kompetent klingend)]

## Konzept / Idee
[Projektspezifischer Konzepttext:
 - Unser Verständnis des Projekts und der Zielgruppe
 - Unser Ansatz und die Kernidee
 - Grobe Informationsarchitektur oder Visualisierungskonzept
 Länge: 200-400 Wörter, direkt einfügbar ins Portfolio-Dokument]

## Empfohlene Referenzprojekte
[3 Projekte aus dem Figures-Portfolio mit:
 - Projektname + Auftraggeber
 - Kurzbeschreibung (1-2 Sätze)
 - Warum dieses Referenzprojekt für die aktuelle Ausschreibung relevant ist]
```

### Draft-Bewerbungsdokumente

Pro angefordertem Dokument (aus Checkliste) eine eigene Datei im `Outgoing/`-Ordner:
- Dateiname = Dokumentname aus der Ausschreibung
- Vorgefertigte Struktur mit allen Pflichtfeldern
- Bereits ausgefüllte Standardinformationen (Firmenname, Kontakt etc.)
- Platzhalter für projektspezifische Inhalte klar markiert

---

## Dateistruktur

### Skill-Verzeichnis

```
ausschreibung/
├── SKILL.md                        ← Hauptinstruktionen
├── config/
│   └── figures-config.md           ← Tagessätze, Firmenprofil, Team, Kernkompetenzen
└── references/
    └── portfolio.md                ← Aufbereitetes Portfolio (einmalig vorbereitet)
```

### Output je Ausschreibung

```
[Ausschreibungsordner]/
├── Incoming/                       ← Heruntergeladene Ausschreibungsunterlagen
│   ├── Leistungsbeschreibung.pdf
│   ├── Angebotsformular.pdf
│   └── ...
├── 01_zusammenfassung.md
├── 02_fit-bewertung.md
├── 03_checkliste.md
└── Outgoing/                       ← Wird erst nach Checkpoint-Bestätigung erstellt
    ├── 04_kosteneinschätzung.md
    ├── 05_portfolio-texte.md
    ├── Konzept.md
    ├── Angebotsformular.md
    └── ...
```

---

## Konfigurationsdatei (`config/figures-config.md`)

Enthält (einmalig befüllen, selten ändern):
- Tagessätze pro Phase
- Firmenprofil-Text (Standardversion)
- Team-Steckbriefe (Standardversion)
- Kernkompetenzen und Alleinstellungsmerkmale
- Typische Ausschlusskritieren (Projekte die Figures nicht macht)

---

## Portfolio-Referenz (`references/portfolio.md`)

Einmalig aufbereitete, strukturierte Liste aller Figures-Projekte mit:
- Projektname + Auftraggeber
- Projektyp (Datenviz / Scrollytelling / Web App / Infografik)
- Themenbereich (Wissenschaft / Klima / Gesellschaft / ...)
- Kurzbeschreibung (2-3 Sätze)
- Technologien
- Besonderheiten / Awards

Wird genutzt für Fit-Bewertung (haben wir ähnliches gemacht?) und Referenzvorschläge.

---

## Trigger

Der Skill wird ausgelöst, wenn der Nutzer:
- Einen Ordnerpfad mit Ausschreibungsunterlagen nennt
- Phrases wie "neue Ausschreibung", "Ausschreibung analysieren", "Ausschreibungsunterlagen" verwendet
- Im Kontext von Tender-/Vergabedokumenten arbeitet

---

## Sprache

- **Analyse-Outputs** (01–03): Immer auf **Deutsch**, unabhängig von der Ausschreibungssprache
- **Bewerbungsdokumente** (Outgoing/): Passen sich an die **Sprache der Ausschreibung** an (typisch Deutsch, gelegentlich Englisch)

---

## Portfolio-Aufbereitung (Teil des Skill-Projekts)

Das vollständige Portfolio liegt als PDF vor (`Portfolio/Figures Portfolio gesamt_compressed.pdf`). Als Teil dieses Projekts wird die `references/portfolio.md` einmalig aus dem PDF aufgebaut.

**Erfasste Projekte (19):**

| Projekt | Auftraggeber | Typ | Thema | Services | Awards |
|---|---|---|---|---|---|
| Sternenhimmel der Menschheit | Stiftung Kunst und Natur | Interactive App, 360° | Kultur, Astronomie | Visual Identity, Graphic Design, Web Development | IiB Shortlist |
| Hirnorganoide | Leopoldina | Scrollytelling | Wissenschaft, Biologie | Illustration, Animation, Web Development | — |
| Artenvielfalt/Biodiversität | Leopoldina, acatech, Akademieunion | Data Scrollytelling | Wissenschaft, Umwelt | Illustration, Animation, Data Visualization, Web Development | IiB Shortlist |
| Wasserstoff Story | Fraunhofer ENIQ | Data Scrollytelling | Energie, Wissenschaft | Visual Identity, Illustration, Data Visualization, Web Development | — |
| Wind City | Figures | 3D-Scrollytelling | Energie, Wissenschaft | Concept, Visual Identity, 3D-Model, Web Development | — |
| Umwelt in Ostdeutschland | MDR / Hoferichter & Jacobs | Data Scrollytelling | Umwelt, Broadcast | Visual Identity, Illustration, Data Visualization, Web Development | Grimme Online Award |
| Research to Action Compass | Fraunhofer IAO, TU Berlin | Interactive Survey | Wissenschaft | Survey Design, Data Visualization, Web Development | — |
| Internet Health Report | Mozilla Foundation | Data Visualization | Digital, Gesellschaft | Data Analysis, Data Visualization, Development | — |
| Trade Briefs | International Trade Centre | Dashboard | Wirtschaft, Handel | Concept, Visual Identity, Data Visualization, UI-Design | — |
| Trails of Wind | Figures | Scrollytelling, Map | Geografie | Concept, Visual Identity, Mapdesign, Web Development | — |
| 100 Jahre Radio | Rundfunk Sinfonieorchester Berlin | Scrollytelling, 3D, Maps | Kultur, Geschichte | Design, Maps, 3D-Visualisations, Web Development | — |
| ReBalance | Forum for a New Economy | Website, Dataviz | Wirtschaft, Politik | Data Analysis, Data Visualization, Development | — |
| Acatech Jahresbericht | acatech | Website, Dataviz | Wissenschaft | Data Analysis, Data Visualization, Development | — |
| Digamus | Deutscher Museumsbund | WordPress-Website | Kultur, Museum | WordPress-Development, UI-Design | — |
| Trendreport | u-institut | Report, Data Analysis | Wirtschaft, KI | Data Analysis, Data Visualization, Infographic, Layout | — |
| Datalab | Badisches Landesmuseum | Generative Art, Animation | Kultur, Museum, KI | CSS-Implementation, Cables Animation | — |
| h2info | YOUNG ACADEMY FOR SUSTAINABILITY RESEARCH, Uni Freiburg | Interactive App, Webflow | Energie, Wissenschaft | Illustration, Infografik, UI-Design, Web Development | — |
| Die Ökonomie des Wassers | OECD Water Commission | Data Scrollytelling | Wasser, Nachhaltigkeit | Data Analysis, Data Visualization, Illustration, UI-Design, Web Development, Animation | — |
| SMART | Fraunhofer / Partner | Interactive Survey | Wirtschaft, Technologie | Concept, Design, Layout | — |

---

## Bekannte Limitierungen

- **Angebotsformulare**: Manche sind ausfüllbare PDFs — der Skill erstellt Markdown-Drafts, kann keine PDFs ausfüllen. Das ist explizit kein Ziel des Skills.
