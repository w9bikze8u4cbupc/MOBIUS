import promClient from 'prom-client';
import logger from './logger.js';

// Create a Registry which registers the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  service: 'mobius-dhash',
  environment: process.env.NODE_ENV || 'development'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const extractionFailuresTotal = new promClient.Counter({
  name: 'extraction_failures_total',
  help: 'Total number of extraction failures',
  labelNames: ['type', 'error']
});

const hashProcessingTime = new promClient.Histogram({
  name: 'hash_processing_duration_seconds',
  help: 'Duration of hash processing operations in seconds',
  labelNames: ['operation_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

const filesProcessedTotal = new promClient.Counter({
  name: 'files_processed_total',
  help: 'Total number of files processed',
  labelNames: ['file_type', 'status']
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(extractionFailuresTotal);
register.registerMetric(hashProcessingTime);
register.registerMetric(activeConnections);
register.registerMetric(filesProcessedTotal);

// Middleware to collect HTTP metrics
export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.url;
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestsTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });

  next();
};

// Helper functions to record specific metrics
export const recordExtractionFailure = (type, error) => {
  extractionFailuresTotal.labels(type, error).inc();
  logger.warn('Extraction failure recorded', { type, error });
};

export const recordHashProcessingTime = (operationType, duration) => {
  hashProcessingTime.labels(operationType).observe(duration);
  logger.debug('Hash processing time recorded', { operationType, duration });
};

export const recordFileProcessed = (fileType, status) => {
  filesProcessedTotal.labels(fileType, status).inc();
  logger.debug('File processed recorded', { fileType, status });
};

export const incrementActiveConnections = () => {
  activeConnections.inc();
};

export const decrementActiveConnections = () => {
  activeConnections.dec();
};

// Health check helpers
export const getSystemHealth = () => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime)}s`,
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    },
    pid: process.pid,
    version: process.version,
    environment: process.env.NODE_ENV || 'development'
  };
};

export default register;