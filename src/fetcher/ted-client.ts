const TED_API_URL = 'https://api.ted.europa.eu/v3/notices/search';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

/**
 * POST to TED API with exponential backoff retry.
 * Uses native fetch (Node 22 built-in) — no axios/node-fetch.
 * AbortController enforces 30-second timeout per attempt.
 *
 * Throws after MAX_RETRIES failures.
 *
 * T-03-04: URL hardcoded — not configurable via env to prevent domain spoofing.
 */
export async function tedFetch(body: object, attempt = 0): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(TED_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`TED API HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  } catch (err) {
    clearTimeout(timer);

    if (attempt < MAX_RETRIES - 1) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.log(`[ted-client] Retry ${attempt + 1}/${MAX_RETRIES - 1} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return tedFetch(body, attempt + 1);
    }

    throw err;
  }
}
