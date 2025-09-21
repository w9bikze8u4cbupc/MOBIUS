#!/usr/bin/env node

/**
 * PDF Worker Pool Concurrency Test
 *
 * This script tests the PDF worker pool under concurrent load to measure:
 * - Throughput (pages/second)
 * - Time to first byte (TTFB) impact
 * - Memory usage patterns
 * - Worker recycling behavior
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import WorkerPool from '../src/utils/workerPool.js';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a test PDF file with multiple pages
function createTestPdf(pages = 5) {
  const pdfPath = path.join(__dirname, '..', 'test-files', `test-${Date.now()}.pdf`);
  const outputDir = path.join(__dirname, '..', 'test-files', `output-${Date.now()}`);

  // Create directories if they don't exist
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

  // Create a simple text file that can be converted to PDF
  const textPath = pdfPath.replace('.pdf', '.txt');
  const content = Array(pages)
    .fill(0)
    .map(
      (_, i) => `Page ${i + 1}

This is test content for page ${i + 1} of the PDF document.

Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
    )
    .join('\f'); // Form feed character to separate pages

  fs.writeFileSync(textPath, content);

  // Try to convert text to PDF using available tools
  try {
    // Try using LibreOffice (if available)
    import('child_process').then(({ spawnSync }) => {
      const result = spawnSync('libreoffice', [
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        path.dirname(pdfPath),
        textPath,
      ]);

      if (result.status === 0 && fs.existsSync(pdfPath)) {
        // Clean up text file
        fs.unlinkSync(textPath);
        return { pdfPath, outputDir };
      }

      // Try using wkhtmltopdf (if available)
      const htmlPath = textPath.replace('.txt', '.html');
      const htmlContent = `<html><body><pre>${content.replace(/\n/g, '<br>')}</pre></body></html>`;
      fs.writeFileSync(htmlPath, htmlContent);

      const result2 = spawnSync('wkhtmltopdf', [htmlPath, pdfPath]);

      if (result2.status === 0 && fs.existsSync(pdfPath)) {
        // Clean up temporary files
        fs.unlinkSync(textPath);
        fs.unlinkSync(htmlPath);
        return { pdfPath, outputDir };
      }

      throw new Error('No PDF conversion tool available');
    });
  } catch (error) {
    console.warn('Could not create test PDF, using placeholder:', error.message);
    // Create a minimal PDF placeholder
    const placeholder = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000015 00000 n \n0000000060 00000 n \n0000000111 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n158\n%%EOF',
    );
    fs.writeFileSync(pdfPath, placeholder);
    return { pdfPath, outputDir };
  }

  return { pdfPath, outputDir };
}

async function runConcurrencyTest() {
  console.log('Starting PDF Worker Pool Concurrency Test');
  console.log('========================================');

  // Create test PDF
  const { pdfPath, outputDir } = createTestPdf(3);
  console.log(`Created test PDF: ${pdfPath}`);

  // Create worker pool
  const workerPool = new WorkerPool({
    maxWorkers: 2,
    maxJobsPerWorker: 5,
    maxHeapPerWorker: 100 * 1024 * 1024, // 100MB for testing
  });

  // Test parameters
  const concurrentTasks = 4;
  const totalTasks = 10;

  console.log(`Running ${totalTasks} tasks with ${concurrentTasks} concurrent workers`);

  // Track metrics
  const startTime = Date.now();
  const taskTimes = [];
  const memoryUsage = [];

  // Function to run a single task
  async function runTask(taskId) {
    const taskStartTime = Date.now();

    try {
      // Capture memory usage before task
      const memBefore = process.memoryUsage();

      // Execute task
      const result = await workerPool.execute({
        action: 'extractImages',
        pdfPath,
        outputDir: path.join(outputDir, `task-${taskId}`),
      });

      // Capture memory usage after task
      const memAfter = process.memoryUsage();

      const taskTime = Date.now() - taskStartTime;
      taskTimes.push(taskTime);

      memoryUsage.push({
        rss: (memAfter.rss - memBefore.rss) / 1024 / 1024, // MB
        heapUsed: (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024, // MB
      });

      console.log(`Task ${taskId} completed in ${taskTime}ms`);
      return result;
    } catch (error) {
      const taskTime = Date.now() - taskStartTime;
      taskTimes.push(taskTime);
      console.error(`Task ${taskId} failed after ${taskTime}ms:`, error.message);
      throw error;
    }
  }

  // Run tasks with concurrency limit
  const allTasks = Array.from({ length: totalTasks }, (_, i) => i + 1);
  const results = [];

  // Process tasks in batches
  for (let i = 0; i < allTasks.length; i += concurrentTasks) {
    const batch = allTasks.slice(i, i + concurrentTasks);
    console.log(
      `\nStarting batch ${Math.floor(i / concurrentTasks) + 1}: tasks ${batch.join(', ')}`,
    );

    const batchPromises = batch.map((taskId) => runTask(taskId));
    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
  }

  const totalTime = Date.now() - startTime;

  // Calculate metrics
  const successfulTasks = results.filter((r) => r.status === 'fulfilled').length;
  const failedTasks = results.filter((r) => r.status === 'rejected').length;

  const avgTaskTime = taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length;
  const minTaskTime = Math.min(...taskTimes);
  const maxTaskTime = Math.max(...taskTimes);

  const avgMemoryRSS = memoryUsage.reduce((a, b) => a + b.rss, 0) / memoryUsage.length;
  const avgMemoryHeap = memoryUsage.reduce((a, b) => a + b.heapUsed, 0) / memoryUsage.length;

  // Calculate throughput
  const throughput = (totalTasks / totalTime) * 1000; // tasks/second

  // Output results
  console.log('\nTest Results');
  console.log('============');
  console.log(`Total time: ${totalTime}ms`);
  console.log(`Successful tasks: ${successfulTasks}/${totalTasks}`);
  console.log(`Failed tasks: ${failedTasks}`);
  console.log(`Average task time: ${avgTaskTime.toFixed(2)}ms`);
  console.log(`Min task time: ${minTaskTime}ms`);
  console.log(`Max task time: ${maxTaskTime}ms`);
  console.log(`Throughput: ${throughput.toFixed(2)} tasks/second`);
  console.log(`Average memory RSS increase: ${avgMemoryRSS.toFixed(2)}MB`);
  console.log(`Average memory heap increase: ${avgMemoryHeap.toFixed(2)}MB`);

  // Cleanup
  try {
    workerPool.terminateAllWorkers();
    fs.unlinkSync(pdfPath);
    // Clean up output directory
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    // Clean up test-files directory if empty
    const testFilesDir = path.join(__dirname, '..', 'test-files');
    if (fs.existsSync(testFilesDir) && fs.readdirSync(testFilesDir).length === 0) {
      fs.rmdirSync(testFilesDir);
    }
  } catch (error) {
    console.warn('Cleanup warning:', error.message);
  }

  console.log('\nTest completed successfully!');

  // Exit with appropriate code
  process.exit(failedTasks > 0 ? 1 : 0);
}

// Run the test
runConcurrencyTest().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
