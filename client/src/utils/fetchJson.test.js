import fetchJson from './fetchJson';

// Mock fetch for testing
global.fetch = jest.fn();

describe('fetchJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should make a basic GET request and return JSON', async () => {
    const mockResponse = { test: 'data' };
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    const result = await fetchJson('https://api.example.com/data');

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'GET',
      headers: {},
      signal: expect.any(AbortSignal)
    });
    expect(result).toEqual(mockResponse);
  });

  it('should make a POST request with JSON body', async () => {
    const mockResponse = { success: true };
    const requestBody = { name: 'test', value: 123 };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    const result = await fetchJson('https://api.example.com/create', {
      method: 'POST',
      body: requestBody
    });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: expect.any(AbortSignal)
    });
    expect(result).toEqual(mockResponse);
  });

  it('should handle different response types', async () => {
    const xmlData = '<xml>test</xml>';
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: jest.fn().mockResolvedValueOnce(xmlData)
    });

    const result = await fetchJson('https://api.example.com/xml', {
      responseType: 'xml'
    });

    expect(result).toBe(xmlData);
  });

  it('should handle arrayBuffer response type', async () => {
    const bufferData = new ArrayBuffer(8);
    global.fetch.mockResolvedValueOnce({
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValueOnce(bufferData)
    });

    const result = await fetchJson('https://api.example.com/audio', {
      responseType: 'arrayBuffer'
    });

    expect(result).toBe(bufferData);
  });

  it('should add Bearer token when provided', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValueOnce({})
    });

    await fetchJson('https://api.example.com/secured', {
      bearerToken: 'test-token-123'
    });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/secured', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer test-token-123' },
      signal: expect.any(AbortSignal)
    });
  });

  it('should retry failed requests with exponential backoff', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValueOnce({ success: true })
      });

    const promise = fetchJson('https://api.example.com/flaky', {
      retries: 2,
      retryDelay: 100 // Faster for testing
    });

    // Advance timers to trigger retries
    jest.advanceTimersByTime(100); // First retry after 100ms
    await new Promise(resolve => setImmediate(resolve)); // Allow promise to continue
    jest.advanceTimersByTime(200); // Second retry after 200ms (exponential backoff)
    await new Promise(resolve => setImmediate(resolve));
    
    const result = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ success: true });
  });

  it('should validate expected status codes', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 404,
      text: jest.fn().mockResolvedValueOnce('Not Found')
    });

    await expect(fetchJson('https://api.example.com/missing', {
      expectedStatuses: [200],
      retries: 0 // No retries to speed up test
    })).rejects.toThrow('HTTP 404: Not Found');
  });

  it('should handle timeout', async () => {
    // Create a promise that never resolves to simulate timeout
    global.fetch.mockImplementationOnce(() => new Promise(() => {}));

    const promise = fetchJson('https://api.example.com/slow', {
      timeout: 100 // Fast timeout for testing
    });

    jest.advanceTimersByTime(100);
    
    await expect(promise).rejects.toThrow('Request timeout after 100ms');
  });

  it('should include context in error messages', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network failure'));

    try {
      await fetchJson('https://api.example.com/fail', {
        context: { area: 'test', action: 'contextTest' },
        retries: 0 // No retries for faster test
      });
    } catch (error) {
      expect(error.context).toEqual({
        area: 'test',
        action: 'contextTest',
        url: 'https://api.example.com/fail',
        method: 'GET',
        attemptNum: 1,
        originalError: 'Network failure'
      });
    }
  });

  it('should deduplicate concurrent requests with same key', async () => {
    const mockResponse = { id: 123 };
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    const dedupeKey = 'test-dedupe-key';
    const [result1, result2] = await Promise.all([
      fetchJson('https://api.example.com/data', { dedupeKey }),
      fetchJson('https://api.example.com/data', { dedupeKey })
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1); // Only one actual request
    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
  });
});