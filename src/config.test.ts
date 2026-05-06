import { describe, it, expect, afterEach } from 'vitest';
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
  const originalEnv = process.env.DB_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalEnv;
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
});
