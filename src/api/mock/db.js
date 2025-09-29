// Mock database module for containerized API
export default {
  get: (query, params, callback) => {
    // Mock response for project queries
    callback(null, {
      id: 1,
      name: 'Mock Project',
      metadata: '{}',
      components: '[]',
      images: '[]',
      script: '',
      audio: '',
      created_at: new Date().toISOString()
    });
  }
};