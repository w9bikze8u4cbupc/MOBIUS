// src/worker/previewWorker.js
import pkg from 'bullmq';
import IORedis from 'ioredis';
import { validatePayload } from '../../scripts/validatePreviewPayload.js'; // adjust path
import { renderPreview } from './jobHandlers/renderPreview.js';
import { recordJobCompletion, updateActiveJobs, updateQueueSize } from './previewMetrics.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Worker, Queue } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure Redis connection for BullMQ
const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const QUEUE_NAME = process.env.PREVIEW_QUEUE_NAME || 'preview-jobs';
const CONCURRENCY = Number(process.env.PREVIEW_WORKER_CONCURRENCY || 2);

// Create queue instance
export const queue = new Queue(QUEUE_NAME, { connection });

const worker = new Worker(
  QUEUE_NAME,
  async job => {
    const payload = job.data;
    // Validate
    const errors = validatePayload(payload);
    if (errors.length) {
      recordJobCompletion('invalid', 0);
      console.warn(`Invalid preview job payload for jobId ${payload?.jobId}:`, errors);
      // Move to failed immediately and record reason
      throw new Error(`Invalid preview payload: ${errors.join('; ')}`);
    }

    // Dry-run support
    if (payload.dryRun) {
      recordJobCompletion('dryrun', 0);
      console.log(`Dry-run preview job received for jobId ${payload.jobId} — skipping render`);
      return { dryRun: true, jobId: payload.jobId };
    }

    recordJobCompletion('started', 0);
    const start = Date.now();

    try {
      // Create preview directory
      const previewDir = path.join(process.env.DATA_DIR || './data', 'previews', payload.projectId, payload.jobId);
      await fs.mkdir(previewDir, { recursive: true });
      
      const result = await renderPreview(payload, previewDir);
      recordJobCompletion('completed', (Date.now() - start) / 1000);
      console.log(`Preview rendered for jobId ${payload.jobId} in ${Date.now() - start}ms`);
      return result;
    } catch (err) {
      recordJobCompletion('failed', (Date.now() - start) / 1000);
      console.error(`Preview render failed for jobId ${payload.jobId}:`, err);
      // Re-throw to let BullMQ handle retries/backoff
      throw err;
    }
  },
  { connection, concurrency: CONCURRENCY }
);

// graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutdown signal received, closing preview worker');
  await worker.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
});

worker.on('active', (job) => {
  console.log(`Job ${job.id} is now active`);
  // Update active jobs metric
});

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
  recordJobCompletion('success', job.finishedOn ? (job.finishedOn - job.processedOn) / 1000 : 0);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
  recordJobCompletion('failure', job.finishedOn && job.processedOn ? (job.finishedOn - job.processedOn) / 1000 : 0);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log('Preview Worker started');

export default worker;