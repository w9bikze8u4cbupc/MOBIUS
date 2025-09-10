import LoggingService from '../utils/logging/LoggingService.js';
import ApiError from '../utils/errors/ApiError.js';

class BaseApiService {
  constructor(config) {
    if (!config) {
      throw new ApiError('BaseApiService', 'Missing configuration');
    }
    
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout || 5000;
    this.serviceName = this.constructor.name;
  }

  async handleResponse(response) {
    try {
      if (!response.ok) {
        throw new ApiError(
          this.serviceName,
          response.statusText,
          response.status
        );
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return response;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Response handling failed', error);
      throw error instanceof ApiError ? error : new ApiError(
        this.serviceName,
        'Failed to process API response',
        500,
        error
      );
    }
  }

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Request failed', error);
      throw new ApiError(
        this.serviceName,
        'Request failed',
        500,
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  validateConfig(requiredFields) {
    for (const field of requiredFields) {
      if (!(field in this)) {
        throw new ApiError(
          this.serviceName,
          `Missing required configuration: ${field}`
        );
      }
    }
  }
}

export default BaseApiService;