#!/usr/bin/env node

/**
 * Basic test suite for DHash functionality
 * Tests core DHash operations without requiring real images
 */

const fs = require('fs');
const path = require('path');
const { DHashProcessor } = require('../src/dhash.js');

// Test data and utilities
const TEST_LIBRARY = {
  images: [
    { filename: 'test1.jpg', path: '/tmp/test1.jpg' },
    { filename: 'test2.jpg', path: '/tmp/test2.jpg' },
    { filename: 'test3.jpg', path: '/tmp/test3.jpg' }
  ]
};

// Create a minimal test image (1x1 PNG) for testing
function createTestImage(filename) {
  const testImageData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk size
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // Width: 1
    0x00, 0x00, 0x00, 0x01, // Height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth: 8, Color type: RGB
    0x90, 0x77, 0x53, 0xDE, // CRC
    0x00, 0x00, 0x00, 0x0C, // IDAT chunk size
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
    0xE5, 0x27, 0xDE, 0xFC, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk size
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);
  
  fs.writeFileSync(filename, testImageData);
}

// Test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }
  
  test(name, fn) {
    this.tests.push({ name, fn });
  }
  
  async run() {
    console.log(`\n=== DHash Test Suite ===\n`);
    
    for (const { name, fn } of this.tests) {
      try {
        console.log(`Testing: ${name}...`);
        await fn();
        console.log(`✓ PASS: ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`✗ FAIL: ${name}`);
        console.log(`  Error: ${error.message}`);
        this.failed++;
      }
    }
    
    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Total: ${this.tests.length}`);
    
    if (this.failed > 0) {
      console.log(`\nSome tests failed. Check the implementation.`);
      process.exit(1);
    } else {
      console.log(`\nAll tests passed! ✓`);
    }
  }
  
  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }
  
  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }
}

// Test suite
const runner = new TestRunner();

runner.test('DHashProcessor instantiation', () => {
  const processor = new DHashProcessor();
  runner.assert(processor instanceof DHashProcessor, 'Should create DHashProcessor instance');
  runner.assertEqual(processor.options.hashSize, 8, 'Default hash size should be 8');
});

runner.test('Hash comparison functionality', () => {
  const processor = new DHashProcessor();
  
  // Test identical hashes
  const distance1 = processor.compareHashes('0123456789ABCDEF', '0123456789ABCDEF');
  runner.assertEqual(distance1, 0, 'Identical hashes should have distance 0');
  
  // Test completely different hashes
  const distance2 = processor.compareHashes('0000000000000000', 'FFFFFFFFFFFFFFFF');
  runner.assertEqual(distance2, 64, 'Completely different hashes should have distance 64');
  
  // Test single bit difference
  const distance3 = processor.compareHashes('0000000000000000', '0000000000000001');
  runner.assertEqual(distance3, 1, 'Single bit difference should have distance 1');
});

runner.test('Similarity detection', () => {
  const processor = new DHashProcessor();
  
  // Similar hashes (within threshold)
  runner.assert(processor.areSimilar('0000000000000000', '0000000000000001', 10), 
    'Hashes with distance 1 should be similar with threshold 10');
  
  // Dissimilar hashes (outside threshold) 
  runner.assert(!processor.areSimilar('0000000000000000', 'FFFFFFFFFFFFFFFF', 10),
    'Hashes with distance 64 should not be similar with threshold 10');
});

runner.test('Migration script validation functions', async () => {
  const { validateLibraryFormat } = require('../scripts/migrate_dhash.js');
  
  // Valid library format
  const validLib = { images: [{ filename: 'test.jpg', path: '/test.jpg' }] };
  
  try {
    validateLibraryFormat(validLib);
    // Should not throw
  } catch (error) {
    throw new Error(`Valid library should not throw: ${error.message}`);
  }
  
  // Invalid library format
  const invalidLib = { images: [{ filename: 'test.jpg' }] }; // missing path
  
  try {
    validateLibraryFormat(invalidLib);
    throw new Error('Invalid library should throw an error');
  } catch (error) {
    runner.assert(error.message.includes('Missing required fields'), 
      'Should throw error about missing fields');
  }
});

