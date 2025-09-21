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
 
// Module-level Map to track in-flight requests for deduplication
const inFlightRequests = new Map();

// Helper function for abortable sleep
function sleepAbortable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

// Helper function to parse Retry-After header
function parseRetryAfter(header) {
  if (!header) return null;
  const secs = Number(header);
  if (!Number.isNaN(secs)) return secs * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

// Helper functions for in-flight dedupe management
function getDedupePromise(key) { return inFlightRequests.get(key); }
function setDedupePromise(key, p) { inFlightRequests.set(key, p); }
function clearDedupe(key) { inFlightRequests.delete(key); }

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

  // Create a unique key for deduplication
  const dedupeKey = toast?.dedupeKey ? `${method}:${url}:${toast.dedupeKey}` : null;
  
  // Check if there's an in-flight request for this key
  if (dedupeKey) {
    const existing = getDedupePromise(dedupeKey);
    if (existing) return existing;
  }

  // Track start time for maxTimeout
  const startTime = Date.now();
  
  // Create the actual request promise
  const requestPromise = (async () => {
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
        
        let data;
        let rawText = null;
        
        if (isJson) {
          try {
            data = await res.json();
          } catch (parseError) {
            // If JSON parsing fails, get raw text for debugging
            rawText = await res.text();
            data = {};
          }
        } else {
          rawText = await res.text();
          data = rawText;
        }

        if (!expectedStatuses.includes(res.status)) {
          const backendError = isJson
            ? data?.error || data
            : { status: res.status, text: rawText };
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
          err.backendRaw = rawText;
          err.attempts = n + 1;
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
          
          // Add jitter as a fraction of backoff (20%)
          const jitter = (Math.random() * 0.4 - 0.2) * backoff;
          backoff += jitter;
          
          // For 429, check for Retry-After header
          if (is429) {
            const retryAfterHeader = res?.headers?.get('Retry-After');
            const retryAfterMs = parseRetryAfter(retryAfterHeader);
            
            if (retryAfterMs) {
              // Use the server's suggested retry time, but cap it
              backoff = Math.min(retryAfterMs, 30000); // Cap at 30 seconds
            } else {
              // Use a larger backoff for rate limiting
              backoff = Math.max(backoff, 1000);
            }
          }
          
          // Check if adding this backoff would exceed maxTimeout
          if (Date.now() - startTime + backoff > maxTimeout) {
            throw new Error('Request timeout exceeded');
          }
          
          // Wait with abort support
          await sleepAbortable(backoff, signal);
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
        
        // Add telemetry info to error
        err.attempts = n + 1;
        err.timing = Date.now() - startTime;
        throw err;
      }
    };

    try {
      return await attempt(0);
    } finally {
      // Always clean up dedupe entry
      if (dedupeKey) {
        clearDedupe(dedupeKey);
      }
    }
  })();
  
  // Store the promise in the in-flight requests map
  if (dedupeKey) {
    setDedupePromise(dedupeKey, requestPromise);
  }
  
  // Return the promise
  return requestPromise;
}