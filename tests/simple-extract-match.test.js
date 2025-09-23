const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { processImage } = require('../src/utils/imageProcessing');
const { calculatePerceptualHash, matchImageToLibrary, createLibrary } = require('../src/utils/imageMatching');

/**
 * Synthetic test harness to validate the full PDF image extraction and matching pipeline
 * 
 * This test creates synthetic images, processes them through the pipeline,
 * and validates that identical images achieve 100% confidence matching.
 */

describe('Image Extraction and Matching Pipeline', () => {
  const testDir = '/tmp/image-extraction-test';
  const imagesDir = path.join(testDir, 'images');
  const thumbnailsDir = path.join(testDir, 'images', 'thumbnails');
  
  beforeAll(async () => {
    // Create test directories
    await fs.promises.mkdir(imagesDir, { recursive: true });
    await fs.promises.mkdir(thumbnailsDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup test directories
    try {
      await fs.promises.rm(testDir, { recursive: true });
    } catch (err) {
      console.warn('Failed to cleanup test directory:', err.message);
    }
  });

  /**
   * Create a synthetic test image with specific characteristics
   */
  async function createSyntheticImage(filename, width = 400, height = 600, color = '#ffffff') {
    const outputPath = path.join(testDir, filename);
    
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
    
    return outputPath;
  }

  /**
   * Create a synthetic game component image
   */
  async function createGameComponentImage(filename, componentType = 'card') {
    const outputPath = path.join(testDir, filename);
    
    // Create different patterns for different component types
    let width, height, background;
    
    switch (componentType) {
      case 'card':
        width = 300;
        height = 420; // Standard card ratio
        background = '#f8f8f8';
        break;
      case 'token':
        width = 200;
        height = 200; // Square token
        background = '#fff5d6';
        break;
      case 'board':
        width = 800;
        height = 600; // Board-like
        background = '#e8f4f8';
        break;
      default:
        width = 400;
        height = 300;
        background = '#ffffff';
    }
    
    // Create base image
    let image = sharp({
      create: {
        width,
        height,
        channels: 3,
        background
      }
    });

    // Add some distinctive patterns to make images unique but similar
    const patternSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${background}"/>
        <rect x="10" y="10" width="${width-20}" height="${height-20}" 
              fill="none" stroke="#333" stroke-width="2"/>
        <circle cx="${width/2}" cy="${height/2}" r="20" fill="#4a90e2"/>
        <text x="${width/2}" y="${height/2+5}" text-anchor="middle" 
              font-family="Arial" font-size="14" fill="white">${componentType.toUpperCase()}</text>
      </svg>
    `;
    
    const buffer = Buffer.from(patternSvg);
    await image.composite([{ input: buffer }]).png().toFile(outputPath);
    
    return outputPath;
  }

  test('should process a synthetic image through the complete pipeline', async () => {
    // Create a synthetic test image
    const testImagePath = await createSyntheticImage('test_card.png', 300, 420, '#f0f0f0');
    
    // Process the image
    const result = await processImage(testImagePath, imagesDir, thumbnailsDir, 'test_card');
    
    // Verify all output files were created
    expect(fs.existsSync(result.masterPath)).toBe(true);
    expect(fs.existsSync(result.webPath)).toBe(true);
    expect(fs.existsSync(result.thumbnailPath)).toBe(true);
    
    // Verify files have content
    const masterStat = await fs.promises.stat(result.masterPath);
    expect(masterStat.size).toBeGreaterThan(0);
    
    const webStat = await fs.promises.stat(result.webPath);
    expect(webStat.size).toBeGreaterThan(0);
    
    const thumbStat = await fs.promises.stat(result.thumbnailPath);
    expect(thumbStat.size).toBeGreaterThan(0);
  }, 10000);

  test('should calculate perceptual hashes for processed images', async () => {
    // Create two similar but different images
    const image1Path = await createGameComponentImage('card1.png', 'card');
    const image2Path = await createGameComponentImage('card2.png', 'token');
    
    // Calculate hashes
    const hash1 = await calculatePerceptualHash(image1Path);
    const hash2 = await calculatePerceptualHash(image2Path);
    
    // Verify hashes are valid hex strings
    expect(hash1).toMatch(/^[a-f0-9]+$/i);
    expect(hash2).toMatch(/^[a-f0-9]+$/i);
    expect(hash1).toHaveLength(64); // 64-character hex hash
    expect(hash2).toHaveLength(64);
    
    // Different images should have different hashes
    expect(hash1).not.toEqual(hash2);
  }, 10000);

  test('should achieve 100% confidence for identical images', async () => {
    // Create a synthetic image
    const originalPath = await createGameComponentImage('identical_test.png', 'card');
    
    // Create an identical copy
    const copyPath = path.join(testDir, 'identical_copy.png');
    await fs.promises.copyFile(originalPath, copyPath);
    
    // Process both images
    const processed1 = await processImage(originalPath, imagesDir, thumbnailsDir, 'original');
    const processed2 = await processImage(copyPath, imagesDir, thumbnailsDir, 'copy');
    
    // Calculate hashes
    const hash1 = await calculatePerceptualHash(processed1.masterPath);
    const hash2 = await calculatePerceptualHash(processed2.masterPath);
    
    // Create library with first image
    const library = createLibrary([{
      id: 'original',
      masterPath: processed1.masterPath,
      perceptualHash: hash1
    }]);
    
    // Match second image against library
    const matchResult = await matchImageToLibrary(processed2.masterPath, library, 90);
    
    expect(matchResult.success).toBe(true);
    expect(matchResult.bestMatch).toBeDefined();
    expect(matchResult.bestMatch.confidence).toBeGreaterThanOrEqual(90);
    
    // For identical images, we should get very high confidence (close to 100%)
    expect(matchResult.bestMatch.confidence).toBeGreaterThan(95);
  }, 15000);

  test('should handle library matching with multiple candidates', async () => {
    // Create several different game component images
    const components = ['card', 'token', 'board'];
    const library = [];
    
    for (let i = 0; i < components.length; i++) {
      const imagePath = await createGameComponentImage(`lib_${components[i]}.png`, components[i]);
      const processed = await processImage(imagePath, imagesDir, thumbnailsDir, `lib_${i}`);
      const hash = await calculatePerceptualHash(processed.masterPath);
      
      library.push({
        id: `lib_${i}`,
        type: components[i],
        masterPath: processed.masterPath,
        perceptualHash: hash
      });
    }
    
    // Create a query image similar to the first component
    const queryPath = await createGameComponentImage('query_card.png', 'card');
    const queryProcessed = await processImage(queryPath, imagesDir, thumbnailsDir, 'query');
    
    // Create searchable library
    const searchableLibrary = createLibrary(library);
    
    // Match query against library
    const matchResult = await matchImageToLibrary(queryProcessed.masterPath, searchableLibrary, 50);
    
    expect(matchResult.success).toBe(true);
    expect(matchResult.allMatches).toHaveLength(components.length);
    expect(matchResult.bestMatch.libraryImage.type).toBe('card'); // Should match the card type
    
    // All matches should be sorted by confidence (highest first)
    for (let i = 1; i < matchResult.allMatches.length; i++) {
      expect(matchResult.allMatches[i-1].confidence).toBeGreaterThanOrEqual(
        matchResult.allMatches[i].confidence
      );
    }
  }, 20000);

  test('should handle edge cases gracefully', async () => {
    // Test with non-existent file
    await expect(calculatePerceptualHash('/nonexistent/path.png')).rejects.toThrow();
    
    // Test with empty library
    const testImagePath = await createSyntheticImage('edge_test.png');
    const emptyResult = await matchImageToLibrary(testImagePath, [], 90);
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.message).toContain('No library images provided');
    
    // Test with library missing hashes
    const invalidLibrary = [{ id: 'test', path: '/tmp/test.png' }]; // Missing perceptualHash
    
    const invalidResult = await matchImageToLibrary(testImagePath, invalidLibrary, 90);
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.allMatches).toHaveLength(0);
  }, 10000);

  test('should validate metadata structure', async () => {
    // Create and process a test image
    const testPath = await createGameComponentImage('metadata_test.png', 'token');
    const processed = await processImage(testPath, imagesDir, thumbnailsDir, 'metadata');
    
    // Verify metadata structure
    expect(processed).toHaveProperty('masterPath');
    expect(processed).toHaveProperty('webPath');
    expect(processed).toHaveProperty('thumbnailPath');
    expect(processed).toHaveProperty('originalMetadata');
    expect(processed).toHaveProperty('finalMetadata');
    
    // Verify metadata contains expected fields
    expect(processed.originalMetadata).toHaveProperty('width');
    expect(processed.originalMetadata).toHaveProperty('height');
    expect(processed.originalMetadata).toHaveProperty('format');
    
    expect(processed.finalMetadata).toHaveProperty('width');
    expect(processed.finalMetadata).toHaveProperty('height');
    
    // Create a proper image metadata object like the main script would
    const hash = await calculatePerceptualHash(processed.masterPath);
    const imageData = {
      id: 'metadata_test',
      originalPath: testPath,
      masterPath: processed.masterPath,
      webPath: processed.webPath,
      thumbnailPath: processed.thumbnailPath,
      width: processed.finalMetadata.width,
      height: processed.finalMetadata.height,
      format: processed.finalMetadata.format,
      perceptualHash: hash,
      extractedAt: new Date().toISOString()
    };
    
    // Verify all expected fields are present
    expect(imageData.id).toBeDefined();
    expect(imageData.perceptualHash).toMatch(/^[a-f0-9]+$/i);
    expect(imageData.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  }, 10000);
});