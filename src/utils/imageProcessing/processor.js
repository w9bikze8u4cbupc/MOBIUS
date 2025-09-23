/**
 * Image Processing Utilities
 * Provides image quality improvements including deskewing, cropping, and enhancement
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { Jimp } from 'jimp';

/**
 * Process image with quality improvements
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path for processed image
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results and metadata
 */
export async function processImage(inputPath, outputPath, options = {}) {
  const {
    autoCrop = true,
    autoContrast = true,
    deskew = true,
    denoise = false,
    upscale = false,
    targetWidth = null,
    targetHeight = null,
    quality = 95
  } = options;

  const processingSteps = [];
  const metadata = {};

  try {
    console.log(`🔧 Processing image: ${path.basename(inputPath)}`);

    // Read original image metadata
    const originalMetadata = await sharp(inputPath).metadata();
    metadata.original = {
      width: originalMetadata.width,
      height: originalMetadata.height,
      format: originalMetadata.format,
      size: originalMetadata.size
    };

    let image = sharp(inputPath);
    
    // Step 1: Auto-crop margins if enabled
    if (autoCrop) {
      try {
        const cropResult = await autoCropImage(inputPath);
        if (cropResult.cropped) {
          image = sharp(cropResult.buffer);
          processingSteps.push({
            step: 'auto-crop',
            success: true,
            removed: cropResult.removed
          });
          metadata.cropped = cropResult.metadata;
        }
      } catch (error) {
        console.warn('Auto-crop failed:', error.message);
        processingSteps.push({
          step: 'auto-crop',
          success: false,
          error: error.message
        });
      }
    }

    // Step 2: Deskew if enabled
    if (deskew) {
      try {
        const deskewResult = await deskewImage(await image.png().toBuffer());
        if (deskewResult.skewAngle !== 0) {
          image = sharp(deskewResult.buffer);
          processingSteps.push({
            step: 'deskew',
            success: true,
            angle: deskewResult.skewAngle
          });
          metadata.deskewed = {
            originalAngle: deskewResult.skewAngle,
            corrected: true
          };
        }
      } catch (error) {
        console.warn('Deskew failed:', error.message);
        processingSteps.push({
          step: 'deskew',
          success: false,
          error: error.message
        });
      }
    }

    // Step 3: Auto-contrast enhancement
    if (autoContrast) {
      try {
        image = image.normalize(); // Sharp's built-in contrast enhancement
        processingSteps.push({
          step: 'auto-contrast',
          success: true
        });
      } catch (error) {
        console.warn('Auto-contrast failed:', error.message);
        processingSteps.push({
          step: 'auto-contrast',
          success: false,
          error: error.message
        });
      }
    }

    // Step 4: Denoise if enabled (using blur as simple denoising)
    if (denoise) {
      try {
        image = image.blur(0.5); // Very light blur for noise reduction
        processingSteps.push({
          step: 'denoise',
          success: true
        });
      } catch (error) {
        console.warn('Denoise failed:', error.message);
        processingSteps.push({
          step: 'denoise',
          success: false,
          error: error.message
        });
      }
    }

    // Step 5: Resize/upscale if specified
    if (targetWidth || targetHeight || upscale) {
      try {
        const resizeOptions = {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: !upscale
        };

        if (targetWidth && targetHeight) {
          image = image.resize(targetWidth, targetHeight, {
            ...resizeOptions,
            fit: 'inside'
          });
        } else if (targetWidth) {
          image = image.resize(targetWidth, null, resizeOptions);
        } else if (targetHeight) {
          image = image.resize(null, targetHeight, resizeOptions);
        } else if (upscale) {
          // Simple 2x upscale using Lanczos
          const currentMeta = await image.metadata();
          image = image.resize(currentMeta.width * 2, currentMeta.height * 2, {
            kernel: sharp.kernel.lanczos3
          });
        }

        processingSteps.push({
          step: 'resize',
          success: true,
          targetWidth,
          targetHeight,
          upscale
        });
      } catch (error) {
        console.warn('Resize failed:', error.message);
        processingSteps.push({
          step: 'resize',
          success: false,
          error: error.message
        });
      }
    }

    // Save processed image
    const outputFormat = path.extname(outputPath).slice(1).toLowerCase();
    if (outputFormat === 'jpg' || outputFormat === 'jpeg') {
      await image.jpeg({ quality }).toFile(outputPath);
    } else if (outputFormat === 'png') {
      await image.png({ quality }).toFile(outputPath);
    } else {
      await image.toFile(outputPath);
    }

    // Get final metadata
    const finalMetadata = await sharp(outputPath).metadata();
    metadata.processed = {
      width: finalMetadata.width,
      height: finalMetadata.height,
      format: finalMetadata.format,
      size: finalMetadata.size
    };

    const result = {
      success: true,
      inputPath,
      outputPath,
      processingSteps,
      metadata,
      sizeReduction: metadata.original.size - metadata.processed.size,
      processingTime: new Date().toISOString()
    };

    console.log(`✅ Image processed successfully: ${processingSteps.length} steps applied`);
    return result;

  } catch (error) {
    console.error('❌ Image processing failed:', error);
    return {
      success: false,
      inputPath,
      outputPath,
      error: error.message,
      processingSteps,
      metadata
    };
  }
}

