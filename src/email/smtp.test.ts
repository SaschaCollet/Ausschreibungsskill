import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so these are available inside the hoisted vi.mock factory
const { mockVerify, mockSendMail, mockCreateTransport } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  const mockSendMail = vi.fn();
  const mockCreateTransport = vi.fn().mockReturnValue({
    verify: mockVerify,
    sendMail: mockSendMail,
  });
  return { mockVerify, mockSendMail, mockCreateTransport };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
}));

import { createGmailTransport, verifySmtp, sendDigestEmail } from './smtp.js';
import type { DigestEmailPayload } from './smtp.js';

describe('createGmailTransport', () => {
  it('calls nodemailer.createTransport with service:gmail and provided credentials', () => {
    createGmailTransport('test@gmail.com', 'app-password-16chars');
    expect(mockCreateTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'test@gmail.com', pass: 'app-password-16chars' },
    });
  });
});

describe('verifySmtp', () => {
  beforeEach(() => mockVerify.mockReset());

  it('DIGEST-05: resolves when verify() succeeds', async () => {
    mockVerify.mockResolvedValueOnce(true);
    const transporter = createGmailTransport('u', 'p');
    await expect(verifySmtp(transporter)).resolves.toBeUndefined();
  });

  it('DIGEST-05: propagates error when verify() throws (wrong app password)', async () => {
    mockVerify.mockRejectedValueOnce(new Error('535 Authentication credentials invalid'));
    const transporter = createGmailTransport('u', 'wrong');
    await expect(verifySmtp(transporter)).rejects.toThrow('535');
  });
});

describe('sendDigestEmail', () => {
  beforeEach(() => mockSendMail.mockReset());

  it('DIGEST-01: calls sendMail with correct from/to/subject/html/text', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: 'abc123' });
    const transporter = createGmailTransport('sender@gmail.com', 'p');
    const payload: DigestEmailPayload = {
      subject: '[Scanner] 2A + 3B Ausschreibungen — 2026-05-06',
      html: '<html><body>test</body></html>',
      text: 'test plain',
    };

    await sendDigestEmail(transporter, { gmailUser: 'sender@gmail.com' }, payload);

    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"Ausschreibungs-Scanner" <sender@gmail.com>',
      to: 'sascha.collet@gmail.com',
      subject: '[Scanner] 2A + 3B Ausschreibungen — 2026-05-06',
      text: 'test plain',
      html: '<html><body>test</body></html>',
    });
  });
});
