import ApiError from '../utils/errors/ApiError';
import LoggingService from '../utils/logging/LoggingService';

import BaseApiService from './BaseApiService';

class ElevenLabsService extends BaseApiService {
  constructor(config) {
    super(config);
    this.voices = config.voices;
    this.audioFormat = config.audioFormat;

    // Validate required configuration
    this.validateConfig(['voices', 'audioFormat']);
  }

  async generateSpeech(text, voiceId, language = 'english') {
    try {
      if (!this.voices[language]) {
        throw new ApiError(this.serviceName, `Unsupported language: ${language}`, 400);
      }

      LoggingService.debug(this.serviceName, 'Generating speech', { text, voiceId, language });

      const url = this.buildUrl('/text-to-speech');
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          voice_id: voiceId,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        throw new ApiError(this.serviceName, 'Speech generation failed', response.status);
      }

      LoggingService.info(this.serviceName, 'Speech generation successful');
      return response.arrayBuffer();
    } catch (error) {
      LoggingService.error(this.serviceName, 'Speech generation failed', error);
      throw error instanceof ApiError
        ? error
        : new ApiError(this.serviceName, 'Failed to generate speech', 500, error);
    }
  }

  getVoicesByLanguage(language) {
    return this.voices[language] || [];
  }
}

export default ElevenLabsService;
