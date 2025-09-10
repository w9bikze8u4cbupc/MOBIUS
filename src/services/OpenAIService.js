import BaseApiService from './BaseApiService';
import LoggingService from '../utils/logging/LoggingService';
import ApiError from '../utils/errors/ApiError';

class OpenAIService extends BaseApiService {
  constructor(config) {
    super(config);
    this.model = config.models?.default;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
    
    // Validate required configuration
    this.validateConfig(['model', 'maxTokens']);
  }

  async generateText(prompt) {
    try {
      LoggingService.debug(this.serviceName, 'Generating text', { prompt });
      
      const url = this.buildUrl('/chat/completions');
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: this.maxTokens,
          temperature: this.temperature
        })
      });

      const data = await this.handleResponse(response);
      
      if (!data.choices?.[0]?.message?.content) {
        throw new ApiError(
          this.serviceName,
          'Invalid response format from OpenAI',
          500
        );
      }

      LoggingService.info(this.serviceName, 'Text generation successful');
      return data.choices[0].message.content;
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

  async validateApiKey() {
    try {
      const url = this.buildUrl('/models');
      await this.fetchWithTimeout(url, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });
      return true;
    } catch (error) {
      LoggingService.error(this.serviceName, 'API key validation failed', error);
      return false;
    }
  }
}

export default OpenAIService;