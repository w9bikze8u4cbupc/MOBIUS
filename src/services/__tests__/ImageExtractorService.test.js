import ServiceName from '../ServiceName';
import ApiError from '../../utils/errors/ApiError';
import LoggingService from '../../utils/logging/LoggingService';

// Mock dependencies
jest.mock('../../utils/logging/LoggingService');

describe('ImageExtractorService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    // Reset mocks between tests
    jest.clearAllMocks();
    
    mockConfig = {
      baseUrl: 'https://api.image-extractor.com',
      timeout: 30000,
      formats: ['jpg', 'png'],
      minQuality: 80
    };
    
    service = new ImageExtractorService(mockConfig);
  });

  describe('extractImagesFromPDF', () => {
    const mockPdfBuffer = Buffer.from('mock pdf content');
    const mockImages = ['image1.jpg', 'image2.png'];

    it('should successfully extract images from PDF', async () => {
      // Mock successful API response
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: () => Promise.resolve({ images: mockImages })
      };

      service.fetchWithTimeout = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.extractImagesFromPDF(mockPdfBuffer);

      expect(result).toEqual(mockImages);
      expect(service.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/extract'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );
      expect(LoggingService.info).toHaveBeenCalledWith(
        'ImageExtractorService',
        'Image extraction successful'
      );
    });

    it('should handle API errors gracefully', async () => {
      // Mock API error
      const errorMessage = 'API Error';
      service.fetchWithTimeout = jest.fn().mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(service.extractImagesFromPDF(mockPdfBuffer))
        .rejects
        .toThrow(ApiError);

      expect(LoggingService.error).toHaveBeenCalledWith(
        'ImageExtractorService',
        'Image extraction failed',
        expect.any(Error)
      );
    });
  });

  describe('enhanceImage', () => {
    const mockImageBuffer = Buffer.from('mock image data');
    const mockEnhancedBuffer = new ArrayBuffer(8);

    it('should successfully enhance image', async () => {
      service.fetchWithTimeout = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockEnhancedBuffer)
      });

      const result = await service.enhanceImage(mockImageBuffer);

      expect(result).toBe(mockEnhancedBuffer);
      expect(service.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/enhance'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should handle enhancement errors', async () => {
      service.fetchWithTimeout = jest.fn().mockRejectedValue(
        new Error('Enhancement failed')
      );

      await expect(service.enhanceImage(mockImageBuffer))
        .rejects
        .toThrow(ApiError);
    });
  });
});