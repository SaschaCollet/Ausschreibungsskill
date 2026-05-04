# Ausschreibungs-Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen Claude-Skill für Figures eGbR bauen, der Ausschreibungsunterlagen analysiert und ein vollständiges Bewerbungspaket (Zusammenfassung, Fit-Bewertung, Checkliste, Kostenschätzung, Portfolio-Texte, Draft-Dokumente) erstellt.

**Architecture:** Ein einzelner Skill (`ausschreibung`) mit drei Schichten: Hauptinstruktionen (SKILL.md), Firmenkonfiguration (config/figures-config.md) und Portfolio-Referenz (references/portfolio.md). Der Skill folgt einem gestuften Workflow: Phase 1 läuft automatisch, dann Checkpoint, Phase 2 nach Bestätigung.

**Tech Stack:** Claude Skill (Markdown-Instruktionen), kein Code außer Shell-Befehlen zum Anlegen der Struktur. Evaluation via skill-creator eval-Workflow.

---

## Dateistruktur

```
~/.claude/skills/ausschreibung/          ← Skill-Installation
├── SKILL.md                             ← Hauptinstruktionen
├── config/
│   └── figures-config.md               ← Firmendaten, Tagessätze (AUSFÜLLEN nötig), Team
└── references/
    └── portfolio.md                     ← Alle 19 Figures-Projekte strukturiert

~/Dev/Ausschreibungsskill/               ← Entwicklungs-Workspace
├── ausschreibung-workspace/
│   ├── evals/
│   │   └── evals.json
│   └── iteration-1/
│       ├── eval-0/
│       ├── eval-1/
│       └── eval-2/
└── docs/superpowers/
    ├── plans/2026-04-30-ausschreibung-skill.md  ← diese Datei
    └── specs/2026-04-30-ausschreibung-design.md
```

---

## Task 1: Skill-Verzeichnisstruktur anlegen

**Files:**
- Create: `~/.claude/skills/ausschreibung/SKILL.md` (leer, Platzhalter)
- Create: `~/.claude/skills/ausschreibung/config/figures-config.md` (leer)
- Create: `~/.claude/skills/ausschreibung/references/portfolio.md` (leer)

- [ ] **Step 1: Verzeichnisstruktur erstellen**

```bash
mkdir -p ~/.claude/skills/ausschreibung/config
mkdir -p ~/.claude/skills/ausschreibung/references
```

Expected: Kein Output, kein Fehler.

- [ ] **Step 2: Leere Dateien anlegen und prüfen**

```bash
touch ~/.claude/skills/ausschreibung/SKILL.md
touch ~/.claude/skills/ausschreibung/config/figures-config.md
touch ~/.claude/skills/ausschreibung/references/portfolio.md
ls -R ~/.claude/skills/ausschreibung/
```

Expected Output:
```
~/.claude/skills/ausschreibung/:
SKILL.md  config/  references/

~/.claude/skills/ausschreibung/config/:
figures-config.md

~/.claude/skills/ausschreibung/references/:
portfolio.md
```

---

## Task 2: figures-config.md befüllen

**Files:**
- Write: `~/.claude/skills/ausschreibung/config/figures-config.md`

Diese Datei enthält alle statischen Figures-Daten die der Skill als Kontext braucht. Die Tagessätze sind Platzhalter — Sascha füllt sie manuell aus.

- [ ] **Step 1: figures-config.md schreiben**

Schreibe folgenden Inhalt nach `~/.claude/skills/ausschreibung/config/figures-config.md`:

