// client/src/api/__tests__/searchImages.test.js
import { searchImages } from '../searchImages';
import { fetchJson } from '../../utils/fetchJson';

// Mock fetchJson
jest.mock('../../utils/fetchJson');

describe('searchImages', () => {
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

  it('returns search results on success', async () => {
    const mockResponse = { 
      data: {
        images: [
          { id: '1', name: 'image1.jpg' },
          { id: '2', name: 'image2.jpg' }
        ]
      },
      status: 200,
      timing: 120,
      attempts: 1
    };
    fetchJson.mockResolvedValue(mockResponse);
    
    const res = await searchImages({
      apiBase: 'http://localhost:5001',
      query: { gameName: 'Sample Game', pageLimit: 2 },
      addToast: mockAddToast
    });
    
    expect(res).toEqual(mockResponse.data);
    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:5001/api/search-images',
      {
        method: 'POST',
        body: { 
          gameName: 'Sample Game', 
          pageLimit: 2 
        },
        toast: { 
          addToast: mockAddToast, 
          dedupeKey: 'search-images' 
        },
        errorContext: { 
          area: 'search', 
          action: 'images' 
        },
        retries: 2,
        retryBackoffMs: 300,
        maxTimeout: 20000,
      }
    );
  });

  it('throws mapped error on failure', async () => {
    const mockError = new Error('Search failed');
    mockError.code = 'SEARCH_ERROR';
    fetchJson.mockRejectedValue(mockError);
    
    await expect(
      searchImages({
        apiBase: 'http://localhost:5001',
        query: { gameName: 'Sample Game', pageLimit: 2 },
        addToast: mockAddToast
      })
    ).rejects.toMatchObject({ code: 'SEARCH_ERROR' });
  });
  
  it('retries on network failure and eventually succeeds', async () => {
    const mockResponse = { 
      data: {
        images: [
          { id: '1', name: 'image1.jpg' },
          { id: '2', name: 'image2.jpg' }
        ]
      },
      status: 200,
      timing: 180,
      attempts: 2
    };
    
    // Fail once, then succeed
    fetchJson
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(mockResponse);
    
    // Call the function
    const promise = searchImages({
      apiBase: 'http://localhost:5001',
      query: { gameName: 'Sample Game', pageLimit: 2 },
      addToast: mockAddToast
    });
    
    // Fast-forward through the retry
    await jest.advanceTimersByTimeAsync(500);
    
    // Wait for the promise to resolve
    const res = await promise;
    
    // Should have retried once and succeeded
    expect(res).toEqual(mockResponse.data);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
  
  it('deduplicates toast messages for repeated errors', async () => {
    const mockError = new Error('Search failed');
    mockError.code = 'SEARCH_ERROR';
    fetchJson.mockRejectedValue(mockError);
    
    // Call the function twice with the same parameters
    await searchImages({
      apiBase: 'http://localhost:5001',
      query: { gameName: 'Sample Game', pageLimit: 2 },
      addToast: mockAddToast
    }).catch(() => {});
    
    await searchImages({
      apiBase: 'http://localhost:5001',
      query: { gameName: 'Sample Game', pageLimit: 2 },
      addToast: mockAddToast
    }).catch(() => {});
    
    // Should have called addToast twice, but with the same dedupeKey
    expect(mockAddToast).toHaveBeenCalledTimes(2);
    expect(mockAddToast).toHaveBeenCalledWith({
      variant: 'error',
      message: expect.any(String),
      dedupeKey: 'search-images'
    });
  });
});