const express = require('express');

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(express.json({ limit: '1mb' }));

// Health check endpoint - basic liveness probe
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness check endpoint - more comprehensive readiness probe
app.get('/ready', (req, res) => {
  const memUsage = process.memoryUsage();
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
    },
    nodeVersion: process.version
  });
});

// API info endpoint - provides API metadata
app.get('/api/info', (req, res) => {
  res.status(200).json({
    name: 'MOBIUS CI API',
    version: '1.0.0',
    description: 'Lightweight API for CI smoke testing',
    endpoints: [
      'GET /health - Health check',
      'GET /ready - Readiness check',
      'GET /api/info - API information',
      'POST /api/echo - Echo test'
    ],
    timestamp: new Date().toISOString()
  });
});

// Echo endpoint - tests POST requests and request/response handling
app.post('/api/echo', (req, res) => {
  const { message, data } = req.body;
  
  res.status(200).json({
    echo: {
      message: message || 'No message provided',
      data: data || null,
      receivedAt: new Date().toISOString(),
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    }
  });
});

// 404 handler for testing error responses
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`MOBIUS CI API listening on port ${port}`);
  console.log(`Available endpoints:`);
  console.log(`- GET  /health`);
  console.log(`- GET  /ready`);
  console.log(`- GET  /api/info`);
  console.log(`- POST /api/echo`);
});