import LoggingService from '../utils/logging/LoggingService';
import ApiError from '../utils/errors/ApiError';

class ApiError extends Error {
  constructor(service, message, statusCode = 500, originalError = null) {
    super(message);
    this.name = 'ApiError';
    this.service = service;
    this.statusCode = statusCode;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      service: this.service,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      originalError: this.originalError?.message
    };
  }
}

export default ApiError;