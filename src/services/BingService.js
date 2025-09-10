import BaseApiService from './BaseApiService';
import LoggingService from '../utils/logging/LoggingService';
import ApiError from '../utils/errors/ApiError';

class BingService extends BaseApiService {
  constructor(config) {
    super(config);
    this.searchType = config.searchType;
    this.market = config.market;
    this.count = config.count;
    
    this.validateConfig(['searchType', 'market', 'count']);
  }

  async searchImages(query, filter = {}) {
    try {
      LoggingService.debug(this.serviceName, 'Searching images', { query, filter });
      
      const queryParams = new URLSearchParams({
        q: query,
        count: this.count,
        mkt: this.market,
        ...filter
      });

      const url = this.buildUrl(`/images/search?${queryParams}`);
      const response = await this.fetchWithTimeout(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY
        }
      });

      const data = await this.handleResponse(response);
      LoggingService.info(this.serviceName, 'Image search successful');
      return data.value;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Image search failed', error);
      throw error instanceof ApiError ? error : new ApiError(
        this.serviceName,
        'Failed to search images',
        500,
        error
      );
    }
  }
}

export default BingService;