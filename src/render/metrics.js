/**
 * Metrics collection for the video rendering pipeline
 * Exposes Prometheus metrics for monitoring render performance and reliability
 */

import http from 'node:http';
import client from 'prom-client';

// Create a new registry for our metrics
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// Define our custom metrics
export const renderStarted = new client.Counter({
  name: 'mobius_render_started_total',
  help: 'Total number of renders started',
  registers: [registry]
});

export const renderCompleted = new client.Counter({
  name: 'mobius_render_completed_total',
  help: 'Total number of renders completed successfully',
  registers: [registry]
});

export const renderFailed = new client.Counter({
  name: 'mobius_render_failed_total',
  help: 'Total number of renders that failed',
  labelNames: ['reason'],
  registers: [registry]
});

export const renderTimeout = new client.Counter({
  name: 'mobius_render_timeout_total',
  help: 'Render timeouts triggered',
  labelNames: ['reason'],
  registers: [registry]
});

export const renderDuration = new client.Histogram({
  name: 'mobius_render_duration_seconds',
  help: 'Render durations in seconds',
  buckets: [5, 15, 30, 60, 120, 300, 900, 1800],
  registers: [registry]
});

export const ffmpegSpeedRatio = new client.Histogram({
  name: 'mobius_ffmpeg_speed_ratio',
  help: 'FFmpeg processing speed ratio (processed time / wall clock time)',
  buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
  registers: [registry]
});

// Register all our custom metrics
registry.registerMetric(renderStarted);
registry.registerMetric(renderCompleted);
registry.registerMetric(renderFailed);
registry.registerMetric(renderTimeout);
registry.registerMetric(renderDuration);
registry.registerMetric(ffmpegSpeedRatio);

/**
 * Start the metrics server
 * @param {number} port Port to listen on (defaults to METRICS_PORT env var or 9464)
 * @returns {http.Server} The HTTP server instance
 */
export function startMetricsServer(port = process.env.METRICS_PORT || 9464) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      try {
        res.setHeader('Content-Type', registry.contentType);
        res.end(await registry.metrics());
      } catch (error) {
        res.statusCode = 500;
        res.end(`Error collecting metrics: ${error.message}`);
      }
    } else {
      res.statusCode = 404;
      res.end('Not Found - only /metrics endpoint is available');
    }
  });
  
  server.listen(port, () => {
    console.log(`Metrics server listening on port ${port}`);
  });
  
  return server;
}

/**
 * Stop the metrics server
 * @param {http.Server} server The server instance to close
 * @returns {Promise<void>} Promise that resolves when server is closed
 */
export function stopMetricsServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('Metrics server stopped');
      resolve();
    });
  });
}