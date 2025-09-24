import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  calculateImageHash,
  calculateHammingDistance,
  calculateConfidence,
  getMaxHammingDistance,
  checkImageSimilarity,
  generateExtractionStats,
  HASH_CONFIG
} from '../utils/imageHashing.js';

const TEST_DIR = path.join(process.cwd(), 'tmp', 'test-images');

describe('Image Hashing Functionality', () => {
  beforeAll(async () => {
    // Create test directory
    await fsPromises.mkdir(TEST_DIR, { recursive: true });
    
    // Create test images
    const testImage1 = sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    });
    
    const testImage2 = sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    });

    // Save test images
    await testImage1.png().toFile(path.join(TEST_DIR, 'red.png'));
    await testImage2.png().toFile(path.join(TEST_DIR, 'green.png'));
    
    // Create similar image (slightly different)
    const similarImage = sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 254, g: 1, b: 1 }
      }
    });
    await similarImage.png().toFile(path.join(TEST_DIR, 'red_similar.png'));
  });

  afterAll(async () => {
    // Clean up test directory
    await fsPromises.rm(TEST_DIR, { recursive: true, force: true });
  });

  test('should calculate deterministic image hash', async () => {
    const imagePath = path.join(TEST_DIR, 'red.png');
    const result = await calculateImageHash(imagePath);

    expect(result).toHaveProperty('hash');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('timestamp');

    // Check hash formats
    expect(result.hash).toHaveProperty('raw');
    expect(result.hash).toHaveProperty('hex');
    expect(result.hash).toHaveProperty('base64');
    expect(typeof result.hash.hex).toBe('string');
    expect(result.hash.hex).toHaveLength(16); // 64-bit hash = 16 hex chars

    // Check metadata
    expect(result.metadata.algorithm).toBe(HASH_CONFIG.ALGORITHM);
    expect(result.metadata.version).toBe(HASH_CONFIG.VERSION);
    expect(result.metadata.bits).toBe(HASH_CONFIG.BITS);
  });

  test('should calculate same hash for identical images', async () => {
    const imagePath = path.join(TEST_DIR, 'red.png');
    const result1 = await calculateImageHash(imagePath);
    const result2 = await calculateImageHash(imagePath);

    expect(result1.hash.hex).toBe(result2.hash.hex);
    expect(result1.hash.base64).toBe(result2.hash.base64);
  });

  test('should calculate different hashes for different images', async () => {
    const redImage = path.join(TEST_DIR, 'red.png');
    const greenImage = path.join(TEST_DIR, 'green.png');
    
    const redResult = await calculateImageHash(redImage);
    const greenResult = await calculateImageHash(greenImage);

    expect(redResult.hash.hex).not.toBe(greenResult.hash.hex);
  });

  test('should calculate Hamming distance correctly', () => {
    // Test known values
    const hash1 = 0xFFFF; // 1111111111111111
    const hash2 = 0x0000; // 0000000000000000
    const distance = calculateHammingDistance(hash1, hash2);
    expect(distance).toBe(16); // All bits different

    // Test identical hashes
    const identicalDistance = calculateHammingDistance(hash1, hash1);
    expect(identicalDistance).toBe(0);
  });

  test('should calculate confidence correctly', () => {
    // Perfect match
    const perfectConfidence = calculateConfidence(0, 64);
    expect(perfectConfidence).toBe(1.0);

    // 50% match
    const halfConfidence = calculateConfidence(32, 64);
    expect(halfConfidence).toBe(0.5);

    // No match
    const noConfidence = calculateConfidence(64, 64);
    expect(noConfidence).toBe(0.0);
  });

  test('should calculate maximum Hamming distance for threshold', () => {
    // 90% confidence threshold
    const maxHamming90 = getMaxHammingDistance(0.90, 64);
    expect(maxHamming90).toBe(6); // floor((1 - 0.90) * 64) = 6

    // 95% confidence threshold
    const maxHamming95 = getMaxHammingDistance(0.95, 64);
    expect(maxHamming95).toBe(3); // floor((1 - 0.95) * 64) = 3
  });

  test('should check image similarity correctly', async () => {
    const redImage = path.join(TEST_DIR, 'red.png');
    const greenImage = path.join(TEST_DIR, 'green.png');
    const similarImage = path.join(TEST_DIR, 'red_similar.png');

    const redHash = await calculateImageHash(redImage);
    const greenHash = await calculateImageHash(greenImage);
    const similarHash = await calculateImageHash(similarImage);

    // Check dissimilar images
    const dissimilarResult = checkImageSimilarity(
      redHash.hash.hex, 
      greenHash.hash.hex, 
      0.90
    );
    expect(dissimilarResult.similar).toBe(false);
    expect(dissimilarResult.confidence).toBeLessThan(0.90);

    // Check identical images
    const identicalResult = checkImageSimilarity(
      redHash.hash.hex, 
      redHash.hash.hex, 
      0.90
    );
    expect(identicalResult.similar).toBe(true);
    expect(identicalResult.confidence).toBe(1.0);

    // Include metadata in result
    expect(dissimilarResult.metadata.algorithm).toBe(HASH_CONFIG.ALGORITHM);
    expect(dissimilarResult.threshold.confidence).toBe(0.90);
  });

  test('should generate comprehensive extraction statistics', async () => {
    const mockImages = [
      {
        confidence: 0.95,
        metadata: { format: 'png' },
        hash: { hex: 'abcd1234' }
      },
      {
        confidence: 0.85,
        metadata: { format: 'jpeg' },
        hash: { hex: 'efgh5678' }
      },
      {
        confidence: 0.90,
        metadata: { format: 'png' },
        hash: { hex: 'abcd1234' } // Duplicate hash
      }
    ];

    const stats = generateExtractionStats(mockImages, 'pdfimages');

    expect(stats.totalImages).toBe(3);
    expect(stats.extractionMethod).toBe('pdfimages');
    expect(stats.averageConfidence).toBe(0.9); // (0.95 + 0.85 + 0.90) / 3
    expect(stats.duplicates).toBe(1); // One duplicate hash
    expect(stats.imageFormats.png).toBe(2);
    expect(stats.imageFormats.jpeg).toBe(1);
    expect(stats.hashMetadata.algorithm).toBe(HASH_CONFIG.ALGORITHM);
  });

  test('should handle buffer input for hashing', async () => {
    const imagePath = path.join(TEST_DIR, 'red.png');
    const imageBuffer = await fsPromises.readFile(imagePath);
    
    const pathResult = await calculateImageHash(imagePath);
    const bufferResult = await calculateImageHash(imageBuffer);

    // Should produce the same hash
    expect(pathResult.hash.hex).toBe(bufferResult.hash.hex);
  });

  test('should validate hash configuration constants', () => {
    expect(HASH_CONFIG.ALGORITHM).toBe('blockhash');
    expect(HASH_CONFIG.BITS).toBe(64);
    expect(HASH_CONFIG.DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.90);
    expect(typeof HASH_CONFIG.VERSION).toBe('string');
  });

  test('should handle invalid inputs gracefully', async () => {
    // Invalid image path
    await expect(calculateImageHash('/nonexistent/path.png'))
      .rejects
      .toThrow();

    // Invalid Hamming distance calculation
    expect(() => calculateHammingDistance('invalid', 'hashes'))
      .toThrow();

    // Invalid confidence threshold
    expect(() => getMaxHammingDistance(-0.1))
      .toThrow();
    
    expect(() => getMaxHammingDistance(1.1))
      .toThrow();

    // Invalid confidence calculation
    expect(() => calculateConfidence(-1, 64))
      .toThrow();
    
    expect(() => calculateConfidence(65, 64))
      .toThrow();
  });
});