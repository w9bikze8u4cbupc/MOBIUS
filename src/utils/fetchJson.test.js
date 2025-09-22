import fetchJson from './fetchJson.js';
import { Readable } from 'stream';

// Mock fetch for testing
global.fetch = jest.fn();

describe('fetchJson (Server)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set default User-Agent for server requests', async () => {
    const mockResponse = { test: 'data' };
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await fetchJson('https://api.example.com/data');

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'GET',
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
      signal: expect.any(AbortSignal)
    });
  });

  it('should handle stream response type for Node.js', async () => {
    const mockStream = new ReadableStream();
    global.fetch.mockResolvedValueOnce({
      status: 200,
      body: mockStream
    });

    const result = await fetchJson('https://api.example.com/stream', {
      responseType: 'stream'
    });

    expect(result).toBeInstanceOf(Readable);
  });

  it('should preserve custom User-Agent when provided', async () => {
    const mockResponse = { test: 'data' };
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await fetchJson('https://api.example.com/data', {
      headers: { 'User-Agent': 'CustomBot/2.0' }
    });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'GET',
      headers: { 'User-Agent': 'CustomBot/2.0' },
      signal: expect.any(AbortSignal)
    });
  });

  it('should handle XML response type correctly', async () => {
    const xmlData = '<?xml version="1.0"?><root><item>test</item></root>';
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: jest.fn().mockResolvedValueOnce(xmlData)
    });

    const result = await fetchJson('https://boardgamegeek.com/xmlapi2/thing?id=1', {
      responseType: 'xml',
      headers: { 'User-Agent': 'TestBot/1.0' }
    });

    expect(result).toBe(xmlData);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://boardgamegeek.com/xmlapi2/thing?id=1',
      {
        method: 'GET',
        headers: { 'User-Agent': 'TestBot/1.0' },
        signal: expect.any(AbortSignal)
      }
    );
  });

  it('should handle POST requests with API keys', async () => {
    const mockResponse = { id: 'extraction-123' };
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await fetchJson('https://api.extract.pics/v0/extractions', {
      method: 'POST',
      body: { url: 'https://example.com', mode: 'basic' },
      bearerToken: 'test-api-key'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.extract.pics/v0/extractions',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'User-Agent': 'BoardGameTutorialGenerator/1.0'
        },
        body: JSON.stringify({ url: 'https://example.com', mode: 'basic' }),
        signal: expect.any(AbortSignal)
      }
    );
  });

  it('should handle arrayBuffer response for audio data', async () => {
    const audioBuffer = new ArrayBuffer(1024);
    global.fetch.mockResolvedValueOnce({
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValueOnce(audioBuffer)
    });

    const result = await fetchJson('https://api.elevenlabs.io/v1/text-to-speech/voice123', {
      method: 'POST',
      body: { text: 'Hello world', model_id: 'eleven_multilingual_v2' },
      headers: { 'xi-api-key': 'test-key' },
      responseType: 'arrayBuffer'
    });

    expect(result).toBe(audioBuffer);
  });

  it('should retry with proper backoff and context', async () => {
    const networkError = new Error('ECONNREFUSED');
    global.fetch
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValueOnce({ success: true })
      });

    const promise = fetchJson('https://api.example.com/retry-test', {
      retries: 2,
      retryDelay: 500,
      context: { area: 'bgg', action: 'fetchAPI' }
    });

    jest.advanceTimersByTime(500); // First retry
    await Promise.resolve();
    jest.advanceTimersByTime(1000); // Second retry (exponential backoff)
    
    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});