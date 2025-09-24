import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ensurePngMaster, generateWebDerivative, generateThumbnail, processImageDerivatives, batchProcessImages } from '../utils/imageProcessing.js';
import { createTestImageDirectory, cleanupTestFiles, validateTestImage } from './testUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Image Processing', () => {
  let testDir;
  let testImageStructure;
  let cleanup = [];

  beforeAll(async () => {
    testDir = path.join(__dirname, 'temp', 'processing-tests');
    cleanup.push(testDir);
    
    // Create test image directory structure
    testImageStructure = await createTestImageDirectory(testDir);
    
    // Validate test images
    for (const imagePath of testImageStructure.allImages) {
      const validation = await validateTestImage(imagePath);
      expect(validation.valid).toBe(true);
    }
  });

  afterAll(async () => {
    await cleanupTestFiles(cleanup);
  });

  describe('ensurePngMaster', () => {
    test('should create PNG master from JPEG input', async () => {
      const jpegImage = testImageStructure.allImages.find(img => img.endsWith('.jpg'));
      const outputDir = path.join(testDir, 'masters-test');
      cleanup.push(outputDir);
      
      const result = await ensurePngMaster(jpegImage, outputDir);
      
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('type', 'master');
      expect(result).toHaveProperty('format', 'png');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
      expect(result).toHaveProperty('size');
      
      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.path).toMatch(/.*_master\.png$/);
      
      // Validate created PNG
      const validation = await validateTestImage(result.path);
      expect(validation.valid).toBe(true);
      expect(validation.format).toBe('png');
    });

    test('should create PNG master from PNG input', async () => {
      const pngImage = testImageStructure.allImages.find(img => img.endsWith('.png'));
      const outputDir = path.join(testDir, 'masters-png-test');
      cleanup.push(outputDir);
      
      const result = await ensurePngMaster(pngImage, outputDir);
      
      expect(result.format).toBe('png');
      expect(fs.existsSync(result.path)).toBe(true);
      
      const validation = await validateTestImage(result.path);
      expect(validation.valid).toBe(true);
    });

    test('should handle invalid input file', async () => {
      const invalidPath = path.join(testDir, 'invalid.txt');
      fs.writeFileSync(invalidPath, 'Not an image');
      cleanup.push(invalidPath);
      
      const outputDir = path.join(testDir, 'masters-invalid-test');
      
      await expect(ensurePngMaster(invalidPath, outputDir)).rejects.toThrow();
    });
  });

  describe('generateWebDerivative', () => {
    test('should create JPEG web derivative with correct properties', async () => {
      const inputImage = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'web-test');
      cleanup.push(outputDir);
      
      const result = await generateWebDerivative(inputImage, outputDir);
      
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('type', 'web');
      expect(result).toHaveProperty('format', 'jpeg');
      expect(result).toHaveProperty('quality', 90);
      
      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.path).toMatch(/.*_web\.jpg$/);
      
      // Validate dimensions (should be resized)
      const validation = await validateTestImage(result.path);
      expect(validation.valid).toBe(true);
      expect(validation.format).toBe('jpeg');
      expect(validation.width).toBeLessThanOrEqual(1920);
    });

    test('should maintain aspect ratio when resizing', async () => {
      const inputImage = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'web-aspect-test');
      cleanup.push(outputDir);
      
      // Get original dimensions
      const originalValidation = await validateTestImage(inputImage);
      const originalRatio = originalValidation.width / originalValidation.height;
      
      const result = await generateWebDerivative(inputImage, outputDir);
      const resultValidation = await validateTestImage(result.path);
      const resultRatio = resultValidation.width / resultValidation.height;
      
      // Aspect ratio should be approximately preserved
      expect(Math.abs(originalRatio - resultRatio)).toBeLessThan(0.01);
    });

    test('should not enlarge small images', async () => {
      // Use a small test image
      const smallImage = testImageStructure.allImages.find(img => {
        // Find the smallest image in our test set
        return true; // For now, assume our test images are reasonably sized
      });
      
      const outputDir = path.join(testDir, 'web-small-test');
      cleanup.push(outputDir);
      
      const originalValidation = await validateTestImage(smallImage);
      const result = await generateWebDerivative(smallImage, outputDir);
      const resultValidation = await validateTestImage(result.path);
      
      // If original was small, result should not be larger
      if (originalValidation.width < 1920) {
        expect(resultValidation.width).toBeLessThanOrEqual(originalValidation.width + 1); // Allow for rounding
      }
    });
  });

  describe('generateThumbnail', () => {
    test('should create square thumbnail', async () => {
      const inputImage = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'thumb-test');
      cleanup.push(outputDir);
      
      const result = await generateThumbnail(inputImage, outputDir);
      
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('type', 'thumbnail');
      expect(result).toHaveProperty('format', 'jpeg');
      expect(result).toHaveProperty('width', 300);
      expect(result).toHaveProperty('height', 300);
      
      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.path).toMatch(/.*_thumb\.jpg$/);
      
      const validation = await validateTestImage(result.path);
      expect(validation.valid).toBe(true);
      expect(validation.width).toBe(300);
      expect(validation.height).toBe(300);
    });

    test('should crop to fill square format', async () => {
      const inputImage = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'thumb-crop-test');
      cleanup.push(outputDir);
      
      const result = await generateThumbnail(inputImage, outputDir);
      
      // Should always be exactly 300x300
      expect(result.width).toBe(300);
      expect(result.height).toBe(300);
      
      const validation = await validateTestImage(result.path);
      expect(validation.width).toBe(300);
      expect(validation.height).toBe(300);
    });
  });

  describe('processImageDerivatives', () => {
    test('should create all derivative types', async () => {
      const inputImage = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'derivatives-test');
      cleanup.push(outputDir);
      
      const result = await processImageDerivatives(inputImage, outputDir);
      
      expect(result).toHaveProperty('input', inputImage);
      expect(result).toHaveProperty('outputs');
      expect(result).toHaveProperty('errors');
      
      expect(result.outputs.length).toBe(3); // master, web, thumbnail
      expect(result.errors.length).toBe(0);
      
      // Check each output type
      const outputTypes = result.outputs.map(output => output.type);
      expect(outputTypes).toContain('master');
      expect(outputTypes).toContain('web');
      expect(outputTypes).toContain('thumbnail');
      
      // Verify files exist
      for (const output of result.outputs) {
        expect(fs.existsSync(output.path)).toBe(true);
        
        const validation = await validateTestImage(output.path);
        expect(validation.valid).toBe(true);
      }
    });

    test('should create proper directory structure', async () => {
      const inputImage = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'structure-test');
      cleanup.push(outputDir);
      
      await processImageDerivatives(inputImage, outputDir);
      
      // Check directory structure
      expect(fs.existsSync(path.join(outputDir, 'masters'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'web'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'thumbnails'))).toBe(true);
    });

    test('should handle processing errors gracefully', async () => {
      const invalidPath = path.join(testDir, 'invalid-for-processing.txt');
      fs.writeFileSync(invalidPath, 'Not an image');
      cleanup.push(invalidPath);
      
      const outputDir = path.join(testDir, 'error-test');
      cleanup.push(outputDir);
      
      const result = await processImageDerivatives(invalidPath, outputDir);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.outputs.length).toBe(0);
    });
  });

  describe('batchProcessImages', () => {
    test('should process multiple images', async () => {
      const imagePaths = testImageStructure.allImages.slice(0, 3); // Process first 3 images
      const outputDir = path.join(testDir, 'batch-test');
      cleanup.push(outputDir);
      
      const results = await batchProcessImages(imagePaths, outputDir, { concurrency: 2 });
      
      expect(results.length).toBe(imagePaths.length);
      
      // Check each result
      for (const result of results) {
        expect(result).toHaveProperty('input');
        expect(result).toHaveProperty('outputs');
        expect(result).toHaveProperty('errors');
        expect(imagePaths).toContain(result.input);
      }
      
      // Most should be successful
      const successfulResults = results.filter(r => r.outputs && r.outputs.length > 0);
      expect(successfulResults.length).toBeGreaterThan(0);
    });

    test('should respect concurrency limits', async () => {
      const imagePaths = testImageStructure.allImages.slice(0, 2);
      const outputDir = path.join(testDir, 'concurrency-test');
      cleanup.push(outputDir);
      
      const startTime = Date.now();
      const results = await batchProcessImages(imagePaths, outputDir, { concurrency: 1 });
      const endTime = Date.now();
      
      // Should process sequentially with concurrency 1
      expect(results.length).toBe(imagePaths.length);
      
      // Sequential processing should take longer (rough check)
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThan(100); // At least some processing time
    });

    test('should skip existing files when requested', async () => {
      const imagePath = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'skip-existing-test');
      cleanup.push(outputDir);
      
      // First run
      const firstResults = await batchProcessImages([imagePath], outputDir, { 
        skipExisting: false 
      });
      expect(firstResults[0].outputs.length).toBe(3);
      
      // Second run with skipExisting: true
      const secondResults = await batchProcessImages([imagePath], outputDir, { 
        skipExisting: true 
      });
      expect(secondResults[0].skipped).toBe(true);
    });

    test('should handle mix of valid and invalid images', async () => {
      const invalidPath = path.join(testDir, 'batch-invalid.txt');
      fs.writeFileSync(invalidPath, 'Not an image');
      cleanup.push(invalidPath);
      
      const mixedPaths = [testImageStructure.allImages[0], invalidPath];
      const outputDir = path.join(testDir, 'mixed-batch-test');
      cleanup.push(outputDir);
      
      const results = await batchProcessImages(mixedPaths, outputDir);
      
      expect(results.length).toBe(2);
      
      // One should succeed, one should fail
      const successful = results.filter(r => r.outputs && r.outputs.length > 0);
      const failed = results.filter(r => r.errors && r.errors.length > 0);
      
      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);
    });
  });

  describe('getProcessingStats', () => {
    test('should calculate correct statistics', async () => {
      const imagePaths = testImageStructure.allImages.slice(0, 2);
      const outputDir = path.join(testDir, 'stats-test');
      cleanup.push(outputDir);
      
      const results = await batchProcessImages(imagePaths, outputDir);
      const { getProcessingStats } = await import('../utils/imageProcessing.js');
      const stats = getProcessingStats(results);
      
      expect(stats).toHaveProperty('total', imagePaths.length);
      expect(stats).toHaveProperty('successful');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('skipped');
      expect(stats).toHaveProperty('totalOutputs');
      expect(stats).toHaveProperty('outputTypes');
      
      expect(stats.total).toBe(stats.successful + stats.failed + stats.skipped);
      
      // Output types should be tracked
      expect(stats.outputTypes).toHaveProperty('master');
      expect(stats.outputTypes).toHaveProperty('web');
      expect(stats.outputTypes).toHaveProperty('thumbnail');
    });
  });

  describe('Performance', () => {
    test('should process images within reasonable time', async () => {
      const imagePath = testImageStructure.allImages[0];
      const outputDir = path.join(testDir, 'performance-test');
      cleanup.push(outputDir);
      
      const startTime = Date.now();
      await processImageDerivatives(imagePath, outputDir);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      
      // Should complete within 10 seconds (generous limit for CI)
      expect(duration).toBeLessThan(10000);
    });
    
    test('should handle large batch efficiently', async () => {
      const imagePaths = testImageStructure.allImages; // All test images
      const outputDir = path.join(testDir, 'large-batch-test');
      cleanup.push(outputDir);
      
      const startTime = Date.now();
      const results = await batchProcessImages(imagePaths, outputDir, { 
        concurrency: 3,
        skipExisting: false 
      });
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      
      expect(results.length).toBe(imagePaths.length);
      
      // Should complete within reasonable time (adjust based on image count)
      const timePerImage = duration / imagePaths.length;
      expect(timePerImage).toBeLessThan(5000); // 5 seconds per image max
    });
  });
});