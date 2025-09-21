import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

import LoggingService from './logging/LoggingService.js';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WorkerPool {
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers || 2;
    this.workerPath = options.workerPath || path.join(__dirname, '../workers/pdfWorker.js');
    this.maxJobsPerWorker = options.maxJobsPerWorker || 100;
    this.maxHeapPerWorker = options.maxHeapPerWorker || 500 * 1024 * 1024; // 500MB

    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers = 0;
    this.workerJobCounts = new Map();
    this.workerCreationTimes = new Map();
  }

  async execute(taskData) {
    return new Promise((resolve, reject) => {
      const task = { taskData, resolve, reject };

      if (this.activeWorkers < this.maxWorkers) {
        this.processTask(task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  async processTask(task) {
    this.activeWorkers++;

    try {
      const worker = new Worker(this.workerPath);

      // Track worker for cleanup and recycling
      this.workers.push(worker);
      const workerId = worker.threadId;
      this.workerJobCounts.set(workerId, (this.workerJobCounts.get(workerId) || 0) + 1);
      if (!this.workerCreationTimes.has(workerId)) {
        this.workerCreationTimes.set(workerId, Date.now());
      }

      // Set timeout for worker
      const timeout = setTimeout(() => {
        worker.terminate();
        this.cleanupWorker(worker);
        task.reject(new Error('Worker timeout'));
      }, 60000); // 60 second timeout

      worker.on('message', (result) => {
        clearTimeout(timeout);
        this.cleanupWorker(worker);
        if (result.success) {
          task.resolve(result);
        } else {
          task.reject(new Error(result.error));
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        this.cleanupWorker(worker);
        task.reject(error);
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        this.cleanupWorker(worker);
        if (code !== 0) {
          task.reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });

      // Send task to worker
      worker.postMessage(task.taskData);
    } catch (error) {
      this.activeWorkers--;
      task.reject(error);
    }
  }

  shouldRecycleWorker(workerId) {
    const jobCount = this.workerJobCounts.get(workerId) || 0;
    const creationTime = this.workerCreationTimes.get(workerId) || Date.now();

    // Recycle if max jobs reached or if worker is older than 1 hour
    return jobCount >= this.maxJobsPerWorker || Date.now() - creationTime > 3600000;
  }

  cleanupWorker(worker) {
    const workerId = worker.threadId;

    // Clean up worker tracking
    this.activeWorkers--;
    this.workers = this.workers.filter((w) => w !== worker);
    this.workerJobCounts.delete(workerId);
    this.workerCreationTimes.delete(workerId);

    // Terminate worker if it should be recycled
    if (this.shouldRecycleWorker(workerId)) {
      try {
        worker.terminate();
        LoggingService.info('WorkerPool', 'Terminated worker for recycling', { workerId });
      } catch (error) {
        LoggingService.warn('WorkerPool', 'Failed to terminate worker', {
          workerId,
          error: error.message,
        });
      }
    }

    // Process next task in queue if available
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift();
      this.processTask(nextTask);
    }
  }

  async terminateAllWorkers() {
    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch (error) {
        LoggingService.warn('WorkerPool', 'Failed to terminate worker', error);
      }
    }
    this.workers = [];
    this.activeWorkers = 0;
    this.taskQueue = [];
    this.workerJobCounts.clear();
    this.workerCreationTimes.clear();
  }
}

export default WorkerPool;
