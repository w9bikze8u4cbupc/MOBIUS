/**
 * Unit tests for fetchJson browser utility
 */

import fetchJson from '../fetchJson';

// Mock fetch
global.fetch = jest.fn();
global.AbortController = class MockAbortController {
  constructor() {
    this.signal = { aborted: false };
  }
  abort() {
    this.signal.aborted = true;
  }
};

describe('fetchJson browser utility', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('makes successful JSON request', async () => {
    const mockResponse = { data: 'test' };
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchJson('/test');

    expect(fetch).toHaveBeenCalledWith('/test', {
      method: 'GET',
      headers: {},
      body: undefined,
      signal: expect.any(Object),
    });
    expect(result).toEqual(mockResponse);
  });

  test('handles POST request with JSON body', async () => {
    const requestBody = { name: 'test' };
    const mockResponse = { success: true };
    
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchJson('/test', {
      method: 'POST',
      body: requestBody,
    });

    expect(fetch).toHaveBeenCalledWith('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: expect.any(Object),
    });
    expect(result).toEqual(mockResponse);
  });

  test('handles arrayBuffer responseType', async () => {
    const mockArrayBuffer = new ArrayBuffer(8);
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    });

    const result = await fetchJson('/test', {
      responseType: 'arrayBuffer',
    });

    expect(result).toEqual(mockArrayBuffer);
  });

  test('adds Authorization header with token', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await fetchJson('/test', {
      token: 'test-token',
    });

    expect(fetch).toHaveBeenCalledWith('/test', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
      body: undefined,
      signal: expect.any(Object),
    });
  });

  test('throws error for unexpected status', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Not found'),
    });

    await expect(fetchJson('/test')).rejects.toThrow('HTTP 404: Not Found');
  });

  test('retries on network error', async () => {
    const networkError = new Error('Network error');
    fetch.mockRejectedValueOnce(networkError)
         .mockResolvedValue({
           ok: true,
           status: 200,
           json: () => Promise.resolve({ success: true }),
         });

    const result = await fetchJson('/test', { retries: 1 });
    
    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(2); // Original + 1 retry
  });

  test('deduplication prevents duplicate requests', async () => {
    const mockResponse = { data: 'test' };
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const dedupeKey = 'test-key';
    const promise1 = fetchJson('/test', { dedupeKey });
    const promise2 = fetchJson('/test', { dedupeKey });

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
  });
});