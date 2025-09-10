import UnsplashService from '../UnsplashService';
import ApiError from '../../utils/errors/ApiError';
import LoggingService from '../../utils/logging/LoggingService';

jest.mock('../../utils/logging/LoggingService');

describe('UnsplashService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      baseUrl: 'https://api.unsplash.com',
      perPage: 10,
      orientation: 'landscape'
    };
    service = new UnsplashService(mockConfig);
  });

  describe('searchImages', () => {
    const mockQuery = 'board games';
    const mockImages = [
      { id: '1', urls: { regular: 'image1.jpg' } },
      { id: '2', urls: { regular: 'image2.jpg' } }
    ];

    it('should search images successfully', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ results: mockImages })
      };

      service.fetchWithTimeout = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.searchImages(mockQuery);

      expect(result).toEqual(mockImages);
      expect(service.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(mockQuery)),
        expect.objectContaining({
          headers: {
            'Authorization': expect.stringContaining('Client-ID')
          }
        })
      );
      expect(LoggingService.info).toHaveBeenCalledWith(
        'UnsplashService',
        'Image search successful'
      );
    });

    it('should handle search errors', async () => {
      service.fetchWithTimeout = jest.fn().mockRejectedValue(
        new Error('Search failed')
      );

      await expect(service.searchImages(mockQuery))
        .rejects
        .toThrow(ApiError);

      expect(LoggingService.error).toHaveBeenCalled();
    });
  });

  describe('getRandomImage', () => {
    const mockQuery = 'board games';
    const mockImage = { id: '1', urls: { regular: 'image1.jpg' } };

    it('should fetch random image successfully', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue(mockImage)
      };

      service.fetchWithTimeout = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.getRandomImage(mockQuery);

      expect(result).toEqual(mockImage);
      expect(service.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('random'),
        expect.any(Object)
      );
      expect(LoggingService.info).toHaveBeenCalledWith(
        'UnsplashService',
        'Random image fetch successful'
      );
    });

    it('should handle fetch errors', async () => {
      service.fetchWithTimeout = jest.fn().mockRejectedValue(
        new Error('Fetch failed')
      );

      await expect(service.getRandomImage(mockQuery))
        .rejects
        .toThrow(ApiError);

      expect(LoggingService.error).toHaveBeenCalled();
    });
  });
});