/**
 * Unit tests for fetchJson server utility
 */

import fetchJson from '../fetchJson.js';
import { jest } from '@jest/globals';

// Mock fetch for Node.js
global.fetch = jest.fn();
global.AbortController = class MockAbortController {
  constructor() {
    this.signal = { aborted: false };
  }
  abort() {
    this.signal.aborted = true;
  }
};

describe('fetchJson server utility', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('makes successful JSON request with default User-Agent', async () => {
    const mockResponse = { data: 'test' };
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchJson('https://example.com/test');

    expect(fetch).toHaveBeenCalledWith('https://example.com/test', {
      method: 'GET',
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
      body: undefined,
      signal: expect.any(Object),
    });
    expect(result).toEqual(mockResponse);
  });

  test('handles XML responseType', async () => {
    const mockXml = '<root><item>test</item></root>';
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockXml),
    });

    const result = await fetchJson('https://example.com/test', {
      responseType: 'xml',
    });

    expect(result).toEqual(mockXml);
  });

  test('includes context in error for observability', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server error'),
    });

    try {
      await fetchJson('https://example.com/test', {
        context: { area: 'bgg', action: 'fetch', gameId: '123' }
      });
      fail('Should have thrown an error');
    } catch (error) {
      expect(error.context).toEqual({
        area: 'bgg',
        action: 'fetch',
        gameId: '123',
        url: 'https://example.com/test',
        method: 'GET',
        status: 500,
        attempt: 1
      });
    }
  });

  test('supports streaming responseType', async () => {
    const mockStream = { readable: true, pipe: jest.fn() };
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: mockStream,
    });

    const result = await fetchJson('https://example.com/test', {
      responseType: 'stream',
    });

    expect(result).toBeDefined();
  });

  test('retries server errors but not client errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve('Bad request'),
    });

    await expect(fetchJson('https://example.com/test', { retries: 2 }))
      .rejects.toThrow('HTTP 400: Bad Request');
    
    expect(fetch).toHaveBeenCalledTimes(1); // No retries for 4xx errors
  });

  test('applies exponential backoff for retries', async () => {
    const serverError = new Error('Server error');
    fetch.mockRejectedValueOnce(serverError)
         .mockRejectedValueOnce(serverError)
         .mockResolvedValue({
           ok: true,
           status: 200,
           json: () => Promise.resolve({ success: true }),
         });

    const startTime = Date.now();
    const resultPromise = fetchJson('https://example.com/test', { retries: 2 });

    // Advance through backoff delays
    jest.advanceTimersByTime(1000); // First retry after 1s
    await Promise.resolve();
    jest.advanceTimersByTime(2000); // Second retry after 2s
    await Promise.resolve();

    const result = await resultPromise;
    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});