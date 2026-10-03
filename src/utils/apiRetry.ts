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
 * CRITICAL: 503, 500, 405, 404, 400, 401, 403 must NEVER be retried.
 * Retrying 500/503/405 creates a frontend retry storm that hammers the server and Firebase quotas.
 * Only HTTP 429 (Too Many Requests / Rate Limited) is safely retryable with exponential backoff.
 */
export function defaultIsRetryableStatus(status: number): boolean {
  return status === 429;
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
 * Safe fetch with exponential backoff and retry storm protection.
 * Immediately stops retrying and throws if it receives a 503, 500, 405, or other fatal status.
 * Only retries on genuine network failures (TypeError) or 429 Too Many Requests.
 */
export async function fetchWithBackoff(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: BackoffOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const isRetryable = options.isRetryableStatus ?? defaultIsRetryableStatus;

  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(input, init);

      // Successful response: return immediately
      if (response.ok) {
        return response;
      }

      // Check for non-retryable fatal status (503, 500, 405, 404, etc.)
      if (!isRetryable(response.status)) {
        const errorMsg = `Server request failed with HTTP ${response.status} (${response.statusText || 'Error'})`;
        console.warn(
          `[fetchWithBackoff] Non-retryable status ${response.status} for ${typeof input === 'string' ? input : 'URL'}. Halting retries immediately.`
        );
        const error: any = new Error(errorMsg);
        error.status = response.status;
        error.response = response;
        throw error;
      }

      // Only retryable status (429 Rate Limited) proceeds to backoff
      if (attempt >= maxRetries) {
        const rateLimitErr: any = new Error(`Request rate-limited after ${maxRetries} attempts (HTTP 429)`);
        rateLimitErr.status = 429;
        rateLimitErr.response = response;
        throw rateLimitErr;
      }

      const delayMs = calculateBackoffDelay(attempt, options, response);
      console.warn(
        `[fetchWithBackoff] HTTP 429 Rate Limit encountered. Retrying in ${delayMs}ms (Attempt ${attempt + 1}/${maxRetries})...`
      );
      await sleep(delayMs);
      attempt++;
    } catch (networkError: any) {
      // If error was thrown intentionally for fatal HTTP statuses (500, 503, 405), rethrow immediately!
      if (networkError?.status) {
        throw networkError;
      }

      // Only retry true network failures (e.g. TypeError from fetch failed / offline / DNS error)
      const isNetworkTypeError = networkError instanceof TypeError || networkError?.name === 'TypeError';
      if (!isNetworkTypeError || attempt >= maxRetries) {
        console.error(
          `[fetchWithBackoff] Network request failed permanently after ${attempt} attempts:`,
          networkError?.message || networkError
        );
        throw networkError;
      }

      const delayMs = calculateBackoffDelay(attempt, options);
      console.warn(
        `[fetchWithBackoff] Network connectivity error. Retrying in ${delayMs}ms (Attempt ${attempt + 1}/${maxRetries})...`,
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
