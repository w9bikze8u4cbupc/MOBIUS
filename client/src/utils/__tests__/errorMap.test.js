import { getErrorMessageFor, httpStatusToCode, findHeuristicCode } from '../errorMap';

describe('errorMap', () => {
  describe('getErrorMessageFor', () => {
    it('should return a user-friendly message for HTTP 413 errors', () => {
      const error = new Error('Payload Too Large');
      error.status = 413;
      
      const result = getErrorMessageFor(error, { area: 'extract', action: 'bgg-html' });
      
      expect(result).toBe('File is too large. Please try a smaller file.');
    });

    it('should return a user-friendly message for network errors', () => {
      const error = new Error('Failed to fetch');
      
      const result = getErrorMessageFor(error, { area: 'extract', action: 'bgg-html' });
      
      expect(result).toBe('Network error. Please check your connection and try again.');
    });

    it('should return a user-friendly message for timeout errors', () => {
      const error = new Error('AbortError');
      
      const result = getErrorMessageFor(error, { area: 'extract', action: 'bgg-html' });
      
      expect(result).toBe('Request timed out. Please try again.');
    });

    it('should return a generic message for unknown errors', () => {
      const error = new Error('Unknown error');
      error.status = 500;
      
      const result = getErrorMessageFor(error, { area: 'extract', action: 'bgg-html' });
      
      expect(result).toBe('An unexpected error occurred. Please try again.');
    });

    it('should use context to provide more specific messages', () => {
      const error = new Error('Failed to fetch');
      
      const result = getErrorMessageFor(error, { area: 'search', action: 'images' });
      
      expect(result).toBe('Network error. Please check your connection and try again.');
    });
  });

  describe('httpStatusToCode', () => {
    it('should map HTTP 413 to FILE_TOO_LARGE', () => {
      expect(httpStatusToCode(413)).toBe('FILE_TOO_LARGE');
    });

    it('should map HTTP 404 to NOT_FOUND', () => {
      expect(httpStatusToCode(404)).toBe('NOT_FOUND');
    });

    it('should map HTTP 500 to SERVER_ERROR', () => {
      expect(httpStatusToCode(500)).toBe('SERVER_ERROR');
    });

    it('should return null for unmapped status codes', () => {
      expect(httpStatusToCode(200)).toBeNull();
    });
  });

  describe('findHeuristicCode', () => {
    it('should detect network errors', () => {
      const error = new Error('Failed to fetch');
      expect(findHeuristicCode(error)).toBe('NETWORK_ERROR');
    });

    it('should detect timeout errors', () => {
      const error = new Error('AbortError');
      expect(findHeuristicCode(error)).toBe('TIMEOUT');
    });

    it('should detect JSON parse errors', () => {
      const error = new Error('Unexpected token < in JSON at position 0');
      expect(findHeuristicCode(error)).toBe('INVALID_JSON');
    });

    it('should return null for unknown error patterns', () => {
      const error = new Error('Some other error');
      expect(findHeuristicCode(error)).toBeNull();
    });
  });
});