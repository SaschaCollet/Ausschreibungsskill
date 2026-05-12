import { describe, it, expect, vi } from 'vitest';

const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { sendDigestEmail } from './smtp.js';
import type { DigestEmailPayload } from './smtp.js';

const payload: DigestEmailPayload = {
  subject: '[Scanner] 2A + 3B Ausschreibungen — 2026-05-06',
  html: '<html><body>test</body></html>',
  text: 'test plain',
};

describe('sendDigestEmail', () => {
  it('DIGEST-01: sends to sascha.collet@gmail.com with correct subject/html/text', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'abc123' }, error: null });
    await sendDigestEmail('re_test_key', payload);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'sascha.collet@gmail.com',
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }));
  });

  it('DIGEST-01: throws when Resend returns an error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'Invalid API key' } });
    await expect(sendDigestEmail('bad_key', payload)).rejects.toThrow('Invalid API key');
  });

  it('DIGEST-01: throws when Resend call rejects', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network error'));
    await expect(sendDigestEmail('re_test_key', payload)).rejects.toThrow('Network error');
  });

  it('DIGEST-01: from address identifies the scanner', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'x' }, error: null });
    await sendDigestEmail('re_test_key', payload);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      from: expect.stringContaining('Ausschreibungs-Scanner'),
    }));
  });
});

describe('sendDigestEmail with attachments', () => {
  it('ANALYSIS-03: passes attachments array to resend.emails.send when provided', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'xyz789' }, error: null });
    const attachments = [
      { filename: '500-2026-analyse.md', content: Buffer.from('# Analyse', 'utf-8'), content_type: 'text/markdown' },
    ];
    await sendDigestEmail('re_test_key', payload, attachments);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      attachments: expect.arrayContaining([
        expect.objectContaining({ filename: '500-2026-analyse.md' }),
      ]),
    }));
  });

  it('ANALYSIS-03: does not include attachments key when attachments array is empty', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'xyz790' }, error: null });
    await sendDigestEmail('re_test_key', payload, []);
    const callArg = mockSend.mock.calls[mockSend.mock.calls.length - 1][0];
    expect(callArg).not.toHaveProperty('attachments');
  });
});
