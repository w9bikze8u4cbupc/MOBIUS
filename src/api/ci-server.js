#!/usr/bin/env node

/**
 * MOBIUS CI Mock API Server
 * 
 * Lightweight Express server for CI/CD testing and validation.
 * Provides health checks, API introspection, and request/response validation
 * without external dependencies or secrets.
 * 
 * Designed for:
 * - Docker container health checks
 * - Smoke test validation
 * - CI/CD pipeline verification
 * - Local development testing
 */

const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
const port = process.env.PORT || 5001;
const startTime = Date.now();

// Package info for version reporting
const packageInfo = {
  name: 'mobius-api-ci',
  version: '1.0.0',
  mode: 'mock'
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

/**
 * GET /health
 * 
 * Primary health check endpoint for Docker healthcheck and load balancers.
 * Returns application status, mode, version, and basic runtime information.
 */
app.get('/health', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  
  res.json({
    status: 'healthy',
    mode: packageInfo.mode,
    timestamp: new Date().toISOString(),
    version: packageInfo.version,
    uptime: Math.round(uptime * 10000) / 10000, // 4 decimal places
    service: packageInfo.name
  });
});

/**
 * GET /ready
 * 
 * Kubernetes-style readiness probe with detailed system information.
 * Includes memory usage, CPU info, and process details for monitoring.
 */
app.get('/ready', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  const memUsage = process.memoryUsage();
  
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
    uptime: Math.round(uptime * 10000) / 10000,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100, // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100 // MB
    },
    cpu: {
      arch: os.arch(),
      platform: os.platform(),
      cpus: os.cpus().length,
      loadavg: os.loadavg()
    },
    process: {
      pid: process.pid,
      version: process.version,
      nodeVersion: process.versions.node
    }
  });
});

/**
 * GET /api/info
 * 
 * API introspection endpoint providing metadata about available endpoints,
 * API capabilities, and usage information for developers and monitoring tools.
 */
app.get('/api/info', (req, res) => {
  res.json({
    name: packageInfo.name,
    version: packageInfo.version,
    mode: packageInfo.mode,
    description: 'MOBIUS CI Mock API for testing and validation',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint for containers and load balancers',
        response: 'Application status and basic runtime info'
      },
      {
        path: '/ready',
        method: 'GET',
        description: 'Readiness probe with detailed system information',
        response: 'System metrics, memory usage, and process details'
      },
      {
        path: '/api/info',
        method: 'GET',
        description: 'API metadata and endpoint documentation',
        response: 'Available endpoints and their descriptions'
      },
      {
        path: '/api/echo',
        method: 'POST',
        description: 'Request/response validation and debugging',
        request: 'JSON payload to echo back with metadata',
        response: 'Original request data plus server-side metadata'
      }
    ],
    features: [
      'Docker container health checks',
      'Kubernetes readiness/liveness probes',
      'Request/response validation',
      'CI/CD smoke testing',
      'Development debugging'
    ],
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - startTime) / 1000 * 10000) / 10000
  });
});

/**
 * POST /api/echo
 * 
 * Request/response validation endpoint for testing data flow,
 * request parsing, and response formatting. Useful for debugging
 * client integrations and validating API communication.
 */
app.post('/api/echo', (req, res) => {
  const receivedAt = new Date().toISOString();
  const requestSize = JSON.stringify(req.body).length;
  
  res.json({
    echo: {
      body: req.body,
      headers: {
        'content-type': req.get('content-type'),
        'user-agent': req.get('user-agent'),
        'content-length': req.get('content-length')
      },
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip
    },
    server: {
      receivedAt,
      processedAt: new Date().toISOString(),
      requestSize,
      version: packageInfo.version,
      mode: packageInfo.mode
    },
    validation: {
      hasBody: !!req.body && Object.keys(req.body).length > 0,
      bodyType: Array.isArray(req.body) ? 'array' : typeof req.body,
      bodyKeys: typeof req.body === 'object' && req.body ? Object.keys(req.body) : [],
      isValidJson: true // If we got here, JSON parsing succeeded
    }
  });
});

/**
 * Generic error handler
 */
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  console.error(err.stack);
  
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString(),
    mode: packageInfo.mode
  });
});

/**
 * 404 handler for undefined routes
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Path ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    availableEndpoints: ['/health', '/ready', '/api/info', '/api/echo'],
    mode: packageInfo.mode
  });
});

/**
 * Graceful shutdown handling
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
const server = app.listen(port, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log(`🚀 MOBIUS CI Mock API Server`);
  console.log(`📍 Mode: ${packageInfo.mode}`);
  console.log(`🌐 Listening on: http://0.0.0.0:${port}`);
  console.log(`📋 Version: ${packageInfo.version}`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  console.log('📋 Available endpoints:');
  console.log(`   GET  /health    - Health check`);
  console.log(`   GET  /ready     - Readiness probe`);
  console.log(`   GET  /api/info  - API documentation`);
  console.log(`   POST /api/echo  - Request/response validation`);
  console.log('='.repeat(60));
});

// Handle server startup errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
});

module.exports = app;