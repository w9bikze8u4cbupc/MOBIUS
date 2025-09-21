// client/src/api/__tests__/extractBggHtml.test.js
import { extractBggHtml } from '../extractBggHtml';
import { fetchJson } from '../../utils/fetchJson';

// Mock fetchJson
jest.mock('../../utils/fetchJson');

describe('extractBggHtml', () => {
  const mockAddToast = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed html on success', async () => {
    const mockResponse = { 
      ok: true, 
      json: { title: 'Sample Game', metadata: { bgg_id: '12345' } } 
    };
    fetchJson.mockResolvedValue(mockResponse);
    
    const res = await extractBggHtml({
      apiBase: 'http://localhost:5001',
      bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game',
      addToast: mockAddToast
    });
    
    expect(res).toEqual(mockResponse);
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
        timeoutMs: 20000,
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
});