/**
 * Unified fetchJson utility for Node.js server environments
 * Provides retries, deduplication, timeout, responseType handling, and structured errors
 */

import { Readable } from 'stream';

// Global request cache for deduplication
const requestCache = new Map();

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Exponential backoff calculation
 */
const calculateBackoffDelay = (attempt, baseDelay = 1000) => {
  return Math.min(baseDelay * Math.pow(2, attempt - 1), 10000); // Cap at 10 seconds
};

/**
 * Create structured error with context
 */
class FetchError extends Error {
  constructor(message, context = {}, status = null, response = null) {
    super(message);
    this.name = 'FetchError';
    this.context = context;
    this.status = status;
    this.response = response;
  }
}

/**
 * Unified fetch utility for Node.js server
 * 
 * @param {string} url - Request URL
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method (default: 'GET')
 * @param {Object} options.body - Request body (will be JSON stringified if object)
 * @param {Object} options.headers - Request headers
 * @param {string} options.responseType - Response type: 'json' | 'xml' | 'text' | 'arrayBuffer' | 'stream' (default: 'json')
 * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
 * @param {number} options.retries - Number of retries (default: 3)
 * @param {Array} options.expectedStatuses - Expected HTTP status codes (default: [200, 201, 204])
 * @param {string} options.token - Bearer token for Authorization header
 * @param {string} options.dedupeKey - Key for request deduplication
 * @param {Object} options.context - Error context for observability
 * @returns {Promise} - Response data based on responseType
 */
async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    responseType = 'json',
    timeout = 10000,
    retries = 3,
    expectedStatuses = [200, 201, 204],
    token,
    dedupeKey,
    context = {}
  } = options;

  // Generate deduplication key if not provided
  const cacheKey = dedupeKey || `${method}:${url}:${JSON.stringify(body)}`;

  // Check for ongoing request with same key
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey);
  }

  // Create the actual request promise
  const requestPromise = executeRequest();

  // Cache the promise
  requestCache.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Remove from cache after completion
    requestCache.delete(cacheKey);
  }

  async function executeRequest() {
    let lastError;

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Prepare headers with server-specific defaults
        const requestHeaders = {
          'User-Agent': 'BoardGameTutorialGenerator/1.0',
          ...headers
        };
        
        // Add Authorization header if token provided
        if (token) {
          requestHeaders.Authorization = `Bearer ${token}`;
        }

        // Prepare body
        let requestBody = body;
        if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
          requestBody = JSON.stringify(body);
          if (!requestHeaders['Content-Type']) {
            requestHeaders['Content-Type'] = 'application/json';
          }
        }

        // Make the request
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check if status is expected
        if (!expectedStatuses.includes(response.status)) {
          let errorBody;
          try {
            errorBody = await response.text();
          } catch (e) {
            errorBody = 'Unable to read error response';
          }

          throw new FetchError(
            `HTTP ${response.status}: ${response.statusText}`,
            { ...context, url, method, status: response.status, attempt },
            response.status,
            errorBody
          );
        }

        // Parse response based on responseType
        let data;
        switch (responseType) {
          case 'json':
            data = await response.json();
            break;
          case 'xml':
          case 'text':
            data = await response.text();
            break;
          case 'arrayBuffer':
            data = await response.arrayBuffer();
            break;
          case 'stream':
            // For Node.js, return the response body as a readable stream
            if (response.body) {
              data = Readable.fromWeb(response.body);
            } else {
              data = response.body;
            }
            break;
          default:
            throw new FetchError(
              `Unsupported responseType: ${responseType}`,
              { ...context, url, method, responseType }
            );
        }

        return data;

      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          lastError = new FetchError(
            `Request timeout after ${timeout}ms`,
            { ...context, url, method, timeout, attempt }
          );
        } else if (error instanceof FetchError) {
          lastError = error;
        } else {
          lastError = new FetchError(
            `Network error: ${error.message}`,
            { ...context, url, method, originalError: error.message, attempt }
          );
        }

        // Don't retry on client errors (4xx) or timeout
        if (error instanceof FetchError && error.status >= 400 && error.status < 500) {
          throw lastError;
        }

        // If not the last attempt, wait before retry
        if (attempt <= retries) {
          const delay = calculateBackoffDelay(attempt);
          console.warn(`Request failed (attempt ${attempt}/${retries + 1}), retrying in ${delay}ms...`, lastError.message);
          
          // In test environment, don't actually wait to speed up tests
          if (typeof jest === 'undefined') {
            await sleep(delay);
          }
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }
}

export default fetchJson;