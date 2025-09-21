// client/src/api/__tests__/searchImages.test.js
import { searchImages } from '../searchImages';
import { fetchJson } from '../../utils/fetchJson';

// Mock fetchJson
jest.mock('../../utils/fetchJson');

describe('searchImages', () => {
  const mockApiBase = 'http://localhost:3001';
  const mockQuery = { gameName: 'Test Game', pageLimit: 2 };
  const mockAddToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns search results on success', async () => {
    const mockResponse = { 
      images: [
        { id: '1', url: 'http://example.com/image1.jpg' },
        { id: '2', url: 'http://example.com/image2.jpg' }
      ]
    };
    
    fetchJson.mockResolvedValue(mockResponse);
    
    const result = await searchImages({ 
      apiBase: mockApiBase, 
      query: mockQuery, 
      addToast: mockAddToast 
    });
    
    expect(result).toEqual(mockResponse);
    expect(fetchJson).toHaveBeenCalledWith(`${mockApiBase}/api/search-images`, {
      method: 'POST',
      body: mockQuery,
      toast: { addToast: mockAddToast, dedupeKey: 'search-images' },
      errorContext: { area: 'search', action: 'images' },
      retries: 2,
      retryBackoffMs: 300,
      timeoutMs: 20000,
    });
  });

  it('throws mapped error on failure', async () => {
    const mockError = new Error('Search failed');
    mockError.code = 'SEARCH_ERROR';
    
    fetchJson.mockRejectedValue(mockError);
    
    await expect(searchImages({ 
      apiBase: mockApiBase, 
      query: mockQuery, 
      addToast: mockAddToast 
    })).rejects.toThrow('Search failed');
    
    // fetchJson should handle toasting the error
    expect(fetchJson).toHaveBeenCalledWith(`${mockApiBase}/api/search-images`, {
      method: 'POST',
      body: mockQuery,
      toast: { addToast: mockAddToast, dedupeKey: 'search-images' },
      errorContext: { area: 'search', action: 'images' },
      retries: 2,
      retryBackoffMs: 300,
      timeoutMs: 20000,
    });
  });
});