```markdown
# Figures eGbR — Konfiguration für Ausschreibungs-Skill

## Firmendaten

**Name und Rechtsform:** Figures eGbR  
**Gründung:** 2019  
**Adresse:** Mühlenstraße 8a, 14167 Berlin  
**Website:** www.figures.cc  
**Kontakt:** contact@figures.cc | +49 (0)30 200 087 22  
**Umsatzsteuer-ID:** DE327175883

**Standardbeschreibung (kurz, ~100 Wörter):**
Figures ist ein Design- und Developmentstudio, das sich auf die Visualisierung von
komplexen Informationen spezialisiert hat. Wir verfügen über umfangreiche Expertise
in der visuellen Aufbereitung von Daten in Form von Animationen, Infografiken oder
Präsentationen. Wir arbeiten mit JavaScript, Webflow, WordPress und verschiedenen
Tools wie D3, Lottie oder WebGL, um jedes Thema angemessen präsentieren zu können.

**Services:**
- Visualisierung: Interaktive Charts, Animationen, 3D-Darstellungen, Infografiken
- Data Storytelling: Scrollytelling-Microsites mit interaktiven Charts, animierter UI
- Web Application: Websites mit CMS, Blogs, Mediatheken, Login-Bereiche

**Ausgewählte Kunden:**
International Trade Center, Mozilla, Leopoldina, Stiftung Kunst und Natur, MDR,
TU Berlin, Fraunhofer IAO, Acatech, HateAid, Fraunhofer ENIQ, Akademieunion,
Neue deutsche Medienmacher, Campact, IG Metall, Universität Freiburg, Rundfunk
Sinfonieorchester Berlin, Smart City Mannheim, Forum for a New Economy, OECD,
Potsdam-Institut für Klimafolgenforschung, Badisches Landesmuseum,
Deutscher Museumsbund

**Awards:**
- Grimme Online Award 2022 (Projekt: Umwelt in Ostdeutschland, Kunde: MDR)
- Information is Beautiful Shortlist (Sternenhimmel der Menschheit; Artenvielfalt)

---

## Tagessätze

<!-- Sascha: Bitte hier die aktuellen Tagessätze eintragen -->
- Konzept: [AUSFÜLLEN: €/Tag]
- Design: [AUSFÜLLEN: €/Tag]
- Development: [AUSFÜLLEN: €/Tag]
- Projektmanagement: [AUSFÜLLEN: €/Tag]

---

## Team-Steckbriefe

### Sascha Collet — Projektleitung & Konzeption
**Qualifikationen:** MA Soziologie | Fachkraft agile Führung (IHK) |
Zertifizierter Projektmanagement-Fachmann (GPM) | Gründer und Geschäftsführer Figures

**Standardaufgaben im Projekt:**
- Gesamtprojektleitung und Hauptansprechpartner
- Erstellung und Überwachung des Projektplans sowie des Budgets
- Konzeptionelle Entwicklung der Informationsarchitektur und des Narrativs
- Koordination zwischen Design, Development und redaktionellen Inhalten
- Qualitätssicherung von Inhalten, Designs und technischen Lieferobjekten

### Corinna Päffgen — Projektkoordination
**Qualifikationen:** Betriebswirtin (VWA) | Bankkauffrau UniCredit Group |
Projektmanagerin & Office-Managerin Figures

**Standardaufgaben im Projekt:**
- Stellvertretende Projektleitung und Vertretung von Sascha Collet
- Koordination von Lieferterminen und internen Abstimmungsprozessen
- Administrative Dokumentation und Kommunikationsunterstützung

### David von Buseck — Kreativleitung & Design
**Qualifikationen:** BA Interface Design | Infographic Artist & Data Visualist
INFOGRAPHICS GROUP | Gründer und Geschäftsführer Figures

**Standardaufgaben im Projekt:**
- Visuelles Gesamtkonzept und Designsystem
- Layout und UI/UX-Design
- Infografiken, Datenvisualisierungen und Animationskonzepte
- Interaktive Prototypen in Figma

### Samed Kavak — Technische Umsetzung & Development
**Qualifikationen:** BSc Medizinische Informatik (Universität Heidelberg) |
Geschäftsführer Web N App Programming GmbH

**Standardaufgaben im Projekt:**
- Implementierung aller interaktiven Module und Frontendkomponenten
- Barrierefreiheit nach WCAG 2.1 AA und umfassendes Cross-Browser-Testing
- Performance-Optimierung: Lazy Loading, Bildkomprimierung, schnelle Ladezeiten
- Deployment & Hosting-Integration sowie technische Dokumentation

---

## Kernkompetenzen

- Visualisierung komplexer wissenschaftlicher und gesellschaftlicher Themen
- Scrollytelling und interaktives Data Storytelling
- 3D-Visualisierungen und Animationen (Three.js, WebGL, Cables, Lottie)
- Interaktive Karten (MapLibre GL JS, OpenStreetMap)
- Web-Technologien: React, Next.js, TypeScript, D3.js, Webflow, WordPress
- CMS-Integration: WordPress, Webflow, Supabase, Typo3
- Barrierefreiheit (WCAG 2.1 AA, Alternativtexte, Tastaturnavigation)
- Responsive und Mobile-first Design
- Generative Art und KI-gestützte Visualisierungen

---

## Ausschlusskriterien

(Projekte die Figures typischerweise nicht annimmt — niedrigen Fit-Score vergeben)
- Reine Print-Projekte ohne digitale Komponente
- Marketing / Werbung ohne Informations- oder Wissenschaftsbezug
- Projekte unter ca. 5.000 € Auftragsvolumen
- Projekte bei denen proprietäre Daten nicht zugänglich gemacht werden können
```

- [ ] **Step 2: Datei prüfen**

```bash
wc -l ~/.claude/skills/ausschreibung/config/figures-config.md
head -5 ~/.claude/skills/ausschreibung/config/figures-config.md
```

Expected: Datei hat >80 Zeilen, erste Zeile ist `# Figures eGbR — Konfiguration für Ausschreibungs-Skill`.

- [ ] **Step 3: Tagessätze eintragen (manuell durch Sascha)**

Öffne `~/.claude/skills/ausschreibung/config/figures-config.md` und ersetze die vier `[AUSFÜLLEN: €/Tag]`-Platzhalter mit den echten Tagessätzen. Danach verifizieren:

```bash
grep "AUSFÜLLEN" ~/.claude/skills/ausschreibung/config/figures-config.md
```

Expected: Kein Output (alle Platzhalter ersetzt).

---

## Task 3: references/portfolio.md aufbauen

**Files:**
- Write: `~/.claude/skills/ausschreibung/references/portfolio.md`

Quelle: `/Users/saschacollet/Dev/Ausschreibungsskill/Portfolio/Figures Portfolio gesamt_compressed.pdf` — bereits vollständig gelesen und extrahiert.

- [ ] **Step 1: portfolio.md schreiben**

Schreibe folgenden Inhalt nach `~/.claude/skills/ausschreibung/references/portfolio.md`:

