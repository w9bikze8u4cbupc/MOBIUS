import axios from 'axios';

/**
 * Resilient API client with retry logic, circuit breaker, and structured logging
 */

// Circuit breaker state for each service
const circuitBreakers = new Map();

// Mock mode flags from environment
const MOCK_MODE = {
  openai: process.env.MOCK_OPENAI === 'true',
  elevenlabs: process.env.MOCK_ELEVENLABS === 'true',
  bgg: process.env.MOCK_BGG === 'true',
  extractPics: process.env.MOCK_EXTRACT_PICS === 'true'
};

/**
 * Log structured API calls for monitoring and debugging
 */
function logApiCall(area, action, target, status, latencyMs, error = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    area,
    action, 
    target,
    status,
    latency_ms: latencyMs,
    ...(error && { error: error.message || error })
  };
  
  console.log(JSON.stringify(logEntry));
  
  // Also log human-readable format for development
  if (status !== 'success') {
    console.error(`API Call Failed: ${action} to ${target} - ${status} (${latencyMs}ms)`, error);
  }
}

/**
 * Circuit breaker implementation
 */
class CircuitBreaker {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.failures = 0;
    this.lastFailTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }
  
  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    
    if (this.state === 'HALF_OPEN') {
      return true;
    }
    
    return false;
  }
  
  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailTime = null;
  }
  
  onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`Circuit breaker opened for ${this.serviceName} after ${this.failures} failures`);
    }
  }
}

/**
 * Get or create circuit breaker for a service
 */
function getCircuitBreaker(serviceName) {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(serviceName, new CircuitBreaker(serviceName));
  }
  return circuitBreakers.get(serviceName);
}

/**
 * Sleep function for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resilient HTTP client with retry and circuit breaker
 */
export async function resilientHttpCall(options) {
  const {
    url,
    method = 'GET',
    headers = {},
    data,
    serviceName,
    action,
    maxRetries = 3,
    baseDelay = 1000, // Base delay for exponential backoff
    timeout = 10000,
    mockResponse
  } = options;
  
  const startTime = Date.now();
  
  // Check mock mode
  const mockKey = serviceName?.toLowerCase();
  if (mockKey && MOCK_MODE[mockKey]) {
    console.log(`Mock mode enabled for ${serviceName}, returning mock response`);
    logApiCall('api', action, new URL(url).hostname, 'mocked', Date.now() - startTime);
    return mockResponse || { data: { mock: true, service: serviceName } };
  }
  
  // Check circuit breaker
  const circuitBreaker = getCircuitBreaker(serviceName);
  if (!circuitBreaker.canExecute()) {
    const error = new Error(`Circuit breaker is OPEN for ${serviceName}`);
    logApiCall('api', action, new URL(url).hostname, 'circuit_open', Date.now() - startTime, error);
    throw error;
  }
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios({
        url,
        method,
        headers,
        data,
        timeout,
        validateStatus: (status) => status < 500 // Don't retry client errors (4xx)
      });
      
      // Success
      circuitBreaker.onSuccess();
      const latency = Date.now() - startTime;
      logApiCall('api', action, new URL(url).hostname, 'success', latency);
      return response;
      
    } catch (error) {
      lastError = error;
      const latency = Date.now() - startTime;
      
      // Determine error type
      let status = 'unknown_error';
      if (error.code === 'ECONNREFUSED') {
        status = 'connection_refused';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        status = 'timeout';
      } else if (error.code === 'ENOTFOUND') {
        status = 'dns_error';
      } else if (error.response) {
        status = `http_${error.response.status}`;
        // Don't retry client errors
        if (error.response.status >= 400 && error.response.status < 500) {
          logApiCall('api', action, new URL(url).hostname, status, latency, error);
          circuitBreaker.onFailure();
          throw error;
        }
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        logApiCall('api', action, new URL(url).hostname, status, latency, error);
        circuitBreaker.onFailure();
        break;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      logApiCall('api', action, new URL(url).hostname, `${status}_retry_${attempt + 1}`, latency, error);
      
      await sleep(delay);
    }
  }
  
  // All retries exhausted
  throw lastError;
}

/**
 * OpenAI API wrapper with resilience
 */
export async function resilientOpenAICall(openai, method, params, action = 'openai_request') {
  const mockResponse = {
    choices: [{
      message: { content: '{"mock": true, "service": "OpenAI"}' }
    }]
  };
  
  // For OpenAI SDK calls, we need to wrap differently
  if (MOCK_MODE.openai) {
    console.log('Mock mode enabled for OpenAI, returning mock response');
    logApiCall('api', action, 'api.openai.com', 'mocked', 0);
    return mockResponse;
  }
  
  const circuitBreaker = getCircuitBreaker('openai');
  if (!circuitBreaker.canExecute()) {
    const error = new Error('Circuit breaker is OPEN for OpenAI');
    logApiCall('api', action, 'api.openai.com', 'circuit_open', 0, error);
    throw error;
  }
  
  const startTime = Date.now();
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let response;
      
      // Handle different OpenAI SDK methods
      if (method === 'chat.completions.create') {
        response = await openai.chat.completions.create(params);
      } else {
        throw new Error(`Unknown OpenAI method: ${method}`);
      }
      
      circuitBreaker.onSuccess();
      const latency = Date.now() - startTime;
      logApiCall('api', action, 'api.openai.com', 'success', latency);
      return response;
      
    } catch (error) {
      lastError = error;
      const latency = Date.now() - startTime;
      
      // Determine retry strategy based on error
      let shouldRetry = false;
      let status = 'unknown_error';
      
      if (error.status) {
        status = `http_${error.status}`;
        // Retry on 429 (rate limit) and 5xx errors
        shouldRetry = error.status === 429 || error.status >= 500;
      } else if (error.code) {
        if (error.code === 'ECONNREFUSED') {
          status = 'connection_refused';
          shouldRetry = true;
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          status = 'timeout';
          shouldRetry = true;
        } else if (error.code === 'ENOTFOUND') {
          status = 'dns_error';
          shouldRetry = true;
        }
      }
      
      // Don't retry on last attempt or non-retryable errors
      if (attempt === maxRetries || !shouldRetry) {
        logApiCall('api', action, 'api.openai.com', status, latency, error);
        circuitBreaker.onFailure();
        break;
      }
      
      // Exponential backoff with jitter
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
      logApiCall('api', action, 'api.openai.com', `${status}_retry_${attempt + 1}`, latency, error);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}