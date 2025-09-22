/**
 * Unified fetchJson utility for browser (client-side)
 * 
 * Features:
 * - Exponential backoff retries
 * - Request deduplication via dedupeKey
 * - Timeout handling via AbortController
 * - Explicit responseType support
 * - Expected status validation
 * - Automatic Bearer token handling
 * - Structured error objects with context
 */

// In-flight request deduplication cache
const inflightRequests = new Map();

/**
 * Sleep utility for exponential backoff
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds (default: 100)
 */
function getBackoffDelay(attempt, baseDelay = 100) {
  return Math.min(baseDelay * Math.pow(2, attempt), 5000); // Max 5 seconds
}

/**
 * Process response based on responseType
 * @param {Response} response - Fetch API response object
 * @param {string} responseType - Type of response expected
 * @returns {Promise<*>} Processed response data
 */
async function processResponse(response, responseType) {
  switch (responseType) {
    case 'json':
      return await response.json();
    
    case 'text':
    case 'xml':
      return await response.text();
    
    case 'arrayBuffer':
      return await response.arrayBuffer();
    
    case 'stream':
      return response.body;
    
    default:
      // Default to json for backward compatibility
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
  }
}

/**
 * Unified fetchJson function for browser
 * @param {string|URL} url - The URL to fetch
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method (default: GET)
 * @param {*} options.body - Request body
 * @param {Object} options.headers - Request headers
 * @param {string} options.responseType - Response type: json|xml|text|arrayBuffer|stream
 * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
 * @param {number} options.retries - Number of retries (default: 3)
 * @param {Array<number>} options.expectedStatuses - Expected status codes (default: [200])
 * @param {string} options.token - Bearer token for Authorization header
 * @param {string} options.dedupeKey - Key for request deduplication
 * @param {Object} options.context - Context object for error reporting
 * @returns {Promise<*>} Promise that resolves to the response data
 */
export default async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    responseType = 'json',
    timeout = 10000,
    retries = 3,
    expectedStatuses = [200],
    token,
    dedupeKey,
    context = {}
  } = options;

  // Request deduplication
  if (dedupeKey) {
    if (inflightRequests.has(dedupeKey)) {
      return inflightRequests.get(dedupeKey);
    }
  }

  // Prepare headers
  const requestHeaders = {
    ...headers
  };

  // Add Bearer token if provided
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  // Add Content-Type for JSON requests
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof ArrayBuffer)) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const executeRequest = async () => {
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      let controller = new AbortController();
      let timeoutId;
      
      try {
        // Add exponential backoff delay for retries
        if (attempt > 0) {
          const delay = getBackoffDelay(attempt - 1);
          await sleep(delay);
        }

        // Set up timeout
        timeoutId = setTimeout(() => controller.abort(), timeout);

        // Prepare body
        let requestBody = body;
        if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof ArrayBuffer)) {
          requestBody = JSON.stringify(body);
        }

        // Make the fetch request
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal
        });

        // Clear timeout
        clearTimeout(timeoutId);

        // Check if status is expected
        if (!expectedStatuses.includes(response.status)) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          error.statusText = response.statusText;
          error.response = response;
          error.context = context;
          error.url = url;
          throw error;
        }

        // Process response based on type
        const processedData = await processResponse(response, responseType);
        
        return processedData;

      } catch (error) {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        lastError = error;
        
        // Don't retry for client errors (4xx) or abort errors
        if (error.status >= 400 && error.status < 500) {
          break;
        }
        if (error.name === 'AbortError') {
          break;
        }
        
        // Log retry attempts
        if (attempt < retries) {
          console.warn(`Request failed (attempt ${attempt + 1}/${retries + 1}):`, error.message);
        }
      }
    }
    
    // Enhance error with context
    if (lastError) {
      lastError.context = { ...context, retries, url: url.toString() };
      lastError.area = context.area || 'http';
      lastError.action = context.action || 'request';
    }
    
    throw lastError;
  };

  // Handle request deduplication
  if (dedupeKey) {
    const promise = executeRequest();
    inflightRequests.set(dedupeKey, promise);
    
    try {
      const result = await promise;
      return result;
    } finally {
      inflightRequests.delete(dedupeKey);
    }
  }

  return executeRequest();
}