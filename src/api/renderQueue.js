import { randomUUID } from 'crypto';
import { runRenderJob } from './renderExecutor.js';

const queue = [];
const jobs = new Map();
let processing = false;

function buildJob(config, options = {}) {
  const id = options.jobId || randomUUID();
  return {
    id,
    status: 'queued',
    progress: 0,
    error: null,
    resultPaths: [],
    config,
  };
}

async function processQueue(executor, outputOptions) {
  if (processing) return;
  const next = queue.shift();
  if (!next) return;
  processing = true;

  const job = jobs.get(next.id);
  if (!job) {
    processing = false;
    return;
  }

  job.status = 'running';
  job.progress = 0;

  try {
    const resultPaths = await executor(job, {
      ...outputOptions,
      onProgress: (progress) => {
        if (typeof progress === 'number' && Number.isFinite(progress)) {
          job.progress = Math.max(0, Math.min(100, progress));
        }
      },
    });

    job.resultPaths = Array.isArray(resultPaths) ? resultPaths : [];
    job.status = 'completed';
    job.progress = 100;
  } catch (err) {
    job.status = 'failed';
    job.error = err?.message || 'Unknown render failure';
  } finally {
    processing = false;
    if (queue.length > 0) {
      setImmediate(() => processQueue(executor, outputOptions));
    }
  }
}

export function enqueueRenderJob(config, options = {}) {
  const executor = options.executor || runRenderJob;
  const job = buildJob(config, options);

  jobs.set(job.id, job);
  queue.push(job);
  processQueue(executor, options.outputOptions);

  return job;
}

export function getJob(jobId) {
  return jobs.get(jobId);
}

export function listJobArtifacts(jobId) {
  const job = jobs.get(jobId);
  return job?.resultPaths || [];
}

export function getQueueSize() {
  return queue.length;
}

export function resetRenderQueue() {
  queue.splice(0, queue.length);
  jobs.clear();
  processing = false;
}
