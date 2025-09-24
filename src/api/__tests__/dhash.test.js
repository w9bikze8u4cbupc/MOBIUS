/**
 * Unit tests for DHash implementation
 * Tests boundary cases, confidence mapping, and core functionality
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import {
  calculateDHash,
  calculateHammingDistance,
  confidenceToMaxHamming,
  hammingToConfidence,
  matchHashes,
  batchCalculateDHash,
  validateHashMetadata,
  DHASH_ALGORITHM,
  DHASH_VERSION,
  DHASH_BITS
} from '../dhash.js';

// Test fixtures directory
const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');
const TEST_IMAGES_DIR = path.join(FIXTURES_DIR, 'images');

describe('DHash Implementation', () => {
  
  beforeAll(async () => {
    // Create test fixtures directory
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await fs.mkdir(TEST_IMAGES_DIR, { recursive: true });
    
    // Generate test images
    await generateTestImages();
  });

  afterAll(async () => {
    // Clean up test fixtures
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  describe('calculateDHash', () => {
    test('should generate deterministic hash for same image', async () => {
      const imagePath = path.join(TEST_IMAGES_DIR, 'test-image.png');
      
      const result1 = await calculateDHash(imagePath);
      const result2 = await calculateDHash(imagePath);
      
      expect(result1.hash).toBe(result2.hash);
      expect(result1.hash_base64).toBe(result2.hash_base64);
    });

    test('should include all required metadata', async () => {
      const imagePath = path.join(TEST_IMAGES_DIR, 'test-image.png');
      const result = await calculateDHash(imagePath);
      
      expect(result).toMatchObject({
        hash: expect.any(String),
        hash_base64: expect.any(String),
        hash_alg: DHASH_ALGORITHM,
        version: DHASH_VERSION,
        bits: DHASH_BITS,
        node_module_version: expect.any(String),
        timestamp: expect.any(String),
        metadata: expect.objectContaining({
          original_width: expect.any(Number),
          original_height: expect.any(Number),
          original_format: expect.any(String)
        })
      });
    });

    test('should generate 64-bit hash by default', async () => {
      const imagePath = path.join(TEST_IMAGES_DIR, 'test-image.png');
      const result = await calculateDHash(imagePath);
      
      // Hex hash should be 16 characters (64 bits)
      expect(result.hash).toHaveLength(16);
      expect(result.bits).toBe(64);
    });

    test('should handle different image formats', async () => {
      const formats = ['png', 'jpg', 'webp'];
      
      for (const format of formats) {
        const imagePath = path.join(TEST_IMAGES_DIR, `test-image.${format}`);
        const result = await calculateDHash(imagePath);
        
        expect(result.hash).toMatch(/^[0-9a-f]{16}$/);
        expect(result.metadata.original_format).toBe(format === 'jpg' ? 'jpeg' : format);
      }
    });

    test('should fail gracefully for invalid input', async () => {
      await expect(calculateDHash('non-existent-file.png'))
        .rejects.toThrow('DHash calculation failed');
    });
  });

  describe('calculateHammingDistance', () => {
    test('should return 0 for identical hashes', () => {
      const hash = 'a1b2c3d4e5f6789a';
      const distance = calculateHammingDistance(hash, hash);
      expect(distance).toBe(0);
    });

    test('should calculate correct distance for different hashes', () => {
      const hash1 = '0000000000000000'; // All zeros
      const hash2 = 'ffffffffffffffff'; // All ones
      const distance = calculateHammingDistance(hash1, hash2);
      expect(distance).toBe(64); // All bits different
    });

    test('should calculate distance for 1-bit difference', () => {
      const hash1 = '0000000000000000';
      const hash2 = '0000000000000001'; // Only last bit different
      const distance = calculateHammingDistance(hash1, hash2);
      expect(distance).toBe(1);
    });

    test('should throw error for invalid inputs', () => {
      expect(() => calculateHammingDistance(null, 'abc'))
        .toThrow('Both hashes must be provided');
      
      expect(() => calculateHammingDistance('', 'abc'))
        .toThrow('Both hashes must be provided');
    });
  });

  describe('confidenceToMaxHamming and hammingToConfidence', () => {
    test('should implement correct formula: max_hamming = ⌊(1−confidence) × bit_length⌋', () => {
      const testCases = [
        { confidence: 0.90, expected: 6 },  // ⌊(1-0.9) × 64⌋ = ⌊6.4⌋ = 6
        { confidence: 0.95, expected: 3 },  // ⌊(1-0.95) × 64⌋ = ⌊3.2⌋ = 3
        { confidence: 0.80, expected: 12 }, // ⌊(1-0.8) × 64⌋ = ⌊12.8⌋ = 12
        { confidence: 1.00, expected: 0 },  // ⌊(1-1.0) × 64⌋ = 0
        { confidence: 0.00, expected: 64 }  // ⌊(1-0.0) × 64⌋ = 64
      ];

      testCases.forEach(({ confidence, expected }) => {
        const result = confidenceToMaxHamming(confidence);
        expect(result).toBe(expected);
      });
    });

    test('should be inverse functions', () => {
      const hamming = 6;
      const confidence = hammingToConfidence(hamming);
      const backToHamming = confidenceToMaxHamming(confidence);
      
      // Due to floor operation, we check that it's within acceptable range
      expect(Math.abs(backToHamming - hamming)).toBeLessThanOrEqual(1);
    });

    test('should handle boundary cases', () => {
      // Boundary for confidence
      expect(confidenceToMaxHamming(0)).toBe(64);
      expect(confidenceToMaxHamming(1)).toBe(0);
      
      // Boundary for hamming
      expect(hammingToConfidence(0)).toBe(1.0);
      expect(hammingToConfidence(64)).toBe(0.0);
    });

    test('should validate input ranges', () => {
      expect(() => confidenceToMaxHamming(-0.1))
        .toThrow('Confidence must be between 0.0 and 1.0');
      
      expect(() => confidenceToMaxHamming(1.1))
        .toThrow('Confidence must be between 0.0 and 1.0');
      
      expect(() => hammingToConfidence(-1))
        .toThrow('Hamming distance must be between 0 and 64');
      
      expect(() => hammingToConfidence(65))
        .toThrow('Hamming distance must be between 0 and 64');
    });

    test('should handle unit test assertions for equivalence', () => {
      // Test the specific examples mentioned in the PR description
      const confidence90 = 0.90;
      const maxHamming90 = confidenceToMaxHamming(confidence90);
      expect(maxHamming90).toBe(6); // 0.90 → max_hamming = 6 for 64 bits

      const confidence95 = 0.95;
      const maxHamming95 = confidenceToMaxHamming(confidence95);
      expect(maxHamming95).toBe(3); // 0.95 → max_hamming = 3 for 64 bits
    });
  });

  describe('matchHashes', () => {
    test('should correctly identify matching hashes', () => {
      const hash1 = '0000000000000000';
      const hash2 = '0000000000000001'; // 1-bit difference
      
      const result = matchHashes(hash1, hash2, 0.95); // max_hamming = 3
      
      expect(result.match).toBe(true);
      expect(result.hamming_distance).toBe(1);
      expect(result.confidence).toBeCloseTo(0.984375, 5); // 1-1/64
      expect(result.max_distance).toBe(3);
    });

    test('should correctly identify non-matching hashes', () => {
      const hash1 = '0000000000000000';
      const hash2 = 'ffffffffffffffff'; // All bits different
      
      const result = matchHashes(hash1, hash2, 0.90); // max_hamming = 6
      
      expect(result.match).toBe(false);
      expect(result.hamming_distance).toBe(64);
      expect(result.confidence).toBe(0);
    });
  });

  describe('batchCalculateDHash', () => {
    test('should process multiple images', async () => {
      const imagePaths = [
        path.join(TEST_IMAGES_DIR, 'test-image.png'),
        path.join(TEST_IMAGES_DIR, 'test-image.jpg')
      ];
      
      const results = await batchCalculateDHash(imagePaths);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].hash).toMatch(/^[0-9a-f]{16}$/);
      expect(results[1].hash).toMatch(/^[0-9a-f]{16}$/);
    });

    test('should handle failed images gracefully', async () => {
      const imagePaths = [
        path.join(TEST_IMAGES_DIR, 'test-image.png'),
        'non-existent-file.png'
      ];
      
      const results = await batchCalculateDHash(imagePaths);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });
  });

  describe('validateHashMetadata', () => {
    test('should validate complete metadata', () => {
      const validMetadata = {
        hash: 'a1b2c3d4e5f6789a',
        hash_alg: DHASH_ALGORITHM,
        version: DHASH_VERSION,
        bits: DHASH_BITS,
        node_module_version: 'v18.0.0'
      };
      
      expect(validateHashMetadata(validMetadata)).toBe(true);
    });

    test('should reject incomplete metadata', () => {
      const incompleteMetadata = {
        hash: 'a1b2c3d4e5f6789a',
        hash_alg: DHASH_ALGORITHM
        // Missing required fields
      };
      
      expect(validateHashMetadata(incompleteMetadata)).toBe(false);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle very small images', async () => {
      // Create a 1x1 pixel image
      const smallImagePath = path.join(TEST_IMAGES_DIR, 'small-1x1.png');
      await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
      .png()
      .toFile(smallImagePath);

      const result = await calculateDHash(smallImagePath);
      expect(result.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(result.metadata.original_width).toBe(1);
      expect(result.metadata.original_height).toBe(1);
    });

    test('should handle large images without memory issues', async () => {
      // Create a large image (2048x2048)
      const largeImagePath = path.join(TEST_IMAGES_DIR, 'large-2048x2048.png');
      await sharp({
        create: {
          width: 2048,
          height: 2048,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      })
      .png()
      .toFile(largeImagePath);

      const result = await calculateDHash(largeImagePath);
      expect(result.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(result.metadata.original_width).toBe(2048);
      expect(result.metadata.original_height).toBe(2048);
    }, 10000); // 10 second timeout for large image processing
  });
});

/**
 * Generate test images for the test suite
 */
