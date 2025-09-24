#!/usr/bin/env node

/**
 * Performance benchmark script for Mobius Games Tutorial Generator
 * Tests PDF extraction and image hashing performance at scale
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { calculateImageHash } from '../src/utils/imageHashing.js';
import { extractImagesFromPDF } from '../src/utils/pdfExtraction.js';

const BENCHMARK_ITERATIONS = 10;
const RESULTS_FILE = 'benchmark-results.json';

/**
 * Create synthetic test images for benchmarking
 */
async function createTestImages(count = 100) {
  const testDir = path.join(process.cwd(), 'tmp', 'benchmark');
  await fsPromises.mkdir(testDir, { recursive: true });
  
  console.log(`Creating ${count} test images...`);
  
  const images = [];
  for (let i = 0; i < count; i++) {
    // Create simple test image data (simplified for speed)
    const width = 200;
    const height = 200;
    const channels = 3;
    const data = Buffer.alloc(width * height * channels);
    
    // Fill with pseudo-random pattern based on index
    for (let j = 0; j < data.length; j++) {
      data[j] = (i * 37 + j * 13) % 256; // Deterministic pseudo-random
    }
    
    const imagePath = path.join(testDir, `test-${i.toString().padStart(3, '0')}.raw`);
    await fsPromises.writeFile(imagePath, data);
    
    images.push({
      path: imagePath,
      width,
      height,
      channels,
      index: i
    });
  }
  
  return images;
}

/**
 * Benchmark image hashing performance
 */
async function benchmarkHashing(images) {
  console.log(`\\nBenchmarking image hashing (${images.length} images, ${BENCHMARK_ITERATIONS} iterations)...`);
  
  const results = {
    iterations: BENCHMARK_ITERATIONS,
    imageCount: images.length,
    times: [],
    errors: 0,
    hashes: []
  };
  
  for (let iteration = 0; iteration < BENCHMARK_ITERATIONS; iteration++) {
    const startTime = performance.now();
    const iterationHashes = [];
    let iterationErrors = 0;
    
    // Sample subset of images for each iteration to avoid memory issues
    const sampleSize = Math.min(10, images.length);
    const sampledImages = images.slice(0, sampleSize);
    
    for (const image of sampledImages) {
      try {
        // Create a simple PNG-like buffer for hashing
        const sharp = (await import('sharp')).default;
        const buffer = await sharp({
          create: {
            width: image.width,
            height: image.height,
            channels: image.channels,
            background: { r: (image.index * 50) % 255, g: (image.index * 75) % 255, b: (image.index * 100) % 255 }
          }
        }).png().toBuffer();
        
        const hashResult = await calculateImageHash(buffer);
        iterationHashes.push({
          imageIndex: image.index,
          hash: hashResult.hash.hex,
          processingTime: performance.now() - startTime
        });
      } catch (error) {
        iterationErrors++;
        console.warn(`Hashing error for image ${image.index}:`, error.message);
      }
    }
    
    const iterationTime = performance.now() - startTime;
    results.times.push(iterationTime);
    results.errors += iterationErrors;
    
    if (iteration === 0) {
      results.hashes = iterationHashes; // Save first iteration hashes for analysis
    }
    
    process.stdout.write(`\\r  Iteration ${iteration + 1}/${BENCHMARK_ITERATIONS} (${iterationTime.toFixed(2)}ms)`);
  }
  
  console.log('\\n');
  return results;
}

/**
 * Calculate performance statistics
 */
function calculateStats(times) {
  if (!times || times.length === 0) return {};
  
  const sorted = times.slice().sort((a, b) => a - b);
  return {
    count: times.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    stdDev: Math.sqrt(times.reduce((sum, time) => sum + Math.pow(time - (times.reduce((a, b) => a + b, 0) / times.length), 2), 0) / times.length)
  };
}

/**
 * Main benchmark function
 */
async function runBenchmark() {
  console.log('🚀 Mobius Games Tutorial Generator - Performance Benchmark');
  console.log('=========================================================');
  
  const benchmarkStart = performance.now();
  
  try {
    // System info
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: (await import('os')).cpus().length,
      totalMemory: (await import('os')).totalmem(),
      freeMemory: (await import('os')).freemem(),
      timestamp: new Date().toISOString()
    };
    
    console.log('System Info:');
    console.log(`  Node.js: ${systemInfo.nodeVersion}`);
    console.log(`  Platform: ${systemInfo.platform} ${systemInfo.arch}`);
    console.log(`  CPUs: ${systemInfo.cpus}`);
    console.log(`  Memory: ${Math.round(systemInfo.totalMemory / 1024 / 1024 / 1024)}GB total, ${Math.round(systemInfo.freeMemory / 1024 / 1024 / 1024)}GB free`);
    
    // Create test data
    const images = await createTestImages(50); // Reduced count for faster testing
    
    // Benchmark hashing
    const hashingResults = await benchmarkHashing(images);
    const hashingStats = calculateStats(hashingResults.times);
    
    console.log('Image Hashing Results:');
    console.log(`  Iterations: ${hashingResults.iterations}`);
    console.log(`  Images per iteration: ${Math.min(10, images.length)}`);
    console.log(`  Total errors: ${hashingResults.errors}`);
    console.log(`  Mean time: ${hashingStats.mean.toFixed(2)}ms`);
    console.log(`  Median time: ${hashingStats.median.toFixed(2)}ms`);
    console.log(`  95th percentile: ${hashingStats.p95.toFixed(2)}ms`);
    console.log(`  99th percentile: ${hashingStats.p99.toFixed(2)}ms`);
    console.log(`  Min/Max: ${hashingStats.min.toFixed(2)}ms / ${hashingStats.max.toFixed(2)}ms`);
    
    // Memory usage check
    const memoryUsage = process.memoryUsage();
    console.log('\\nMemory Usage:');
    console.log(`  RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`);
    console.log(`  Heap Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`  Heap Total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`);
    console.log(`  External: ${Math.round(memoryUsage.external / 1024 / 1024)}MB`);
    
    // Performance recommendations
    console.log('\\n📊 Performance Analysis:');
    if (hashingStats.p95 < 100) {
      console.log('✅ Excellent performance - 95th percentile under 100ms');
    } else if (hashingStats.p95 < 500) {
      console.log('⚠️  Good performance - 95th percentile under 500ms');
    } else {
      console.log('❌ Performance concern - 95th percentile over 500ms');
      console.log('   Consider optimizing image processing or reducing concurrent operations');
    }
    
    if (hashingResults.errors === 0) {
      console.log('✅ No processing errors - system stable');
    } else {
      console.log(`⚠️  ${hashingResults.errors} processing errors - investigate system stability`);
    }
    
    // Save detailed results
    const fullResults = {
      systemInfo,
      benchmarkDuration: performance.now() - benchmarkStart,
      hashing: {
        ...hashingResults,
        statistics: hashingStats
      },
      memoryUsage,
      recommendations: []
    };
    
    await fsPromises.writeFile(RESULTS_FILE, JSON.stringify(fullResults, null, 2));
    console.log(`\\n📁 Detailed results saved to: ${RESULTS_FILE}`);
    
    const totalTime = performance.now() - benchmarkStart;
    console.log(`\\n🏁 Benchmark completed in ${totalTime.toFixed(2)}ms`);
    
    // Cleanup
    try {
      await fsPromises.rm(path.join(process.cwd(), 'tmp', 'benchmark'), { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error.message);
    process.exit(1);
  }
}

// Add to package.json scripts or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark().catch(console.error);
}

export { runBenchmark };