import BaseApiService from './BaseApiService';
import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';
import BGGCache from '../utils/cache/BGGCache.js';
import { XMLParser } from 'fast-xml-parser';
import { bggRateLimiter } from '../utils/rateLimiter.js';

class BGGService extends BaseApiService {
  constructor(config) {
    super(config);
    this.endpoints = config.endpoints;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.xmlParser = new XMLParser();
    this.cache = new BGGCache();
    this.cacheTtl = config.cacheTtl || 300000; // 5 minutes default
    
    this.validateConfig(['endpoints', 'retryAttempts', 'retryDelay']);
  }

  async searchGame(query) {
    try {
      LoggingService.debug(this.serviceName, 'Searching game', { query });
      
      // Apply rate limiting
      const rateLimitResult = await bggRateLimiter.consume(1);
      if (!rateLimitResult.success) {
        // Throw rate limited error that can be handled by the calling function
        throw new ApiError(
          this.serviceName,
          'Rate limit exceeded for BGG API',
          429
        );
      }
      
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
      // Try cache first
      const cached = this.cache.get(gameId, this.cacheTtl);
      if (cached) {
        LoggingService.info(this.serviceName, 'Game details fetched from cache', { gameId });
        return cached;
      }

      LoggingService.debug(this.serviceName, 'Fetching game details', { gameId });
      
      // Apply rate limiting
      const rateLimitResult = await bggRateLimiter.consume(1);
      if (!rateLimitResult.success) {
        throw new ApiError(
          this.serviceName,
          'Rate limit exceeded for BGG API',
          429
        );
      }
      
      const url = this.buildUrl(`${this.endpoints.thing}?id=${gameId}&stats=1`);
      const response = await this.fetchWithRetry(url);
      const xmlData = await response.text();
      
      const result = this.xmlParser.parse(xmlData);
      
      // Cache the result
      this.cache.set(gameId, result);
      
      LoggingService.info(this.serviceName, 'Game details fetched successfully', { gameId });
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
      // Add User-Agent header to respect BGG service limits
      const headers = {
        'User-Agent': 'MobiusGamesTutorialGenerator/1.0 (https://github.com/mobius-games/tutorial-generator)'
      };
      
      const response = await this.fetchWithTimeout(url, { headers });
      
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