// src/worker/previewMetrics.js
import { Metrics } from '../metrics/metrics.js';

// Simple tracking without using the Metrics registry pattern
const jobOutcomes = new Map();
const jobDurations = [];

// Helper functions to track metrics
function trackJobOutcome(outcome) {
  const count = jobOutcomes.get(outcome) || 0;
  jobOutcomes.set(outcome, count + 1);
}

function trackJobDuration(duration) {
  jobDurations.push(duration);
}

/**
 * Record a job outcome
 * @param {string} outcome - The outcome of the job (success, failure, retry, etc.)
 * @param {number} duration - Duration of the job in seconds
 */
export function recordJobCompletion(outcome, duration) {
  trackJobOutcome(outcome);
  if (duration > 0) {
    trackJobDuration(duration);
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
  return {
    jobOutcomes: Array.from(jobOutcomes.entries()),
    jobDurations
  };
}