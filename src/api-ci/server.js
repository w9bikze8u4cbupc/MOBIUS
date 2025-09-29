import express from 'express';

const app = express();
const PORT = process.env.PORT || 5001;
const VERSION = process.env.npm_package_version || '0.1.0';

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: VERSION,
    mode: 'mock'
  });
});

// Ready check endpoint
app.get('/ready', (req, res) => {
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    version: VERSION,
    mode: 'mock'
  });
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'MOBIUS CI API',
    version: VERSION,
    description: 'Lightweight CI-only API for smoke testing',
    endpoints: [
      'GET /health',
      'GET /ready', 
      'GET /api/info',
      'POST /api/echo'
    ],
    timestamp: new Date().toISOString(),
    mode: 'mock'
  });
});

// Echo endpoint for testing POST requests
app.post('/api/echo', (req, res) => {
  res.json({
    success: true,
    echo: req.body,
    timestamp: new Date().toISOString(),
    method: 'POST',
    version: VERSION,
    mode: 'mock'
  });
});

// 404 handler for testing
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    version: VERSION
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    timestamp: new Date().toISOString(),
    version: VERSION
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MOBIUS CI API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Ready check: http://localhost:${PORT}/ready`);
  console.log(`ℹ️  API info: http://localhost:${PORT}/api/info`);
  console.log(`🔄 Echo endpoint: POST http://localhost:${PORT}/api/echo`);
  console.log(`🐳 Mode: CI/Mock`);
});