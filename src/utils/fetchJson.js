/**
 * Unified fetchJson utility for Node.js server
 * Provides retries, dedupe, timeout, responseType, context-aware errors
 */

// Request deduplication cache
const dedupeCache = new Map();

/**
 * Sleeps for the specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt, baseDelay = 1000) {
  // Exponential backoff: base * 2^attempt with jitter
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * delay; // 10% jitter
  return Math.min(delay + jitter, 30000); // Cap at 30s
}

/**
 * Unified fetch function with retry, dedupe, timeout, and structured errors
 * @param {string} url - The URL to fetch
 * @param {object} options - Request options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {object} [options.headers={}] - Request headers
 * @param {any} [options.body] - Request body
 * @param {string} [options.responseType='json'] - Response type: json|xml|text|arrayBuffer|stream
 * @param {number} [options.timeout=10000] - Timeout in milliseconds
 * @param {number} [options.retries=3] - Number of retries
 * @param {number[]} [options.expectedStatuses=[200]] - Expected HTTP status codes
 * @param {string} [options.dedupeKey] - Key for request deduplication
 * @param {object} [options.context={}] - Error context for observability
 * @param {string} [options.authToken] - Bearer token for Authorization header
 * @returns {Promise<any>} Response data based on responseType
 */
export async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    responseType = 'json',
    timeout = 10000,
    retries = 3,
    expectedStatuses = [200],
    dedupeKey,
    context = {},
    authToken
  } = options;

  // Request deduplication
  if (dedupeKey) {
    if (dedupeCache.has(dedupeKey)) {
      return dedupeCache.get(dedupeKey);
    }
  }

  // Prepare headers
  const finalHeaders = {
    'User-Agent': 'BoardGameTutorialGenerator/1.0',
    ...headers
  };

  if (authToken) {
    finalHeaders.Authorization = `Bearer ${authToken}`;
  }

  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
  }

  // Prepare fetch options
  const fetchOptions = {
    method,
    headers: finalHeaders,
    signal: AbortSignal.timeout(timeout)
  };

  if (body) {
    if (typeof body === 'object' && !Buffer.isBuffer(body)) {
      fetchOptions.body = JSON.stringify(body);
    } else {
      fetchOptions.body = body;
    }
  }

  const executeRequest = async () => {
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);

        // Check if status is expected
        if (!expectedStatuses.includes(response.status)) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Handle different response types
        let data;
        switch (responseType) {
          case 'json':
            data = await response.json();
            break;
          case 'text':
          case 'xml':
            data = await response.text();
            break;
          case 'arrayBuffer':
            data = await response.arrayBuffer();
            break;
          case 'stream':
            data = response.body;
            break;
          default:
            throw new Error(`Unsupported responseType: ${responseType}`);
        }

        return data;

      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.name === 'AbortError' || 
            (error.message && error.message.includes('HTTP 4'))) {
          break;
        }

        if (attempt < retries) {
          const delay = calculateBackoffDelay(attempt);
          await sleep(delay);
        }
      }
    }

    // Create structured error
    const structuredError = new Error(lastError.message || 'Request failed');
    structuredError.context = {
      url,
      method,
      attempt: retries + 1,
      ...context
    };
    structuredError.originalError = lastError;
    
    throw structuredError;
  };

  const promise = executeRequest();

  // Cache promise if deduplication is enabled
  if (dedupeKey) {
    dedupeCache.set(dedupeKey, promise);
    // Clean up cache after request completes
    promise.finally(() => {
      setTimeout(() => dedupeCache.delete(dedupeKey), 1000);
    });
  }

  return promise;
}

export default fetchJson;