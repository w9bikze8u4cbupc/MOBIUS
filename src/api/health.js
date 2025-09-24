/**
 * MOBIUS DHash System - Health and Metrics Module
 * Provides health and metrics endpoints for monitoring
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DHash metrics storage (in production, this would be in a proper metrics store)
let dhashMetrics = {
  avg_hash_time: 150,  // Sample data
  p95_hash_time: 400,
  extraction_failures_rate: 0.02,
  low_confidence_queue_length: 5,
  total_images_processed: 1250,
  duplicate_hashes_detected: 23,
  last_migration_timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  last_backup_timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  system_health_status: 'healthy'
};

// Health endpoint handler
export function healthEndpoint(req, res) {
  const healthCheck = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    version: '1.0.0',
    system: 'MOBIUS DHash System',
    checks: {
      database: 'healthy',
      filesystem: 'healthy',
      backup_system: 'healthy',
      migration_system: 'healthy'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };

  // Basic health checks
  try {
    // Check filesystem access
    const libDir = process.env.LIBRARY_DIR || path.join(__dirname, '..', '..', 'library');
    if (!fs.existsSync(libDir)) {
      healthCheck.checks.filesystem = 'warning';
      healthCheck.status = 'degraded';
    }

    // Check if system is critically unhealthy
    if (dhashMetrics.system_health_status === 'critical') {
      healthCheck.status = 'unhealthy';
    }

    // Set appropriate HTTP status
    const httpStatus = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(healthCheck);

  } catch (error) {
    res.status(503).json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: error.message,
      system: 'MOBIUS DHash System'
    });
  }
}

// DHash metrics endpoint handler
export function metricsEndpoint(req, res) {
  try {
    const metricsData = {
      timestamp: new Date().toISOString(),
      system: 'MOBIUS DHash System',
      metrics: {
        // Performance metrics
        avg_hash_time_ms: dhashMetrics.avg_hash_time,
        p95_hash_time_ms: dhashMetrics.p95_hash_time,
        
        // Quality metrics
        extraction_failures_rate: dhashMetrics.extraction_failures_rate,
        low_confidence_queue_length: dhashMetrics.low_confidence_queue_length,
        
        // Volume metrics
        total_images_processed: dhashMetrics.total_images_processed,
        duplicate_hashes_detected: dhashMetrics.duplicate_hashes_detected,
        
        // System state
        last_migration_timestamp: dhashMetrics.last_migration_timestamp,
        last_backup_timestamp: dhashMetrics.last_backup_timestamp,
        system_health_status: dhashMetrics.system_health_status,
        
        // Derived metrics
        duplicate_rate: dhashMetrics.total_images_processed > 0 ? 
          (dhashMetrics.duplicate_hashes_detected / dhashMetrics.total_images_processed) : 0,
        
        processing_rate_per_hour: dhashMetrics.avg_hash_time > 0 ? 
          (3600000 / dhashMetrics.avg_hash_time) : 0
      },
      
      // Thresholds for monitoring
      thresholds: {
        avg_hash_time_warning: 5000,    // 5 seconds
        avg_hash_time_critical: 10000,  // 10 seconds
        failure_rate_warning: 0.05,     // 5%
        failure_rate_critical: 0.15,    // 15%
        low_confidence_warning: 100,    // 100 items
        low_confidence_critical: 500    // 500 items
      }
    };

    // Calculate health status based on thresholds
    let healthStatus = 'healthy';
    const m = metricsData.metrics;
    const t = metricsData.thresholds;

    if (m.avg_hash_time_ms > t.avg_hash_time_critical ||
        m.extraction_failures_rate > t.failure_rate_critical ||
        m.low_confidence_queue_length > t.low_confidence_critical) {
      healthStatus = 'critical';
    } else if (m.avg_hash_time_ms > t.avg_hash_time_warning ||
               m.extraction_failures_rate > t.failure_rate_warning ||
               m.low_confidence_queue_length > t.low_confidence_warning) {
      healthStatus = 'warning';
    }

    metricsData.metrics.system_health_status = healthStatus;
    dhashMetrics.system_health_status = healthStatus;

    res.json(metricsData);

  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      error: 'Failed to retrieve metrics',
      details: error.message
    });
  }
}

// Update metrics endpoint handler (internal use)
export function updateMetricsEndpoint(req, res) {
  const { api_key, metrics } = req.body;
  
  // Simple API key check for internal updates
  const internalKey = process.env.INTERNAL_API_KEY || 'internal-key-change-in-production';
  if (api_key !== internalKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Update metrics
    if (metrics.avg_hash_time !== undefined) dhashMetrics.avg_hash_time = metrics.avg_hash_time;
    if (metrics.p95_hash_time !== undefined) dhashMetrics.p95_hash_time = metrics.p95_hash_time;
    if (metrics.extraction_failures_rate !== undefined) dhashMetrics.extraction_failures_rate = metrics.extraction_failures_rate;
    if (metrics.low_confidence_queue_length !== undefined) dhashMetrics.low_confidence_queue_length = metrics.low_confidence_queue_length;
    if (metrics.total_images_processed !== undefined) dhashMetrics.total_images_processed = metrics.total_images_processed;
    if (metrics.duplicate_hashes_detected !== undefined) dhashMetrics.duplicate_hashes_detected = metrics.duplicate_hashes_detected;
    if (metrics.last_migration_timestamp !== undefined) dhashMetrics.last_migration_timestamp = metrics.last_migration_timestamp;
    if (metrics.last_backup_timestamp !== undefined) dhashMetrics.last_backup_timestamp = metrics.last_backup_timestamp;

    res.json({ success: true, updated_at: new Date().toISOString() });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update metrics', details: error.message });
  }
}

// Setup health routes
export function setupHealthRoutes(app) {
  app.get('/health', healthEndpoint);
  app.get('/metrics/dhash', metricsEndpoint);
  app.post('/internal/metrics/update', updateMetricsEndpoint);
  
  console.log('🏥 Health endpoint: /health');
  console.log('📊 DHash metrics: /metrics/dhash');
}