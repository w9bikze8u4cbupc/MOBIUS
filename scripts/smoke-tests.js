#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const axios = require('axios');

/**
 * MOBIUS DHash System - Post-Deploy Smoke Tests
 * Validates system health after deployment
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const SAMPLE_IMAGES_DIR = process.env.SAMPLE_IMAGES_DIR || path.join(__dirname, '..', 'test-samples');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      opts[key] = value;
    }
  }
  
  return opts;
}

async function createSampleImages() {
  await fsp.mkdir(SAMPLE_IMAGES_DIR, { recursive: true });
  
  // Create simple test images using ImageMagick if available
  const testImages = [
    { name: 'test-card.png', size: '200x300', color: 'blue' },
    { name: 'test-board.png', size: '400x400', color: 'green' },
    { name: 'test-token.png', size: '50x50', color: 'red' }
  ];
  
  for (const img of testImages) {
    const imgPath = path.join(SAMPLE_IMAGES_DIR, img.name);
    
    if (!fs.existsSync(imgPath)) {
      try {
        const { spawnSync } = require('child_process');
        const result = spawnSync('convert', [
          '-size', img.size,
          `xc:${img.color}`,
          '-font', 'Arial',
          '-pointsize', '20',
          '-gravity', 'center',
          '-annotate', '+0+0', `Test ${img.name}`,
          imgPath
        ]);
        
        if (result.status === 0) {
          console.log(`✓ Created sample image: ${img.name}`);
        } else {
          console.log(`⚠️ Failed to create ${img.name}, creating placeholder`);
          await fsp.writeFile(imgPath, 'placeholder image data');
        }
      } catch (error) {
        console.log(`⚠️ ImageMagick not available, creating placeholder for ${img.name}`);
        await fsp.writeFile(imgPath, 'placeholder image data');
      }
    }
  }
  
  return testImages.map(img => path.join(SAMPLE_IMAGES_DIR, img.name));
}

async function testHealthEndpoint() {
  console.log('🏥 Testing health endpoint...');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`, {
      timeout: 5000
    });
    
    if (response.status !== 200) {
      throw new Error(`Health endpoint returned status ${response.status}`);
    }
    
    const health = response.data;
    
    if (health.status !== 'healthy') {
      throw new Error(`System status is ${health.status}, expected 'healthy'`);
    }
    
    console.log(`✓ Health endpoint OK: ${health.status}`);
    console.log(`  Uptime: ${Math.round(health.uptime)}s`);
    console.log(`  Checks: ${Object.keys(health.checks).length}`);
    
    return { passed: true, data: health };
    
  } catch (error) {
    console.error(`❌ Health endpoint failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testMetricsEndpoint() {
  console.log('📊 Testing DHash metrics endpoint...');
  
  try {
    const response = await axios.get(`${BASE_URL}/metrics/dhash`, {
      timeout: 5000
    });
    
    if (response.status !== 200) {
      throw new Error(`Metrics endpoint returned status ${response.status}`);
    }
    
    const metrics = response.data;
    
    if (!metrics.metrics) {
      throw new Error('Metrics response missing metrics field');
    }
    
    const requiredFields = [
      'avg_hash_time_ms',
      'extraction_failures_rate',
      'low_confidence_queue_length',
      'total_images_processed'
    ];
    
    for (const field of requiredFields) {
      if (metrics.metrics[field] === undefined) {
        throw new Error(`Missing required metric: ${field}`);
      }
    }
    
    console.log(`✓ Metrics endpoint OK`);
    console.log(`  Total images processed: ${metrics.metrics.total_images_processed}`);
    console.log(`  Low confidence queue: ${metrics.metrics.low_confidence_queue_length}`);
    console.log(`  System health: ${metrics.metrics.system_health_status}`);
    
    return { passed: true, data: metrics };
    
  } catch (error) {
    console.error(`❌ Metrics endpoint failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testBackupSystem() {
  console.log('📦 Testing backup system...');
  
  try {
    const backup = require('./backup.js');
    
    // Test backup list functionality
    const backups = await backup.listBackups();
    console.log(`✓ Can list backups: ${backups.length} found`);
    
    // Test latest backup retrieval
    const latest = await backup.getLatestBackup();
    if (latest) {
      console.log(`✓ Latest backup: ${latest.name} (${latest.timestamp})`);
      
      // Test backup verification if we have one
      try {
        await backup.verifyBackup(latest.checksumFile);
        console.log(`✓ Latest backup verification passed`);
      } catch (verifyError) {
        console.log(`⚠️ Backup verification issue: ${verifyError.message}`);
      }
    } else {
      console.log(`⚠️ No backups found (this might be expected for fresh systems)`);
    }
    
    return { passed: true, backups: backups.length };
    
  } catch (error) {
    console.error(`❌ Backup system test failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testMigrationSystem() {
  console.log('🔄 Testing migration system...');
  
  try {
    const migrate = require('./migrate.js');
    
    // Create sample images if they don't exist
    const sampleImages = await createSampleImages();
    
    // Test dry-run migration on sample images
    const migrationResult = await migrate.processMigration({
      dryRun: true,
      source: SAMPLE_IMAGES_DIR,
      batchSize: 10
    });
    
    if (migrationResult.stats.totalFiles === 0) {
      console.log(`⚠️ No test images found in ${SAMPLE_IMAGES_DIR}`);
    } else {
      console.log(`✓ Migration dry-run completed`);
      console.log(`  Test files processed: ${migrationResult.stats.totalFiles}`);
      console.log(`  Errors: ${migrationResult.stats.errorCount}`);
    }
    
    return { 
      passed: true, 
      filesProcessed: migrationResult.stats.totalFiles,
      errors: migrationResult.stats.errorCount
    };
    
  } catch (error) {
    console.error(`❌ Migration system test failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testDHashGeneration() {
  console.log('🔍 Testing DHash generation on known samples...');
  
  try {
    const migrate = require('./migrate.js');
    
    // Create sample images
    const sampleImages = await createSampleImages();
    
    let hashesGenerated = 0;
    let hashesSuccessful = 0;
    
    for (const imagePath of sampleImages) {
      if (fs.existsSync(imagePath)) {
        hashesGenerated++;
        
        // Test simple DHash calculation
        const hash = migrate.calculateSimpleDHash(imagePath);
        if (hash && hash.length === 16) {
          hashesSuccessful++;
          console.log(`  ✓ ${path.basename(imagePath)}: ${hash}`);
        } else {
          console.log(`  ❌ ${path.basename(imagePath)}: hash generation failed`);
        }
      }
    }
    
    if (hashesSuccessful === 0) {
      throw new Error('No hashes generated successfully');
    }
    
    console.log(`✓ DHash generation: ${hashesSuccessful}/${hashesGenerated} successful`);
    
    return { 
      passed: true, 
      attempted: hashesGenerated, 
      successful: hashesSuccessful 
    };
    
  } catch (error) {
    console.error(`❌ DHash generation test failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testLibraryAccess() {
  console.log('📁 Testing library directory access...');
  
  try {
    const libDir = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
    
    // Test directory existence
    if (!fs.existsSync(libDir)) {
      throw new Error(`Library directory not found: ${libDir}`);
    }
    
    // Test read access
    const stats = await fsp.stat(libDir);
    if (!stats.isDirectory()) {
      throw new Error(`Library path is not a directory: ${libDir}`);
    }
    
    // Test scanning functionality
    const migrate = require('./migrate.js');
    const imageFiles = await migrate.scanImageFiles(libDir);
    
    console.log(`✓ Library directory accessible: ${libDir}`);
    console.log(`  Image files found: ${imageFiles.length}`);
    
    return { passed: true, imageCount: imageFiles.length };
    
  } catch (error) {
    console.error(`❌ Library access test failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

// Main smoke test execution
async function runSmokeTests(opts = {}) {
  console.log('🧪 Starting MOBIUS DHash System Smoke Tests\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Sample images: ${SAMPLE_IMAGES_DIR}`);
  console.log(`Test mode: ${opts.quick ? 'QUICK' : 'FULL'}\n`);
  
  const testResults = {
    startTime: new Date().toISOString(),
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };
  
  const tests = [
    { name: 'Health Endpoint', fn: testHealthEndpoint },
    { name: 'Metrics Endpoint', fn: testMetricsEndpoint },
    { name: 'Library Access', fn: testLibraryAccess },
    { name: 'Backup System', fn: testBackupSystem }
  ];
  
  if (!opts.quick) {
    tests.push(
      { name: 'Migration System', fn: testMigrationSystem },
      { name: 'DHash Generation', fn: testDHashGeneration }
    );
  }
  
  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    
    const startTime = Date.now();
    const result = await test.fn();
    const duration = Date.now() - startTime;
    
    testResults.tests.push({
      name: test.name,
      passed: result.passed,
      duration,
      error: result.error || null,
      data: result.data || {}
    });
    
    testResults.summary.total++;
    if (result.passed) {
      testResults.summary.passed++;
      console.log(`✅ ${test.name} PASSED (${duration}ms)`);
    } else {
      testResults.summary.failed++;
      console.log(`❌ ${test.name} FAILED (${duration}ms)`);
    }
  }
  
  testResults.endTime = new Date().toISOString();
  
  // Summary
  console.log('\n=== SMOKE TEST SUMMARY ===');
  console.log(`Total tests: ${testResults.summary.total}`);
  console.log(`Passed: ${testResults.summary.passed}`);
  console.log(`Failed: ${testResults.summary.failed}`);
  console.log(`Success rate: ${Math.round((testResults.summary.passed / testResults.summary.total) * 100)}%`);
  
  if (opts.output) {
    await fsp.writeFile(opts.output, JSON.stringify(testResults, null, 2));
    console.log(`\nTest results saved to: ${opts.output}`);
  }
  
  const allPassed = testResults.summary.failed === 0;
  if (allPassed) {
    console.log('\n🎉 All smoke tests passed! System is ready for production use.');
  } else {
    console.log('\n⚠️ Some smoke tests failed. Review the issues before proceeding.');
  }
  
  return testResults;
}

// Main execution
async function main() {
  const opts = parseArgs();
  
  try {
    if (opts.help) {
      console.log(`
MOBIUS DHash System - Post-Deploy Smoke Tests

Usage: node smoke-tests.js [options]

Options:
  --quick             Run only essential tests (faster)
  --output FILE       Save test results to JSON file
  --base-url URL      Base URL for API tests (default: http://localhost:5001)
  --samples-dir DIR   Directory for sample test images
  --help              Show this help message

Environment Variables:
  BASE_URL            Base URL for API endpoints
  SAMPLE_IMAGES_DIR   Directory for test sample images
  LIBRARY_DIR         Main library directory to test

Test Categories:
  Essential Tests:
    - Health endpoint availability and status
    - Metrics endpoint functionality
    - Library directory access
    - Backup system basic functionality
  
  Full Tests (--quick skips these):
    - Migration system dry-run
    - DHash generation on sample images

Examples:
  node smoke-tests.js                           # Run all tests
  node smoke-tests.js --quick                   # Run essential tests only
  node smoke-tests.js --output results.json    # Save results to file
  node smoke-tests.js --base-url http://prod:5001  # Test production server
`);
      return;
    }
    
    // Override defaults with command line options
    if (opts['base-url']) {
      process.env.BASE_URL = opts['base-url'];
    }
    if (opts['samples-dir']) {
      process.env.SAMPLE_IMAGES_DIR = opts['samples-dir'];
    }
    
    const results = await runSmokeTests(opts);
    
    // Exit with error code if tests failed
    if (results.summary.failed > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`\nSmoke tests failed with error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runSmokeTests,
  testHealthEndpoint,
  testMetricsEndpoint,
  testBackupSystem,
  testMigrationSystem,
  testDHashGeneration,
  testLibraryAccess
};