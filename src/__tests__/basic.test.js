import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simplified synthetic test that creates minimal test images using Sharp
 */
describe('Image Processing Integration - Basic', () => {
  let testDir;
  let testImages = [];

  beforeAll(async () => {
    testDir = path.join(__dirname, 'temp', 'basic-test');
    await fs.promises.mkdir(testDir, { recursive: true });

    // Create simple test images using Sharp
    const colors = [
      { r: 255, g: 0, b: 0 },    // Red
      { r: 0, g: 255, b: 0 },    // Green  
      { r: 0, g: 0, b: 255 },    // Blue
      { r: 255, g: 255, b: 0 }   // Yellow
    ];

    for (let i = 0; i < colors.length; i++) {
      const imagePath = path.join(testDir, `test-${i + 1}.png`);
      
      await sharp({
        create: {
          width: 200,
          height: 150,
          channels: 3,
          background: colors[i]
        }
      })
      .png()
      .toFile(imagePath);

      testImages.push(imagePath);
    }

    // Create a duplicate of the first image
    const duplicatePath = path.join(testDir, 'duplicate.png');
    await fs.promises.copyFile(testImages[0], duplicatePath);
    testImages.push(duplicatePath);
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should create valid test images', async () => {
    expect(testImages.length).toBe(5);

    for (const imagePath of testImages) {
      expect(fs.existsSync(imagePath)).toBe(true);
      
      // Validate using Sharp
      const metadata = await sharp(imagePath).metadata();
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(150);
      expect(metadata.format).toBe('png');
    }
  });

  test('should process images through the pipeline', async () => {
    const { processImageDerivatives } = await import('../utils/imageProcessing.js');
    
    const inputImage = testImages[0];
    const outputDir = path.join(testDir, 'processed');
    
    const result = await processImageDerivatives(inputImage, outputDir);
    
    expect(result.outputs.length).toBe(3); // master, web, thumbnail
    expect(result.errors.length).toBe(0);
    
    // Verify output files exist
    for (const output of result.outputs) {
      expect(fs.existsSync(output.path)).toBe(true);
    }
  });

  test('should generate perceptual hashes', async () => {
    const { generatePHash, calculateSimilarity } = await import('../utils/perceptualHashing.js');
    
    const hash1 = await generatePHash(testImages[0]);
    const hash2 = await generatePHash(testImages[4]); // duplicate
    
    expect(hash1.hash).toBeDefined();
    expect(hash2.hash).toBeDefined();
    
    const similarity = calculateSimilarity(hash1.hash, hash2.hash);
    expect(similarity.similarity).toBeCloseTo(1.0, 2); // Should be nearly identical
  });

  test('should detect different images', async () => {
    const { generatePHash, calculateSimilarity } = await import('../utils/perceptualHashing.js');
    
    const hash1 = await generatePHash(testImages[0]); // Red
    const hash2 = await generatePHash(testImages[1]); // Green
    
    const similarity = calculateSimilarity(hash1.hash, hash2.hash);
    expect(similarity.similarity).toBeLessThan(0.9); // Should be quite different
  });

  test('should run basic extraction workflow', async () => {
    // Test the image extraction utilities
    const { validateAndFilterImages } = await import('../utils/imageExtraction.js');
    
    const validImages = await validateAndFilterImages(testImages, 1000);
    
    expect(validImages.length).toBeGreaterThan(0);
    
    for (const img of validImages) {
      expect(img.width).toBe(200);
      expect(img.height).toBe(150);
      expect(img.format).toBe('png');
      expect(img.valid).toBe(true);
    }
  });
});