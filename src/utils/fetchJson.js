/**
 * Unified fetchJson utility for Node.js server
 * 
 * Features:
 * - Exponential backoff retries
 * - Request deduplication via dedupeKey
 * - Timeout handling via AbortController
 * - Explicit responseType support
 * - Expected status validation
 * - Automatic Bearer token handling
 * - Structured error objects with context
 * - Default User-Agent header
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Readable } from 'stream';

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
 * Create a Node.js HTTP request
 * @param {string|URL} url - The URL to fetch
 * @param {Object} options - Request options
 * @returns {Promise} Promise that resolves to response
 */
function makeNodeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000,
      signal: options.signal
    };

    const req = httpModule.request(requestOptions, (res) => {
      let data = [];
      
      res.on('data', chunk => {
        data.push(chunk);
      });
      
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          data: buffer,
          url: url.toString()
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${requestOptions.timeout}ms`));
    });

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('Request aborted'));
      });
    }

    if (options.body) {
      if (typeof options.body === 'string') {
        req.write(options.body);
      } else if (Buffer.isBuffer(options.body)) {
        req.write(options.body);
      } else if (options.body instanceof Readable) {
        options.body.pipe(req);
        return; // Don't call req.end() for streams
      } else {
        req.write(JSON.stringify(options.body));
      }
    }

    req.end();
  });
}

/**
 * Process response based on responseType
 * @param {Object} response - Raw response object
 * @param {string} responseType - Type of response expected
 * @returns {*} Processed response data
 */
function processResponse(response, responseType) {
  const buffer = response.data;
  
  switch (responseType) {
    case 'json':
      try {
        return JSON.parse(buffer.toString('utf8'));
      } catch (error) {
        throw new Error(`Invalid JSON response: ${error.message}`);
      }
    
    case 'text':
      return buffer.toString('utf8');
    
    case 'xml':
      return buffer.toString('utf8');
    
    case 'arrayBuffer':
      return buffer;
    
    case 'stream':
      return Readable.from(buffer);
    
    default:
      // Default to json for backward compatibility
      try {
        return JSON.parse(buffer.toString('utf8'));
      } catch {
        return buffer.toString('utf8');
      }
  }
}

/**
 * Unified fetchJson function for Node.js
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
    'User-Agent': 'BoardGameTutorialGenerator/1.0',
    ...headers
  };

  // Add Bearer token if provided
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  // Add Content-Type for JSON requests
  if (body && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Readable)) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const executeRequest = async () => {
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Add exponential backoff delay for retries
        if (attempt > 0) {
          const delay = getBackoffDelay(attempt - 1);
          await sleep(delay);
        }

        const response = await makeNodeRequest(url, {
          method,
          headers: requestHeaders,
          body,
          timeout,
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
        const processedData = processResponse(response, responseType);
        
        return processedData;

      } catch (error) {
        lastError = error;
        
        // Don't retry for client errors (4xx) or abort errors
        if (error.status >= 400 && error.status < 500) {
          break;
        }
        if (error.message.includes('abort')) {
          break;
        }
        
        // Log retry attempts
        if (attempt < retries) {
          console.warn(`Request failed (attempt ${attempt + 1}/${retries + 1}):`, error.message);
        }
      }
    }

    // Clear timeout on final failure
    clearTimeout(timeoutId);
    
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