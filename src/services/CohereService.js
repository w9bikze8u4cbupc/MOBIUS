import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';

import BaseApiService from './BaseApiService';

class CohereService extends BaseApiService {
  constructor(config) {
    super(config);
    this.model = config.model;
    this.maxTokens = config.maxTokens;

    this.validateConfig(['model', 'maxTokens']);
  }

  async generateText(prompt) {
    try {
      LoggingService.debug(this.serviceName, 'Generating text', { prompt });

      const url = this.buildUrl('/generate');
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          max_tokens: this.maxTokens,
        }),
      });

      const data = await this.handleResponse(response);
      LoggingService.info(this.serviceName, 'Text generation successful');
      return data.generations[0].text;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Text generation failed', error);
      throw error instanceof ApiError
        ? error
        : new ApiError(this.serviceName, 'Failed to generate text', 500, error);
    }
  }
}

export default CohereService;
