// Mock API responses for CI mode
const MOCK_MODE = process.env.MOBIUS_MODE === 'mock' || process.env.NODE_ENV === 'ci';

const mockResponses = {
  health: {
    status: 'healthy',
    mode: MOCK_MODE ? 'mock' : 'production',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  },
  
  bggComponents: {
    success: true,
    gameId: '1',
    components: [
      { name: 'Game Board', quantity: 1, selected: true },
      { name: 'Player Cards', quantity: 52, selected: true },
      { name: 'Resource Tokens', quantity: 30, selected: true },
      { name: 'Wooden Meeples', quantity: 24, selected: true },
      { name: 'Dice', quantity: 6, selected: true },
      { name: 'Rulebook', quantity: 1, selected: true }
    ],
    extractedAt: new Date().toISOString()
  },
  
  extractComponents: {
    success: true,
    components: [
      { name: 'Mock Card Set', quantity: 40, selected: true, confidence: 0.9, parseMethod: 'mock' },
      { name: 'Mock Tokens', quantity: 20, selected: true, confidence: 0.8, parseMethod: 'mock' },
      { name: 'Mock Board', quantity: 1, selected: true, confidence: 0.95, parseMethod: 'mock' }
    ],
    extractionMethod: 'mock_data',
    extractionStats: {
      totalLines: 100,
      headerFound: true,
      headerLine: 'Components:',
      componentLinesFound: 3,
      fallbackUsed: false,
      processingSteps: ['Mock extraction completed'],
      finalComponentCount: 3,
      averageConfidence: 0.88
    },
    message: 'Mock extraction completed successfully'
  },
  
  bggMetadata: {
    success: true,
    metadata: {
      title: 'Mock Board Game',
      publisher: ['Mock Publisher'],
      player_count: '2-4',
      play_time: '45-60 min',
      min_age: '10+',
      theme: 'Strategy',
      mechanics: ['Card Drafting', 'Set Collection'],
      designers: ['Mock Designer'],
      artists: ['Mock Artist'],
      description: 'A mock board game for testing purposes.',
      average_rating: '7.5',
      bgg_rank: '100',
      bgg_id: '1',
      cover_image: 'https://example.com/mock-image.jpg',
      thumbnail: 'https://example.com/mock-thumb.jpg'
    }
  }
};

function isMockMode() {
  return MOCK_MODE;
}

function getMockResponse(endpoint) {
  return mockResponses[endpoint] || { error: 'Mock response not defined for ' + endpoint };
}

module.exports = {
  isMockMode,
  getMockResponse,
  mockResponses
};