/**
 * Auto-crop white/background margins from image
 */
async function autoCropImage(inputPath) {
  try {
    const image = await Jimp.read(inputPath);
    const originalWidth = image.getWidth();
    const originalHeight = image.getHeight();

    // Find the bounding box of non-white content
    let minX = originalWidth;
    let minY = originalHeight;
    let maxX = -1;
    let maxY = -1;

    const whiteThreshold = 240; // Consider pixels > this value as "white"

    // Scan image to find content boundaries
    image.scan(0, 0, originalWidth, originalHeight, function(x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      
      // Check if pixel is not white/background
      if (red < whiteThreshold || green < whiteThreshold || blue < whiteThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });

    // Add small padding to avoid cutting content
    const padding = 10;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(originalWidth - 1, maxX + padding);
    maxY = Math.min(originalHeight - 1, maxY + padding);

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    // Only crop if we're removing significant margins (>5% on any side)
    const marginThreshold = 0.05;
    const leftMargin = minX / originalWidth;
    const rightMargin = (originalWidth - maxX) / originalWidth;
    const topMargin = minY / originalHeight;
    const bottomMargin = (originalHeight - maxY) / originalHeight;

    const shouldCrop = leftMargin > marginThreshold || 
                      rightMargin > marginThreshold || 
                      topMargin > marginThreshold || 
                      bottomMargin > marginThreshold;

    if (shouldCrop && cropWidth > 0 && cropHeight > 0) {
      const croppedImage = image.clone().crop(minX, minY, cropWidth, cropHeight);
      const buffer = await croppedImage.getBufferAsync(Jimp.MIME_PNG);

      return {
        cropped: true,
        buffer,
        removed: {
          left: minX,
          top: minY,
          right: originalWidth - maxX,
          bottom: originalHeight - maxY
        },
        metadata: {
          originalDimensions: { width: originalWidth, height: originalHeight },
          croppedDimensions: { width: cropWidth, height: cropHeight },
          marginsRemoved: { leftMargin, rightMargin, topMargin, bottomMargin }
        }
      };
    } else {
      // No significant cropping needed
      const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
      return {
        cropped: false,
        buffer,
        removed: { left: 0, top: 0, right: 0, bottom: 0 }
      };
    }
  } catch (error) {
    throw new Error(`Auto-crop failed: ${error.message}`);
  }
}

/**
 * Detect and correct image skew
 * Simplified version using Jimp - would be better with OpenCV
 */
async function deskewImage(imageBuffer) {
  try {
    // For now, return as-is since we don't have OpenCV
    // In a real implementation, this would:
    // 1. Convert to grayscale
    // 2. Detect edges
    // 3. Use Hough transform to find dominant lines
    // 4. Calculate skew angle
    // 5. Rotate image to correct

    console.warn('⚠️ Deskew functionality requires OpenCV - skipping for now');
    
    return {
      skewAngle: 0, // No skew detected/corrected
      buffer: imageBuffer,
      corrected: false
    };
  } catch (error) {
    throw new Error(`Deskew failed: ${error.message}`);
  }
}

/**
 * Batch process multiple images
 */
export async function batchProcessImages(inputPaths, outputDir, options = {}) {
  const results = [];
  
  await fs.mkdir(outputDir, { recursive: true });

  for (const inputPath of inputPaths) {
    const filename = path.basename(inputPath);
    const outputPath = path.join(outputDir, `processed_${filename}`);
    
    try {
      const result = await processImage(inputPath, outputPath, options);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        inputPath,
        outputPath,
        error: error.message
      });
    }
  }

  // Save batch processing report
  const reportPath = path.join(outputDir, 'processing-report.json');
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalImages: inputPaths.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    options,
    results
  }, null, 2));

  return results;
}

/**
 * Analyze image quality metrics
 */
export async function analyzeImageQuality(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const stats = await sharp(imagePath).stats();

    // Calculate basic quality metrics
    const qualityMetrics = {
      dimensions: {
        width: metadata.width,
        height: metadata.height,
        megapixels: (metadata.width * metadata.height) / 1000000
      },
      format: metadata.format,
      colorSpace: metadata.space,
      hasAlpha: metadata.hasAlpha,
      density: metadata.density,
      fileSize: metadata.size,
      channels: stats.channels.map(channel => ({
        mean: channel.mean,
        stdev: channel.stdev,
        min: channel.min,
        max: channel.max
      })),
      contrast: calculateContrast(stats.channels),
      brightness: calculateBrightness(stats.channels)
    };

    return qualityMetrics;
  } catch (error) {
    throw new Error(`Quality analysis failed: ${error.message}`);
  }
}

/**
 * Calculate contrast metric from channel statistics
 */
function calculateContrast(channels) {
  // Use standard deviation as a simple contrast measure
  const avgStdev = channels.reduce((sum, ch) => sum + ch.stdev, 0) / channels.length;
  return Math.round(avgStdev * 100) / 100;
}

/**
 * Calculate brightness metric from channel statistics
 */
function calculateBrightness(channels) {
  // Use mean values as brightness measure
  const avgMean = channels.reduce((sum, ch) => sum + ch.mean, 0) / channels.length;
  return Math.round(avgMean * 100) / 100;
}