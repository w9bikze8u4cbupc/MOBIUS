// client/src/api/__tests__/extractBggHtml.test.js
import { extractBggHtml } from '../extractBggHtml';
import { fetchJson } from '../../utils/fetchJson';

// Mock fetchJson
jest.mock('../../utils/fetchJson');

describe('extractBggHtml', () => {
  const mockAddToast = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Enable fake timers for testing retry behavior
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    // Reset to real timers after each test
    jest.useRealTimers();
  });

  it('returns parsed html on success', async () => {
    const mockResponse = { 
      data: { title: 'Sample Game', metadata: { bgg_id: '12345' } },
      status: 200,
      timing: 100,
      attempts: 1
    };
    fetchJson.mockResolvedValue(mockResponse);
    
    const res = await extractBggHtml({
      apiBase: 'http://localhost:5001',
      bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game',
      addToast: mockAddToast
    });
    
    expect(res).toEqual(mockResponse.data);
    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:5001/api/extract-bgg-html',
      {
        method: 'POST',
        body: { 
          bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game' 
        },
        toast: { 
          addToast: mockAddToast, 
          dedupeKey: 'extract-bgg-html' 
        },
        errorContext: { 
          area: 'extract', 
          action: 'bgg-html' 
        },
        retries: 2,
        retryBackoffMs: 300,
        maxTimeout: 20000,
      }
    );
  });

  it('throws mapped error on failure', async () => {
    const mockError = new Error('Network Error');
    mockError.code = 'NETWORK_ERROR';
    fetchJson.mockRejectedValue(mockError);
    
    await expect(
      extractBggHtml({
        apiBase: 'http://localhost:5001',
        bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game',
        addToast: mockAddToast
      })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
  
  it('retries on network failure and eventually succeeds', async () => {
    const mockResponse = { 
      data: { title: 'Sample Game', metadata: { bgg_id: '12345' } },
      status: 200,
      timing: 150,
      attempts: 3
    };
    
    // Fail twice, then succeed
    fetchJson
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(mockResponse);
    
    // Call the function
    const promise = extractBggHtml({
      apiBase: 'http://localhost:5001',
      bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game',
      addToast: mockAddToast
    });
    
    // Fast-forward through the retries
    await jest.advanceTimersByTimeAsync(1000);
    
    // Wait for the promise to resolve
    const res = await promise;
    
    // Should have retried twice and succeeded
    expect(res).toEqual(mockResponse.data);
    expect(fetchJson).toHaveBeenCalledTimes(3);
  });
  
  it('deduplicates toast messages for repeated errors', async () => {
    const mockError = new Error('Network Error');
    mockError.code = 'NETWORK_ERROR';
    fetchJson.mockRejectedValue(mockError);
    
    // Call the function twice with the same parameters
    await extractBggHtml({
      apiBase: 'http://localhost:5001',
      bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game',
      addToast: mockAddToast
    }).catch(() => {});
    
    await extractBggHtml({
      apiBase: 'http://localhost:5001',
      bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game',
      addToast: mockAddToast
    }).catch(() => {});
    
    // Should have called addToast twice, but with the same dedupeKey
    expect(mockAddToast).toHaveBeenCalledTimes(2);
    expect(mockAddToast).toHaveBeenCalledWith({
      variant: 'error',
      message: expect.any(String),
      dedupeKey: 'extract-bgg-html'
    });
  });
});