/**
 * CI Mock API Server for MOBIUS
 * 
 * Lightweight mock API server for CI testing that provides basic health
 * and readiness endpoints without external dependencies or secrets.
 * 
 * Features:
 * - GET /health - status, timestamp, version, mode
 * - GET /ready - readiness, uptime, memory and CPU info  
 * - GET /api/info - API metadata and available endpoints
 * - POST /api/echo - request/response validation
 */

const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
const port = process.env.PORT || 5001;
const mode = process.env.API_MODE || 'mock';
const version = process.env.npm_package_version || '1.0.0';

// Track server start time for uptime calculation
const startTime = Date.now();

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

/**
 * GET /health - Health check endpoint
 * Returns basic health status, mode, version and timestamp
 */
app.get('/health', (req, res) => {
  const now = new Date();
  const uptime = (Date.now() - startTime) / 1000; // uptime in seconds
  
  res.json({
    status: 'healthy',
    mode: mode,
    timestamp: now.toISOString(),
    version: version,
    uptime: Math.round(uptime * 10000) / 10000 // round to 4 decimal places
  });
});

/**
 * GET /ready - Readiness check endpoint  
 * Returns detailed readiness info including system resources
 */
app.get('/ready', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  res.json({
    ready: true,
    uptime: Math.round(uptime * 100) / 100,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100, // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100 // MB
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      loadAverage: os.loadavg().map(avg => Math.round(avg * 100) / 100)
    }
  });
});

/**
 * GET /api/info - API information endpoint
 * Returns metadata about the API and available endpoints
 */
app.get('/api/info', (req, res) => {
  res.json({
    name: 'MOBIUS CI API',
    version: version,
    mode: mode,
    description: 'Mock API server for CI testing and validation',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check with status, mode, version and timestamp'
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
        description: 'Echo request body for request/response validation'
      }
    ],
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: port,
      mode: mode
    }
  });
});

/**
 * POST /api/echo - Echo endpoint for request/response validation
 * Returns the request body along with metadata for testing
 */
app.post('/api/echo', (req, res) => {
  const receivedAt = new Date().toISOString();
  const requestSize = JSON.stringify(req.body).length;
  
  res.json({
    echo: true,
    receivedAt: receivedAt,
    requestBody: req.body,
    requestMetadata: {
      method: req.method,
      path: req.path,
      headers: {
        'content-type': req.get('content-type'),
        'content-length': req.get('content-length'),
        'user-agent': req.get('user-agent')
      },
      bodySize: requestSize,
      timestamp: receivedAt
    },
    server: {
      mode: mode,
      version: version,
      uptime: Math.round((Date.now() - startTime) / 1000 * 100) / 100
    }
  });
});

/**
 * 404 handler for undefined routes
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: ['/health', '/ready', '/api/info', '/api/echo'],
    timestamp: new Date().toISOString()
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: mode === 'mock' ? 'Mock server error occurred' : 'An error occurred',
    timestamp: new Date().toISOString(),
    mode: mode
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(port, () => {
  console.log(`🚀 MOBIUS CI API Server running on port ${port}`);
  console.log(`📱 Mode: ${mode}`);
  console.log(`📦 Version: ${version}`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
  console.log(`🔗 Endpoints available at: http://localhost:${port}`);
});

module.exports = app;