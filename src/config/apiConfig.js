const apiConfig = {
  apis: {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      timeout: 30000,
      models: {
        default: 'gpt-4',
        fallback: 'gpt-3.5-turbo',
      },
      maxTokens: 4096,
      temperature: 0.7,
    },
    elevenlabs: {
      baseUrl: 'https://api.elevenlabs.io/v1',
      timeout: 60000,
      voices: {
        english: [
          { id: 'dllHSct4GokGc1AH9JwT', name: 'Haseeb' },
          { id: 'oAoF4NpW2Aqxplg9HdYB', name: 'Stephanie' },
        ],
        french: [
          { id: 'j9RedbMRSNQ74PyikQwD', name: 'Louis' },
          { id: 'gCux0vt1cPsEXPNSbchu', name: 'Anna' },
        ],
      },
      audioFormat: 'mp3',
      optimizeLatency: true,
    },
    bgg: {
      baseUrl: 'https://boardgamegeek.com/xmlapi2',
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000,
      endpoints: {
        search: '/search',
        thing: '/thing',
        images: '/images',
      },
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com/v1',
      timeout: 30000,
      model: 'claude-2',
      maxTokens: 4096,
    },
    bing: {
      baseUrl: 'https://api.bing.microsoft.com',
      timeout: 10000,
      searchType: 'Images',
      market: 'en-US',
      count: 50,
    },
    cohere: {
      baseUrl: 'https://api.cohere.ai/v1',
      timeout: 30000,
      model: 'command-nightly',
      maxTokens: 2048,
    },
    unsplash: {
      baseUrl: 'https://api.unsplash.com',
      timeout: 10000,
      perPage: 30,
      orientation: 'landscape',
    },
    imageExtractor: {
      baseUrl: 'https://api.image-extractor.com/v1',
      timeout: 60000,
      formats: ['jpg', 'png'],
      minQuality: 80,
    },
  },
  defaults: {
    // ...existing defaults code...
  },
  video: {
    format: {
      container: 'mp4',
      codec: 'h264',
      quality: 'high',
      bitrate: '5000k',
    },
    sections: {
      intro: { duration: 5 },
      setup: { duration: 'auto' },
      gameplay: { duration: 'auto' },
      conclusion: { duration: 3 },
    },
    transitions: {
      type: 'fade',
      duration: 0.5,
    },
  },
  storage: {
    projectPath: './projects',
    tempPath: './temp',
    assetsPath: './assets',
    maxProjectSize: 1024 * 1024 * 500, // 500MB
  },
};

export default apiConfig;
