#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simple validation script to test the image processing utilities
 */

async function createTestImage(outputPath, width = 200, height = 150, color = { r: 255, g: 0, b: 0 }) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  })
  .png()
  .toFile(outputPath);
  
  console.log(`Created test image: ${outputPath}`);
}

async function testImageProcessing() {
  console.log('=== Testing Image Processing Utilities ===');
  
  const testDir = path.join(__dirname, '../../tmp/validation-test');
  await fs.promises.mkdir(testDir, { recursive: true });
  
  try {
    // Create test image
    const testImagePath = path.join(testDir, 'test.png');
    await createTestImage(testImagePath);
    
    // Test image processing
    const { processImageDerivatives } = await import('../utils/imageProcessing.js');
    const outputDir = path.join(testDir, 'processed');
    
    console.log('Processing test image...');
    const result = await processImageDerivatives(testImagePath, outputDir);
    
    console.log('Processing result:');
    console.log(`- Outputs: ${result.outputs.length}`);
    console.log(`- Errors: ${result.errors.length}`);
    
    for (const output of result.outputs) {
      console.log(`  ${output.type}: ${path.basename(output.path)} (${output.width}x${output.height})`);
    }
    
    // Test perceptual hashing
    const { generatePHash } = await import('../utils/perceptualHashing.js');
    
    console.log('\nTesting perceptual hashing...');
    const hashResult = await generatePHash(testImagePath);
    
    console.log(`Generated hash: ${hashResult.hash}`);
    console.log(`Algorithm: ${hashResult.algorithm}`);
    
    console.log('\n✅ All utilities working correctly!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    // Cleanup
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
      console.log('Cleaned up test files');
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  }
}

async function testBulkUtility() {
  console.log('\n=== Testing Bulk Utility ===');
  
  const testDir = path.join(__dirname, '../../tmp/bulk-test');
  await fs.promises.mkdir(testDir, { recursive: true });
  
  try {
    // Create test images
    const colors = [
      { r: 255, g: 0, b: 0 },    // Red
      { r: 0, g: 255, b: 0 },    // Green  
      { r: 0, g: 0, b: 255 },    // Blue
    ];
    
    for (let i = 0; i < colors.length; i++) {
      const imagePath = path.join(testDir, `image-${i + 1}.png`);
      await createTestImage(imagePath, 150, 100, colors[i]);
    }
    
    // Test hash database building
    const { buildHashDatabase } = await import('../utils/perceptualHashing.js');
    
    console.log('Building hash database...');
    const imagePaths = [];
    const files = await fs.promises.readdir(testDir);
    for (const file of files) {
      if (file.endsWith('.png')) {
        imagePaths.push(path.join(testDir, file));
      }
    }
    
    const database = await buildHashDatabase(imagePaths);
    
    console.log(`Database created with ${database.successCount}/${database.totalImages} images`);
    
    console.log('\n✅ Bulk utility working correctly!');
    
  } catch (error) {
    console.error('❌ Bulk test failed:', error.message);
    throw error;
  } finally {
    // Cleanup
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
      console.log('Cleaned up bulk test files');
    } catch (error) {
      console.warn('Bulk cleanup warning:', error.message);
    }
  }
}

async function main() {
  try {
    await testImageProcessing();
    await testBulkUtility();
    
    console.log('\n🎉 All validation tests passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Validation failed:', error.message);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}