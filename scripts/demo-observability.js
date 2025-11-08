#!/usr/bin/env node

/**
 * Demo script for the observability features of the rendering pipeline
 * This script demonstrates how to use metrics and structured logging
 */

import { startMetricsServer } from '../src/render/metrics.js';
import { logger } from '../src/render/log.js';
import { render } from '../src/render/index.js';

// Get metrics port from environment or command line args
const getMetricsPort = () => {
  // Check command line args first
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--metrics-port');
  if (portIndex !== -1 && args[portIndex + 1]) {
    return parseInt(args[portIndex + 1], 10);
  }
  
  // Fall back to environment variable
  if (process.env.METRICS_PORT) {
    return parseInt(process.env.METRICS_PORT, 10);
  }
  
  // Default port
  return 9464;
};

// Get log level from environment
const getLogLevel = () => {
  return process.env.LOG_LEVEL || 'info';
};

// Start metrics server
const metricsPort = getMetricsPort();
const metricsServer = startMetricsServer(metricsPort);

// Create a logger with context
const log = logger.withContext({ 
  component: 'demo-observability',
  demoId: Math.random().toString(36).substring(2, 15)
});

log.info('Observability demo started', { metricsPort, logLevel: getLogLevel() });

// Simulate a few renders to generate metrics
async function runDemo() {
  log.info('Starting demo renders');
  
  // Simulate 3 renders with different parameters
  for (let i = 0; i < 3; i++) {
    const jobId = `demo-job-${i}`;
    const jobLogger = log.withContext({ jobId });
    
    jobLogger.info('Starting render job', { 
      imageCount: 5,
      duration: 30,
      hasAudio: true
    });
    
    try {
      // Run a dry-run render to demonstrate logging
      const job = {
        images: Array(5).fill('test-image.jpg'),
        audioFile: 'test-audio.mp3',
        outputDir: './out'
      };
      
      const options = {
        dryRun: true,
        loudness: {
          enabled: true,
          targetI: -16,
          lra: 11,
          tp: -1.5
        },
        safetyFilters: {
          highpassHz: 80,
          lowpassHz: 16000,
          limiter: true
        },
        caps: {
          maxWidth: 1920,
          maxHeight: 1080,
          maxFps: 30,
          maxBitrateKbps: 6000
        },
        sessionId: `demo-session-${i}`,
        jobId
      };
      
      await render(job, options);
      
      jobLogger.info('Render job completed', { 
        duration: Math.random() * 10 + 5 // Random duration between 5-15 seconds
      });
    } catch (error) {
      jobLogger.error('Render job failed', { 
        error: error.message 
      });
    }
  }
  
  log.info('Demo renders completed');
  
  // Keep the server running for a bit so we can check metrics
  log.info('Metrics server running - visit http://localhost:' + metricsPort + '/metrics to view metrics');
  log.info('Press Ctrl+C to stop the demo');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log.info('Shutting down demo');
  
  // Close metrics server
  await new Promise((resolve) => {
    metricsServer.close(() => {
      log.info('Metrics server stopped');
      resolve();
    });
  });
  
  process.exit(0);
});

// Run the demo
runDemo().catch((error) => {
  log.error('Demo failed', { error: error.message });
  process.exit(1);
});