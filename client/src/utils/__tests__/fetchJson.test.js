import { fetchJson } from '../fetchJson';

// Mock the errorMap
jest.mock('../errorMap', () => ({
  getErrorMessageFor: jest.fn((error, context) => {
    if (error.message === 'Network error') {
      return 'Network error occurred. Please check your connection.';
    }
    if (error.message === 'Timeout') {
      return 'Request timed out. Please try again.';
    }
    return 'An unexpected error occurred.';
  }),
}));

// Mock global fetch
global.fetch = jest.fn();

// Mock AbortController
global.AbortController = class {
  constructor() {
    this.signal = { aborted: false };
  }
  abort() {
    this.signal.aborted = true;
  }
};

describe('fetchJson', () => {
  const mockUrl = '/api/test';
  const mockOptions = {
    method: 'GET',
    toast: { addToast: jest.fn(), dedupeKey: 'test-key' },
    errorContext: { area: 'test', action: 'fetch' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  it('should make a successful request and return JSON data', async () => {
    const mockResponse = { data: 'test' };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
      status: 200,
      headers: new Map(),
    });

    const result = await fetchJson(mockUrl, mockOptions);

    expect(global.fetch).toHaveBeenCalledWith(mockUrl, expect.objectContaining({
      method: 'GET',
    }));
    expect(result).toEqual(mockResponse);
  });

  it('should handle HTTP errors and throw with mapped message', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server error'),
      headers: new Map(),
    });

    await expect(fetchJson(mockUrl, mockOptions)).rejects.toThrow(
      'Network error occurred. Please check your connection.'
    );
  });

  it('should retry failed requests', async () => {
    // First two requests fail, third succeeds
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
        headers: new Map(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
        headers: new Map(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
        status: 200,
        headers: new Map(),
      });

    // Use jest.useFakeTimers to control setTimeout
    jest.useFakeTimers();

    const promise = fetchJson(mockUrl, {
      ...mockOptions,
      retries: 2,
      retryBackoffMs: 100,
    });

    // Fast-forward until all timers are executed
    await jest.runAllTimersAsync();

    const result = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: 'test' });

    // Reset timers
    jest.useRealTimers();
  });

  it('should show toast on error when provided', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server error'),
      headers: new Map(),
    });

    const mockAddToast = jest.fn();
    
    await expect(fetchJson(mockUrl, {
      ...mockOptions,
      toast: { addToast: mockAddToast, dedupeKey: 'test-error' },
    })).rejects.toThrow();

    expect(mockAddToast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'Network error occurred. Please check your connection.',
      dedupeKey: 'test-error',
    });
  });

  it('should handle timeout', async () => {
    global.fetch.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 100);
    }));

    await expect(fetchJson(mockUrl, {
      ...mockOptions,
      timeoutMs: 50,
    })).rejects.toThrow('Request timed out. Please try again.');
  });
});