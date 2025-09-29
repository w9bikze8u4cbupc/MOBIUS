import express from 'express';
import cors from 'cors';
import os from 'os';
import process from 'process';

const app = express();
const port = process.env.PORT || 5001;
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'mock';
const startTime = Date.now();

// CORS configuration
app.use(cors());
app.use(express.json());

// Health endpoint - status, timestamp, version, mode
app.get('/health', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  res.json({
    status: 'healthy',
    mode: mode,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: uptime,
    service: 'mobius-api-ci'
  });
});

// Ready endpoint - Kubernetes-style readiness probe with memory/CPU metrics
app.get('/ready', (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const loadAvg = os.loadavg();
  
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
    checks: {
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      system: {
        loadAverage: loadAvg,
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
        uptime: os.uptime()
      }
    }
  });
});

// API info endpoint - API documentation and endpoint metadata
app.get('/api/info', (req, res) => {
  res.json({
    name: 'MOBIUS API CI Server',
    version: '1.0.0',
    mode: mode,
    description: 'Lightweight mock API server for CI testing',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint with service status'
      },
      {
        path: '/ready',
        method: 'GET', 
        description: 'Kubernetes-style readiness probe with system metrics'
      },
      {
        path: '/api/info',
        method: 'GET',
        description: 'API documentation and endpoint metadata'
      },
      {
        path: '/api/echo',
        method: 'POST',
        description: 'Request/response validation for debugging'
      }
    ],
    features: [
      'Non-root runtime (mobius:1001)',
      'Health checks and monitoring',
      'Mock-by-default operation',
      'Structured logging',
      'Docker containerized'
    ]
  });
});

// Echo endpoint - request/response validation for debugging
app.post('/api/echo', (req, res) => {
  const receivedAt = new Date().toISOString();
  
  res.json({
    echo: true,
    receivedAt: receivedAt,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params,
    server: {
      mode: mode,
      version: '1.0.0',
      service: 'mobius-api-ci'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: ['/health', '/ready', '/api/info', '/api/echo']
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: mode === 'production' ? 'Something went wrong' : err.message
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, '0.0.0.0', () => {
    console.log(`MOBIUS CI API server running on port ${port} in ${mode} mode`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Ready probe: http://localhost:${port}/ready`);
    console.log(`API info: http://localhost:${port}/api/info`);
  });
}

export default app;