import ServiceName from '../ServiceName';
import ApiError from '../../utils/errors/ApiError';
import LoggingService from '../../utils/logging/LoggingService';

jest.mock('../../utils/logging/LoggingService');

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

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('error logging', () => {
    it('should log errors when handling failed responses', async () => {
      const response = {
        ok: false,
        statusText: 'Server Error',
        status: 500
      };

      await expect(service.handleResponse(response)).rejects.toThrow(ApiError);
      expect(LoggingService.error).toHaveBeenCalledWith(
        'BaseApiService',
        'Response handling failed',
        expect.any(ApiError)
      );
    });

    it('should log timeouts', async () => {
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

    it('should log validation errors', () => {
      expect(() => {
        service.validateConfig(['nonexistentField']);
      }).toThrow(ApiError);
      
      expect(LoggingService.error).toHaveBeenCalledWith(
        'BaseApiService',
        'Missing required configuration: nonexistentField',
        expect.any(ApiError)
      );
    });
  });
});