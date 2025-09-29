import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 5001;
const startTime = Date.now();

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Health endpoint - basic status check
app.get('/health', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  res.json({
    status: 'healthy',
    mode: 'mock',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: uptime,
    service: 'mobius-api-ci'
  });
});

// Ready endpoint - Kubernetes-style readiness probe with metrics
app.get('/ready', (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const uptime = (Date.now() - startTime) / 1000;
  
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    uptime: uptime,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024) // MB
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      loadAverage: os.loadavg()
    }
  });
});

// API info endpoint - documentation and metadata
app.get('/api/info', (req, res) => {
  res.json({
    service: 'mobius-api-ci',
    version: '1.0.0',
    mode: 'mock',
    description: 'Mock API server for CI testing of MOBIUS API',
    endpoints: {
      '/health': {
        method: 'GET',
        description: 'Basic health check with service status and uptime'
      },
      '/ready': {
        method: 'GET',
        description: 'Kubernetes-style readiness probe with memory/CPU metrics'
      },
      '/api/info': {
        method: 'GET',
        description: 'API documentation and endpoint metadata'
      },
      '/api/echo': {
        method: 'POST',
        description: 'Echo endpoint for request/response validation and debugging'
      }
    },
    features: [
      'Non-root container runtime',
      'Lightweight Alpine Linux base',
      'Built-in healthcheck',
      'Structured logging',
      'Mock-first approach'
    ],
    environment: {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch()
    }
  });
});

// Echo endpoint - for request/response validation and debugging
app.post('/api/echo', (req, res) => {
  const timestamp = new Date().toISOString();
  
  res.json({
    timestamp: timestamp,
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    echo: {
      message: 'Request successfully echoed',
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      service: 'mobius-api-ci'
    }
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: ['/health', '/ready', '/api/info', '/api/echo'],
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

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 MOBIUS CI Mock API Server running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`📍 Ready check: http://localhost:${port}/ready`);
  console.log(`📍 API info: http://localhost:${port}/api/info`);
  console.log(`📍 Echo endpoint: http://localhost:${port}/api/echo`);
  console.log(`🔧 Mode: mock`);
  console.log(`🐋 Container-ready with non-root user support`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully');
  process.exit(0);
});