import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';

import BaseApiService from './BaseApiService';

class UnsplashService extends BaseApiService {
  constructor(config) {
    super(config);
    this.perPage = config.perPage;
    this.orientation = config.orientation;

    this.validateConfig(['perPage', 'orientation']);
  }

  async searchImages(query) {
    try {
      LoggingService.debug(this.serviceName, 'Searching images', { query });

      const url = this.buildUrl(
        `/search/photos?query=${encodeURIComponent(query)}&per_page=${this.perPage}&orientation=${this.orientation}`,
      );
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        },
      });

      const data = await this.handleResponse(response);
      LoggingService.info(this.serviceName, 'Image search successful');
      return data.results;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Image search failed', error);
      throw error instanceof ApiError
        ? error
        : new ApiError(this.serviceName, 'Failed to search images', 500, error);
    }
  }

  async getRandomImage(query) {
    try {
      LoggingService.debug(this.serviceName, 'Fetching random image', { query });

      const url = this.buildUrl(
        `/photos/random?query=${encodeURIComponent(query)}&orientation=${this.orientation}`,
      );
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        },
      });

      const data = await this.handleResponse(response);
      LoggingService.info(this.serviceName, 'Random image fetch successful');
      return data;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Random image fetch failed', error);
      throw error instanceof ApiError
        ? error
        : new ApiError(this.serviceName, 'Failed to get random image', 500, error);
    }
  }
}

export default UnsplashService;
