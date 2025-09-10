import BGGService from '../BGGService';
import ApiError from '../../utils/errors/ApiError';
import LoggingService from '../../utils/logging/LoggingService';
import { XMLParser } from 'fast-xml-parser';

jest.mock('../../utils/logging/LoggingService');
jest.mock('fast-xml-parser');

describe('BGGService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      baseUrl: 'https://boardgamegeek.com/xmlapi2',
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000
    };
    service = new BGGService(mockConfig);
  });

  describe('searchGame', () => {
    const mockQuery = 'Catan';
    const mockXmlData = '<items><item id="13"></item></items>';
    const mockParsedData = { items: { item: [{ id: '13' }] } };

    beforeEach(() => {
      XMLParser.prototype.parse.mockReturnValue(mockParsedData);
    });

    it('should search games successfully', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(mockXmlData)
      };

      service.fetchWithRetry = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.searchGame(mockQuery);

      expect(result).toEqual(mockParsedData);
      expect(service.fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(mockQuery))
      );
      expect(LoggingService.info).toHaveBeenCalledWith(
        'BGGService',
        'Game search successful'
      );
    });

    it('should handle search errors', async () => {
      service.fetchWithRetry = jest.fn().mockRejectedValue(
        new Error('Search failed')
      );

      await expect(service.searchGame(mockQuery))
        .rejects
        .toThrow(ApiError);

      expect(LoggingService.error).toHaveBeenCalled();
    });
  });

  describe('getGameDetails', () => {
    const mockGameId = '13';
    const mockXmlData = '<items><item id="13"><name>Catan</name></item></items>';
    const mockParsedData = { items: { item: [{ id: '13', name: 'Catan' }] } };

    beforeEach(() => {
      XMLParser.prototype.parse.mockReturnValue(mockParsedData);
    });

    it('should fetch game details successfully', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(mockXmlData)
      };

      service.fetchWithRetry = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.getGameDetails(mockGameId);

      expect(result).toEqual(mockParsedData);
      expect(service.fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining(mockGameId)
      );
      expect(LoggingService.info).toHaveBeenCalledWith(
        'BGGService',
        'Game details fetched successfully'
      );
    });

    it('should handle fetch errors', async () => {
      service.fetchWithRetry = jest.fn().mockRejectedValue(
        new Error('Fetch failed')
      );

      await expect(service.getGameDetails(mockGameId))
        .rejects
        .toThrow(ApiError);

      expect(LoggingService.error).toHaveBeenCalled();
    });
  });
});