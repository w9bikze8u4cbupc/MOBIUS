import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';

import BaseApiService from './BaseApiService';

class ImageExtractorService extends BaseApiService {
  constructor(config) {
    super(config);
    this.formats = config.formats;
    this.minQuality = config.minQuality;

    this.validateConfig(['formats', 'minQuality']);
  }

  async extractImagesFromPDF(pdfBuffer) {
    try {
      LoggingService.debug(this.serviceName, 'Extracting images from PDF');

      const url = this.buildUrl('/extract');
      const formData = new FormData();
      formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }));
      formData.append('formats', JSON.stringify(this.formats));
      formData.append('minQuality', this.minQuality);

      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.IMAGE_EXTRACTOR_API_KEY}`,
        },
        body: formData,
      });

      const data = await this.handleResponse(response);
      LoggingService.info(this.serviceName, 'Image extraction successful');
      return data.images;
    } catch (error) {
      LoggingService.error(this.serviceName, 'Image extraction failed', error);
      throw error instanceof ApiError
        ? error
        : new ApiError(this.serviceName, 'Failed to extract images', 500, error);
    }
  }

  async enhanceImage(imageBuffer) {
    try {
      LoggingService.debug(this.serviceName, 'Enhancing image');

      const url = this.buildUrl('/enhance');
      const formData = new FormData();
      formData.append('image', new Blob([imageBuffer]));
      formData.append('quality', this.minQuality);

      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.IMAGE_EXTRACTOR_API_KEY}`,
        },
        body: formData,
      });

      LoggingService.info(this.serviceName, 'Image enhancement successful');
      return response.arrayBuffer();
    } catch (error) {
      LoggingService.error(this.serviceName, 'Image enhancement failed', error);
      throw error instanceof ApiError
        ? error
        : new ApiError(this.serviceName, 'Failed to enhance image', 500, error);
    }
  }
}

export default ImageExtractorService;