async function generateTestImages() {
  // Create a basic test image (PNG)
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
  .png()
  .toFile(path.join(TEST_IMAGES_DIR, 'test-image.png'));

  // Create test image variants in different formats
  const baseImage = sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 0, g: 255, b: 0 }
    }
  });

  // JPG version
  await baseImage
    .clone()
    .jpeg()
    .toFile(path.join(TEST_IMAGES_DIR, 'test-image.jpg'));

  // WebP version
  await baseImage
    .clone()
    .webp()
    .toFile(path.join(TEST_IMAGES_DIR, 'test-image.webp'));

  // Create a gradient image for more realistic testing
  const gradientBuffer = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
  .composite([
    {
      input: Buffer.from(
        Array.from({length: 256 * 256 * 3}, (_, i) => {
          const pixelIndex = Math.floor(i / 3);
          const x = pixelIndex % 256;
          const y = Math.floor(pixelIndex / 256);
          const channel = i % 3;
          
          if (channel === 0) return x; // Red gradient left to right
          if (channel === 1) return y; // Green gradient top to bottom
          return 128; // Blue constant
        })
      ),
      raw: {
        width: 256,
        height: 256,
        channels: 3
      },
      top: 0,
      left: 0
    }
  ])
  .png()
  .toBuffer();

  await fs.writeFile(path.join(TEST_IMAGES_DIR, 'gradient.png'), gradientBuffer);
}