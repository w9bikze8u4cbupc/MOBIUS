const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
const port = process.env.PORT || 5001;
const startTime = Date.now();

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoint - status, timestamp, version, mode
app.get('/health', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  
  res.json({
    status: 'healthy',
    mode: 'mock',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: Math.round(uptime * 1000) / 1000
  });
});

// Ready endpoint - readiness, uptime, memory and CPU info
app.get('/ready', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  const memUsage = process.memoryUsage();
  
  res.json({
    ready: true,
    uptime: Math.round(uptime * 1000) / 1000,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100, // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100 // MB
    },
    cpu: {
      loadAverage: os.loadavg(),
      cores: os.cpus().length
    },
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version
  });
});

// API info endpoint - metadata and available endpoints
app.get('/api/info', (req, res) => {
  res.json({
    name: 'MOBIUS CI Mock API',
    version: '1.0.0',
    mode: 'mock',
    description: 'Mock API server for CI testing and smoke tests',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check with status, timestamp, version, and mode'
      },
      {
        path: '/ready',
        method: 'GET', 
        description: 'Readiness check with uptime, memory and CPU info'
      },
      {
        path: '/api/info',
        method: 'GET',
        description: 'API metadata and available endpoints'
      },
      {
        path: '/api/echo',
        method: 'POST',
        description: 'Echo endpoint for request/response validation'
      }
    ],
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - startTime) / 1000 * 1000) / 1000
  });
});

// Echo endpoint - request/response validation
app.post('/api/echo', (req, res) => {
  const { body, headers, query } = req;
  
  res.json({
    echo: true,
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      url: req.url,
      headers: {
        'content-type': headers['content-type'],
        'user-agent': headers['user-agent'],
        'content-length': headers['content-length']
      },
      query,
      body
    },
    response: {
      status: 200,
      message: 'Request echoed successfully'
    }
  });
});

// Catch-all 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: ['/health', '/ready', '/api/info', '/api/echo'],
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MOBIUS CI Mock API server running on port ${port}`);
  console.log(`📊 Mode: mock`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
  console.log(`📋 API info: http://localhost:${port}/api/info`);
});

module.exports = app;