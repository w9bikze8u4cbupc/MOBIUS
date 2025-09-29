// Minimal CI API server - simplified version for CI testing
const express = require('express');
const cors = require('cors');
const { isMockMode, getMockResponse } = require('./mock');

const app = express();
const port = process.env.PORT || 5001;

console.log('Starting MOBIUS API server in CI mode...');
console.log('Mock mode:', isMockMode());

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
  const healthData = getMockResponse('health');
  res.json(healthData);
});

// BGG Components endpoint (mock)
app.get('/api/bgg-components', (req, res) => {
  if (isMockMode()) {
    console.log('Running in mock mode - returning mock BGG components');
    return res.json(getMockResponse('bggComponents'));
  }
  
  res.status(501).json({ 
    error: 'BGG components endpoint not available in production mode without full dependencies' 
  });
});

// Extract components endpoint (mock)
app.post('/api/extract-components', (req, res) => {
  if (isMockMode()) {
    console.log('Running in mock mode - returning mock component extraction');
    return res.json(getMockResponse('extractComponents'));
  }
  
  res.status(501).json({ 
    error: 'Component extraction endpoint not available in production mode without full dependencies' 
  });
});

// Extract BGG HTML metadata endpoint (mock)
app.post('/api/extract-bgg-html', (req, res) => {
  if (isMockMode()) {
    console.log('Running in mock mode - returning mock BGG metadata');
    return res.json(getMockResponse('bggMetadata'));
  }
  
  res.status(501).json({ 
    error: 'BGG HTML extraction endpoint not available in production mode without full dependencies' 
  });
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /health',
      'GET /api/bgg-components',
      'POST /api/extract-components',
      'POST /api/extract-bgg-html'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 MOBIUS API server is running on port ${port}`);
  console.log(`📱 Mode: ${isMockMode() ? 'mock' : 'production'}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});