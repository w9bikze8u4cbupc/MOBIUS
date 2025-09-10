import apiConfig from '../config/apiConfig';
import OpenAIService from './OpenAIService';
import ElevenLabsService from './ElevenLabsService';
import BGGService from './BGGService';
import AnthropicService from './AnthropicService';
import BingService from './BingService';
import CohereService from './CohereService';
import UnsplashService from './UnsplashService';
import ImageExtractorService from './ImageExtractorService';
import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';

class ServiceFactory {
  static services = {};

  static getService(serviceName) {
    try {
      if (!this.services[serviceName]) {
        const config = apiConfig.apis[serviceName];
        
        if (!config) {
          throw new ApiError(
            'ServiceFactory',
            `Configuration not found for service: ${serviceName}`,
            404
          );
        }

        LoggingService.debug('ServiceFactory', `Initializing service: ${serviceName}`);
        
        switch (serviceName) {
          case 'openai':
            this.services[serviceName] = new OpenAIService(config);
            break;
          case 'elevenlabs':
            this.services[serviceName] = new ElevenLabsService(config);
            break;
          case 'bgg':
            this.services[serviceName] = new BGGService(config);
            break;
          case 'anthropic':
            this.services[serviceName] = new AnthropicService(config);
            break;
          case 'bing':
            this.services[serviceName] = new BingService(config);
            break;
          case 'cohere':
            this.services[serviceName] = new CohereService(config);
            break;
          case 'unsplash':
            this.services[serviceName] = new UnsplashService(config);
            break;
          case 'imageExtractor':
            this.services[serviceName] = new ImageExtractorService(config);
            break;
          default:
            throw new ApiError(
              'ServiceFactory',
              `Unknown service: ${serviceName}`,
              400
            );
        }
      }
      
      return this.services[serviceName];
    } catch (error) {
      LoggingService.error('ServiceFactory', `Failed to get service: ${serviceName}`, error);
      throw error instanceof ApiError ? error : new ApiError(
        'ServiceFactory',
        'Internal service factory error',
        500,
        error
      );
    }
  }

  static clearServices() {
    LoggingService.info('ServiceFactory', 'Clearing all service instances');
    this.services = {};
  }
}

export default ServiceFactory;