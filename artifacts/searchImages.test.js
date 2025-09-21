// client/src/api/__tests__/searchImages.test.js
import { searchImages } from '../searchImages';
import { fetchJson } from '../../utils/fetchJson';

// Mock fetchJson
jest.mock('../../utils/fetchJson');

describe('searchImages', () => {
  const mockAddToast = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns search results on success', async () => {
    const mockResponse = { 
      ok: true, 
      images: [
        { id: '1', name: 'image1.jpg' },
        { id: '2', name: 'image2.jpg' }
      ] 
    };
    fetchJson.mockResolvedValue(mockResponse);
    
    const res = await searchImages({
      apiBase: 'http://localhost:5001',
      query: { gameName: 'Sample Game', pageLimit: 2 },
      addToast: mockAddToast
    });
    
    expect(res).toEqual(mockResponse);
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
        timeoutMs: 20000,
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
});