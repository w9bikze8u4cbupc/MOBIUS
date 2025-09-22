import { Readable } from 'stream';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// In-flight request tracking for deduplication
const inFlightRequests = new Map();

/**
 * Unified HTTP client for Node.js with retry logic, deduplication, and improved error handling
 * 
 * @param {string} url - The URL to fetch
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method (default: 'GET')
 * @param {Object} options.headers - HTTP headers
 * @param {*} options.data - Request body data
 * @param {number} options.timeout - Request timeout in ms (default: 10000)
 * @param {string} options.responseType - Expected response type: 'json', 'text', 'xml', 'stream', 'arrayBuffer'
 * @param {number[]} options.expectedStatuses - Expected HTTP status codes (default: [200])
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.retryDelay - Base retry delay in ms (default: 1000)
 * @param {string} options.dedupeKey - Key for request deduplication
 * @param {string} options.area - Context area for error messages (e.g., 'bgg', 'tts')
 * @param {string} options.action - Context action for error messages (e.g., 'fetchGameData', 'generateAudio')
 * @param {string} options.authToken - Authorization token (will be prefixed with 'Bearer ')
 * @returns {Promise<*>} - Response data based on responseType
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
    area = 'api',
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
  if (dedupeKey || inFlightRequests.size < 100) { // Prevent memory leaks
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
        
        const response = await makeHttpRequest(url, {
          method,
          headers: buildHeaders(headers, authToken),
          data,
          timeout,
        });

        // Check if status is expected
        if (!expectedStatuses.includes(response.statusCode)) {
          throw new HttpError(
            response.statusCode,
            `HTTP ${response.statusCode}: ${response.statusMessage}`,
            response.body,
            area,
            action
          );
        }

        // Process response based on type
        const result = await processResponse(response, responseType);
        
        console.log(`✅ ${area}: ${action} - Success (${response.statusCode})`);
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

async function makeHttpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: options.headers,
      timeout: options.timeout,
    };

    const req = httpModule.request(requestOptions, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body,
          raw: res
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${options.timeout}ms`));
    });

    req.on('error', (error) => {
      reject(error);
    });

    // Send request body if present
    if (options.data) {
      if (typeof options.data === 'string') {
        req.write(options.data);
      } else if (Buffer.isBuffer(options.data)) {
        req.write(options.data);
      } else {
        // Assume JSON
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(options.data));
      }
    }

    req.end();
  });
}

async function processResponse(response, responseType) {
  switch (responseType) {
    case 'json':
      try {
        return JSON.parse(response.body.toString('utf8'));
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${error.message}`);
      }
      
    case 'text':
    case 'xml':
      return response.body.toString('utf8');
      
    case 'arrayBuffer':
      return response.body;
      
    case 'stream':
      // Return a readable stream from the buffer
      return Readable.from(response.body);
      
    default:
      throw new Error(`Unsupported response type: ${responseType}`);
  }
}

class HttpError extends Error {
  constructor(statusCode, message, responseBody, area = 'api', action = 'request') {
    super(`${area}: ${action} failed - ${message}`);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.area = area;
    this.action = action;
  }
}

export { HttpError };