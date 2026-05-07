import nodemailer from 'nodemailer';
import type { AppConfig } from '../config.js';

export interface DigestEmailPayload {
  subject: string;
  html: string;
  text: string;
}

export type GmailTransporter = ReturnType<typeof nodemailer.createTransport>;

export function createGmailTransport(user: string, appPassword: string): GmailTransporter {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass: appPassword,
    },
  });
}

/**
 * Verify SMTP auth — DIGEST-05.
 * Throws if authentication fails. Caller (runner.ts) must call process.exit(2) on catch.
 * Must be called BEFORE openDb() so auth failure never locks the job.
 */
export async function verifySmtp(transporter: GmailTransporter): Promise<void> {
  await transporter.verify();
}

/**
 * Send the daily digest email.
 * Recipient is hardcoded to sascha.collet@gmail.com (single-user internal tool).
 */
export async function sendDigestEmail(
  transporter: GmailTransporter,
  config: Pick<AppConfig, 'gmailUser'>,
  payload: DigestEmailPayload,
): Promise<void> {
  await transporter.sendMail({
    from: `"Ausschreibungs-Scanner" <${config.gmailUser}>`,
    to: 'sascha.collet@gmail.com',
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}
