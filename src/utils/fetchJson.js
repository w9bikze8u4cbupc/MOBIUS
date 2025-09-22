// Node/server-compatible unified fetchJson utility
// Provides retries, deduplication, timeouts, responseType handling, and context-aware errors

import { Readable } from 'stream';

const pendingRequests = new Map(); // For request deduplication

/**
 * Unified fetch utility for Node.js environments
 * @param {string} url - Request URL
 * @param {Object} options - Request options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.headers] - Request headers
 * @param {*} [options.body] - Request body
 * @param {string} [options.responseType='json'] - Response type: 'json', 'xml', 'text', 'arrayBuffer', 'stream'
 * @param {number} [options.timeout=10000] - Request timeout in ms
 * @param {number} [options.retries=3] - Number of retry attempts
 * @param {number} [options.retryDelay=1000] - Initial retry delay in ms
 * @param {string} [options.dedupeKey] - Key for request deduplication
 * @param {number[]} [options.expectedStatuses=[200]] - Array of expected HTTP status codes
 * @param {string} [options.bearerToken] - Bearer token (will be prefixed automatically)
 * @param {Object} [options.context] - Error context for better logging
 * @returns {Promise<*>} - Response data in requested format
 */
export async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    responseType = 'json',
    timeout = 10000,
    retries = 3,
    retryDelay = 1000,
    dedupeKey,
    expectedStatuses = [200],
    bearerToken,
    context = { area: 'http', action: 'request' }
  } = options;

  // Handle request deduplication
  if (dedupeKey) {
    if (pendingRequests.has(dedupeKey)) {
      console.log(`[fetchJson] Deduplicating request for key: ${dedupeKey}`);
      return pendingRequests.get(dedupeKey);
    }
  }

  const makeRequest = async (attemptNum = 1) => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    try {
      // Prepare headers
      const requestHeaders = { ...headers };
      if (bearerToken) {
        requestHeaders.Authorization = `Bearer ${bearerToken}`;
      }

      // Set default User-Agent for server requests
      if (!requestHeaders['User-Agent']) {
        requestHeaders['User-Agent'] = 'BoardGameTutorialGenerator/1.0';
      }

      // Prepare fetch options
      const fetchOptions = {
        method,
        headers: requestHeaders,
        signal: abortController.signal
      };

      if (body && method !== 'GET') {
        if (typeof body === 'object' && body !== null) {
          fetchOptions.body = JSON.stringify(body);
          requestHeaders['Content-Type'] = 'application/json';
        } else {
          fetchOptions.body = body;
        }
      }

      console.log(`[fetchJson] ${method} ${url} (attempt ${attemptNum}/${retries + 1})`);
      
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Check if status is expected
      if (!expectedStatuses.includes(response.status)) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Handle different response types
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
          // For Node.js, convert web stream to Node.js readable stream
          data = Readable.fromWeb(response.body);
          break;
        default:
          throw new Error(`Unsupported responseType: ${responseType}`);
      }

      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      // Handle retries with exponential backoff
      if (attemptNum <= retries) {
        const delay = retryDelay * Math.pow(2, attemptNum - 1);
        console.log(`[fetchJson] Retrying in ${delay}ms (attempt ${attemptNum + 1}/${retries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return makeRequest(attemptNum + 1);
      }

      // Create context-aware error
      const contextError = new Error(error.message);
      contextError.context = {
        ...context,
        url,
        method,
        attemptNum,
        originalError: error.message
      };
      throw contextError;
    }
  };

  // Execute request with deduplication
  const requestPromise = makeRequest();
  
  if (dedupeKey) {
    pendingRequests.set(dedupeKey, requestPromise);
    requestPromise.finally(() => {
      pendingRequests.delete(dedupeKey);
    });
  }

  return requestPromise;
}

export default fetchJson;