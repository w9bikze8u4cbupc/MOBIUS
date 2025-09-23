/**
 * Unit tests for Enhanced Image Extraction System
 */

import { jest } from '@jest/globals';
import { generateImageHash, calculateHammingDistance, calculateSimilarityScore } from '../src/utils/imageMatching/matcher.js';
import { processImage, analyzeImageQuality } from '../src/utils/imageProcessing/processor.js';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

describe('Image Matching Utilities', () => {
  
  describe('calculateHammingDistance', () => {
    test('should return 0 for identical hashes', () => {
      const hash1 = 'abcd1234';
      const hash2 = 'abcd1234';
      expect(calculateHammingDistance(hash1, hash2)).toBe(0);
    });

    test('should calculate distance correctly for different hashes', () => {
      const hash1 = '0000';
      const hash2 = 'ffff';
      // Each character differs by 4 bits (0000 vs 1111), so 4 chars * 4 bits = 16
      expect(calculateHammingDistance(hash1, hash2)).toBe(16);
    });

    test('should throw error for different length hashes', () => {
      expect(() => {
        calculateHammingDistance('abc', 'abcd');
      }).toThrow('Hash lengths must match');
    });
  });

  describe('calculateSimilarityScore', () => {
    test('should return 1 for identical hashes (distance 0)', () => {
      expect(calculateSimilarityScore(0, 64)).toBe(1);
    });

    test('should return 0.5 for half-different hashes', () => {
      expect(calculateSimilarityScore(32, 64)).toBe(0.5);
    });

    test('should return 0 for completely different hashes', () => {
      expect(calculateSimilarityScore(64, 64)).toBe(0);
    });

    test('should not return negative values', () => {
      expect(calculateSimilarityScore(100, 64)).toBe(0);
    });
  });
});

describe('Image Processing Utilities', () => {

  describe('analyzeImageQuality', () => {
    // Create a test image for analysis
    const testImagePath = '/tmp/test-image.png';
    
    beforeAll(async () => {
      // Create a simple test image
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .png()
      .toFile(testImagePath);
    });

    afterAll(async () => {
      try {
        await fs.unlink(testImagePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    test('should analyze basic image properties', async () => {
      const quality = await analyzeImageQuality(testImagePath);
      
      expect(quality).toHaveProperty('dimensions');
      expect(quality.dimensions.width).toBe(100);
      expect(quality.dimensions.height).toBe(100);
      expect(quality.dimensions.megapixels).toBe(0.01);
      
      expect(quality).toHaveProperty('format');
      expect(quality).toHaveProperty('channels');
      expect(quality).toHaveProperty('contrast');
      expect(quality).toHaveProperty('brightness');
    });

    test('should handle invalid image path', async () => {
      await expect(analyzeImageQuality('/nonexistent/path.jpg'))
        .rejects.toThrow('Quality analysis failed');
    });
  });
});

describe('Image Processing Integration', () => {
  const testDir = '/tmp/image-extraction-test';
  const testImagePath = path.join(testDir, 'test-input.png');
  const outputImagePath = path.join(testDir, 'test-output.png');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    
    // Create a test image with some content
    await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 240, g: 240, b: 240 }
      }
    })
    .composite([
      {
        input: Buffer.from(`
          <svg width="160" height="110">
            <rect x="20" y="20" width="120" height="70" fill="black" />
            <text x="80" y="60" text-anchor="middle" fill="white" font-size="16">Test</text>
          </svg>
        `),
        top: 20,
        left: 20
      }
    ])
    .png()
    .toFile(testImagePath);
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should process image with default options', async () => {
    const result = await processImage(testImagePath, outputImagePath);
    
    expect(result.success).toBe(true);
    expect(result.inputPath).toBe(testImagePath);
    expect(result.outputPath).toBe(outputImagePath);
    expect(result.processingSteps.length).toBeGreaterThan(0);
    expect(result.metadata).toHaveProperty('original');
    expect(result.metadata).toHaveProperty('processed');
    
    // Check that output file exists
    const outputExists = await fs.access(outputImagePath).then(() => true).catch(() => false);
    expect(outputExists).toBe(true);
  });

  test('should handle processing with custom options', async () => {
    const customOutputPath = path.join(testDir, 'test-custom.jpg');
    const options = {
      autoCrop: false,
      autoContrast: true,
      deskew: false,
      quality: 80
    };
    
    const result = await processImage(testImagePath, customOutputPath, options);
    
    expect(result.success).toBe(true);
    expect(result.processingSteps.some(step => step.step === 'auto-contrast')).toBe(true);
    expect(result.processingSteps.some(step => step.step === 'auto-crop')).toBe(false);
  });
});

describe('Hash Generation and Matching', () => {
  const testDir = '/tmp/hash-test';
  const testImage1Path = path.join(testDir, 'image1.png');
  const testImage2Path = path.join(testDir, 'image2.png');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    
    // Create two similar images
    const baseImage = sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    });

    await baseImage
      .composite([
        {
          input: Buffer.from(`
            <svg width="80" height="80">
              <circle cx="40" cy="40" r="30" fill="blue" />
            </svg>
          `),
          top: 10,
          left: 10
        }
      ])
      .png()
      .toFile(testImage1Path);

    await baseImage
      .composite([
        {
          input: Buffer.from(`
            <svg width="80" height="80">
              <circle cx="40" cy="40" r="30" fill="blue" />
            </svg>
          `),
          top: 10,
          left: 15 // Slightly different position
        }
      ])
      .png()
      .toFile(testImage2Path);
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should generate consistent hashes for same image', async () => {
    const hash1 = await generateImageHash(testImage1Path, 'phash');
    const hash2 = await generateImageHash(testImage1Path, 'phash');
    
    expect(hash1.hash).toBe(hash2.hash);
    expect(hash1.algorithm).toBe('phash');
    expect(hash1.path).toBe(testImage1Path);
  });

  test('should generate different but similar hashes for similar images', async () => {
    const hash1 = await generateImageHash(testImage1Path, 'phash');
    const hash2 = await generateImageHash(testImage2Path, 'phash');
    
    expect(hash1.hash).not.toBe(hash2.hash);
    
    const distance = calculateHammingDistance(hash1.hash, hash2.hash);
    const similarity = calculateSimilarityScore(distance);
    
    // Similar images should have high similarity (> 0.8)
    expect(similarity).toBeGreaterThan(0.8);
    expect(distance).toBeLessThan(13); // Should be fairly close
  });
});

describe('Error Handling', () => {
  test('should handle missing image files gracefully', async () => {
    await expect(generateImageHash('/nonexistent/image.jpg'))
      .rejects.toThrow('Failed to generate hash');
  });

  test('should handle invalid processing parameters', async () => {
    const result = await processImage('/nonexistent/input.jpg', '/tmp/output.jpg');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('Utility Functions', () => {
  test('should handle edge cases in similarity calculation', () => {
    // Test boundary conditions
    expect(calculateSimilarityScore(0, 64)).toBe(1);
    expect(calculateSimilarityScore(64, 64)).toBe(0);
    expect(calculateSimilarityScore(-5, 64)).toBe(0); // Negative should clamp to 0
    expect(calculateSimilarityScore(100, 64)).toBe(0); // Over-distance should clamp to 0
  });

  test('should handle empty hash strings', () => {
    expect(() => calculateHammingDistance('', '')).not.toThrow();
    expect(calculateHammingDistance('', '')).toBe(0);
  });
});