runner.test('Test library creation and JSON parsing', () => {
  const testFile = '/tmp/test-library.json';
  
  // Write test library
  fs.writeFileSync(testFile, JSON.stringify(TEST_LIBRARY, null, 2));
  
  // Read and parse
  const loaded = JSON.parse(fs.readFileSync(testFile, 'utf8'));
  
  runner.assertEqual(loaded.images.length, 3, 'Should load 3 test images');
  runner.assertEqual(loaded.images[0].filename, 'test1.jpg', 'Should preserve filename');
  
  // Cleanup
  fs.unlinkSync(testFile);
});

runner.test('Batch processing structure', () => {
  const processor = new DHashProcessor();
  
  // Test with empty array
  const results1 = processor.batchProcess([]);
  runner.assertEqual(results1.length, 0, 'Empty array should return empty results');
  
  // Test stats generation
  const stats1 = processor.generateStats(results1);
  runner.assertEqual(stats1.total, 0, 'Stats should show 0 total');
  runner.assertEqual(stats1.successful, 0, 'Stats should show 0 successful');
  runner.assertEqual(stats1.failed, 0, 'Stats should show 0 failed');
  
  // Test with mock results
  const mockResults = [
    { path: 'test1.jpg', hash: 'ABC123', error: null },
    { path: 'test2.jpg', hash: null, error: 'File not found' }
  ];
  
  const stats2 = processor.generateStats(mockResults);
  runner.assertEqual(stats2.total, 2, 'Stats should show 2 total');
  runner.assertEqual(stats2.successful, 1, 'Stats should show 1 successful');
  runner.assertEqual(stats2.failed, 1, 'Stats should show 1 failed');
  runner.assertEqual(stats2.successRate, 0.5, 'Success rate should be 0.5');
});

runner.test('LCM manager functions', () => {
  const { findLowConfidenceMatches } = require('../scripts/lcm_manager.js');
  
  // Test with library that has no DHash data
  const libWithoutHashes = { images: [{ filename: 'test.jpg', path: '/test.jpg' }] };
  const matches1 = findLowConfidenceMatches(libWithoutHashes, 8, 15);
  runner.assertEqual(matches1.length, 0, 'Library without hashes should return no matches');
  
  // Test with library that has DHash data
  const libWithHashes = {
    images: [
      { filename: 'test1.jpg', path: '/test1.jpg', dhash: '0000000000000000' },
      { filename: 'test2.jpg', path: '/test2.jpg', dhash: '000000000000000F' }, // distance 4
      { filename: 'test3.jpg', path: '/test3.jpg', dhash: '00000000000003FF' }  // distance 10 from first
    ]
  };
  
  const matches2 = findLowConfidenceMatches(libWithHashes, 8, 15);
  runner.assertEqual(matches2.length, 1, 'Should find one match in distance range 8-15');
});

// Check FFmpeg availability for integration tests
runner.test('FFmpeg availability check', () => {
  const { spawnSync } = require('child_process');
  
  try {
    const result = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    runner.assert(result.status === 0, 'FFmpeg should be available and return status 0');
    runner.assert(result.stdout.includes('ffmpeg version'), 'FFmpeg should return version info');
  } catch (error) {
    // FFmpeg not available - this is expected in some environments
    console.log('  NOTE: FFmpeg not available for integration tests');
    console.log('  This test passes but full DHash functionality requires FFmpeg');
  }
});

// Basic file operations test
runner.test('File operations and cleanup', () => {
  const testFile = '/tmp/dhash-test-file.txt';
  const testContent = 'DHash test content';
  
  // Write test file
  fs.writeFileSync(testFile, testContent);
  runner.assert(fs.existsSync(testFile), 'Test file should be created');
  
  // Read test file
  const content = fs.readFileSync(testFile, 'utf8');
  runner.assertEqual(content, testContent, 'File content should match');
  
  // Cleanup
  fs.unlinkSync(testFile);
  runner.assert(!fs.existsSync(testFile), 'Test file should be cleaned up');
});

// Run all tests
if (require.main === module) {
  runner.run().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { TestRunner, createTestImage };