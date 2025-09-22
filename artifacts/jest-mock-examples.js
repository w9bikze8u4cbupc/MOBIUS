/**
 * Jest Mock Examples for fetchJson
 *
 * This file contains examples of how to properly mock fetchJson in your Jest tests.
 */

// Mock fetchJson directly
jest.mock('../utils/fetchJson', () => ({
  fetchJson: jest.fn(),
}));

import { fetchJson } from '../utils/fetchJson';

// Example test with successful response
describe('API Helper Tests', () => {
  beforeEach(() => {
    fetchJson.mockClear();
  });

  it('should call fetchJson with correct parameters', async () => {
    // Arrange
    const mockResponse = { id: 1, name: 'Test' };
    fetchJson.mockResolvedValue(mockResponse);

    // Act
    const result = await someApiHelperFunction();

    // Assert
    expect(fetchJson).toHaveBeenCalledWith('/api/endpoint', {
      method: 'GET',
      expectedStatuses: [200],
    });
    expect(result).toEqual(mockResponse);
  });

  it('should handle errors correctly', async () => {
    // Arrange
    const mockError = new Error('Network error');
    fetchJson.mockRejectedValue(mockError);

    // Act & Assert
    await expect(someApiHelperFunction()).rejects.toThrow('Network error');
  });
});

// Example with deduplication testing
describe('Deduplication Tests', () => {
  beforeEach(() => {
    fetchJson.mockClear();
  });

  it('should deduplicate concurrent requests', async () => {
    // Arrange
    const mockResponse = { data: 'test' };
    fetchJson.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockResponse), 100)),
    );

    // Act - Call the same function twice rapidly
    const promise1 = someApiHelperFunction();
    const promise2 = someApiHelperFunction();

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Assert - fetchJson should only be called once
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
  });
});

// Example with abort signal testing
describe('Abort Signal Tests', () => {
  beforeEach(() => {
    fetchJson.mockClear();
  });

  it('should handle aborted requests', async () => {
    // Arrange
    const abortController = new AbortController();
    fetchJson.mockImplementation(() => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve({ data: 'success' }), 100);
        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('AbortError'));
        });
      });
    });

    // Act
    const promise = someApiHelperFunction({ signal: abortController.signal });
    abortController.abort();

    // Assert
    await expect(promise).rejects.toThrow('AbortError');
  });
});

// Example with retry testing using fake timers
describe('Retry Tests', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchJson.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should retry on failure', async () => {
    // Arrange
    const mockError = new Error('Network error');
    fetchJson
      .mockRejectedValueOnce(mockError) // First call fails
      .mockResolvedValue({ data: 'success' }); // Second call succeeds

    // Act
    const promise = someApiHelperFunction();

    // Fast-forward through retries
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;

    // Assert
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: 'success' });
  });
});
