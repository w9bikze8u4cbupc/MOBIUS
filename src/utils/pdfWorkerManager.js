import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

import LoggingService from './logging/LoggingService.js';
import WorkerPool from './workerPool.js';

class PDFWorkerManager {
  constructor() {
    // Create a worker pool with PDF-specific settings
    this.workerPool = new WorkerPool({
      maxWorkers: parseInt(process.env.PDF_WORKER_MAX || '2'),
      workerPath: new URL('../workers/pdfWorker.js', import.meta.url).pathname,
      maxJobsPerWorker: parseInt(process.env.PDF_WORKER_MAX_JOBS || '100'),
      maxHeapPerWorker: parseInt(process.env.PDF_WORKER_MAX_HEAP_MB || '500') * 1024 * 1024,
    });
  }

  async extractImagesFromPDF(pdfPath, outputDir) {
    try {
      const result = await this.workerPool.execute({
        action: 'extractImages',
        pdfPath: pdfPath,
        outputDir: outputDir,
      });

      if (result.success) {
        return result.images;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      LoggingService.error('PDFWorkerManager', 'PDF image extraction failed', {
        pdfPath,
        outputDir,
        error: error.message,
      });
      throw error;
    }
  }

  async terminateAllWorkers() {
    await this.workerPool.terminateAllWorkers();
  }
}

// Create a singleton instance
const pdfWorkerManager = new PDFWorkerManager();

export default pdfWorkerManager;
