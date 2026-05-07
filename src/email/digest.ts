import type { NoticeRecord, TriageRecord } from '../db/queries.js';
import type { DigestEmailPayload } from './smtp.js';
import type { TriageStats } from '../triage/index.js';

export interface NoticeWithTriage {
  notice: NoticeRecord;
  score: number;
  rationale: string;
}

function tedLink(nd: string): string {
  return `https://ted.europa.eu/en/notice/-/detail/${nd}`;
}

function formatBudget(budget: number | null | undefined): string {
  if (budget == null) return '(kein Budget)';
  return `${budget.toLocaleString('de-DE')} EUR`;
}

function formatDeadline(deadline: string | undefined): string {
  if (!deadline) return '(keine Frist)';
  // deadline may be ISO with timezone offset: "2026-06-01+01:00" → show date part only
  return deadline.split('+')[0].split('T')[0];
}

function renderNoticeCard(n: NoticeWithTriage, tierColor: string): string {
  const title = n.notice.titleDeu ?? '(kein Titel)';
  const link = tedLink(n.notice.nd);
  return `
      <tr>
        <td style="padding:8px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border:1px solid #e0e0e0;border-radius:3px;border-left:4px solid ${tierColor};">
            <tr>
              <td style="padding:12px 16px;">
                <span style="display:inline-block;background-color:${tierColor};color:#ffffff;
                             font-size:12px;font-weight:bold;padding:2px 8px;border-radius:10px;">
                  Score ${n.score}/10
                </span>
                <p style="margin:8px 0 4px;font-size:15px;font-weight:bold;color:#1a1a2e;">
                  <a href="${link}" style="color:#1a1a2e;text-decoration:none;">${title}</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;color:#444444;line-height:1.5;">
                  ${n.rationale}
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:12px;color:#666666;">
                      Budget: <strong>${formatBudget(n.notice.budget)}</strong>
                    </td>
                    <td style="font-size:12px;color:#666666;text-align:right;">
                      Frist: <strong>${formatDeadline(n.notice.deadline)}</strong>
                    </td>
                  </tr>
                </table>
                <p style="margin:8px 0 0;">
                  <a href="${link}" style="color:${tierColor};font-size:12px;text-decoration:underline;">
                    TED-Ausschreibung ansehen
                  </a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

function renderTierSection(
  label: string,
  color: string,
  notices: NoticeWithTriage[],
): string {
  if (notices.length === 0) return '';
  const cards = notices.map(n => renderNoticeCard(n, color)).join('');
  return `
      <tr>
        <td style="padding:16px 24px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background-color:${color};padding:8px 12px;border-radius:3px;">
                <span style="color:#ffffff;font-size:14px;font-weight:bold;">
                  ${label} (${notices.length} Ausschreibungen)
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>${cards}`;
}

export function buildDigest(
  noticesAndTriage: Array<{ notice: NoticeRecord; triage: TriageRecord }>,
  stats: TriageStats,
  dateStr?: string,
): DigestEmailPayload {
  const date = dateStr ?? new Date().toISOString().slice(0, 10);
  const triagedCount = noticesAndTriage.length;

  // Partition into tiers
  const tierA: NoticeWithTriage[] = [];
  const tierB: NoticeWithTriage[] = [];

  for (const { notice, triage } of noticesAndTriage) {
    if (triage.score == null) continue;
    if (triage.score >= 7) {
      tierA.push({ notice, score: triage.score, rationale: triage.rationale ?? '' });
    } else if (triage.score >= 4) {
      tierB.push({ notice, score: triage.score, rationale: triage.rationale ?? '' });
    }
    // score < 4: excluded
  }

  // Sort descending by score within each tier
  tierA.sort((a, b) => b.score - a.score);
  tierB.sort((a, b) => b.score - a.score);

  const costStr = stats.estimatedCostUsd.toFixed(4);

  // DIGEST-04: zero-notice confirmation email
  if (tierA.length === 0 && tierB.length === 0) {
    const subject = `[Scanner] Kein Treffer heute — ${date}`;
    const text =
      `Scanner lief am ${date}. Keine Ausschreibungen mit Score >= 4 gefunden.\n\n` +
      `Notices triagiert: ${triagedCount}\n` +
      `Haiku-Token-Kosten: $${costStr}`;
    const html =
      `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>` +
      `<body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">` +
      `<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:4px;padding:24px;">` +
      `<tr><td><h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">Kein Treffer heute</h2>` +
      `<p style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">` +
      `Scanner lief am <strong>${date}</strong>.</p>` +
      `<p style="margin:0 0 12px;font-size:14px;color:#444;">` +
      `Keine Ausschreibungen mit Score &ge; 4 gefunden.</p>` +
      `<p style="margin:0;font-size:11px;color:#888;">` +
      `Notices triagiert: ${triagedCount} | Token-Kosten: $${costStr}</p>` +
      `</td></tr></table></body></html>`;
    return { subject, html, text };
  }

  // Full tiered digest
  const subject = `[Scanner] ${tierA.length}A + ${tierB.length}B Ausschreibungen — ${date}`;

  const tierASection = renderTierSection('TIER A — Score 7-10', '#0d6e3a', tierA);
  const tierBSection = renderTierSection('TIER B — Score 4-6', '#c47900', tierB);

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border-radius:4px;">
          <tr>
            <td style="background-color:#1a1a2e;padding:20px 24px;border-radius:4px 4px 0 0;">
              <span style="color:#ffffff;font-size:18px;font-weight:bold;">Ausschreibungs-Scanner</span>
              <span style="color:#a0a0c0;font-size:13px;display:block;margin-top:4px;">
                ${date} — ${tierA.length}A + ${tierB.length}B Treffer
              </span>
            </td>
          </tr>
          ${tierASection}
          ${tierBSection}
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;font-size:11px;color:#888888;">
                Haiku-Tokens: ${stats.totalInputTokens} in / ${stats.totalOutputTokens} out —
                Geschätzte Kosten: $${costStr}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text fallback
  const textLines: string[] = [
    `Ausschreibungs-Scanner — ${date}`,
    `${tierA.length} Tier A + ${tierB.length} Tier B Ausschreibungen`,
    '',
  ];
  for (const n of tierA) {
    textLines.push(`[A ${n.score}/10] ${n.notice.titleDeu ?? n.notice.nd}`);
    textLines.push(n.rationale);
    textLines.push(tedLink(n.notice.nd));
    textLines.push('');
  }
  for (const n of tierB) {
    textLines.push(`[B ${n.score}/10] ${n.notice.titleDeu ?? n.notice.nd}`);
    textLines.push(n.rationale);
    textLines.push(tedLink(n.notice.nd));
    textLines.push('');
  }
  textLines.push(`Token-Kosten: $${costStr}`);
  const text = textLines.join('\n');

  return { subject, html, text };
}
