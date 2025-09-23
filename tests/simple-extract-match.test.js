/**
 * Simple Extract-Match End-to-End Test
 * Synthetic tests that validate extraction → processing → matching pipeline
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { extractImages } = require('../scripts/extract_images');
const { processImageComplete, processBatch } = require('../src/utils/imageProcessing');
const { 
  computeImageHash, 
  matchImageToLibrary, 
  buildLibraryFromDirectory,
  addHashesToImageData 
} = require('../src/utils/imageMatching');

// Test configuration
const TEST_DIR = path.join(__dirname, 'test_temp');
const ASSETS_DIR = path.join(TEST_DIR, 'assets');
const LIBRARY_DIR = path.join(TEST_DIR, 'library');
const OUTPUT_DIR = path.join(TEST_DIR, 'output');

// Clean up and setup test directories
async function setupTest() {
  // Clean up previous test data
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  
  // Create test directories
  [TEST_DIR, ASSETS_DIR, LIBRARY_DIR, OUTPUT_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

// Create synthetic test images
async function createTestImages() {
  console.log('Creating synthetic test images...');
  
  const testImages = [
    {
      name: 'game_board.png',
      width: 800,
      height: 600,
      color: { r: 100, g: 150, b: 200 }
    },
    {
      name: 'player_cards.png', 
      width: 400,
      height: 600,
      color: { r: 200, g: 100, b: 150 }
    },
    {
      name: 'tokens.png',
      width: 300,
      height: 300,
      color: { r: 150, g: 200, b: 100 }
    }
  ];
  
  for (const img of testImages) {
    const filePath = path.join(ASSETS_DIR, img.name);
    
    // Create a synthetic image with some pattern
    await sharp({
      create: {
        width: img.width,
        height: img.height,
        channels: 3,
        background: img.color
      }
    })
    .png()
    .toFile(filePath);
    
    console.log(`  Created: ${img.name} (${img.width}x${img.height})`);
  }
  
  return testImages.map(img => path.join(ASSETS_DIR, img.name));
}

// Create a synthetic library
async function createTestLibrary() {
  console.log('Creating test library...');
  
  // Create some library images (similar to test images but slightly different)
  const libraryImages = [
    {
      name: 'wingspan_board.png',
      width: 800,
      height: 600,
      color: { r: 105, g: 155, b: 205 } // Slightly different
    },
    {
      name: 'wingspan_cards.png',
      width: 400,
      height: 600,
      color: { r: 205, g: 105, b: 155 } // Slightly different
    },
    {
      name: 'unknown_game.png',
      width: 500,
      height: 500,
      color: { r: 50, g: 50, b: 50 } // Very different
    }
  ];
  
  for (const img of libraryImages) {
    const filePath = path.join(LIBRARY_DIR, img.name);
    
    await sharp({
      create: {
        width: img.width,
        height: img.height,
        channels: 3,
        background: img.color
      }
    })
    .png()
    .toFile(filePath);
  }
  
  // Build the library
  const library = await buildLibraryFromDirectory(LIBRARY_DIR);
  return library.items;
}

// Test: Image Processing Pipeline
async function testImageProcessing(imagePaths) {
  console.log('\n=== Testing Image Processing ===');
  
  const processDir = path.join(OUTPUT_DIR, 'processed');
  const results = await processBatch(imagePaths, processDir, {
    normalize: true,
    trim: true,
    thumbnail: true,
    webDerivative: true
  });
  
  // Validate results
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    if (result.success) {
      // Check that all expected files were created
      const checks = [
        result.normalized_path && fs.existsSync(result.normalized_path),
        result.trimmed_path && fs.existsSync(result.trimmed_path),
        result.thumbnail_path && fs.existsSync(result.thumbnail_path),
        result.web_path && fs.existsSync(result.web_path)
      ];
      
      if (checks.every(check => check)) {
        console.log(`  ✓ ${result.basename}: All outputs created`);
        passed++;
      } else {
        console.log(`  ✗ ${result.basename}: Missing output files`);
        failed++;
      }
    } else {
      console.log(`  ✗ ${result.basename}: Processing failed - ${result.error}`);
      failed++;
    }
  }
  
  console.log(`\nImage Processing Results: ${passed} passed, ${failed} failed`);
  return { passed, failed, results };
}

// Test: Hash Computation
async function testHashComputation(processedResults) {
  console.log('\n=== Testing Hash Computation ===');
  
  let passed = 0;
  let failed = 0;
  
  for (const result of processedResults) {
    if (!result.success) continue;
    
    try {
      const imagePath = result.processed_path;
      const hash = await computeImageHash(imagePath);
      
      if (hash && typeof hash === 'string' && hash.length > 0) {
        console.log(`  ✓ ${result.basename}: Hash computed (${hash.length} chars)`);
        result.phash = hash; // Add for matching test
        passed++;
      } else {
        console.log(`  ✗ ${result.basename}: Invalid hash computed`);
        failed++;
      }
    } catch (error) {
      console.log(`  ✗ ${result.basename}: Hash computation failed - ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nHash Computation Results: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Test: Image Matching
async function testImageMatching(processedResults, libraryItems) {
  console.log('\n=== Testing Image Matching ===');
  
  let passed = 0;
  let failed = 0;
  const matchResults = [];
  
  for (const result of processedResults) {
    if (!result.success || !result.phash) continue;
    
    try {
      const matchResult = await matchImageToLibrary(result, libraryItems, {
        autoAssignThreshold: 0.90,
        useEmbedding: false,
        phashWeight: 1.0,
        returnTopN: 3
      });
      
      matchResults.push(matchResult);
      
      if (matchResult.matches && matchResult.matches.length > 0) {
        const topMatch = matchResult.matches[0];
        console.log(`  ✓ ${result.basename}: Found ${matchResult.matches.length} matches`);
        console.log(`    Best match: ${topMatch.item.title} (similarity: ${topMatch.total_score.toFixed(3)})`);
        
        if (matchResult.auto_assigned) {
          console.log(`    Auto-assigned: ${matchResult.chosen.title}`);
        }
        
        passed++;
      } else {
        console.log(`  ✗ ${result.basename}: No matches found`);
        failed++;
      }
    } catch (error) {
      console.log(`  ✗ ${result.basename}: Matching failed - ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nImage Matching Results: ${passed} passed, ${failed} failed`);
  return { passed, failed, results: matchResults };
}

// Test: End-to-End Pipeline
async function testEndToEndPipeline() {
  console.log('\n=== Testing End-to-End Pipeline ===');
  
  try {
    // Create test images and library
    const testImagePaths = await createTestImages();
    const libraryItems = await createTestLibrary();
    
    console.log(`Created ${testImagePaths.length} test images and ${libraryItems.length} library items`);
    
    // Test 1: Image Processing
    const processingResults = await testImageProcessing(testImagePaths);
    
    // Test 2: Hash Computation
    const hashResults = await testHashComputation(processingResults.results);
    
    // Test 3: Image Matching
    const matchingResults = await testImageMatching(processingResults.results, libraryItems);
    
    // Summary
    const totalTests = processingResults.passed + processingResults.failed +
                      hashResults.passed + hashResults.failed +
                      matchingResults.passed + matchingResults.failed;
    const totalPassed = processingResults.passed + hashResults.passed + matchingResults.passed;
    const totalFailed = processingResults.failed + hashResults.failed + matchingResults.failed;
    
    console.log('\n=== FINAL RESULTS ===');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
    
    return {
      success: totalFailed === 0,
      totalTests,
      totalPassed,
      totalFailed,
      details: {
        processing: processingResults,
        hashing: hashResults,
        matching: matchingResults
      }
    };
    
  } catch (error) {
    console.error(`End-to-end test failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Cleanup test data
async function cleanupTest() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  console.log('Test cleanup completed');
}

// Main test runner
async function runTests() {
  console.log('Starting Simple Extract-Match End-to-End Tests...');
  console.log('================================================');
  
  try {
    await setupTest();
    const results = await testEndToEndPipeline();
    
    // Cleanup only if successful or user wants to clean up
    if (results.success) {
      await cleanupTest();
    } else {
      console.log(`\nTest data preserved in: ${TEST_DIR}`);
    }
    
    process.exit(results.success ? 0 : 1);
    
  } catch (error) {
    console.error(`Test runner failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for external use
module.exports = {
  runTests,
  testImageProcessing,
  testHashComputation,
  testImageMatching,
  setupTest,
  cleanupTest
};

// Run tests if called directly
if (require.main === module) {
  runTests();
}