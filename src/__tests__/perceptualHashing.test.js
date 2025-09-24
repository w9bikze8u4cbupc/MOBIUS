import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generatePHash, calculateSimilarity, compareImages, findSimilarImages, buildHashDatabase, deduplicateImages } from '../utils/perceptualHashing.js';
import { createTestImageSet, createTestImageDirectory, cleanupTestFiles, validateTestImage } from './testUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Perceptual Hashing', () => {
  let testDir;
  let testImages;
  let cleanup = [];

  beforeAll(async () => {
    testDir = path.join(__dirname, 'temp', 'phash-tests');
    cleanup.push(testDir);
    
    // Create test images
    testImages = await createTestImageSet(testDir);
    
    // Validate all test images were created
    for (const img of testImages) {
      const validation = await validateTestImage(img.path);
      expect(validation.valid).toBe(true);
    }
  });

  afterAll(async () => {
    await cleanupTestFiles(cleanup);
  });

  describe('generatePHash', () => {
    test('should generate hash for valid image', async () => {
      const original = testImages.find(img => img.name === 'original');
      const result = await generatePHash(original.path);
      
      expect(result).toHaveProperty('imagePath', original.path);
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('algorithm', 'phash');
      expect(result).toHaveProperty('size', 8);
      expect(typeof result.hash).toBe('string');
      expect(result.hash.length).toBeGreaterThan(0);
    });

    test('should throw error for non-existent image', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.jpg');
      
      await expect(generatePHash(nonExistentPath)).rejects.toThrow('Image file not found');
    });

    test('should generate consistent hashes for same image', async () => {
      const original = testImages.find(img => img.name === 'original');
      
      const hash1 = await generatePHash(original.path);
      const hash2 = await generatePHash(original.path);
      
      expect(hash1.hash).toBe(hash2.hash);
    });
  });

  describe('calculateSimilarity', () => {
    test('should return 100% similarity for identical hashes', () => {
      const hash = 'abcd1234';
      const result = calculateSimilarity(hash, hash);
      
      expect(result.similarity).toBe(1.0);
      expect(result.percentage).toBe(100);
      expect(result.distance).toBe(0);
    });

    test('should return lower similarity for different hashes', () => {
      const hash1 = 'abcd1234';
      const hash2 = 'efgh5678';
      const result = calculateSimilarity(hash1, hash2);
      
      expect(result.similarity).toBeLessThan(1.0);
      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.distance).toBeGreaterThan(0);
      expect(result.percentage).toBe(Math.round(result.similarity * 10000) / 100);
    });

    test('should throw error for mismatched hash lengths', () => {
      expect(() => calculateSimilarity('abc', 'abcdef')).toThrow('Hashes must be the same length');
    });

    test('should throw error for missing hashes', () => {
      expect(() => calculateSimilarity(null, 'abc')).toThrow('Both hashes must be provided');
      expect(() => calculateSimilarity('abc', null)).toThrow('Both hashes must be provided');
    });
  });

  describe('compareImages', () => {
    test('should detect identical images', async () => {
      const original = testImages.find(img => img.name === 'original');
      const duplicate = testImages.find(img => img.name === 'duplicate');
      
      const result = await compareImages(original.path, duplicate.path);
      
      expect(result).toHaveProperty('image1');
      expect(result).toHaveProperty('image2');
      expect(result).toHaveProperty('similarity');
      expect(result).toHaveProperty('isMatch');
      expect(result.similarity).toBeCloseTo(1.0, 2);
      expect(result.isMatch).toBe(true);
    });

    test('should detect different images', async () => {
      const original = testImages.find(img => img.name === 'original');
      const different = testImages.find(img => img.name === 'different');
      
      const result = await compareImages(original.path, different.path);
      
      expect(result.similarity).toBeLessThan(0.9);
      expect(result.isMatch).toBe(false);
    });

    test('should handle comparison errors gracefully', async () => {
      const original = testImages.find(img => img.name === 'original');
      const nonExistent = path.join(testDir, 'non-existent.jpg');
      
      await expect(compareImages(original.path, nonExistent)).rejects.toThrow();
    });
  });

  describe('findSimilarImages', () => {
    test('should find similar images above threshold', async () => {
      const original = testImages.find(img => img.name === 'original');
      const candidates = testImages.filter(img => img.name !== 'original').map(img => img.path);
      
      const result = await findSimilarImages(original.path, candidates, 0.85);
      
      expect(result).toHaveProperty('targetImage', original.path);
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('allResults');
      expect(result.matches.length).toBeGreaterThan(0);
      
      // Should find the duplicate
      const duplicateMatch = result.matches.find(match => 
        match.candidatePath.includes('duplicate')
      );
      expect(duplicateMatch).toBeDefined();
      expect(duplicateMatch.similarity).toBeCloseTo(1.0, 2);
    });

    test('should sort results by similarity', async () => {
      const original = testImages.find(img => img.name === 'original');
      const candidates = testImages.filter(img => img.name !== 'original').map(img => img.path);
      
      const result = await findSimilarImages(original.path, candidates, 0.1); // Low threshold to get all
      
      expect(result.allResults.length).toBeGreaterThan(1);
      
      // Check sorting (highest similarity first)
      for (let i = 0; i < result.allResults.length - 1; i++) {
        expect(result.allResults[i].similarity).toBeGreaterThanOrEqual(
          result.allResults[i + 1].similarity
        );
      }
    });

    test('should respect similarity threshold', async () => {
      const original = testImages.find(img => img.name === 'original');
      const candidates = testImages.filter(img => img.name !== 'original').map(img => img.path);
      
      // High threshold should find fewer matches
      const strictResult = await findSimilarImages(original.path, candidates, 0.95);
      
      // Low threshold should find more matches
      const looseResult = await findSimilarImages(original.path, candidates, 0.1);
      
      expect(strictResult.matches.length).toBeLessThanOrEqual(looseResult.matches.length);
    });
  });

  describe('buildHashDatabase', () => {
    test('should build database for multiple images', async () => {
      const imagePaths = testImages.map(img => img.path);
      
      const database = await buildHashDatabase(imagePaths);
      
      expect(database).toHaveProperty('version');
      expect(database).toHaveProperty('algorithm', 'phash');
      expect(database).toHaveProperty('images');
      expect(database).toHaveProperty('totalImages', imagePaths.length);
      expect(database).toHaveProperty('successCount');
      expect(database).toHaveProperty('errorCount');
      
      expect(database.images.length).toBe(imagePaths.length);
      expect(database.successCount).toBeGreaterThan(0);
    });

    test('should save database to file when path provided', async () => {
      const imagePaths = testImages.slice(0, 2).map(img => img.path); // Use fewer images for speed
      const dbPath = path.join(testDir, 'test-database.json');
      cleanup.push(dbPath);
      
      const database = await buildHashDatabase(imagePaths, dbPath);
      
      expect(fs.existsSync(dbPath)).toBe(true);
      
      const savedData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      expect(savedData.totalImages).toBe(imagePaths.length);
    });

    test('should handle invalid images gracefully', async () => {
      const invalidPath = path.join(testDir, 'invalid.txt');
      fs.writeFileSync(invalidPath, 'This is not an image');
      cleanup.push(invalidPath);
      
      const mixedPaths = [testImages[0].path, invalidPath];
      
      const database = await buildHashDatabase(mixedPaths);
      
      expect(database.totalImages).toBe(2);
      expect(database.successCount).toBe(1);
      expect(database.errorCount).toBe(1);
    });
  });

  describe('deduplicateImages', () => {
    test('should identify exact duplicates', async () => {
      const imagePaths = testImages.map(img => img.path);
      
      const result = await deduplicateImages(imagePaths, 0.99);
      
      expect(result).toHaveProperty('unique');
      expect(result).toHaveProperty('duplicates');
      expect(result).toHaveProperty('totalProcessed', imagePaths.length);
      
      // Should find at least one duplicate (the exact copy)
      expect(result.duplicates.length).toBeGreaterThan(0);
      
      const duplicateEntry = result.duplicates.find(dup =>
        dup.duplicate.includes('duplicate') || dup.original.includes('original')
      );
      expect(duplicateEntry).toBeDefined();
      expect(duplicateEntry.similarity).toBeCloseTo(1.0, 2);
    });

    test('should respect similarity threshold', async () => {
      const imagePaths = testImages.map(img => img.path);
      
      // Strict threshold should find fewer duplicates
      const strictResult = await deduplicateImages(imagePaths, 0.99);
      
      // Loose threshold should find more duplicates
      const looseResult = await deduplicateImages(imagePaths, 0.70);
      
      expect(strictResult.duplicates.length).toBeLessThanOrEqual(looseResult.duplicates.length);
    });

    test('should maintain unique list correctly', async () => {
      const imagePaths = testImages.map(img => img.path);
      
      const result = await deduplicateImages(imagePaths, 0.95);
      
      // Total should equal unique + duplicates
      expect(result.unique.length + result.duplicates.length).toBe(result.totalProcessed);
      
      // No image should appear in both lists
      const uniqueBasenames = result.unique.map(path => path.basename(path));
      const duplicateBasenames = result.duplicates.map(dup => path.basename(dup.duplicate));
      
      const intersection = uniqueBasenames.filter(name => duplicateBasenames.includes(name));
      expect(intersection.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted image files', async () => {
      const corruptedPath = path.join(testDir, 'corrupted.jpg');
      fs.writeFileSync(corruptedPath, 'Not a valid image');
      cleanup.push(corruptedPath);
      
      await expect(generatePHash(corruptedPath)).rejects.toThrow();
    });

    test('should handle empty hash database', async () => {
      const emptyDatabase = {
        version: '1.0.0',
        algorithm: 'phash',
        images: [],
        totalImages: 0,
        successCount: 0,
        errorCount: 0
      };
      
      const { findMatchesInDatabase } = await import('../utils/perceptualHashing.js');
      const original = testImages.find(img => img.name === 'original');
      
      const result = await findMatchesInDatabase(original.path, emptyDatabase, 0.9);
      
      expect(result.matches.length).toBe(0);
      expect(result.databaseSize).toBe(0);
    });
  });
});