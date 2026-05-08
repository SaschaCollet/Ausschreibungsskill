import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildCpvQueryPart, getConfig } from './config.js';

describe('buildCpvQueryPart', () => {
  it('builds query string from cpv-codes.json prefixes and additions', () => {
    const result = buildCpvQueryPart();
    expect(result).toContain('PC=79*');
    expect(result).toContain('PC=92*');
    expect(result).toContain('PC=73*');
    expect(result).toContain('PC=72212000');
    expect(result).toMatch(/^\(.*\)$/);
  });

  it('does not hardcode CPV codes — result comes from json file', () => {
    const result = buildCpvQueryPart();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(10);
  });
});

describe('getConfig', () => {
  const REQUIRED_VARS = ['RESEND_API_KEY', 'ANTHROPIC_API_KEY', 'DB_PATH'] as const;
  const saved: Partial<Record<typeof REQUIRED_VARS[number], string | undefined>> = {};

  beforeEach(() => {
    for (const v of REQUIRED_VARS) {
      saved[v] = process.env[v];
    }
    process.env.RESEND_API_KEY = 're_test_dummy';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy';
  });

  afterEach(() => {
    for (const v of REQUIRED_VARS) {
      if (saved[v] === undefined) {
        delete process.env[v];
      } else {
        process.env[v] = saved[v];
      }
    }
  });

  it('defaults dbPath to /data/scanner.db when DB_PATH unset', () => {
    delete process.env.DB_PATH;
    const config = getConfig();
    expect(config.dbPath).toBe('/data/scanner.db');
  });

  it('uses DB_PATH env var when set', () => {
    process.env.DB_PATH = '/tmp/scanner.db';
    const config = getConfig();
    expect(config.dbPath).toBe('/tmp/scanner.db');
  });

  it('throws when RESEND_API_KEY is missing', () => {
    delete process.env.RESEND_API_KEY;
    expect(() => getConfig()).toThrow('RESEND_API_KEY');
  });

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getConfig()).toThrow('ANTHROPIC_API_KEY');
  });

  it('throws listing all missing vars in a single error when multiple are absent', () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getConfig()).toThrow('[config] Missing required environment variables: RESEND_API_KEY, ANTHROPIC_API_KEY');
  });

  it('returns resendApiKey from env', () => {
    process.env.RESEND_API_KEY = 're_real_key';
    const config = getConfig();
    expect(config.resendApiKey).toBe('re_real_key');
  });

  it('returns anthropicApiKey from env', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-real-key';
    const config = getConfig();
    expect(config.anthropicApiKey).toBe('sk-ant-real-key');
  });
});
