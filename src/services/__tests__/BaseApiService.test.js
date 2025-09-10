import BaseApiService from '../BaseApiService';
import ApiError from '../../utils/errors/ApiError';
import LoggingService from '../../utils/logging/LoggingService';

jest.mock('../../utils/logging/LoggingService', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('BaseApiService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      baseUrl: 'https://api.example.com',
      timeout: 5000
    };
    service = new BaseApiService(mockConfig);
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(service.baseUrl).toBe(mockConfig.baseUrl);
      expect(service.timeout).toBe(mockConfig.timeout);
      expect(service.serviceName).toBe('BaseApiService');
    });

    it('should throw error if config is missing', () => {
      expect(() => new BaseApiService()).toThrow(ApiError);
    });
  });

  describe('handleResponse', () => {
    it('should handle JSON response', async () => {
      const mockData = { key: 'value' };
      const response = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue(mockData)
      };

      const result = await service.handleResponse(response);
      expect(result).toEqual(mockData);
    });

    it('should handle non-JSON response', async () => {
      const response = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('text/plain')
        }
      };

      const result = await service.handleResponse(response);
      expect(result).toBe(response);
    });

    it('should throw ApiError for non-ok response', async () => {
      const response = {
        ok: false,
        statusText: 'Not Found',
        status: 404
      };

      await expect(service.handleResponse(response)).rejects.toThrow(ApiError);
      expect(LoggingService.error).toHaveBeenCalledWith(
        'BaseApiService',
        'Response handling failed',
        expect.any(ApiError)
      );
    });
  });

  describe('fetchWithTimeout', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should fetch successfully within timeout', async () => {
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.fetchWithTimeout('https://api.example.com/test');
      expect(result).toBe(mockResponse);
    });

    it('should handle timeout', async () => {
      jest.useFakeTimers();
      global.fetch.mockImplementation(() => new Promise(resolve => {
        setTimeout(resolve, 6000);
      }));

      const fetchPromise = service.fetchWithTimeout('https://api.example.com/test');
      jest.advanceTimersByTime(5001);

      await expect(fetchPromise).rejects.toThrow(ApiError);
      expect(LoggingService.error).toHaveBeenCalledWith(
        'BaseApiService',
        'Request failed',
        expect.any(Error)
      );
      jest.useRealTimers();
    });
  });

  describe('validateConfig', () => {
    it('should validate required fields', () => {
      expect(() => {
        service.validateConfig(['nonexistentField']);
      }).toThrow(ApiError);
      expect(LoggingService.error).toHaveBeenCalledWith(
        'BaseApiService',
        'Missing required configuration: nonexistentField',
        expect.any(ApiError)
      );
    });

    it('should pass when all required fields exist', () => {
      expect(() => {
        service.validateConfig(['baseUrl', 'timeout']);
      }).not.toThrow();
    });
  });
});