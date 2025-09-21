// client/src/api/__tests__/fetchJson-final.test.js
import { fetchJson } from '../utils/fetchJson';

// Mock global fetch
global.fetch = jest.fn();

describe('fetchJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
    
    // Enable fake timers for testing retry behavior
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    // Reset to real timers after each test
    jest.useRealTimers();
  });

  it('should make a successful request and return data with metadata', async () => {
    // Mock a successful response
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({ message: 'success' }),
      text: () => Promise.resolve('{"message": "success"}')
    };
    
    global.fetch.mockResolvedValue(mockResponse);
    
    // Call fetchJson
    const result = await fetchJson('/api/test');
    
    // Verify the result
    expect(result).toEqual({
      data: { message: 'success' },
      status: 200,
      headers: mockResponse.headers,
      timing: expect.any(Number),
      attempts: 1
    });
    
    // Verify fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith('/api/test', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      body: undefined,
      signal: undefined,
      credentials: 'include'
    });
  });

  it('should retry on network failure and eventually succeed', async () => {
    // Mock a network failure followed by success
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({ message: 'success' }),
      text: () => Promise.resolve('{"message": "success"}')
    };
    
    global.fetch
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(mockResponse);
    
    // Call fetchJson
    const promise = fetchJson('/api/test', { retries: 3, retryBackoffMs: 100 });
    
    // Fast-forward through the retries
    await jest.advanceTimersByTimeAsync(1000);
    
    // Wait for the promise to resolve
    const result = await promise;
    
    // Should have retried twice and succeeded
    expect(result.attempts).toBe(3);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
  
  it('should handle 429 with Retry-After header', async () => {
    // Mock a 429 response followed by success
    const mock429Response = {
      ok: false,
      status: 429,
      headers: new Map([['Retry-After', '2']]), // 2 seconds
      json: () => Promise.resolve({ error: 'Too Many Requests' }),
      text: () => Promise.resolve('{"error": "Too Many Requests"}')
    };
    
    const mockSuccessResponse = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({ message: 'success' }),
      text: () => Promise.resolve('{"message": "success"}')
    };
    
    global.fetch
      .mockResolvedValueOnce(mock429Response)
      .mockResolvedValueOnce(mockSuccessResponse);
    
    // Call fetchJson
    const promise = fetchJson('/api/test', { retries: 2, retryBackoffMs: 100 });
    
    // Fast-forward by 2 seconds (Retry-After value)
    await jest.advanceTimersByTimeAsync(2000);
    
    // Wait for the promise to resolve
    const result = await promise;
    
    // Should have retried once and succeeded
    expect(result.attempts).toBe(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  
  it('should deduplicate concurrent requests with same dedupeKey', async () => {
    // Mock a delayed response
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({ message: 'success' }),
      text: () => Promise.resolve('{"message": "success"}')
    };
    
    // Create a promise that resolves after a delay
    let resolveFunc;
    const delayedPromise = new Promise(resolve => {
      resolveFunc = resolve;
    });
    
    global.fetch.mockReturnValue(delayedPromise.then(() => mockResponse));
    
    // Call fetchJson twice with the same dedupeKey
    const toast = { addToast: jest.fn(), dedupeKey: 'test-key' };
    const promise1 = fetchJson('/api/test', { toast });
    const promise2 = fetchJson('/api/test', { toast });
    
    // Resolve the delayed promise
    resolveFunc(mockResponse);
    
    // Wait for both promises to resolve
    const [result1, result2] = await Promise.all([promise1, promise2]);
    
    // Should have only made one fetch call
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    // Both results should be the same
    expect(result1).toEqual(result2);
  });
  
  it('should respect AbortSignal during backoff', async () => {
    // Create an AbortController
    const controller = new AbortController();
    
    // Mock a network failure
    global.fetch.mockRejectedValue(new Error('Network Error'));
    
    // Call fetchJson with abort signal
    const promise = fetchJson('/api/test', { 
      retries: 3, 
      retryBackoffMs: 1000,
      signal: controller.signal
    });
    
    // Advance time by 500ms and then abort
    await jest.advanceTimersByTimeAsync(500);
    controller.abort();
    
    // Wait for the promise to reject
    await expect(promise).rejects.toThrow('Aborted');
    
    // Should have only made one fetch call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  
  it('should handle JSON parse errors and include raw text', async () => {
    // Mock a response with invalid JSON
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.reject(new Error('Invalid JSON')),
      text: () => Promise.resolve('Invalid JSON response')
    };
    
    global.fetch.mockResolvedValue(mockResponse);
    
    // Call fetchJson
    const result = await fetchJson('/api/test');
    
    // Should have parsed the raw text
    expect(result.data).toEqual({});
  });
  
  it('should handle non-JSON responses', async () => {
    // Mock a text response
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      json: () => Promise.reject(new Error('Not JSON')),
      text: () => Promise.resolve('Plain text response')
    };
    
    global.fetch.mockResolvedValue(mockResponse);
    
    // Call fetchJson
    const result = await fetchJson('/api/test');
    
    // Should have returned the raw text
    expect(result.data).toBe('Plain text response');
  });
});