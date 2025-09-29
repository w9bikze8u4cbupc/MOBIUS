import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 5001;

// CORS configuration
app.use(cors({
  origin: true, // Allow all origins for CI testing
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'mobius-api-ci',
    version: '1.0.0'
  });
});

// Readiness check endpoint
app.get('/ready', (req, res) => {
  // In a real scenario, you might check database connections, etc.
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      server: 'ok',
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }
  });
});

// Basic API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'MOBIUS Games CI API',
    description: 'Lightweight API for CI smoke tests',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET /ready - Readiness check',
      'GET /api/info - API information',
      'POST /api/echo - Echo test'
    ]
  });
});

// Echo endpoint for testing POST requests
app.post('/api/echo', (req, res) => {
  res.json({
    message: 'Echo successful',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The endpoint ${req.method} ${req.originalUrl} was not found`,
    availableEndpoints: ['/health', '/ready', '/api/info', '/api/echo']
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

app.listen(port, () => {
  console.log(`🚀 MOBIUS CI API is running on port ${port}`);
  console.log(`📋 Health check: http://localhost:${port}/health`);
  console.log(`📋 Ready check: http://localhost:${port}/ready`);
  console.log(`📋 API info: http://localhost:${port}/api/info`);
});