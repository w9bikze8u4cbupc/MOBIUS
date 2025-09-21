import ApiError from '../../utils/errors/ApiError';
import LoggingService from '../../utils/logging/LoggingService';
import AnthropicService from '../AnthropicService';

jest.mock('../../utils/logging/LoggingService');

describe('AnthropicService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-2',
      maxTokens: 1000,
    };
    service = new AnthropicService(mockConfig);
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(service.model).toBe(mockConfig.model);
      expect(service.maxTokens).toBe(mockConfig.maxTokens);
    });

    it('should throw error if required config is missing', () => {
      expect(() => new AnthropicService({})).toThrow(ApiError);
    });
  });

  describe('generateText', () => {
    const mockPrompt = 'Test prompt';
    const mockResponse = { content: 'Generated text' };

    it('should generate text successfully', async () => {
      const mockApiResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn().mockResolvedValue(mockResponse),
      };

      service.fetchWithTimeout = jest.fn().mockResolvedValue(mockApiResponse);

      const result = await service.generateText(mockPrompt);

      expect(result).toBe(mockResponse.content);
      expect(service.fetchWithTimeout).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining(mockPrompt),
        }),
      );
      expect(LoggingService.info).toHaveBeenCalledWith(
        'AnthropicService',
        'Text generation successful',
      );
    });

    it('should handle API errors', async () => {
      service.fetchWithTimeout = jest.fn().mockRejectedValue(new Error('API Error'));

      await expect(service.generateText(mockPrompt)).rejects.toThrow(ApiError);

      expect(LoggingService.error).toHaveBeenCalled();
    });
  });
});