```markdown
# Figures Portfolio — Referenzprojekte

Alle 19 Projekte mit Typ, Thema, Services und Besonderheiten.
Genutzt für Fit-Bewertung und Referenzvorschläge in Bewerbungen.

---

## Sternenhimmel der Menschheit
**Auftraggeber:** Stiftung Kunst und Natur  
**Typ:** Interactive App, 360°-Projektion, Touch-Display  
**Thema:** Kultur, Astronomie, Kulturvermittlung  
**Services:** Visual Identity, Graphic Design, Web Development  
**Beschreibung:** Visualisierung von Sternbildern aus 14 Kulturen weltweit. Touch-Tisch
für Ausstellungsbesucher und großflächige 360°-Animation. Im engen Austausch mit
Autoren, einer Künstlerin und einem Astronomen entwickelt.  
**Awards:** Information is Beautiful Shortlist

---

## Hirnorganoide
**Auftraggeber:** Leopoldina (Nationale Akademie der Wissenschaften)  
**Typ:** Scrollytelling-Microsite  
**Thema:** Wissenschaft, Biologie, Wissenschaftskommunikation  
**Services:** Illustration, Animation, Web Development  
**Beschreibung:** Digitales Dossier zu Hirnorganoiden in drei Teilen: Hirnfunktionen,
Was sind Hirnorganoide?, Ethische Fragen. 3D-Darstellungen, Vektor-Animationen,
Fotos aus Laboren. Responsive, barrierearm, Corporate Design Leopoldina.

---

## Artenvielfalt — Biodiversität und Management von Agrarlandschaften
**Auftraggeber:** Leopoldina, acatech, Akademieunion  
**Typ:** Data Scrollytelling, Interactive App  
**Thema:** Wissenschaft, Umwelt, Biodiversität  
**Services:** Illustration, Animation, Data Visualization, Web Development  
**Beschreibung:** Interaktives Storytelling basierend auf Studie zum Rückgang der
Biodiversität. Interaktive Datenvisualisierungen, animierte 3D-Landschaften
(selbst modelliert), sortierbarer Katalog mit Handlungsvorschlägen.  
**Awards:** Information is Beautiful Shortlist  
**Referenz:** *"Figures lieferten eigene kreative Ideen und der Austausch war angenehm
und produktiv." — Johannes Mengel, Leopoldina*

---

## Wasserstoff Story
**Auftraggeber:** Fraunhofer ENIQ  
**Typ:** Data Scrollytelling  
**Thema:** Energie, Wasserstoff, Wissenschaftskommunikation  
**Services:** Visual Identity, Illustration, Data Visualization, Web Development  
**Beschreibung:** Große Datenbasis analysiert, mehrere interaktive Visualisierungen
entwickelt. Scrollytelling das Forschungsergebnisse für Fachpublikum und
interessierte Laien zugänglich macht.

---

## Wind City
**Auftraggeber:** Figures (Eigenproduktion)  
**Typ:** 3D-Scrollytelling, Interactive App  
**Thema:** Energie, Windkraft, Wissenschaft  
**Services:** Concept, Visual Identity, 3D-Model, Web Development  
**Beschreibung:** Erklärt das Innenleben einer Windkraftanlage. Nach kurzem
Scrollytelling können User ein 3D-Modell der Turbine erkunden und Parameter wie
Windstärke und Rotorgröße einstellen.

---

## Umwelt in Ostdeutschland
**Auftraggeber:** Hoferichter und Jacobs / MDR  
**Typ:** Data Scrollytelling, Broadcast  
**Thema:** Umwelt, Ostdeutschland, Broadcast  
**Services:** Visual Identity, Illustration, Data Visualization, Web Development  
**Beschreibung:** Informative Website für MDR-Dokumentationsreihe. Storyline führt
User von der Wolkendecke bis 80m unter die Erde. Echtzeitdaten vom Umweltbundesamt,
einzigartiges Design das für die Dokuserie adaptiert wurde.  
**Awards:** Grimme Online Award 2022

---

## Research to Action Compass
**Auftraggeber:** Fraunhofer IAO, TU Berlin  
**Typ:** Interactive Survey, Science Tool  
**Thema:** Wissenschaft, Wissenschaftskommunikation, Forschungstransfer  
**Services:** Survey Design, Data Visualization, Web Development  
**Beschreibung:** Instrument für Forschende um Möglichkeiten des gesellschaftlichen
Engagements zu finden. Kurze Befragung → personalisierte Vorschläge → Filtermöglichkeit.  
**Referenz:** *"Figures hat unsere Idee weitergedacht und hervorragend umgesetzt."
— Henriette Ruhrmann, TU Berlin*

---

## Internet Health Report
**Auftraggeber:** Mozilla Foundation  
**Typ:** Data Visualization, Report  
**Thema:** Digital, Gesellschaft, Internet  
**Services:** Data Analysis, Data Visualization, Development  
**Beschreibung:** Analyse vieler Datensätze, Visualisierungen in mehreren Iterationen
entwickelt. Darstellungen funktionieren in verschiedenen Kontexten: Stories,
Faktenübersichten, Social Media. Mischung aus ungewöhnlichen und vertrauten Stilen.

---

## Trade Briefs
**Auftraggeber:** International Trade Centre  
**Typ:** Dashboard, Data Visualization, Report  
**Thema:** Wirtschaft, Welthandel, Politik  
**Services:** Concept, Visual Identity, Data Visualization, UI-Design  
**Beschreibung:** Monatlicher Report über Welthandel. Komplexe Daten als übersichtliche,
attraktive, intuitive Webdarstellung. Datenvisualisierungen, Dashboards und gesamter
Auftritt der Trade Briefs konzipiert.

---

## Trails of Wind
**Auftraggeber:** Figures (Eigenproduktion)  
**Typ:** Scrollytelling, Interactive Map  
**Thema:** Geografie, Daten, Kartografie  
**Services:** Concept, Visual Identity, Mapdesign, Web Development  
**Beschreibung:** Interaktive Datengeschichte analysiert Weltmuster von Start- und
Landebahnen aus der Vogelperspektive. In Makroperspektive ergibt sich eine
Windkarte der Erde.

---

## 100 Jahre Radio
**Auftraggeber:** Rundfunk Sinfonieorchester Berlin  
**Typ:** Scrollytelling, 3D-Visualisierung, Maps  
**Thema:** Kultur, Geschichte, Radiogeschichte  
**Services:** Design, Maps, 3D-Visualisations, Web Development  
**Beschreibung:** Zwei umfassende Scrollytellings zur 100-jährigen Geschichte des Radios
(1923–heute). Visueller Aufhänger: erste und aktuelle Wirkstätte des Orchesters.
Akribische 3D-Rekonstruktion des Voxhauses (erste Rundfunkübertragung 1923).

---

## ReBalance
**Auftraggeber:** Forum for a New Economy  
**Typ:** Website, Interactive Tool, Data Visualization  
**Thema:** Wirtschaft, Politik, Verteilungsgerechtigkeit  
**Services:** Data Analysis, Data Visualization, Development  
**Beschreibung:** Tool das den Einfluss politischer Maßnahmen auf Verteilungsgerechtigkeit
zeigt. User können selbst ausprobieren welche Effekte verschiedene Instrumente haben.
Zusätzlich Hintergrundinformationen, Literatureinführungen, FAQs.

---

## Acatech Jahresberichte
**Auftraggeber:** acatech (Deutsche Akademie der Technikwissenschaften)  
**Typ:** Website, Data Visualization, Report  
**Thema:** Wissenschaft, Technik, Jahresbericht  
**Services:** Data Analysis, Data Visualization, Development  
**Beschreibung:** Jährliche Berichte auf neue Stufe gehoben. Einheitliches Design für
Web und PDF, interaktive Grafiken für die Onlineversion.

---

## Digamus
**Auftraggeber:** Deutscher Museumsbund  
**Typ:** WordPress-Website, Award-System  
**Thema:** Kultur, Museum, Digital  
**Services:** WordPress-Development, UI-Design  
**Beschreibung:** WordPress-Seite die vom Kunden in Eigenregie betrieben wird.
Enthält Einreichungs- und Abstimmungssystem für die Vergabe des DigAMus-Awards.

---

## Trendreport
**Auftraggeber:** u-institut  
**Typ:** Report, Data Analysis  
**Thema:** Wirtschaft, Innovation, KI  
**Services:** Data Analysis, Data Visualization, Infographic, Layout  
**Beschreibung:** Umfassender Datensatz innovativer Geschäftsideen analysiert,
bereinigt und operationalisiert. KI und Python-Skripte für tiefgreifende Analyse.
Zusammenhänge aufgedeckt, umfangreicher Datensatz generiert.

---

## Datalab
**Auftraggeber:** Badisches Landesmuseum  
**Typ:** Generative Art, Animation, KI  
**Thema:** Kultur, Museum, Digitale Kulturvermittlung  
**Services:** CSS-Implementation, Cables Animation  
**Beschreibung:** Klares UI-Design mit generativer 3D-Animation als Hintergrund.
Macht Museumsdaten durch KI-Technologien zugänglich und interaktiv.

---

## h2info
**Auftraggeber:** YOUNG ACADEMY FOR SUSTAINABILITY RESEARCH, Universität Freiburg  
**Typ:** Interactive App, Webflow  
**Thema:** Energie, Grüner Wasserstoff, Wissenschaft  
**Services:** Illustration, Infografik, UI-Design, Web Development  
**Leistungszeitraum:** 10/2024 – 03/2025  
**Beschreibung:** Data Story zu Grünem Wasserstoff. Bildsprache verbindet
wissenschaftlichen Anspruch mit Leichtigkeit. Webflow als CMS. Illustrationen
die auf Interaktion reagieren, konsequentes Farbsystem für Themenzugehörigkeit.

---

## Die Ökonomie des Wassers
**Auftraggeber:** OECD / Global Commission on the Economics of Water  
**Typ:** Data Scrollytelling, Report  
**Thema:** Wasser, Nachhaltigkeit, Klimapolitik  
**Services:** Data Analysis, Data Visualization, Illustration, UI-Design,
Web Development, Animation  
**Leistungszeitraum:** 06/2024 – 12/2024  
**Beschreibung:** Umfangreiche Data Story mit Illustrationen, Infografiken und
Datenanalysen. Botschaft der Kommission (kollektives Handeln für Nachhaltigkeit)
zugänglich machen und Zielgruppen emotional ansprechen. Vielzahl verschiedener
Visualisierungen: interaktiv, animiert, dynamisch eingebunden.

---

## SMART — Smart Services Maturity Index
**Auftraggeber:** Fraunhofer / Partner (Wirtschaft & Technologie)  
**Typ:** Interactive Survey, Tool  
**Thema:** Wirtschaft, Technologie, Digitalisierung  
**Services:** Concept, Design, Layout  
**Beschreibung:** Tool das Unternehmen hilft, technologische und organisatorische
Hürden zu erkennen. Quick Assessment: Konzept, Design und Layout von Figures
entwickelt, von Kunden umgesetzt.
```

