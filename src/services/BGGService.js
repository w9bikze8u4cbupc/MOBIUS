import BaseApiService from './BaseApiService';
import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';
import { XMLParser } from 'fast-xml-parser';

class BGGService extends BaseApiService {
  constructor(config) {
    super(config);
    this.endpoints = config.endpoints;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.xmlParser = new XMLParser();
    
    this.validateConfig(['endpoints', 'retryAttempts', 'retryDelay']);
  }

  async searchGame(query) {
    try {
      LoggingService.debug(this.serviceName, 'Searching game', { query });
      
      const url = this.buildUrl(`${this.endpoints.search}?query=${encodeURIComponent(query)}&type=boardgame`);
      const response = await this.fetchWithRetry(url);
      const xmlData = await response.text();
      
      const result = this.xmlParser.parse(xmlData);
      LoggingService.info(this.serviceName, 'Game search successful');
      return result;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Game search failed', error);
      throw error instanceof ApiError ? error : new ApiError(
        this.serviceName,
        'Failed to search game',
        500,
        error
      );
    }
  }

  async getGameDetails(gameId) {
    try {
      LoggingService.debug(this.serviceName, 'Fetching game details', { gameId });
      
      const url = this.buildUrl(`${this.endpoints.thing}?id=${gameId}&stats=1`);
      const response = await this.fetchWithRetry(url);
      const xmlData = await response.text();
      
      const result = this.xmlParser.parse(xmlData);
      LoggingService.info(this.serviceName, 'Game details fetched successfully');
      return result;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Failed to fetch game details', error);
      throw error instanceof ApiError ? error : new ApiError(
        this.serviceName,
        'Failed to get game details',
        500,
        error
      );
    }
  }

  async fetchWithRetry(url, attempt = 1) {
    try {
      const response = await this.fetchWithTimeout(url);
      
      if (response.status === 202 && attempt <= this.retryAttempts) {
        LoggingService.debug(this.serviceName, `Retrying request (${attempt}/${this.retryAttempts})`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.fetchWithRetry(url, attempt + 1);
      }
      
      return response;
    } catch (error) {
      if (attempt <= this.retryAttempts) {
        LoggingService.warn(this.serviceName, `Request failed, retrying (${attempt}/${this.retryAttempts})`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.fetchWithRetry(url, attempt + 1);
      }
      throw error;
    }
  }
}

export default BGGService;