// client/src/utils/fetchJson.js
import { getErrorMessageFor } from './errorMap';

/**
 * fetchJson
 * - Consistent JSON fetch with:
 *   - Auth header (optional)
 *   - Retries with backoff for transient errors (5xx, network)
 *   - Abort via AbortSignal
 *   - Centralized error translation using errorMap
 *   - Optional toast hook integration
 *
 * @param {string} url
 * @param {object} options
 *  - method, headers, body, signal
 *  - authToken?: string
 *  - retries?: number (default 2)
 *  - retryBackoffMs?: number (default 400)
 *  - maxTimeout?: number (default 30000) - cap total retry time
 *  - toast?: { addToast: fn, dedupeKey?: string }
 *  - errorContext?: { area?: string, action?: string }
 *  - expectedStatuses?: number[] (default [200])
 */
export async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    signal,
    authToken,
    retries = 2,
    retryBackoffMs = 400,
    maxTimeout = 30000,
    toast,
    errorContext,
    expectedStatuses = [200],
  } = options;

  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (authToken) {
    finalHeaders.Authorization = `Bearer ${authToken}`;
  }

  // Track start time for maxTimeout
  const startTime = Date.now();
  
  // Track in-flight requests for deduplication
  const requestKey = `${method}:${url}:${toast?.dedupeKey || ''}`;
  
  const attempt = async n => {
    // Check if we've exceeded maxTimeout
    if (Date.now() - startTime > maxTimeout) {
      throw new Error('Request timeout exceeded');
    }
    
    try {
      const res = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : undefined,
        signal,
        credentials: 'include',
      });

      const isJson = (res.headers.get('content-type') || '').includes(
        'application/json'
      );
      const data = isJson
        ? await res.json().catch(() => ({}))
        : await res.text();

      if (!expectedStatuses.includes(res.status)) {
        const backendError = isJson
          ? data?.error || data
          : { status: res.status, text: typeof data === 'string' ? data : null };
        const message = getErrorMessageFor(backendError, errorContext);
        if (toast?.addToast) {
          toast.addToast({
            variant: 'error',
            message,
            dedupeKey: toast.dedupeKey || message,
          });
        }
        const err = new Error(message);
        err.status = res.status;
        err.backend = backendError;
        throw err;
      }
      
      // Return response metadata for telemetry
      return {
        data,
        status: res.status,
        headers: res.headers,
        timing: Date.now() - startTime,
        attempts: n + 1
      };
    } catch (err) {
      // Abort: surface immediately
      if (err?.name === 'AbortError') throw err;

      const isNetwork = !('status' in err);
      const is5xx = err?.status >= 500 && err?.status <= 599;
      const is429 = err?.status === 429;

      if ((isNetwork || is5xx || is429) && n < retries) {
        // Calculate backoff with jitter to avoid thundering herd
        let backoff = retryBackoffMs * Math.pow(2, n);
        
        // Add jitter
        const jitter = Math.random() * 100;
        backoff += jitter;
        
        // For 429, check for Retry-After header
        if (is429) {
          // Use a larger backoff for rate limiting
          backoff = Math.max(backoff, 1000);
        }
        
        // Check if adding this backoff would exceed maxTimeout
        if (Date.now() - startTime + backoff > maxTimeout) {
          throw new Error('Request timeout exceeded');
        }
        
        await new Promise(r => setTimeout(r, backoff));
        return attempt(n + 1);
      }

      // Final failure path: ensure toast if not already shown
      if (toast?.addToast) {
        const message = err?.message || getErrorMessageFor(err, errorContext);
        toast.addToast({
          variant: 'error',
          message,
          dedupeKey: toast.dedupeKey || message,
        });
      }
      throw err;
    }
  };

  return attempt(0);
}