- [ ] **Step 2: Datei prüfen**

```bash
grep "^## " ~/.claude/skills/ausschreibung/references/portfolio.md | wc -l
```

Expected: `19` (alle 19 Projekte vorhanden).

---

## Task 4: SKILL.md schreiben

**Files:**
- Write: `~/.claude/skills/ausschreibung/SKILL.md`

- [ ] **Step 1: SKILL.md schreiben**

Schreibe folgenden Inhalt nach `~/.claude/skills/ausschreibung/SKILL.md`:

````markdown
---
name: ausschreibung
description: Analysiert Ausschreibungsunterlagen für Figures eGbR und erstellt ein vollständiges Bewerbungspaket. Nutze diesen Skill immer wenn: ein Ordner mit Vergabe- oder Ausschreibungsunterlagen analysiert werden soll, Phrases wie "neue Ausschreibung", "Ausschreibung analysieren", "Ausschreibungsunterlagen prüfen", "Bewerbungsunterlagen erstellen" fallen, PDF-Dokumente mit Leistungsbeschreibung, Angebotsformular, Vergabebedingungen oder ähnlichem vorliegen, oder Figures bei einem Auftrag anbieten möchte.
---

# Ausschreibungs-Workflow für Figures eGbR

Du hilfst Figures eGbR, einem Berliner Design- und Developmentstudio für Datenviz
und Wissenschaftskommunikation, dabei Ausschreibungen zu analysieren und
Bewerbungsunterlagen zu erstellen.

