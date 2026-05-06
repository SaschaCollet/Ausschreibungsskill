import cpvConfig from '../cpv-codes.json';

export interface AppConfig {
  dbPath: string;
  gmailUser?: string;
  gmailAppPassword?: string;
  anthropicApiKey?: string;
}

/**
 * Build the CPV portion of the TED expert query string.
 * Reads from cpv-codes.json — never hardcoded (D-02).
 * Example output: "(PC=<prefix> OR ... OR PC=<specific_addition>)"
 */
export function buildCpvQueryPart(): string {
  const parts = [
    ...cpvConfig.prefixes.map((p: string) => `PC=${p}`),
    ...cpvConfig.specific_additions.map((c: string) => `PC=${c}`),
  ];
  return `(${parts.join(' OR ')})`;
}

/**
 * Load and validate environment variables.
 * Phase 1 only requires DB_PATH (optional — defaults to /data/scanner.db).
 * Phase 2 vars are optional here so Phase 1 runs without them.
 */
export function getConfig(): AppConfig {
  return {
    dbPath: process.env.DB_PATH ?? '/data/scanner.db',
    gmailUser: process.env.GMAIL_USER,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };
}
