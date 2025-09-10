import BaseApiService from './BaseApiService';
import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';

class AnthropicService extends BaseApiService {
  constructor(config) {
    super(config);
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    
    this.validateConfig(['model', 'maxTokens']);
  }

  async generateText(prompt) {
    try {
      LoggingService.debug(this.serviceName, 'Generating text', { prompt });
      
      const url = this.buildUrl('/messages');
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ANTHROPIC_API_KEY
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: this.maxTokens
        })
      });

      const data = await this.handleResponse(response);
      LoggingService.info(this.serviceName, 'Text generation successful');
      return data.content;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Text generation failed', error);
      throw error instanceof ApiError ? error : new ApiError(
        this.serviceName,
        'Failed to generate text',
        500,
        error
      );
    }
  }
}

export default AnthropicService;