## Schritt 0: Referenzdokumente laden

Lese zuerst diese zwei Dateien aus dem Skill-Verzeichnis:
1. `config/figures-config.md` — Firmenprofil, Tagessätze, Team-Steckbriefe
2. `references/portfolio.md` — Alle Figures-Projekte als Referenz

Dann lese alle Dokumente im vom Nutzer angegebenen Ausschreibungsordner.
Wenn der Nutzer nur einen Ordnerpfad nennt ohne Unterordner-Struktur, lese
alle darin enthaltenen Dokumente. Wenn der Ordner einen `Incoming/`-Unterordner
hat, lese die Dateien darin.

## Phase 1 — Analyse (automatisch, kein User-Input nötig)

Erstelle drei Markdown-Dateien direkt im Ausschreibungsordner:

### 01_zusammenfassung.md

**Sprache: Immer Deutsch.**

Strukturiere in vier Abschnitte:

**## Projekt-Snapshot**
- Auftraggeber: Name und Organisationstyp (z.B. Bundesbehörde, Forschungsinstitut, NGO)
- Was erstellt werden soll (in 1-2 Sätzen, konkret)
- Budget / Auftragsvolumen (falls angegeben, sonst: "Nicht angegeben")
- Abgabefrist: Datum + Uhrzeit
- Vergabeart: z.B. öffentliche Ausschreibung, beschränkte Ausschreibung, freihändige Vergabe

**## Für den Designer**
- Stil-Anforderungen und Corporate Design-Vorgaben
- Zielgruppe und gewünschte Tonalität
- Kreative Freiheit vs. feste Vorgaben
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

Wenn die Ausschreibung zu einem Punkt nichts sagt: schreibe "Nicht spezifiziert" —
lass keine Überschrift weg.

### 02_fit-bewertung.md

**Sprache: Immer Deutsch.**

Vergleiche die Ausschreibungsanforderungen mit dem Figures-Portfolio und den
Kernkompetenzen aus der config-Datei. Sei ehrlich — die Fit-Bewertung ist ein
echtes Entscheidungsinstrument.

**## Fit-Score: [Hoch / Mittel / Niedrig]**

Bestimme den Score nach diesen Kriterien:
- **Hoch**: Figures hat direkte Referenzprojekte im selben Bereich, alle
  gefragten Services passen zu den Kernkompetenzen, realistische Projektgröße
- **Mittel**: Überschneidung in Teilen, aber Lücken oder unbekannte Anforderungen;
  oder Projekt ist grenzwertig groß/klein
- **Niedrig**: Figures hat kaum relevante Referenzen, oder die Anforderungen
  fallen außerhalb der Kernkompetenzen (z.B. reine Printprodukte, Marketing ohne
  Wissenschaftsbezug)

**## Stärken unserer Bewerbung**
- Was Figures besonders gut kann für dieses Projekt
- Nenne konkrete Projekte aus references/portfolio.md die thematisch oder
  technisch ähnlich sind (Projektname + warum relevant)

**## Risiken / Lücken**
- Anforderungen die Figures nicht oder nur eingeschränkt erfüllt
- Bereiche mit Unsicherheit
- Potenzielle Nachteile gegenüber dem Wettbewerb

**## Wettbewerbssituation**
- Einschätzung falls erkennbar: Öffentliche Ausschreibung (viele Bieter) vs.
  direkter Auftrag, Anzahl angefragter Bieter falls angegeben

**## Empfehlung**
[Bewerben / Mit Vorbehalt bewerben / Nicht bewerben]

**Begründung:** 2-3 Sätze die die Empfehlung begründen.

### 03_checkliste.md

**Sprache: Immer Deutsch.**

Extrahiere aus allen Ausschreibungsunterlagen alle einzureichenden Dokumente.
Schau besonders in: Checkliste der einzureichenden Unterlagen, Bewerbungsbedingungen,
Angebotsaufforderung.

```markdown
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

Warte auf Bestätigung. Wenn der Nutzer ablehnt oder abbricht: belasse es bei den
drei Analyse-Dateien.

## Phase 2 — Bewerbungspaket (nur nach Bestätigung)

Erstelle einen `Outgoing/`-Unterordner im Ausschreibungsordner und lege dort
folgende Dateien ab.

**Sprache der Outgoing-Dateien:** Erkenne die Sprache der Leistungsbeschreibung.
Ist sie Deutsch: alle Outgoing-Dokumente auf Deutsch. Ist sie Englisch: auf Englisch.

### 04_kosteneinschätzung.md

Wähle das Format basierend auf dem, was die Leistungsbeschreibung fordert:

**Tagessätze** (Standard wenn nichts anderes gefordert):
```markdown
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

