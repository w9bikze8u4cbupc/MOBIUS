// In-flight request tracking for deduplication
const inFlightRequests = new Map();

/**
 * Unified HTTP client for browsers with retry logic, deduplication, and improved error handling
 */
export async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    data = null,
    timeout = 10000,
    responseType = 'json',
    expectedStatuses = [200],
    maxRetries = 3,
    retryDelay = 1000,
    dedupeKey = null,
    area = 'client',
    action = 'request',
    authToken = null
  } = options;

  // Build request key for deduplication
  const requestKey = dedupeKey || `${method}:${url}:${JSON.stringify(data)}`;

  // Check for in-flight request
  if (inFlightRequests.has(requestKey)) {
    console.log(`🔄 Deduplicating request: ${area}: ${action}`);
    return inFlightRequests.get(requestKey);
  }

  // Create the request promise
  const requestPromise = executeRequest();
  
  // Store in-flight request
  if (dedupeKey || inFlightRequests.size < 100) {
    inFlightRequests.set(requestKey, requestPromise);
  }

  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Clean up in-flight request
    inFlightRequests.delete(requestKey);
  }

  async function executeRequest() {
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📡 ${area}: ${action} - Attempt ${attempt + 1}/${maxRetries + 1} - ${method} ${url}`);
        
        const response = await makeFetchRequest(url, {
          method,
          headers: buildHeaders(headers, authToken),
          data,
          timeout,
        });

        // Check if status is expected
        if (!expectedStatuses.includes(response.status)) {
          const errorText = await response.text();
          throw new HttpError(
            response.status,
            `HTTP ${response.status}: ${response.statusText}`,
            errorText,
            area,
            action
          );
        }

        // Process response based on type
        const result = await processResponse(response, responseType);
        
        console.log(`✅ ${area}: ${action} - Success (${response.status})`);
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx) unless it's specific retryable errors
        if (error.statusCode >= 400 && error.statusCode < 500 && 
            ![408, 429].includes(error.statusCode)) {
          console.error(`❌ ${area}: ${action} failed - ${error.message} (not retrying client error)`);
          throw error;
        }
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          console.error(`❌ ${area}: ${action} failed after ${maxRetries + 1} attempts - ${error.message}`);
          throw error;
        }
        
        // Calculate exponential backoff delay
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`⚠️ ${area}: ${action} - Attempt ${attempt + 1} failed (${error.message}), retrying in ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

function buildHeaders(userHeaders, authToken) {
  const headers = {
    'User-Agent': 'MobiusGamesTutorialGenerator/1.0',
    ...userHeaders,
  };

  // Add auth token if provided
  if (authToken) {
    headers.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  return headers;
}

async function makeFetchRequest(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);
  
  try {
    const fetchOptions = {
      method: options.method,
      headers: options.headers,
      signal: controller.signal,
    };

    // Add request body if present
    if (options.data) {
      if (typeof options.data === 'string') {
        fetchOptions.body = options.data;
      } else if (options.data instanceof FormData || options.data instanceof URLSearchParams) {
        fetchOptions.body = options.data;
      } else {
        // Assume JSON
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(options.data);
      }
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response;
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${options.timeout}ms`);
    }
    throw error;
  }
}

async function processResponse(response, responseType) {
  switch (responseType) {
    case 'json':
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${error.message}`);
      }
      
    case 'text':
    case 'xml':
      return await response.text();
      
    case 'arrayBuffer':
      return await response.arrayBuffer();
      
    default:
      throw new Error(`Unsupported response type: ${responseType}`);
  }
}

class HttpError extends Error {
  constructor(statusCode, message, responseBody, area = 'client', action = 'request') {
    super(`${area}: ${action} failed - ${message}`);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.area = area;
    this.action = action;
  }
}

export { HttpError };
