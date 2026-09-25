/**
 * Resilient API request utility with exponential backoff and retry storm protection.
 * Prevents flooding the server, Vercel functions, or Firebase quotas when endpoints
 * return 404 (Not Found), 405 (Method Not Allowed), or during rate limits.
 */

export interface BackoffOptions {
  /** Maximum number of retry attempts for retryable errors (default: 3) */
  maxRetries?: number;
  /** Initial delay before first retry in milliseconds (default: 1000ms) */
  initialDelayMs?: number;
  /** Maximum delay cap between retries in milliseconds (default: 8000ms) */
  maxDelayMs?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffFactor?: number;
  /** Whether to add random jitter (0-25% variance) to avoid thundering herd (default: true) */
  jitter?: boolean;
  /** Custom check to decide if an HTTP status is retryable */
  isRetryableStatus?: (status: number) => boolean;
}

/**
 * Determines if an HTTP status code is safe to retry.
 * CRITICAL: 404 (Not Found), 405 (Method Not Allowed), 400 (Bad Request),
 * 401 (Unauthorized), 403 (Forbidden) must NEVER be retried automatically in a loop.
 */
export function defaultIsRetryableStatus(status: number): boolean {
  // Non-retryable client errors (retrying will only cause server spam & quota burn)
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || status === 422) {
    return false;
  }
  // Rate limited (429) or Server Errors (500, 502, 503, 504) are retryable
  if (status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }
  return false;
}

/**
 * Calculates exponential backoff delay with optional jitter and Retry-After header parsing.
 */
export function calculateBackoffDelay(
  attempt: number,
  options: BackoffOptions,
  response?: Response
): number {
  const initial = options.initialDelayMs ?? 1000;
  const factor = options.backoffFactor ?? 2;
  const maxDelay = options.maxDelayMs ?? 8000;

  // Check if server sent a standard Retry-After header (in seconds)
  if (response) {
    const retryAfterHeader = response.headers.get('Retry-After');
    if (retryAfterHeader) {
      const parsedSeconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        return Math.min(parsedSeconds * 1000, maxDelay);
      }
    }
  }

  let delay = initial * Math.pow(factor, attempt);
  if (options.jitter !== false) {
    // Add 0-25% random jitter to distribute client reconnects
    delay += Math.random() * (delay * 0.25);
  }

  return Math.min(Math.round(delay), maxDelay);
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe fetch with exponential backoff.
 * Guaranteed never to retry tight-loop fatal status codes like 404 or 405.
 *
 * @example
 * const res = await fetchWithBackoff('/api/election', { method: 'GET' });
 * const json = await res.json();
 */
export async function fetchWithBackoff(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: BackoffOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const isRetryable = options.isRetryableStatus ?? defaultIsRetryableStatus;

  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(input, init);

      // If response is OK or status is not retryable (e.g. 200, 404, 405), return immediately
      if (response.ok || !isRetryable(response.status) || attempt >= maxRetries) {
        return response;
      }

      // Calculate delay with backoff
      const delayMs = calculateBackoffDelay(attempt, options, response);
      console.warn(
        `[fetchWithBackoff] Request to ${typeof input === 'string' ? input : 'URL'} returned ${response.status}. Retrying in ${delayMs}ms (Attempt ${attempt + 1}/${maxRetries})...`
      );

      await sleep(delayMs);
      attempt++;
    } catch (networkError: any) {
      // Network failure (offline, DNS, timeout)
      if (attempt >= maxRetries) {
        console.error(`[fetchWithBackoff] Network request failed after ${maxRetries} attempts:`, networkError);
        throw networkError;
      }

      const delayMs = calculateBackoffDelay(attempt, options);
      console.warn(
        `[fetchWithBackoff] Network error occurred. Retrying in ${delayMs}ms (Attempt ${attempt + 1}/${maxRetries})...`,
        networkError?.message
      );

      await sleep(delayMs);
      attempt++;
    }
  }
}

/**
 * Sends an audit log or election update to the backend with backoff.
 * Automatically handles JSON serialization and headers, silencing 404/405 retry loops.
 */
export async function postJsonWithBackoff<T = any>(
  url: string,
  payload: any,
  options: BackoffOptions = {}
): Promise<{ success: boolean; data?: T; error?: string; status: number }> {
  try {
    const res = await fetchWithBackoff(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
      {
        maxRetries: 2,
        initialDelayMs: 1200,
        maxDelayMs: 5000,
        ...options,
      }
    );

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const json = isJson ? await res.json() : null;

    if (!res.ok) {
      const errorMsg = json?.error || `HTTP ${res.status}: ${res.statusText}`;
      return { success: false, error: errorMsg, status: res.status, data: json };
    }

    return { success: true, data: json, status: res.status };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network request failed',
      status: 0,
    };
  }
}