**Arbeitspakete** (wenn die LB explizit Arbeitspakete definiert):
Schlüssle die Kosten nach den in der LB definierten Arbeitspaketen auf,
mit Netto + Brutto pro AP und als Gesamtsumme.

**Orientierungswerte für die Schätzung (basierend auf Erfahrungswerten):**
- Einzelne statische Grafiken / Infografiken: 3-8 Tage gesamt
- Animierte Einzelvisualisierung: 5-12 Tage gesamt
- Scrollytelling-Microsite (einfach): 15-25 Tage gesamt
- Scrollytelling-Microsite (komplex, 3D): 25-50 Tage gesamt
- Website-Relaunch (mittel): 30-60 Tage gesamt
- Progressive Web App / komplexe Web-App: 60-120 Tage gesamt

Passe die Schätzung an die konkreten Anforderungen der Leistungsbeschreibung an.
Wenn spezifische Arbeitspakete mit Umfang angegeben sind, orientiere dich daran.

### 05_portfolio-texte.md

Diese Datei liefert Texte die direkt ins Figures-Portfolio-Dokument (InDesign/PDF)
eingefügt werden können.

**## Firmenvorstellung**
Passe die Standardbeschreibung aus config/figures-config.md thematisch auf das
Projekt an. Betone die Expertise die für dieses Projekt besonders relevant ist.
Bleibe im Stil des Originals. Länge: ca. 100-150 Wörter.

**## Team-Steckbriefe**
Für alle vier Teammitglieder. Qualifikationen (fest aus config). Aufgaben im
Projekt: projektspezifisch formuliert im ZeStuR-Stil (präzise Bullet-Points,
zeigen dass wir das Projekt durchdacht haben). Nicht generisch — zeige dass
die Person konkret an diesem Projekt gearbeitet hat.

**## Konzept / Idee**
Projektspezifischer Konzepttext:
- Unser Verständnis des Projekts und der Zielgruppe
- Unser Ansatz und die Kernidee
- Grobe Informationsarchitektur oder Visualisierungskonzept
Länge: 200-400 Wörter. Direkt einfügbar. Überzeugend und konkret — zeige dass
wir das Thema verstehen.

**## Empfohlene Referenzprojekte**
3 Projekte aus references/portfolio.md. Für jedes:
- Projektname + Auftraggeber
- Kurzbeschreibung (1-2 Sätze)
- Warum dieses Projekt für die aktuelle Ausschreibung relevant ist (1 Satz)

Wähle Projekte die thematisch oder technisch am nächsten sind.

### Draft-Dokumente

Für jedes in 03_checkliste.md aufgeführte Dokument das erstellt oder ausgefüllt
werden muss:

- Erstelle eine eigene Datei im `Outgoing/`-Ordner
- Dateiname = Dokumentname aus der Ausschreibung (z.B. `Konzept.md`)
- Fülle Firmendaten aus config/figures-config.md bereits ein
- Schreibe echte Entwürfe — kein "TBD" oder Lückentexte
- Markiere Stellen die Figures selbst ausfüllen muss mit: `[AUSFÜLLEN: Beschreibung]`
  (z.B. `[AUSFÜLLEN: Preis in €]`, `[AUSFÜLLEN: Datum der Unterzeichnung]`)
- Bei Konzepten: Schreibe einen vollständigen Erstentwurf basierend auf der
  Leistungsbeschreibung und den portfolio-texte aus 05_portfolio-texte.md

**Wichtig:** Angebotsformulare sind oft ausfüllbare PDFs — der Skill erstellt
in diesem Fall ein Markdown-Draft mit allen Feldern und Werten, das als
Vorlage zum manuellen Ausfüllen des PDFs dient.
````

- [ ] **Step 2: SKILL.md prüfen**

```bash
head -8 ~/.claude/skills/ausschreibung/SKILL.md
wc -l ~/.claude/skills/ausschreibung/SKILL.md
```

Expected: Erste Zeile `---`, frontmatter mit `name: ausschreibung`, Datei hat >100 Zeilen.

- [ ] **Step 3: Skill-Installation verifizieren**

```bash
ls -la ~/.claude/skills/ausschreibung/
ls ~/.claude/skills/ausschreibung/config/
ls ~/.claude/skills/ausschreibung/references/
```

Expected: Alle drei Dateien vorhanden (SKILL.md, config/figures-config.md, references/portfolio.md).

---

## Task 5: Testfälle aufsetzen (evals.json)

**Files:**
- Create: `~/Dev/Ausschreibungsskill/ausschreibung-workspace/evals/evals.json`

Drei realistische Testfälle aus den vorhandenen Beispielen:
- Eval 0: UmweltBundesamt (TN017) — klassische öffentliche Ausschreibung, Dataviz
- Eval 1: Leopoldina Hirnorganoide (TN010) — kürzere freihändige Vergabe, Scrollytelling
- Eval 2: GreenTrails (TN042) — komplexe PWA-Ausschreibung

- [ ] **Step 1: Workspace-Verzeichnis anlegen**

```bash
mkdir -p ~/Dev/Ausschreibungsskill/ausschreibung-workspace/evals
```

- [ ] **Step 2: evals.json schreiben**

Schreibe nach `~/Dev/Ausschreibungsskill/ausschreibung-workspace/evals/evals.json`:

