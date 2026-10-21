import OpenAI from "openai";

export function isTimeout(err) {
  return (
    (OpenAI.APIConnectionTimeoutError && err instanceof OpenAI.APIConnectionTimeoutError) ||
    err?.name === "APIConnectionTimeoutError" ||
    err?.name === "TimeoutError"
  );
}

// Retry: timeouts, network errors, 429, 5xx.  Never: 400, 401, 403 or any other 4xx.
export function isRetryable(err) {
  if (isTimeout(err)) return true;
  const s = err?.status;
  if (typeof s === "number") return s === 429 || s >= 500;
  return OpenAI.APIConnectionError ? err instanceof OpenAI.APIConnectionError : false;
}

// Retry-After can be seconds ("3") or an HTTP date.
function retryAfterMs(err) {
  const h = err?.headers;
  const raw = typeof h?.get === "function" ? h.get("retry-after") : h?.["retry-after"];
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withRetry(fn, { maxRetries = 3, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return { value: await fn(), attempts: attempt + 1 };
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) throw err;
      const backoff = 1000 * 2 ** attempt + Math.random() * 250; // 1s, 2s, 4s + jitter
      const ra = retryAfterMs(err);
      const delay = ra !== null ? Math.min(ra, 30000) : backoff; // obey Retry-After
      onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
}
