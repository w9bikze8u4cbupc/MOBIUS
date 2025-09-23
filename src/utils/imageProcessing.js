/**
 * Image Processing Utilities
 * Normalizes, trims, generates thumbnails and web derivatives via Sharp
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Normalize image: auto-rotate, ensure RGB color space
 */
async function normalizeImage(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    await image
      .rotate() // Auto-rotate based on EXIF orientation
      .png({ quality: 100 })
      .toFile(outputPath);
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      normalized: true
    };
  } catch (error) {
    throw new Error(`Failed to normalize image ${inputPath}: ${error.message}`);
  }
}

/**
 * Trim whitespace/borders from image edges
 */
async function trimImage(inputPath, outputPath, threshold = 10) {
  try {
    const image = sharp(inputPath);
    const { width, height } = await image.metadata();
    
    // Use Sharp's trim functionality
    await image
      .trim({
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // Trim white background
        threshold: threshold // Tolerance for color matching
      })
      .png()
      .toFile(outputPath);
    
    const trimmedMetadata = await sharp(outputPath).metadata();
    
    return {
      original: { width, height },
      trimmed: { width: trimmedMetadata.width, height: trimmedMetadata.height },
      trimmed_pixels: {
        width: width - trimmedMetadata.width,
        height: height - trimmedMetadata.height
      }
    };
  } catch (error) {
    // If trim fails, just copy the original
    await fs.promises.copyFile(inputPath, outputPath);
    const metadata = await sharp(inputPath).metadata();
    return {
      original: { width: metadata.width, height: metadata.height },
      trimmed: { width: metadata.width, height: metadata.height },
      trimmed_pixels: { width: 0, height: 0 },
      trim_failed: true
    };
  }
}

/**
 * Generate thumbnail with consistent sizing
 */
async function generateThumbnail(inputPath, outputPath, size = 300) {
  try {
    await sharp(inputPath)
      .resize(size, size, {
        fit: 'inside',
        withoutEnlargement: false,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toFile(outputPath);
    
    const metadata = await sharp(outputPath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      size: size
    };
  } catch (error) {
    throw new Error(`Failed to generate thumbnail ${outputPath}: ${error.message}`);
  }
}

/**
 * Generate web derivative (optimized for web display)
 */
async function generateWebDerivative(inputPath, outputPath, maxWidth = 1920, quality = 85) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    await image
      .resize(maxWidth, null, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: quality })
      .toFile(outputPath);
    
    const webMetadata = await sharp(outputPath).metadata();
    const fileStats = await fs.promises.stat(outputPath);
    
    return {
      original: { width: metadata.width, height: metadata.height },
      web: { width: webMetadata.width, height: webMetadata.height },
      compression_ratio: fileStats.size / (await fs.promises.stat(inputPath)).size,
      quality: quality
    };
  } catch (error) {
    throw new Error(`Failed to generate web derivative ${outputPath}: ${error.message}`);
  }
}

/**
 * Process a single image through the complete pipeline
 */
async function processImageComplete(inputPath, outputDir, options = {}) {
  const {
    normalize = true,
    trim = true,
    thumbnail = true,
    webDerivative = true,
    thumbnailSize = 300,
    webMaxWidth = 1920,
    webQuality = 85,
    trimThreshold = 10
  } = options;
  
  const basename = path.basename(inputPath, path.extname(inputPath));
  const results = {
    input: inputPath,
    basename: basename,
    steps: []
  };
  
  // Ensure output directories exist
  const dirs = {
    normalized: path.join(outputDir, 'normalized'),
    trimmed: path.join(outputDir, 'trimmed'),
    thumbnails: path.join(outputDir, 'thumbnails'),
    web: path.join(outputDir, 'web')
  };
  
  Object.values(dirs).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  let currentPath = inputPath;
  
  try {
    // Step 1: Normalize
    if (normalize) {
      const normalizedPath = path.join(dirs.normalized, `${basename}.png`);
      const normalizeResult = await normalizeImage(currentPath, normalizedPath);
      results.steps.push({ step: 'normalize', ...normalizeResult });
      results.normalized_path = normalizedPath;
      currentPath = normalizedPath;
    }
    
    // Step 2: Trim
    if (trim) {
      const trimmedPath = path.join(dirs.trimmed, `${basename}.png`);
      const trimResult = await trimImage(currentPath, trimmedPath, trimThreshold);
      results.steps.push({ step: 'trim', ...trimResult });
      results.trimmed_path = trimmedPath;
      currentPath = trimmedPath;
    }
    
    // Step 3: Generate thumbnail
    if (thumbnail) {
      const thumbPath = path.join(dirs.thumbnails, `${basename}_thumb.jpg`);
      const thumbResult = await generateThumbnail(currentPath, thumbPath, thumbnailSize);
      results.steps.push({ step: 'thumbnail', ...thumbResult });
      results.thumbnail_path = thumbPath;
    }
    
    // Step 4: Generate web derivative
    if (webDerivative) {
      const webPath = path.join(dirs.web, `${basename}_web.jpg`);
      const webResult = await generateWebDerivative(currentPath, webPath, webMaxWidth, webQuality);
      results.steps.push({ step: 'web_derivative', ...webResult });
      results.web_path = webPath;
    }
    
    // Final processed path (trimmed or normalized)
    results.processed_path = currentPath;
    results.success = true;
    
  } catch (error) {
    results.error = error.message;
    results.success = false;
  }
  
  return results;
}

/**
 * Process multiple images in batch
 */
async function processBatch(imagePaths, outputDir, options = {}) {
  const results = [];
  
  console.log(`Processing batch of ${imagePaths.length} images...`);
  
  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    console.log(`Processing ${i + 1}/${imagePaths.length}: ${path.basename(imagePath)}`);
    
    try {
      const result = await processImageComplete(imagePath, outputDir, options);
      results.push(result);
      
      if (result.success) {
        console.log(`  ✓ Success`);
      } else {
        console.log(`  ✗ Failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      results.push({
        input: imagePath,
        basename: path.basename(imagePath, path.extname(imagePath)),
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Get image metadata and basic info
 */
async function getImageInfo(imagePath) {
  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const stats = await fs.promises.stat(imagePath);
    
    return {
      path: imagePath,
      filename: path.basename(imagePath),
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      size_bytes: stats.size,
      size_mb: (stats.size / (1024 * 1024)).toFixed(2),
      aspect_ratio: (metadata.width / metadata.height).toFixed(2)
    };
  } catch (error) {
    throw new Error(`Failed to get image info for ${imagePath}: ${error.message}`);
  }
}

module.exports = {
  normalizeImage,
  trimImage,
  generateThumbnail,
  generateWebDerivative,
  processImageComplete,
  processBatch,
  getImageInfo
};