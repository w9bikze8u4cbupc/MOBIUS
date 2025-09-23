const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Image Processing Pipeline using Sharp
 * 
 * Features:
 * - Auto-trim borders
 * - Normalize contrast/brightness
 * - Generate multiple output formats:
 *   - Lossless PNG masters for archival
 *   - High-quality JPEG web derivatives (1920px width) for video editing
 *   - Thumbnails for quick previews
 */

/**
 * Auto-trim borders from an image
 * @param {sharp.Sharp} sharpInstance - Sharp instance
 * @returns {sharp.Sharp} Trimmed sharp instance
 */
async function autoTrim(sharpInstance) {
  try {
    // Get image stats to determine trim threshold
    const stats = await sharpInstance.stats();
    
    // Use a more conservative trim to avoid cutting content
    return sharpInstance.trim({
      background: '#ffffff', // Assume white borders
      threshold: 10 // Small threshold to avoid cutting content
    });
  } catch (err) {
    console.warn('Auto-trim failed, using original image:', err.message);
    return sharpInstance;
  }
}

/**
 * Normalize image contrast and brightness
 * @param {sharp.Sharp} sharpInstance - Sharp instance
 * @returns {sharp.Sharp} Normalized sharp instance
 */
function normalizeImage(sharpInstance) {
  return sharpInstance
    .normalize() // Enhance contrast by stretching luminance
    .gamma(1.1)  // Slight gamma correction for better visibility
    .sharpen(0.5, 1.0, 2.0); // Light sharpening
}

/**
 * Create a thumbnail with consistent sizing
 * @param {sharp.Sharp} sharpInstance - Sharp instance
 * @param {number} size - Thumbnail size (default: 300)
 * @returns {sharp.Sharp} Thumbnail sharp instance
 */
function createThumbnail(sharpInstance, size = 300) {
  return sharpInstance
    .resize(size, size, {
      fit: 'inside',
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    });
}

/**
 * Create web-optimized derivative for video editing
 * @param {sharp.Sharp} sharpInstance - Sharp instance
 * @param {number} maxWidth - Maximum width (default: 1920)
 * @returns {sharp.Sharp} Web-optimized sharp instance
 */
function createWebDerivative(sharpInstance, maxWidth = 1920) {
  return sharpInstance
    .resize(maxWidth, null, {
      fit: 'inside',
      withoutEnlargement: true
    });
}

/**
 * Process a single image through the complete pipeline
 * @param {string} inputPath - Path to input image
 * @param {string} outputDir - Directory for processed images
 * @param {string} thumbnailDir - Directory for thumbnails
 * @param {string} baseName - Base name for output files
 * @returns {Object} Paths to all generated files
 */
async function processImage(inputPath, outputDir, thumbnailDir, baseName) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input image not found: ${inputPath}`);
  }

  // Ensure output directories exist
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.mkdir(thumbnailDir, { recursive: true });

  // Define output paths
  const masterPath = path.join(outputDir, `${baseName}.png`);
  const webPath = path.join(outputDir, `${baseName}.jpg`);
  const thumbnailPath = path.join(thumbnailDir, `${baseName}_thumb.jpg`);

  try {
    // Load the image
    let pipeline = sharp(inputPath);
    
    // Get original metadata
    const metadata = await pipeline.metadata();
    console.log(`  Original: ${metadata.width}x${metadata.height}, ${metadata.format}`);

    // Auto-trim borders
    pipeline = await autoTrim(pipeline);

    // Normalize contrast and brightness
    pipeline = normalizeImage(pipeline);

    // Create master PNG (lossless archival)
    await pipeline
      .clone()
      .png({ 
        quality: 100,
        compressionLevel: 6,
        adaptiveFiltering: true
      })
      .toFile(masterPath);

    // Create web JPEG derivative (for video editing)
    await createWebDerivative(pipeline.clone(), 1920)
      .jpeg({
        quality: 90,
        progressive: true,
        mozjpeg: true
      })
      .toFile(webPath);

    // Create thumbnail
    await createThumbnail(pipeline.clone(), 300)
      .jpeg({
        quality: 80,
        progressive: true
      })
      .toFile(thumbnailPath);

    // Get final metadata
    const finalMetadata = await sharp(masterPath).metadata();
    console.log(`  Processed: ${finalMetadata.width}x${finalMetadata.height}`);

    return {
      masterPath,
      webPath,
      thumbnailPath,
      originalMetadata: metadata,
      finalMetadata
    };

  } catch (err) {
    throw new Error(`Failed to process image ${inputPath}: ${err.message}`);
  }
}

/**
 * Batch process multiple images
 * @param {Array<string>} inputPaths - Array of input image paths
 * @param {string} outputDir - Directory for processed images
 * @param {string} thumbnailDir - Directory for thumbnails
 * @param {string} namePrefix - Prefix for output files
 * @returns {Array<Object>} Array of processing results
 */
async function batchProcessImages(inputPaths, outputDir, thumbnailDir, namePrefix = 'image') {
  const results = [];
  
  console.log(`Processing ${inputPaths.length} images...`);
  
  for (let i = 0; i < inputPaths.length; i++) {
    const inputPath = inputPaths[i];
    const baseName = `${namePrefix}_${String(i + 1).padStart(3, '0')}`;
    
    try {
      console.log(`[${i + 1}/${inputPaths.length}] ${baseName}...`);
      const result = await processImage(inputPath, outputDir, thumbnailDir, baseName);
      results.push({
        index: i + 1,
        inputPath,
        baseName,
        success: true,
        ...result
      });
    } catch (err) {
      console.error(`[${i + 1}/${inputPaths.length}] Failed to process ${baseName}: ${err.message}`);
      results.push({
        index: i + 1,
        inputPath,
        baseName,
        success: false,
        error: err.message
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`✅ Successfully processed ${successCount}/${inputPaths.length} images`);
  
  return results;
}

/**
 * Detect if an image needs processing (check if it's likely a scanned document)
 * @param {string} imagePath - Path to image
 * @returns {Object} Analysis results
 */
async function analyzeImage(imagePath) {
  try {
    const pipeline = sharp(imagePath);
    const metadata = await pipeline.metadata();
    const stats = await pipeline.stats();
    
    // Detect if image might be a scanned document
    const aspectRatio = metadata.width / metadata.height;
    const isLandscape = aspectRatio > 1.2;
    const isPortrait = aspectRatio < 0.8;
    const isSquarish = aspectRatio >= 0.8 && aspectRatio <= 1.2;
    
    // Check if image has a lot of white space (potential borders)
    const channels = stats.channels;
    const avgBrightness = channels.reduce((sum, ch) => sum + ch.mean, 0) / channels.length;
    const hasBorders = avgBrightness > 200; // High average brightness suggests white borders
    
    return {
      width: metadata.width,
      height: metadata.height,
      aspectRatio,
      format: metadata.format,
      colorSpace: metadata.space,
      hasAlpha: metadata.hasAlpha,
      density: metadata.density,
      avgBrightness,
      isLandscape,
      isPortrait,
      isSquarish,
      hasBorders,
      needsProcessing: hasBorders || metadata.density < 150 // Needs processing if low DPI or has borders
    };
  } catch (err) {
    throw new Error(`Failed to analyze image ${imagePath}: ${err.message}`);
  }
}

module.exports = {
  processImage,
  batchProcessImages,
  analyzeImage,
  autoTrim,
  normalizeImage,
  createThumbnail,
  createWebDerivative
};