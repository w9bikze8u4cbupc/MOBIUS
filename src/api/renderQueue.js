import { randomUUID } from 'crypto';

const queue = [];
const jobs = new Map();
let executor = null;
let isProcessing = false;

function createJobId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return `render-job-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function setRenderExecutor(fn) {
  executor = fn;
}

export function enqueueRenderJob({ config }) {
  if (!executor) {
    throw new Error('RENDER_EXECUTOR_NOT_CONFIGURED');
  }

  const job = {
    id: createJobId(),
    status: 'queued',
    progress: 0,
    error: null,
    resultPaths: [],
    config,
    createdAt: Date.now(),
  };

  jobs.set(job.id, job);
  queue.push(job);
  processNext();
  return job;
}

export function getRenderJob(jobId) {
  return jobs.get(jobId);
}

export function getRenderJobArtifacts(jobId) {
  const job = jobs.get(jobId);
  return job?.resultPaths || [];
}

export function updateJobProgress(jobId, progress) {
  const job = jobs.get(jobId);
  if (!job) return;

  const nextProgress = Math.max(0, Math.min(100, Number(progress)));
  if (Number.isFinite(nextProgress)) {
    job.progress = nextProgress;
  }
}

async function processNext() {
  if (isProcessing || !executor) return;
  const next = queue.shift();
  if (!next) return;

  isProcessing = true;
  next.status = 'running';
  updateJobProgress(next.id, next.progress || 5);

  try {
    const result = await executor(next, {
      updateProgress: (value) => updateJobProgress(next.id, value),
    });

    next.status = 'completed';
    updateJobProgress(next.id, 100);
    next.resultPaths = result?.artifacts || [];
    next.error = null;
  } catch (err) {
    next.status = 'failed';
    next.error = err?.message || String(err);
  } finally {
    isProcessing = false;
    processNext();
  }
}

export function resetRenderQueue() {
  queue.length = 0;
  jobs.clear();
  isProcessing = false;
}

