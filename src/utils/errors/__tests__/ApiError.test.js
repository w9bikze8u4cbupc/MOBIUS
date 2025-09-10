import ApiError from '../ApiError';

describe('ApiError', () => {
  const service = 'TestService';
  const message = 'Test error';
  const statusCode = 404;
  const originalError = new Error('Original error');

  it('should create error with all properties', () => {
    const error = new ApiError(service, message, statusCode, originalError);
    
    expect(error.name).toBe('ApiError');
    expect(error.service).toBe(service);
    expect(error.message).toBe(message);
    expect(error.statusCode).toBe(statusCode);
    expect(error.originalError).toBe(originalError);
    expect(error.timestamp).toBeDefined();
  });

  it('should serialize to JSON correctly', () => {
    const error = new ApiError(service, message, statusCode, originalError);
    const json = error.toJSON();
    
    expect(json).toEqual({
      name: 'ApiError',
      service,
      message,
      statusCode,
      timestamp: expect.any(String),
      originalError: originalError.message
    });
  });
});