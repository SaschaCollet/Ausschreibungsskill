import cpvConfig from '../cpv-codes.json';

export interface AppConfig {
  dbPath: string;
  resendApiKey: string;
  anthropicApiKey: string;
}

/**
 * Build the CPV portion of the TED expert query string.
 * Reads from cpv-codes.json - never hardcoded (D-02).
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
 * All Phase 2 vars (GMAIL_USER, GMAIL_APP_PASSWORD, ANTHROPIC_API_KEY) are now required.
 * Throws a descriptive error listing all missing vars - never leaks values (T-02-01-A).
 * DB_PATH is optional and defaults to /data/scanner.db (Railway Volume mount path).
 */
export function getConfig(): AppConfig {
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY)     missing.push('RESEND_API_KEY');
  if (!process.env.ANTHROPIC_API_KEY)  missing.push('ANTHROPIC_API_KEY');
  if (missing.length > 0) {
    throw new Error(
      `[config] Missing required environment variables: ${missing.join(', ')}\n` +
      `Set these in Railway Environment Variables before deploying.`
    );
  }
  return {
    dbPath: process.env.DB_PATH ?? '/data/scanner.db',
    resendApiKey: process.env.RESEND_API_KEY!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  };
}
