import { Resend } from 'resend';

export interface DigestEmailPayload {
  subject: string;
  html: string;
  text: string;
}

export interface AnalysisAttachment {
  filename: string;
  content: Buffer;
  content_type: string;
}

export async function sendDigestEmail(
  apiKey: string,
  payload: DigestEmailPayload,
  attachments?: AnalysisAttachment[],
): Promise<void> {
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: 'Ausschreibungs-Scanner <onboarding@resend.dev>',
    to: 'sascha.collet@gmail.com',
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
