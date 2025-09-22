/**
 * Enhanced fetch utility with retry, deduplication, and error handling
 * Replaces axios throughout the codebase with better error handling and features
 */

// In-flight request cache for deduplication
const inFlightRequests = new Map();

// Default configuration
const DEFAULT_CONFIG = {
  method: 'GET',
  expectedStatuses: [200],
  retries: 3,
  retryDelay: 1000,
  timeout: 10000,
  credentials: 'include'
};

/**
 * Enhanced fetch wrapper with axios-like behavior
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {string} options.method - HTTP method
 * @param {any} options.body - Request body (will be JSON.stringify if object)
 * @param {Object} options.headers - Request headers
 * @param {string} options.authToken - Authorization token (sets Authorization header)
 * @param {number[]} options.expectedStatuses - Array of expected success status codes
 * @param {number} options.retries - Number of retry attempts
 * @param {number} options.retryDelay - Delay between retries in ms
 * @param {number} options.timeout - Request timeout in ms
 * @param {Object} options.toast - Toast notification config { addToast, dedupeKey }
 * @param {string} options.dedupeKey - Key for deduplicating concurrent requests
 * @param {Object} options.errorContext - Context for error reporting { area, action }
 * @param {AbortSignal} options.signal - AbortController signal
 * @param {string} options.responseType - Response type ('json', 'text', 'stream', 'arrayBuffer')
 * @returns {Promise<any>} - Parsed response data
 */
export async function fetchJson(url, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  
  // Handle deduplication
  if (config.dedupeKey) {
    if (inFlightRequests.has(config.dedupeKey)) {
      return inFlightRequests.get(config.dedupeKey);
    }
  }

  const requestPromise = executeRequest(url, config);
  
  if (config.dedupeKey) {
    inFlightRequests.set(config.dedupeKey, requestPromise);
    requestPromise.finally(() => {
      inFlightRequests.delete(config.dedupeKey);
    });
  }

  return requestPromise;
}

async function executeRequest(url, config) {
  let lastError;
  
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      return await makeRequest(url, config);
    } catch (error) {
      lastError = error;
      
      if (attempt < config.retries && shouldRetry(error)) {
        await delay(config.retryDelay * Math.pow(2, attempt)); // Exponential backoff
        continue;
      }
      
      break;
    }
  }

  // Handle error notifications
  handleError(lastError, config);
  throw lastError;
}

async function makeRequest(url, config) {
  const { 
    method, 
    body, 
    headers = {}, 
    authToken, 
    expectedStatuses,
    timeout,
    signal,
    responseType = 'json',
    credentials
  } = config;

  // Prepare headers
  const requestHeaders = { ...headers };
  
  if (authToken) {
    requestHeaders.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  // Handle body serialization
  let requestBody = body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof ArrayBuffer)) {
    requestBody = JSON.stringify(body);
    if (!requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null;
  
  // Combine signals if both exist
  let finalSignal = controller.signal;
  if (signal) {
    // Create a combined AbortController
    const combinedController = new AbortController();
    const abortBoth = () => combinedController.abort();
    
    signal.addEventListener('abort', abortBoth);
    controller.signal.addEventListener('abort', abortBoth);
    
    finalSignal = combinedController.signal;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: finalSignal,
      credentials
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!expectedStatuses.includes(response.status)) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // Handle different response types
    switch (responseType) {
      case 'text':
        return await response.text();
      case 'arrayBuffer':
        return await response.arrayBuffer();
      case 'stream':
        return response.body;
      case 'json':
      default:
        return await response.json();
    }
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}

function shouldRetry(error) {
  // Don't retry on abort or certain client errors
  if (error.name === 'AbortError') return false;
  if (error.message.includes('HTTP 4')) return false;
  
  // Retry on network errors, timeouts, and 5xx errors
  return true;
}

function handleError(error, config) {
  const { toast, errorContext } = config;
  
  if (toast && toast.addToast) {
    const errorMessage = errorContext 
      ? `${errorContext.area}: ${errorContext.action} failed - ${error.message}`
      : `Request failed: ${error.message}`;
    
    toast.addToast({
      type: 'error',
      message: errorMessage,
      dedupeKey: toast.dedupeKey
    });
  }

  // Log error with context
  console.error('fetchJson error:', {
    error: error.message,
    context: errorContext,
    stack: error.stack
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convenience methods that mirror axios API
export const fetchJsonGet = (url, options = {}) => 
  fetchJson(url, { ...options, method: 'GET' });

export const fetchJsonPost = (url, body, options = {}) =>
  fetchJson(url, { ...options, method: 'POST', body });

export const fetchJsonPut = (url, body, options = {}) =>
  fetchJson(url, { ...options, method: 'PUT', body });

export const fetchJsonDelete = (url, options = {}) =>
  fetchJson(url, { ...options, method: 'DELETE' });

// Default export
export default fetchJson;