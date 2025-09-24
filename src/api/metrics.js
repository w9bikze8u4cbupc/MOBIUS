/**
 * Observability and Metrics Module for DHash Image Processing
 * Provides metrics collection for extraction performance and queue management
 */

const EventEmitter = require('events');

class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      extraction_method_count: {},
      extraction_failures: 0,
      hash_calculation_times: [],
      low_confidence_matches: [],
      processing_stats: {
        total_processed: 0,
        successful_extractions: 0,
        failed_extractions: 0,
        avg_processing_time: 0
      }
    };
    this.startTime = Date.now();
  }

  /**
   * Record extraction method usage
   */
  recordExtractionMethod(method) {
    this.metrics.extraction_method_count[method] = 
      (this.metrics.extraction_method_count[method] || 0) + 1;
    this.emit('extraction_method', { method, count: this.metrics.extraction_method_count[method] });
  }

  /**
   * Record extraction failure
   */
  recordExtractionFailure(error, context = {}) {
    this.metrics.extraction_failures++;
    this.metrics.processing_stats.failed_extractions++;
    this.emit('extraction_failure', { error: error.message, context, timestamp: Date.now() });
  }

  /**
   * Record successful extraction
   */
  recordExtractionSuccess(context = {}) {
    this.metrics.processing_stats.successful_extractions++;
    this.emit('extraction_success', { context, timestamp: Date.now() });
  }

  /**
   * Record dhash calculation time
   */
  recordHashCalculationTime(timeMs, context = {}) {
    this.metrics.hash_calculation_times.push({
      time: timeMs,
      timestamp: Date.now(),
      ...context
    });

    // Keep only last 1000 measurements for memory efficiency
    if (this.metrics.hash_calculation_times.length > 1000) {
      this.metrics.hash_calculation_times = this.metrics.hash_calculation_times.slice(-1000);
    }

    this.emit('hash_calculation', { timeMs, context });
  }

  /**
   * Record low confidence match for manual review queue
   */
  recordLowConfidenceMatch(match) {
    this.metrics.low_confidence_matches.push({
      ...match,
      timestamp: Date.now(),
      reviewed: false
    });

    this.emit('low_confidence_match', match);
  }

  /**
   * Mark low confidence match as reviewed
   */
  markMatchReviewed(matchId, decision) {
    const match = this.metrics.low_confidence_matches.find(m => m.id === matchId);
    if (match) {
      match.reviewed = true;
      match.decision = decision;
      match.reviewed_at = Date.now();
      this.emit('match_reviewed', { matchId, decision });
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    const hashTimes = this.metrics.hash_calculation_times.map(h => h.time);
    const avgHashTime = hashTimes.length > 0 ? 
      hashTimes.reduce((sum, time) => sum + time, 0) / hashTimes.length : 0;
    
    const p95HashTime = hashTimes.length > 0 ? 
      this.calculatePercentile(hashTimes, 0.95) : 0;

    const lowConfidenceQueueLength = this.metrics.low_confidence_matches
      .filter(m => !m.reviewed).length;

    const uptime = Date.now() - this.startTime;
    
    return {
      extraction_method_count: { ...this.metrics.extraction_method_count },
      extraction_failures: this.metrics.extraction_failures,
      processing_stats: {
        ...this.metrics.processing_stats,
        total_processed: this.metrics.processing_stats.successful_extractions + 
                        this.metrics.processing_stats.failed_extractions,
        failure_rate: this.metrics.processing_stats.failed_extractions > 0 ? 
          this.metrics.processing_stats.failed_extractions / 
          (this.metrics.processing_stats.successful_extractions + this.metrics.processing_stats.failed_extractions) : 0
      },
      hash_performance: {
        avg_hash_time: avgHashTime,
        p95_hash_time: p95HashTime,
        total_calculations: hashTimes.length
      },
      low_confidence_queue_length: lowConfidenceQueueLength,
      low_confidence_total: this.metrics.low_confidence_matches.length,
      uptime_ms: uptime,
      timestamp: Date.now()
    };
  }

  /**
   * Get health status based on metrics
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const issues = [];
    
    // Check extraction failure rate
    if (metrics.processing_stats.failure_rate > 0.05) { // 5% threshold
      issues.push({
        type: 'high_failure_rate',
        severity: 'warning',
        message: `Extraction failure rate: ${(metrics.processing_stats.failure_rate * 100).toFixed(1)}%`
      });
    }

    // Check low confidence queue length
    if (metrics.low_confidence_queue_length > 100) {
      issues.push({
        type: 'long_review_queue',
        severity: 'warning',
        message: `Low confidence queue length: ${metrics.low_confidence_queue_length}`
      });
    }

    // Check hash calculation performance
    if (metrics.hash_performance.p95_hash_time > 5000) { // 5 seconds
      issues.push({
        type: 'slow_hash_calculation',
        severity: 'critical',
        message: `P95 hash calculation time: ${metrics.hash_performance.p95_hash_time}ms`
      });
    }

    return {
      status: issues.length === 0 ? 'healthy' : 
              issues.some(i => i.severity === 'critical') ? 'critical' : 'warning',
      issues,
      last_check: Date.now()
    };
  }

  /**
   * Generate metrics report for review
   */
  generateReport() {
    const metrics = this.getMetrics();
    const health = this.getHealthStatus();
    
    return {
      summary: {
        uptime_hours: Math.round(metrics.uptime_ms / (1000 * 60 * 60)),
        total_processed: metrics.processing_stats.total_processed,
        success_rate: (1 - metrics.processing_stats.failure_rate) * 100,
        avg_hash_time_ms: Math.round(metrics.hash_performance.avg_hash_time),
        pending_reviews: metrics.low_confidence_queue_length
      },
      extraction_methods: metrics.extraction_method_count,
      performance: metrics.hash_performance,
      health: health,
      detailed_metrics: metrics
    };
  }

  /**
   * Export low confidence matches for manual review
   */
  exportLowConfidenceMatches(format = 'json') {
    const unreviewed = this.metrics.low_confidence_matches
      .filter(m => !m.reviewed)
      .map(m => ({
        id: m.id || `match_${m.timestamp}`,
        image1: m.image1,
        image2: m.image2,
        confidence: m.confidence,
        hamming_distance: m.hamming_distance,
        suggested_match: m.match,
        timestamp: new Date(m.timestamp).toISOString(),
        context: m.context || {}
      }));

    if (format === 'csv') {
      return this.convertToCSV(unreviewed);
    }
    
    return JSON.stringify(unreviewed, null, 2);
  }

  /**
   * Import reviewed matches decisions
   */
  importReviewDecisions(reviewData) {
    if (typeof reviewData === 'string') {
      reviewData = JSON.parse(reviewData);
    }

    let imported = 0;
    reviewData.forEach(review => {
      if (review.id && review.decision) {
        this.markMatchReviewed(review.id, review.decision);
        imported++;
      }
    });

    return { imported, total: reviewData.length };
  }

  /**
   * Reset metrics (useful for testing or periodic cleanup)
   */
  reset() {
    this.metrics = {
      extraction_method_count: {},
      extraction_failures: 0,
      hash_calculation_times: [],
      low_confidence_matches: [],
      processing_stats: {
        total_processed: 0,
        successful_extractions: 0,
        failed_extractions: 0,
        avg_processing_time: 0
      }
    };
    this.startTime = Date.now();
    this.emit('metrics_reset');
  }

  /**
   * Calculate percentile from array of numbers
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(percentile * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Convert array of objects to CSV format
   */
  convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          return typeof value === 'string' && value.includes(',') ? 
            `"${value}"` : value;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  }
}

// Singleton instance for global metrics collection
const globalMetrics = new MetricsCollector();

module.exports = {
  MetricsCollector,
  globalMetrics
};