```json
{
  "skill_name": "ausschreibung",
  "evals": [
    {
      "id": 0,
      "prompt": "Bitte analysiere diese Ausschreibung: /Users/saschacollet/Dev/Ausschreibungsskill/Beispiele/TN017 UmweltBundesamt/Incoming/",
      "expected_output": "Phase 1: 3 Markdown-Dateien (01_zusammenfassung.md, 02_fit-bewertung.md, 03_checkliste.md) im Ausschreibungsordner. Zusammenfassung strukturiert in Projekt-Snapshot + 3 Rollen. Fit-Score gesetzt. Checkliste mit Tabelle.",
      "files": []
    },
    {
      "id": 1,
      "prompt": "Neue Ausschreibung ist reingekommen, bitte analysieren: /Users/saschacollet/Dev/Ausschreibungsskill/Beispiele/TN010 Leopoldina_Hirnorganoide/Incoming/",
      "expected_output": "Phase 1: 3 Markdown-Dateien. Fit-Score Hoch (Scrollytelling-Microsite = Figures-Kernkompetenz, Leopoldina = bekannter Kunde). Checkpoint-Frage gestellt.",
      "files": []
    },
    {
      "id": 2,
      "prompt": "Kannst du dir mal die Ausschreibungsunterlagen von GreenTrails ansehen? /Users/saschacollet/Dev/Ausschreibungsskill/Beispiele/TN042 GreenTrails/Incoming/",
      "expected_output": "Phase 1: 3 Markdown-Dateien. Developer-Abschnitt detailliert (PWA, MapLibre, Tech-Stack-Anforderungen). Fit-Score Mittel oder Hoch. Checkliste vollständig.",
      "files": []
    }
  ]
}
```

- [ ] **Step 3: evals.json validieren**

```bash
python3 -c "import json; data=json.load(open('/Users/saschacollet/Dev/Ausschreibungsskill/ausschreibung-workspace/evals/evals.json')); print(f'OK: {len(data[\"evals\"])} evals')"
```

Expected: `OK: 3 evals`

---

## Task 6: Testläufe starten (mit Skill vs. ohne)

**Files:**
- Create: `~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/` (Verzeichnisse per Run)

- [ ] **Step 1: Iteration-Verzeichnisse anlegen**

```bash
mkdir -p ~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-0/with_skill/outputs
mkdir -p ~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-0/without_skill/outputs
mkdir -p ~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-1/with_skill/outputs
mkdir -p ~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-1/without_skill/outputs
mkdir -p ~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-2/with_skill/outputs
mkdir -p ~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-2/without_skill/outputs
```

- [ ] **Step 2: eval_metadata.json für jeden Eval erstellen**

Schreibe nach `~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-0/eval_metadata.json`:
```json
{
  "eval_id": 0,
  "eval_name": "umweltbundesamt-dataviz",
  "prompt": "Bitte analysiere diese Ausschreibung: /Users/saschacollet/Dev/Ausschreibungsskill/Beispiele/TN017 UmweltBundesamt/Incoming/",
  "assertions": [
    {"name": "creates_summary_file", "check": "01_zusammenfassung.md existiert im Ausschreibungsordner"},
    {"name": "creates_fit_file", "check": "02_fit-bewertung.md existiert"},
    {"name": "creates_checklist_file", "check": "03_checkliste.md existiert"},
    {"name": "summary_has_four_sections", "check": "01_zusammenfassung.md enthält alle 4 Abschnitte: Projekt-Snapshot, Für den Designer, Für den Developer, Für den Projektmanager"},
    {"name": "fit_score_set", "check": "02_fit-bewertung.md enthält einen Fit-Score (Hoch/Mittel/Niedrig)"},
    {"name": "checklist_has_table", "check": "03_checkliste.md enthält eine Markdown-Tabelle"},
    {"name": "checkpoint_question_asked", "check": "Skill stellt Checkpoint-Frage nach Phase 1"}
  ]
}
```

Schreibe nach `~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-1/eval_metadata.json`:
```json
{
  "eval_id": 1,
  "eval_name": "leopoldina-scrollytelling",
  "prompt": "Neue Ausschreibung ist reingekommen, bitte analysieren: /Users/saschacollet/Dev/Ausschreibungsskill/Beispiele/TN010 Leopoldina_Hirnorganoide/Incoming/",
  "assertions": [
    {"name": "creates_three_files", "check": "Alle 3 Phase-1-Dateien erstellt"},
    {"name": "fit_score_hoch", "check": "Fit-Score ist Hoch (Scrollytelling + Leopoldina = klare Figures-Stärke)"},
    {"name": "references_portfolio_project", "check": "Fit-Bewertung referenziert mindestens ein konkretes Portfolio-Projekt"},
    {"name": "german_language", "check": "Alle drei Dateien sind auf Deutsch verfasst"}
  ]
}
```

Schreibe nach `~/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-2/eval_metadata.json`:
```json
{
  "eval_id": 2,
  "eval_name": "greentrails-pwa",
  "prompt": "Kannst du dir mal die Ausschreibungsunterlagen von GreenTrails ansehen? /Users/saschacollet/Dev/Ausschreibungsskill/Beispiele/TN042 GreenTrails/Incoming/",
  "assertions": [
    {"name": "creates_three_files", "check": "Alle 3 Phase-1-Dateien erstellt"},
    {"name": "developer_section_detailed", "check": "Developer-Abschnitt enthält PWA- und Tech-Stack-Infos"},
    {"name": "checklist_complete", "check": "Checkliste enthält alle geforderten Dokumente aus der LB"},
    {"name": "checkpoint_asked", "check": "Checkpoint-Frage gestellt"}
  ]
}
```

