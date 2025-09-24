#!/usr/bin/env node

/**
 * Mock server for testing DHash deployment infrastructure
 */

const http = require('http');
const url = require('url');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// Mock health endpoint
function handleHealth(req, res) {
  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: 'test',
    version: '1.0.0',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    },
    services: {
      database: { status: 'healthy' }
    },
    response_time_ms: '2.43'
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}

// Mock metrics endpoint
function handleMetrics(req, res) {
  const dhashExists = fs.existsSync('test-library.dhash.json');
  
  const response = {
    timestamp: new Date().toISOString(),
    system: {
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      memory_total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      cpu_usage_percent: 12.5
    },
    dhash: {
      version: '1.0.0',
      format_support: ['json', 'dhash'],
      last_deployment: new Date().toISOString(),
      transformation_engine: 'node',
      checksum_algorithm: 'sha256',
      files: dhashExists ? [{
        path: 'test-library.dhash.json',
        size_bytes: fs.statSync('test-library.dhash.json').size,
        modified: fs.statSync('test-library.dhash.json').mtime.toISOString(),
        version: '1.0.0',
        entries: 3,
        checksum: 'c85d3bed...'
      }] : []
    },
    performance: {
      avg_transformation_time_ms: 1250,
      total_transformations: 2,
      successful_transformations: 2,
      failed_transformations: 0
    },
    cache: {
      bgg_metadata_entries: 0,
      cache_hit_rate: null
    }
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}

// Request handler
function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${req.method} ${pathname}`);

  if (pathname === '/health') {
    handleHealth(req, res);
  } else if (pathname === '/metrics/dhash') {
    handleMetrics(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// Create server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`🚀 Mock server is running on port ${PORT}`);
  console.log(`🏥 Health check available at: http://localhost:${PORT}/health`);
  console.log(`📊 DHash metrics available at: http://localhost:${PORT}/metrics/dhash`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down mock server...');
  server.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});