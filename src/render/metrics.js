/**
 * Metrics collection for the video rendering pipeline
 * Exposes Prometheus metrics for monitoring render performance and reliability
 * 
 * OPTIONAL: Requires MOBIUS_ENABLE_METRICS=true and prom-client installed
 * Falls back to no-op implementation when disabled or unavailable
 */

import http from 'node:http';

// Check if metrics are enabled and prom-client is available
const METRICS_ENABLED = process.env.MOBIUS_ENABLE_METRICS === 'true';
let client = null;
let registry = null;

if (METRICS_ENABLED) {
  try {
    // Dynamic import to make prom-client optional
    const promClient = await import('prom-client');
    client = promClient.default;
    registry = new client.Registry();
    client.collectDefaultMetrics({ register: registry });
  } catch (error) {
    console.warn('⚠️  Metrics enabled but prom-client not available:', error.message);
  }
}

// No-op metric implementation for when metrics are disabled
class NoOpMetric {
  inc() {}
  observe() {}
  reset() {}
  async get() {
    return { values: [] };
  }
}

// Define our custom metrics (real or no-op based on availability)
export const renderStarted = client ? new client.Counter({
  name: 'mobius_render_started_total',
  help: 'Total number of renders started',
  registers: [registry]
}) : new NoOpMetric();

export const renderCompleted = client ? new client.Counter({
  name: 'mobius_render_completed_total',
  help: 'Total number of renders completed successfully',
  registers: [registry]
}) : new NoOpMetric();

export const renderFailed = client ? new client.Counter({
  name: 'mobius_render_failed_total',
  help: 'Total number of renders that failed',
  labelNames: ['reason'],
  registers: [registry]
}) : new NoOpMetric();

export const renderTimeout = client ? new client.Counter({
  name: 'mobius_render_timeout_total',
  help: 'Render timeouts triggered',
  labelNames: ['reason'],
  registers: [registry]
}) : new NoOpMetric();

export const renderDuration = client ? new client.Histogram({
  name: 'mobius_render_duration_seconds',
  help: 'Render durations in seconds',
  buckets: [5, 15, 30, 60, 120, 300, 900, 1800],
  registers: [registry]
}) : new NoOpMetric();

export const ffmpegSpeedRatio = client ? new client.Histogram({
  name: 'mobius_ffmpeg_speed_ratio',
  help: 'FFmpeg processing speed ratio (processed time / wall clock time)',
  buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
  registers: [registry]
}) : new NoOpMetric();

// Register all our custom metrics (only if client is available)
if (client && registry) {
  registry.registerMetric(renderStarted);
  registry.registerMetric(renderCompleted);
  registry.registerMetric(renderFailed);
  registry.registerMetric(renderTimeout);
  registry.registerMetric(renderDuration);
  registry.registerMetric(ffmpegSpeedRatio);
}

/**
 * Start the metrics server
 * @param {number} port Port to listen on (defaults to METRICS_PORT env var or 9464)
 * @returns {http.Server|null} The HTTP server instance or null if metrics disabled
 */
export function startMetricsServer(port = process.env.METRICS_PORT || 9464) {
  if (!METRICS_ENABLED || !registry) {
    console.log('Metrics server not started (MOBIUS_ENABLE_METRICS not enabled)');
    return null;
  }
  
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
 * @param {http.Server|null} server The server instance to close
 * @returns {Promise<void>} Promise that resolves when server is closed
 */
export function stopMetricsServer(server) {
  if (!server) {
    return Promise.resolve();
  }
  
  return new Promise((resolve) => {
    server.close(() => {
      console.log('Metrics server stopped');
      resolve();
    });
  });
}