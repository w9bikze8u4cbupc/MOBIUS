import { fetchJson, HttpError } from '../utils/fetchJson.js';

describe('fetchJson Node.js utility', () => {
  describe('Error handling', () => {
    test('should create HttpError with correct properties', () => {
      const error = new HttpError(404, 'Not Found', 'error body', 'test', 'action');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(404);
      expect(error.area).toBe('test');
      expect(error.action).toBe('action');
      expect(error.message).toBe('test: action failed - Not Found');
    });
  });

  describe('Basic functionality', () => {
    test('should handle basic options correctly', () => {
      const options = {
        maxRetries: 2,
        retryDelay: 500,
        area: 'test',
        action: 'retry',
        dedupeKey: 'test-key'
      };
      
      expect(options.maxRetries).toBe(2);
      expect(options.retryDelay).toBe(500);
      expect(options.dedupeKey).toBe('test-key');
    });
  });
});
