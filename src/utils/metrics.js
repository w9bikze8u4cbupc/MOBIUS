const logger = require('./logger');

class MetricsCollector {
  constructor() {
    this.metrics = {
      hash_operations: {
        total: 0,
        successful: 0,
        failed: 0,
        avg_hash_time: 0,
        p95_hash_time: 0,
        extraction_failures_rate: 0,
        low_confidence_queue_length: 0
      },
      system: {
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage()
      },
      hash_times: [],
      low_confidence_queue: []
    };
    
    // Clean up old hash times periodically
    setInterval(() => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      this.metrics.hash_times = this.metrics.hash_times.filter(entry => entry.timestamp > fiveMinutesAgo);
      this.updateCalculatedMetrics();
    }, 60000); // Every minute
  }

  recordHashOperation(duration, success = true, confidence = 1.0) {
    const timestamp = Date.now();
    
    this.metrics.hash_operations.total++;
    if (success) {
      this.metrics.hash_operations.successful++;
    } else {
      this.metrics.hash_operations.failed++;
    }

    // Record hash time for percentile calculations
    if (success) {
      this.metrics.hash_times.push({ duration, timestamp });
    }

    // Handle low confidence operations
    if (confidence < 0.7) {
      this.metrics.low_confidence_queue.push({ timestamp, duration, confidence });
    }

    this.updateCalculatedMetrics();
    
    logger.logHashOperation('hash_processing', duration, success, { 
      confidence, 
      total_operations: this.metrics.hash_operations.total 
    });
  }

  updateCalculatedMetrics() {
    // Calculate average hash time
    if (this.metrics.hash_times.length > 0) {
      const sum = this.metrics.hash_times.reduce((acc, entry) => acc + entry.duration, 0);
      this.metrics.hash_operations.avg_hash_time = Math.round(sum / this.metrics.hash_times.length);
    }

    // Calculate P95 hash time
    if (this.metrics.hash_times.length > 0) {
      const sortedTimes = this.metrics.hash_times.map(entry => entry.duration).sort((a, b) => a - b);
      const p95Index = Math.ceil(sortedTimes.length * 0.95) - 1;
      this.metrics.hash_operations.p95_hash_time = sortedTimes[Math.max(0, p95Index)] || 0;
    }

    // Calculate extraction failures rate
    const total = this.metrics.hash_operations.total;
    if (total > 0) {
      this.metrics.hash_operations.extraction_failures_rate = 
        (this.metrics.hash_operations.failed / total) * 100;
    }

    // Update low confidence queue length
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    this.metrics.low_confidence_queue = this.metrics.low_confidence_queue.filter(
      entry => entry.timestamp > tenMinutesAgo
    );
    this.metrics.hash_operations.low_confidence_queue_length = this.metrics.low_confidence_queue.length;

    // Update system metrics
    this.metrics.system = {
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      cpu_usage: process.cpuUsage()
    };
  }

  getMetrics() {
    this.updateCalculatedMetrics();
    return {
      ...this.metrics.hash_operations,
      system: this.metrics.system,
      timestamp: new Date().toISOString()
    };
  }

  getHealthStatus() {
    this.updateCalculatedMetrics();
    
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        memory: 'OK',
        extraction_failures: 'OK',
        response_time: 'OK'
      }
    };

    // Memory check - warn if using > 1GB
    const memoryUsageMB = this.metrics.system.memory_usage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 1024) {
      health.checks.memory = 'WARN';
      health.status = 'WARN';
    }

    // Extraction failures check - warn if > 10%
    if (this.metrics.hash_operations.extraction_failures_rate > 10) {
      health.checks.extraction_failures = 'ERROR';
      health.status = 'ERROR';
    } else if (this.metrics.hash_operations.extraction_failures_rate > 5) {
      health.checks.extraction_failures = 'WARN';
      if (health.status === 'OK') health.status = 'WARN';
    }

    // Response time check - warn if P95 > 5000ms
    if (this.metrics.hash_operations.p95_hash_time > 5000) {
      health.checks.response_time = 'ERROR';
      health.status = 'ERROR';
    } else if (this.metrics.hash_operations.p95_hash_time > 2000) {
      health.checks.response_time = 'WARN';
      if (health.status === 'OK') health.status = 'WARN';
    }

    return health;
  }

  logMetrics() {
    logger.logMetrics(this.getMetrics());
  }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

// Log metrics every 5 minutes
setInterval(() => {
  metricsCollector.logMetrics();
}, 5 * 60 * 1000);

module.exports = metricsCollector;