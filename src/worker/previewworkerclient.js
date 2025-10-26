// src/worker/previewWorkerClient.js
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { validatePayload } from '../../scripts/validatePreviewPayload.js';

// Environment configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREVIEW_QUEUE_MAX = parseInt(process.env.PREVIEW_QUEUE_MAX || '20');
const QUEUE_NAME = process.env.PREVIEW_QUEUE_NAME || 'preview-jobs';

// Initialize connection
const connection = new IORedis(REDIS_URL);

// Create queue
const previewQueue = new Queue(QUEUE_NAME, { connection });

/**
 * Enqueue a preview job
 * @param {Object} jobData - The job data to enqueue
 * @returns {Promise<Object>} Enqueued job information
 */
export async function enqueuePreviewJob(jobData) {
  // Validate payload before enqueuing
  const errors = validatePayload(jobData);
  if (errors.length > 0) {
    throw new Error(`Invalid job payload: ${errors.join(', ')}`);
  }
  
  // Check queue length to enforce limit
  const queueCount = await previewQueue.count();
  if (queueCount >= PREVIEW_QUEUE_MAX) {
    throw new Error(`Queue is full (max ${PREVIEW_QUEUE_MAX} jobs). Please try again later.`);
  }
  
  // Add job to queue with proper options
  const job = await previewQueue.add('render-preview', jobData, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 }, // starts 1s then ~2s,4s...
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 100 },
    jobId: jobData.jobId, // idempotency: use jobId to avoid duplicates
    priority: jobData.priority === 'high' ? 1 : 2
  });
  
  return {
    jobId: job.id,
    status: 'queued'
  };
}

/**
 * Get job status
 * @param {string} jobId - The job ID to query
 * @returns {Promise<Object>} Job status information
 */
export async function getJobStatus(jobId) {
  const job = await previewQueue.getJob(jobId);
  
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const state = await job.getState();
  
  return {
    jobId,
    status: state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    createdAt: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason
  };
}

/**
 * Get job result artifact URL
 * @param {string} jobId - The job ID to query
 * @returns {Promise<string>} Artifact URL
 */
export async function getJobArtifactUrl(jobId) {
  // In a real implementation, this would return a URL to download the artifact
  // For now, we'll return a placeholder
  return `/api/preview/${jobId}/artifact`;
}

/**
 * Get queue metrics
 * @returns {Promise<Object>} Queue metrics
 */
export async function getQueueMetrics() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    previewQueue.getWaitingCount(),
    previewQueue.getActiveCount(),
    previewQueue.getCompletedCount(),
    previewQueue.getFailedCount(),
    previewQueue.getDelayedCount()
  ]);
  
  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}