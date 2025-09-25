#!/usr/bin/env node

/**
 * Minimal MOBIUS Test Server
 * For testing health and metrics endpoints
 */

import express from 'express';
import logger, { requestLogger } from '../src/utils/logger.js';
import metricsRegister, { 
  metricsMiddleware, 
  getSystemHealth,
  incrementActiveConnections,
  decrementActiveConnections
} from '../src/utils/metrics.js';

const app = express();
const port = process.env.PORT || 5001;
let connectionCount = 0;

logger.info('Test server starting', { port });

// Add request logging and metrics middleware
app.use(requestLogger);
app.use(metricsMiddleware);

// Track connections for metrics
app.use((req, res, next) => {
  incrementActiveConnections();
  connectionCount++;
  
  res.on('close', () => {
    decrementActiveConnections();
    connectionCount--;
  });
  
  next();
});

app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
  try {
    const health = getSystemHealth();
    
    // Check critical dependencies
    const checks = {
      filesystem: true,
      logging: true,
      metrics: true
    };
    
    const allHealthy = Object.values(checks).every(check => check);
    
    res.status(allHealthy ? 200 : 503).json({
      ...health,
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      connections: connectionCount
    });
    
    logger.info('Health check requested', { 
      status: allHealthy ? 'healthy' : 'unhealthy',
      connections: connectionCount 
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsRegister.contentType);
    const metrics = await metricsRegister.metrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Metrics collection failed', { error: error.message });
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

// Simple test endpoint
app.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// Add graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');  
  process.exit(0);
});

app.listen(port, () => {
  logger.info('Test server started', { 
    port, 
    endpoints: {
      health: `http://localhost:${port}/health`,
      metrics: `http://localhost:${port}/metrics`,
      ping: `http://localhost:${port}/ping`
    }
  });
  console.log(`🧪 Test Server running on port ${port}`);
  console.log(`❤️  Health: http://localhost:${port}/health`);
  console.log(`📊 Metrics: http://localhost:${port}/metrics`);
  console.log(`🏓 Ping: http://localhost:${port}/ping`);
});