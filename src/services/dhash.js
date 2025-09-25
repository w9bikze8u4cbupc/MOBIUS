const crypto = require('crypto');
const logger = require('../utils/logger');

class DHashService {
  constructor() {
    this.metrics = {
      total_extractions: 0,
      successful_extractions: 0,
      failed_extractions: 0,
      extraction_times: [],
      low_confidence_count: 0,
      last_reset: new Date().toISOString()
    };
    
    // Reset metrics every hour to maintain rolling window
    setInterval(() => this.resetMetrics(), 60 * 60 * 1000);
  }

  resetMetrics() {
    this.metrics = {
      total_extractions: 0,
      successful_extractions: 0,
      failed_extractions: 0,
      extraction_times: [],
      low_confidence_count: 0,
      last_reset: new Date().toISOString()
    };
  }

  calculateDHash(imagePath) {
    const startTime = Date.now();
    const requestId = logger.requestId();
    
    logger.dhash.extraction_start({ imagePath, requestId });
    
    try {
      // Simulate dhash extraction process
      // In a real implementation, this would use image processing libraries
      const hash = this.generateMockDHash(imagePath);
      const duration = Date.now() - startTime;
      const confidence = Math.random() * 0.4 + 0.6; // Random confidence between 0.6-1.0
      
      this.updateMetrics(true, duration);
      
      if (confidence < 0.8) {
        this.metrics.low_confidence_count++;
        logger.dhash.low_confidence(hash, confidence);
      }
      
      logger.dhash.extraction_success(hash, duration, confidence);
      
      return {
        hash,
        confidence,
        duration_ms: duration,
        requestId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);
      logger.dhash.extraction_failure(error, duration);
      throw error;
    }
  }

  generateMockDHash(imagePath) {
    // Mock dhash generation - in reality this would process the image
    const hash = crypto.createHash('md5').update(imagePath + Date.now()).digest('hex');
    return hash.substring(0, 16); // 64-bit hash as hex string
  }

  updateMetrics(success, duration) {
    this.metrics.total_extractions++;
    this.metrics.extraction_times.push(duration);
    
    // Keep only last 1000 extraction times for memory efficiency
    if (this.metrics.extraction_times.length > 1000) {
      this.metrics.extraction_times = this.metrics.extraction_times.slice(-1000);
    }
    
    if (success) {
      this.metrics.successful_extractions++;
    } else {
      this.metrics.failed_extractions++;
    }
  }

  getMetrics() {
    const times = this.metrics.extraction_times;
    const sortedTimes = [...times].sort((a, b) => a - b);
    
    return {
      total_extractions: this.metrics.total_extractions,
      successful_extractions: this.metrics.successful_extractions,
      failed_extractions: this.metrics.failed_extractions,
      extraction_failures_rate: this.metrics.total_extractions > 0 
        ? this.metrics.failed_extractions / this.metrics.total_extractions 
        : 0,
      avg_hash_time: times.length > 0 
        ? times.reduce((a, b) => a + b, 0) / times.length 
        : 0,
      p95_hash_time: sortedTimes.length > 0 
        ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] 
        : 0,
      low_confidence_queue_length: this.metrics.low_confidence_count,
      last_reset: this.metrics.last_reset,
      uptime_ms: Date.now() - new Date(this.metrics.last_reset).getTime()
    };
  }

  getHealthStatus() {
    const metrics = this.getMetrics();
    const status = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'dhash',
      version: process.env.npm_package_version || '1.0.0'
    };

    // Check rollback triggers
    if (metrics.extraction_failures_rate > 0.1) { // >10%
      status.status = 'CRITICAL';
      status.reason = 'High extraction failure rate';
    } else if (metrics.p95_hash_time > 30000) { // >30s
      status.status = 'WARNING';
      status.reason = 'High P95 hash time';
    } else if (metrics.low_confidence_queue_length > 100) {
      status.status = 'WARNING';
      status.reason = 'High low-confidence queue length';
    }

    return { ...status, metrics };
  }
}

module.exports = new DHashService();