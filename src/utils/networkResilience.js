// Network resilience utilities for external API calls
// Provides retry logic, circuit breakers, and structured error handling

/**
 * Retry an async operation with exponential backoff
 * @param {Function} fn - The async function to retry
 * @param {Object} options - Retry configuration
 * @returns {Promise} - The result of the successful operation
 */
export async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        backoffMultiplier = 2,
        retryCondition = (error) => true
    } = options;

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await fn();
            return result;
        } catch (error) {
            lastError = error;
            
            // Don't retry on the last attempt or if retry condition fails
            if (attempt === maxRetries || !retryCondition(error)) {
                throw error;
            }
            
            // Calculate delay with exponential backoff
            const delay = Math.min(
                initialDelay * Math.pow(backoffMultiplier, attempt),
                maxDelay
            );
            
            console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, {
                error: error.message,
                attempt: attempt + 1,
                maxRetries: maxRetries + 1
            });
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

/**
 * Circuit breaker to prevent cascading failures
 */
export class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.timeout = options.timeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.nextAttempt = null;
        this.successCount = 0;
        this.lastFailureTime = null;
    }
    
    async call(fn, fallback = null) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                if (fallback) {
                    console.warn('Circuit breaker is OPEN, using fallback');
                    return await fallback();
                }
                throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
            }
            this.state = 'HALF_OPEN';
            this.successCount = 0;
        }
        
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            
            if (fallback && this.state === 'OPEN') {
                console.warn('Circuit breaker opened due to failures, using fallback');
                return await fallback();
            }
            
            throw error;
        }
    }
    
    onSuccess() {
        this.failures = 0;
        this.successCount++;
        
        if (this.state === 'HALF_OPEN' && this.successCount >= 2) {
            this.state = 'CLOSED';
            console.info('Circuit breaker reset to CLOSED state');
        }
    }
    
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
            console.error('Circuit breaker OPENED due to repeated failures');
        }
    }
    
    getState() {
        return {
            state: this.state,
            failures: this.failures,
            nextAttempt: this.nextAttempt,
            lastFailureTime: this.lastFailureTime
        };
    }
}

/**
 * Enhanced fetch with retry logic and better error handling
 */
export async function resilientFetch(url, options = {}) {
    const {
        timeout = 30000,
        retries = 3,
        circuitBreaker = null,
        ...fetchOptions
    } = options;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const fetchWithTimeout = async () => {
        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Log response for monitoring
            logApiResponse(url, response.status, Date.now() - startTime);
            
            if (!response.ok) {
                throw new NetworkError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    'HTTP_ERROR',
                    response.status,
                    url
                );
            }
            
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new NetworkError(
                    'Request timeout',
                    'TIMEOUT',
                    null,
                    url
                );
            }
            
            // Re-throw with enhanced error information
            if (!(error instanceof NetworkError)) {
                throw new NetworkError(
                    error.message,
                    'NETWORK_ERROR',
                    null,
                    url,
                    error
                );
            }
            
            throw error;
        }
    };
    
    const startTime = Date.now();
    
    // Retry conditions - don't retry on 4xx errors (client errors)
    const shouldRetry = (error) => {
        if (error instanceof NetworkError) {
            return error.code !== 'HTTP_ERROR' || (error.status >= 500 || error.status === 429);
        }
        return true;
    };
    
    const operation = () => circuitBreaker 
        ? circuitBreaker.call(fetchWithTimeout)
        : fetchWithTimeout();
    
    return retryWithBackoff(operation, {
        maxRetries: retries,
        retryCondition: shouldRetry
    });
}

/**
 * Custom error class for network-related errors
 */
export class NetworkError extends Error {
    constructor(message, code = 'NETWORK_ERROR', status = null, url = null, originalError = null) {
        super(message);
        this.name = 'NetworkError';
        this.code = code;
        this.status = status;
        this.url = url;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
    
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            status: this.status,
            url: this.url,
            timestamp: this.timestamp
        };
    }
}

/**
 * API service wrapper with resilience features
 */
export class ResilientAPIService {
    constructor(baseURL, options = {}) {
        this.baseURL = baseURL;
        this.defaultHeaders = options.headers || {};
        this.timeout = options.timeout || 30000;
        this.retries = options.retries || 3;
        this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
        this.useMocks = process.env.MOCK_APIS === 'true' || options.useMocks;
    }
    
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        if (this.useMocks) {
            console.warn(`Using mock response for ${url}`);
            return this.getMockResponse(endpoint);
        }
        
        const requestOptions = {
            ...options,
            headers: {
                ...this.defaultHeaders,
                ...options.headers
            },
            timeout: this.timeout,
            retries: this.retries,
            circuitBreaker: this.circuitBreaker
        };
        
        try {
            const response = await resilientFetch(url, requestOptions);
            const data = await response.json();
            return data;
        } catch (error) {
            logNetworkError(this.baseURL, error, { endpoint });
            throw error;
        }
    }
    
    getMockResponse(endpoint) {
        // Return appropriate mock data based on endpoint
        return {
            mock: true,
            endpoint,
            data: `Mock response for ${endpoint}`,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Structured logging for network errors
 */
function logNetworkError(service, error, context = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        type: 'network_failure',
        service,
        error: error instanceof NetworkError ? error.toJSON() : {
            name: error.name,
            message: error.message,
            code: error.code || 'UNKNOWN'
        },
        context
    };
    
    console.error(JSON.stringify(logEntry));
}

/**
 * Log successful API responses for monitoring
 */
function logApiResponse(url, status, responseTime) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        type: 'api_response',
        url,
        status,
        response_time: responseTime
    };
    
    console.log(JSON.stringify(logEntry));
}

/**
 * Pre-configured services for common APIs
 */
export const openaiService = new ResilientAPIService('https://api.openai.com', {
    headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
    },
    timeout: 45000, // OpenAI can be slow
    retries: 3,
    circuitBreaker: {
        failureThreshold: 5,
        timeout: 120000 // 2 minutes
    }
});

export const elevenlabsService = new ResilientAPIService('https://api.elevenlabs.io', {
    headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
    },
    timeout: 30000,
    retries: 3,
    circuitBreaker: {
        failureThreshold: 3,
        timeout: 60000
    }
});

export const bggService = new ResilientAPIService('https://boardgamegeek.com', {
    headers: {
        'User-Agent': 'MobiusGamesTutorialGenerator/1.0'
    },
    timeout: 20000,
    retries: 2,
    circuitBreaker: {
        failureThreshold: 3,
        timeout: 60000
    }
});

/**
 * Health check utility
 */
export async function healthCheck() {
    const services = [
        { name: 'OpenAI', service: openaiService, endpoint: '/v1/models' },
        { name: 'ElevenLabs', service: elevenlabsService, endpoint: '/v1/voices' },
        { name: 'BoardGameGeek', service: bggService, endpoint: '/xmlapi2' }
    ];
    
    const results = await Promise.allSettled(
        services.map(async ({ name, service, endpoint }) => {
            try {
                await service.request(endpoint);
                return { name, status: 'healthy', timestamp: new Date().toISOString() };
            } catch (error) {
                return {
                    name,
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        })
    );
    
    return results.map((result, index) => ({
        service: services[index].name,
        ...(result.status === 'fulfilled' ? result.value : {
            status: 'unhealthy',
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        })
    }));
}