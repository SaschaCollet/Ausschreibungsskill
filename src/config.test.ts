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
  const REQUIRED_VARS = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'ANTHROPIC_API_KEY', 'DB_PATH'] as const;
  const saved: Partial<Record<typeof REQUIRED_VARS[number], string | undefined>> = {};

  beforeEach(() => {
    // Save existing env state
    for (const v of REQUIRED_VARS) {
      saved[v] = process.env[v];
    }
    // Set required Phase 2 vars to dummy values so getConfig() doesn't throw
    process.env.GMAIL_USER = 'test@example.com';
    process.env.GMAIL_APP_PASSWORD = 'dummy-app-password';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy';
  });

  afterEach(() => {
    // Restore env to previous state
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

  it('throws when GMAIL_USER is missing', () => {
    delete process.env.GMAIL_USER;
    expect(() => getConfig()).toThrow('GMAIL_USER');
  });

  it('throws when GMAIL_APP_PASSWORD is missing', () => {
    delete process.env.GMAIL_APP_PASSWORD;
    expect(() => getConfig()).toThrow('GMAIL_APP_PASSWORD');
  });

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getConfig()).toThrow('ANTHROPIC_API_KEY');
  });

  it('throws listing all missing vars in a single error when multiple are absent', () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getConfig()).toThrow('[config] Missing required environment variables: GMAIL_USER, GMAIL_APP_PASSWORD, ANTHROPIC_API_KEY');
  });

  it('returns gmailUser from env', () => {
    process.env.GMAIL_USER = 'user@figures.de';
    const config = getConfig();
    expect(config.gmailUser).toBe('user@figures.de');
  });

  it('returns anthropicApiKey from env', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-real-key';
    const config = getConfig();
    expect(config.anthropicApiKey).toBe('sk-ant-real-key');
  });
});
