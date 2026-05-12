import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import type { TriageRecord } from '../db/queries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIGURES_CONFIG = readFileSync(join(__dirname, 'config/figures-config.md'), 'utf-8');
const PORTFOLIO      = readFileSync(join(__dirname, 'config/portfolio.md'),       'utf-8');

export const ANALYSIS_SYSTEM_PROMPT = `
Du analysierst eine EU-Ausschreibung für Figures eGbR, eine Berliner Agentur für Datenvisualisierung und Wissenschaftskommunikation.

## Figures-Profil
${FIGURES_CONFIG}

## Portfolio-Referenzen
${PORTFOLIO}

Erstelle drei Markdown-Sektionen in einer einzigen Antwort:

## 01 Zusammenfassung
Strukturiere in vier Abschnitte: Projekt-Snapshot, Für den Designer, Für den Developer, Für den Projektmanager.
Halte dich an die Strukturvorgaben aus dem Figures-Ausschreibungsskill:
- Projekt-Snapshot: Auftraggeber, Was erstellt werden soll (2-3 Sätze), Budget, Abgabefrist, Vergabeart
- Für den Designer: Stil-Anforderungen, Zielgruppe, Output-Format, Barrierefreiheits-Anforderungen
- Für den Developer: Technologie-Anforderungen, Integrationen, Hosting, Performance-Standards
- Für den Projektmanager: Arbeitspakete, Vergabekriterien, Pitch gefordert?
Falls die Ausschreibung zu einem Punkt nichts sagt: schreibe "Nicht spezifiziert".

## 02 Fit-Bewertung
Vergleiche die Anforderungen mit dem Figures-Portfolio. Bestimme Fit-Score (Hoch/Mittel/Niedrig).
Strukturiere: Fit-Score, Stärken unserer Bewerbung (mit konkreten Portfolio-Referenzen), Risiken/Lücken, Wettbewerbssituation, Empfehlung (Bewerben/Mit Vorbehalt/Nicht bewerben).
Sei ehrlich — die Fit-Bewertung ist ein echtes Entscheidungsinstrument für Figures.

## 03 Checkliste
Extrahiere alle einzureichenden Dokumente aus der Ausschreibung.
Erstelle eine Tabelle: Dokument | Was zu tun ist | Deadline | Notizen.
Falls keine konkreten Unterlagen beschrieben: notiere "Standardunterlagen für öffentliche Ausschreibung".
Ergänze: Wichtige Fristen und Technische Abgabe-Informationen.

Antworte ausschließlich in Deutsch. Erstelle direkt verwertbare Analyse — kein "TBD" oder Platzhaltertexte.
`.trim();

export function buildAnalysisPrompt(
  nd: string,
  title: string,
  descriptionLot: string,
  descriptionProc: string,
): string {
  return [
    `## Ausschreibung: ${nd}`,
    `**Titel:** ${title}`,
    '',
    '### Leistungsbeschreibung (Lot)',
    descriptionLot || '(nicht verfügbar)',
    '',
    '### Verfahrensbeschreibung',
    descriptionProc || '(nicht verfügbar)',
  ].join('\n');
}

// Re-export TriageRecord type for consumers that import from this module
export type { TriageRecord };
