// client/src/api/__tests__/extractBggHtml.test.js
import { fetchJson } from '../../utils/fetchJson';
import { extractBggHtml } from '../extractBggHtml';

// Mock fetchJson
jest.mock('../../utils/fetchJson');

describe('extractBggHtml', () => {
  const mockApiBase = 'http://localhost:3001';
  const mockBggUrl = 'https://boardgamegeek.com/boardgame/12345/test-game';
  const mockAddToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed html on success', async () => {
    const mockResponse = {
      metadata: {
        title: 'Test Game',
        bgg_id: '12345',
      },
    };

    fetchJson.mockResolvedValue(mockResponse);

    const result = await extractBggHtml({
      apiBase: mockApiBase,
      bggUrl: mockBggUrl,
      addToast: mockAddToast,
    });

    expect(result).toEqual(mockResponse);
    expect(fetchJson).toHaveBeenCalledWith(
      `${mockApiBase}/api/extract-bgg-html`,
      {
        method: 'POST',
        body: { bggUrl: mockBggUrl },
        toast: { addToast: mockAddToast, dedupeKey: 'extract-bgg-html' },
        errorContext: { area: 'extract', action: 'bgg-html' },
        retries: 2,
        retryBackoffMs: 300,
        timeoutMs: 20000,
      }
    );
  });

  it('throws mapped error on failure', async () => {
    const mockError = new Error('Network error');
    mockError.code = 'NETWORK_ERROR';

    fetchJson.mockRejectedValue(mockError);

    await expect(
      extractBggHtml({
        apiBase: mockApiBase,
        bggUrl: mockBggUrl,
        addToast: mockAddToast,
      })
    ).rejects.toThrow('Network error');

    // fetchJson should handle toasting the error
    expect(fetchJson).toHaveBeenCalledWith(
      `${mockApiBase}/api/extract-bgg-html`,
      {
        method: 'POST',
        body: { bggUrl: mockBggUrl },
        toast: { addToast: mockAddToast, dedupeKey: 'extract-bgg-html' },
        errorContext: { area: 'extract', action: 'bgg-html' },
        retries: 2,
        retryBackoffMs: 300,
        timeoutMs: 20000,
      }
    );
  });
});
