// src/worker/previewMetrics.js
import { Metrics } from '../metrics/metrics.js';

// Create metrics specific to the Preview Worker
const previewWorkerMetrics = {
  // Counter for various job outcomes
  jobOutcomes: Metrics.registerCounter('preview_worker_job_outcomes_total', {
    help: 'Total number of preview jobs by outcome',
    labelNames: ['outcome']
  }),
  
  // Histogram for job duration
  jobDuration: Metrics.registerHistogram('preview_worker_job_duration_seconds', {
    help: 'Duration of preview job processing in seconds',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
  })
};

/**
 * Record a job outcome
 * @param {string} outcome - The outcome of the job (success, failure, retry, etc.)
 * @param {number} duration - Duration of the job in seconds
 */
export function recordJobCompletion(outcome, duration) {
  previewWorkerMetrics.jobOutcomes.inc({ outcome });
  if (duration > 0) {
    previewWorkerMetrics.jobDuration.observe(duration);
  }
}

/**
 * Update queue size metric
 * @param {number} size - Current queue size
 */
export function updateQueueSize(size) {
  // Implementation would depend on how you want to track queue size
}

/**
 * Update active jobs metric
 * @param {number} count - Number of active jobs
 */
export function updateActiveJobs(count) {
  // Implementation would depend on how you want to track active jobs
}

/**
 * Get all preview worker metrics
 * @returns {Object} Metrics object
 */
export function getPreviewWorkerMetrics() {
  return previewWorkerMetrics;
}