- [ ] **Step 3: Sechs Subagenten parallel starten (3 with_skill + 3 without_skill)**

Starte je einen with_skill- und einen without_skill-Subagenten pro Eval gleichzeitig.

**with_skill prompt (für jeden Eval):**
```
Execute this task:
- Skill path: /Users/saschacollet/.claude/skills/ausschreibung
- Task: [eval prompt]
- Input files: none (Pfad im Prompt enthalten)
- Save outputs to: /Users/saschacollet/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-[ID]/with_skill/outputs/
- Outputs to save: Kopiere alle erzeugten .md-Dateien (01_zusammenfassung.md, 02_fit-bewertung.md, 03_checkliste.md) in den outputs-Ordner
```

**without_skill prompt (für jeden Eval):**
```
Execute this task (no skill):
- Task: [eval prompt]
- Input files: none (Pfad im Prompt enthalten)
- Save outputs to: /Users/saschacollet/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/eval-[ID]/without_skill/outputs/
- Outputs to save: Kopiere alle erzeugten .md-Dateien in den outputs-Ordner
```

- [ ] **Step 4: timing.json speichern wenn jeder Subagent fertig ist**

Sobald ein Subagent eine Completion-Notifikation schickt, speichere sofort:
```json
{
  "total_tokens": [aus Notifikation],
  "duration_ms": [aus Notifikation],
  "total_duration_seconds": [duration_ms / 1000]
}
```
nach `iteration-1/eval-[ID]/[with_skill oder without_skill]/timing.json`.

---

## Task 7: Grading und Review-Viewer

**Files:**
- Create: Grading-Dateien und benchmark.json per Eval

- [ ] **Step 1: Grading für alle Runs durchführen**

Lese `~/.claude/skills/skill-creator/agents/grader.md` und evaluiere jede Assertion
aus den eval_metadata.json-Dateien gegen die tatsächlichen Outputs.

Speichere in `iteration-1/eval-[ID]/with_skill/grading.json` und
`iteration-1/eval-[ID]/without_skill/grading.json`:
```json
{
  "expectations": [
    {
      "text": "[assertion name]",
      "passed": true,
      "evidence": "[Was im Output gefunden wurde / nicht gefunden wurde]"
    }
  ]
}
```

- [ ] **Step 2: Benchmark aggregieren**

```bash
cd ~/.claude/skills/skill-creator && \
python -m scripts.aggregate_benchmark \
  /Users/saschacollet/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1 \
  --skill-name ausschreibung
```

Expected: `benchmark.json` und `benchmark.md` in `iteration-1/`.

- [ ] **Step 3: Review-Viewer starten**

```bash
cd ~/.claude/skills/skill-creator && \
nohup python eval-viewer/generate_review.py \
  /Users/saschacollet/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1 \
  --skill-name "ausschreibung" \
  --benchmark /Users/saschacollet/Dev/Ausschreibungsskill/ausschreibung-workspace/iteration-1/benchmark.json \
  > /tmp/viewer.log 2>&1 &
echo "Viewer PID: $!"
```

- [ ] **Step 4: Sascha benachrichtigen**

Sage dem Nutzer: "Ich habe die Testläufe abgeschlossen und den Review-Viewer geöffnet.
Du siehst zwei Tabs — 'Outputs' zeigt die erzeugten Dateien, 'Benchmark' die
quantitativen Metriken. Wenn du fertig bist, klicke 'Submit All Reviews'
und gib mir Bescheid."

---

## Task 8: Iteration (nach User-Feedback)

- [ ] **Step 1: feedback.json lesen**

```bash
cat ~/Downloads/feedback.json
```

- [ ] **Step 2: SKILL.md basierend auf Feedback verbessern**

Lese das Feedback für jeden Eval. Leeres Feedback = gut. Spezifisches Feedback = verbessern.

Typische Verbesserungsachsen:
- Zu generische Outputs → spezifischere Anweisungen mit Beispielen im SKILL.md
- Fehlende Inhalte → klärende Instruktionen ergänzen
- Falscher Fit-Score → Bewertungskriterien schärfen

- [ ] **Step 3: Iteration-2 starten**

Wiederhole Task 6 + 7 mit `iteration-2/`, diesmal with `--previous-workspace iteration-1`
im generate_review.py-Aufruf.

- [ ] **Step 4: Viewer beenden wenn fertig**

```bash
kill $VIEWER_PID 2>/dev/null
```

---

## Checkliste: Spec-Coverage

| Spec-Anforderung | Task |
|---|---|
| Phase 1 automatisch (3 Dateien) | Task 4 |
| Zusammenfassung mit 4 Rollen | Task 4 |
| Fit-Bewertung mit Score + Empfehlung | Task 4 |
| Checkliste mit Tabelle + Fristen | Task 4 |
| Checkpoint nach Phase 1 | Task 4 |
| Kostenschätzung flexibel (Tagessätze / AP) | Task 4 |
| Portfolio-Texte (Firma, Team, Konzept, Referenzen) | Task 4 |
| Draft-Dokumente pro angefordertem Dokument | Task 4 |
| Sprache: Analyse DE, Bewerbung adaptiv | Task 4 |
| figures-config.md mit Tagessatz-Platzhaltern | Task 2 |
| Portfolio-Referenz alle 19 Projekte | Task 3 |
| Skill-Trigger korrekt beschrieben | Task 4 (frontmatter) |
| Evaluation mit realen Beispielen | Task 5–7 |
