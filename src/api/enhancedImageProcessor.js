// enhancedImageProcessor.js - Advanced image processing for board game components
// Based on Java implementation optimizations for multi-approach extraction

import { promises as fs } from 'fs';
import path from 'path';

import sharp from 'sharp';

export class EnhancedImageProcessor {
  constructor() {
    this.config = {
      // Component-specific configurations
      componentConfigs: {
        dice: {
          cannyThresholds: { low: 25.0, high: 75.0 },
          morphologyOperations: { erosion: 0, dilation: 1 },
          backgroundTolerance: 20,
          qualityThreshold: 0.75,
        },
        cards: {
          cannyThresholds: { low: 40.0, high: 120.0 },
          enableEdgeRefinement: true,
          backgroundTolerance: 15,
          qualityThreshold: 0.8,
        },
        tokens: {
          cannyThresholds: { low: 30.0, high: 90.0 },
          uniformAreaDetection: { radius: 8, threshold: 0.9 },
          backgroundTolerance: 18,
          qualityThreshold: 0.78,
        },
        boards: {
          cannyThresholds: { low: 35.0, high: 100.0 },
          enableLargeObjectMode: true,
          backgroundTolerance: 12,
          qualityThreshold: 0.85,
        },
        figures: {
          cannyThresholds: { low: 20.0, high: 80.0 },
          preserveDetailMode: true,
          backgroundTolerance: 25,
          qualityThreshold: 0.7,
        },
        default: {
          cannyThresholds: { low: 30.0, high: 100.0 },
          backgroundTolerance: 15,
          qualityThreshold: 0.75,
        },
      },

      // Global processing settings
      global: {
        gaussianBlurRadius: 1,
        minimumComponentArea: 500.0,
        maximumBackgroundRatio: 0.7,
        enableNoiseReduction: true,
        maxRetries: 3,
        parallelProcessingLimit: 3,
      },

      // Background removal configurations
      backgroundRemoval: {
        whiteThresholds: [240, 245, 250], // Try multiple thresholds
        backgroundColors: [
          { r: 255, g: 255, b: 255 }, // Pure white
          { r: 248, g: 248, b: 248 }, // Off-white
          { r: 240, g: 240, b: 240 }, // Light gray
        ],
        colorToleranceRadius: 15,
      },
    };
  }

  /**
   * Analyze image characteristics to select optimal processing method
   */
  async analyzeImageCharacteristics(imagePath) {
    try {
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      const stats = await image.stats();

      // Calculate key characteristics
      const hasExistingTransparency = metadata.hasAlpha || false;
      const aspectRatio = metadata.width / metadata.height;

      // Analyze color distribution to detect uniform backgrounds
      const isLikelyUniformBackground = await this.detectUniformBackground(imagePath, stats);

      // Detect complex edges by analyzing variance
      const hasComplexEdges = await this.detectComplexEdges(imagePath);

      return {
        width: metadata.width,
        height: metadata.height,
        hasExistingTransparency,
        hasUniformBackground: isLikelyUniformBackground,
        hasComplexEdges,
        aspectRatio,
        format: metadata.format,
        fileSize: metadata.size || 0,
      };
    } catch (error) {
      console.warn('Failed to analyze image characteristics:', error.message);
      return {
        hasExistingTransparency: false,
        hasUniformBackground: true,
        hasComplexEdges: false,
        aspectRatio: 1.0,
      };
    }
  }

  /**
   * Select optimal extraction method based on image characteristics
   */
  selectOptimalExtractionMethod(imageCharacteristics, componentType = 'default') {
    if (imageCharacteristics.hasExistingTransparency) {
      return 'AI_SEGMENTATION'; // Enhance existing transparency
    } else if (imageCharacteristics.hasUniformBackground) {
      return 'COLOR_THRESHOLD'; // Fast color-based removal
    } else if (imageCharacteristics.hasComplexEdges) {
      return 'EDGE_DETECTION_ADVANCED'; // Advanced edge detection
    } else {
      return 'EDGE_DETECTION_BASIC'; // Traditional edge detection
    }
  }

  /**
   * Get component-specific configuration
   */
  getComponentSpecificConfig(componentType) {
    const normalizedType = componentType.toLowerCase();

    // Check for specific component types
    for (const [type, config] of Object.entries(this.config.componentConfigs)) {
      if (normalizedType.includes(type)) {
        return { ...this.config.componentConfigs.default, ...config };
      }
    }

    return this.config.componentConfigs.default;
  }

  /**
   * Enhanced background removal with multiple approaches
   */
  async enhancedBackgroundRemoval(imagePath, method, componentConfig) {
    const tempFiles = [];

    try {
      switch (method) {
        case 'COLOR_THRESHOLD':
          return await this.colorThresholdRemoval(imagePath, componentConfig, tempFiles);

        case 'EDGE_DETECTION_BASIC':
          return await this.basicEdgeDetectionRemoval(imagePath, componentConfig, tempFiles);

        case 'EDGE_DETECTION_ADVANCED':
          return await this.advancedEdgeDetectionRemoval(imagePath, componentConfig, tempFiles);

        case 'AI_SEGMENTATION':
          return await this.aiSegmentationRemoval(imagePath, componentConfig, tempFiles);

        default:
          return await this.colorThresholdRemoval(imagePath, componentConfig, tempFiles);
      }
    } catch (error) {
      console.warn(`Background removal method ${method} failed:`, error.message);
      // Fallback to basic method
      return await this.basicFallbackRemoval(imagePath, componentConfig, tempFiles);
    } finally {
      // Cleanup temporary files
      await this.cleanupTempFiles(tempFiles);
    }
  }

  /**
   * Color threshold-based background removal (fastest method)
   */
  async colorThresholdRemoval(imagePath, config, tempFiles) {
    const outputPath = this.generateTempPath(imagePath, 'color-thresh', tempFiles);

    // Try multiple thresholds and pick the best result
    let bestResult = null;
    let bestQuality = 0;

    for (const threshold of this.config.backgroundRemoval.whiteThresholds) {
      const tempPath = this.generateTempPath(imagePath, `thresh-${threshold}`, tempFiles);

      try {
        // Apply threshold-based background removal
        await sharp(imagePath)
          .removeAlpha()
          .ensureAlpha()
          .composite([
            {
              input: await sharp(imagePath)
                .removeAlpha()
                .greyscale()
                .threshold(threshold)
                .negate()
                .toBuffer(),
              blend: 'dest-in',
            },
          ])
          .png()
          .toFile(tempPath);

        // Assess quality of this result
        const quality = await this.assessBackgroundRemovalQuality(tempPath);

        if (quality > bestQuality) {
          bestQuality = quality;
          bestResult = tempPath;
        }
      } catch (error) {
        console.warn(`Threshold ${threshold} failed:`, error.message);
      }
    }

    if (bestResult && bestQuality >= config.qualityThreshold) {
      // Copy best result to final output
      await fs.copyFile(bestResult, outputPath);
      return { path: outputPath, quality: bestQuality, method: 'color_threshold' };
    }

    throw new Error('Color threshold method failed to meet quality standards');
  }

  /**
   * Basic edge detection removal
   */
  async basicEdgeDetectionRemoval(imagePath, config, tempFiles) {
    const outputPath = this.generateTempPath(imagePath, 'edge-basic', tempFiles);

    try {
      // Apply Gaussian blur and basic edge enhancement
      const processedImage = sharp(imagePath)
        .blur(this.config.global.gaussianBlurRadius)
        .sharpen()
        .removeAlpha()
        .ensureAlpha();

      // Create mask based on edge detection simulation
      const maskBuffer = await sharp(imagePath)
        .removeAlpha()
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // Edge detection kernel
        })
        .threshold(50)
        .negate()
        .toBuffer();

      await processedImage
        .composite([{ input: maskBuffer, blend: 'dest-in' }])
        .png()
        .toFile(outputPath);

      const quality = await this.assessBackgroundRemovalQuality(outputPath);
      return { path: outputPath, quality, method: 'edge_detection_basic' };
    } catch (error) {
      throw new Error(`Basic edge detection failed: ${error.message}`);
    }
  }

  /**
   * Advanced edge detection with component-specific tuning
   */
  async advancedEdgeDetectionRemoval(imagePath, config, tempFiles) {
    const outputPath = this.generateTempPath(imagePath, 'edge-advanced', tempFiles);

    try {
      // Multi-stage processing for complex edges
      let processedImage = sharp(imagePath);

      // Stage 1: Noise reduction
      if (this.config.global.enableNoiseReduction) {
        processedImage = processedImage.median(3);
      }

      // Stage 2: Edge-preserving smoothing
      processedImage = processedImage.blur(0.5);

      // Stage 3: Advanced edge detection with component-specific thresholds
      const edgeMask = await sharp(imagePath)
        .removeAlpha()
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2], // Sobel-like kernel
        })
        .threshold(config.cannyThresholds.low)
        .negate()
        .toBuffer();

      await processedImage
        .removeAlpha()
        .ensureAlpha()
        .composite([{ input: edgeMask, blend: 'dest-in' }])
        .png()
        .toFile(outputPath);

      const quality = await this.assessBackgroundRemovalQuality(outputPath);
      return { path: outputPath, quality, method: 'edge_detection_advanced' };
    } catch (error) {
      throw new Error(`Advanced edge detection failed: ${error.message}`);
    }
  }

  /**
   * AI-guided segmentation for complex cases
   */
  async aiSegmentationRemoval(imagePath, config, tempFiles) {
    const outputPath = this.generateTempPath(imagePath, 'ai-segment', tempFiles);

    // For now, implement as enhanced color-based method
    // This could be extended with actual AI/ML segmentation in the future
    try {
      // Multi-color background detection
      const results = [];

      for (const bgColor of this.config.backgroundRemoval.backgroundColors) {
        const tempPath = this.generateTempPath(imagePath, `ai-${bgColor.r}`, tempFiles);

        // Create mask for this specific background color
        const colorMask = await this.createColorMask(
          imagePath,
          bgColor,
          config.backgroundTolerance,
        );

        await sharp(imagePath)
          .removeAlpha()
          .ensureAlpha()
          .composite([{ input: colorMask, blend: 'dest-in' }])
          .png()
          .toFile(tempPath);

        const quality = await this.assessBackgroundRemovalQuality(tempPath);
        results.push({ path: tempPath, quality, color: bgColor });
      }

      // Select best result
      const bestResult = results.reduce((best, current) =>
        current.quality > best.quality ? current : best,
      );

      await fs.copyFile(bestResult.path, outputPath);
      return { path: outputPath, quality: bestResult.quality, method: 'ai_segmentation' };
    } catch (error) {
      throw new Error(`AI segmentation failed: ${error.message}`);
    }
  }

  /**
   * Basic fallback method when all else fails
   */
  async basicFallbackRemoval(imagePath, config, tempFiles) {
    const outputPath = this.generateTempPath(imagePath, 'fallback', tempFiles);

    try {
      // Simple white background removal as fallback
      await sharp(imagePath)
        .removeAlpha()
        .ensureAlpha()
        .composite([
          {
            input: await sharp(imagePath)
              .removeAlpha()
              .greyscale()
              .threshold(245) // Conservative threshold
              .negate()
              .toBuffer(),
            blend: 'dest-in',
          },
        ])
        .png()
        .toFile(outputPath);

      const quality = await this.assessBackgroundRemovalQuality(outputPath);
      return { path: outputPath, quality, method: 'fallback' };
    } catch (error) {
      throw new Error(`Fallback method failed: ${error.message}`);
    }
  }

  /**
   * Assess the quality of background removal results
   */
  async assessBackgroundRemovalQuality(processedImagePath) {
    try {
      const image = sharp(processedImagePath);
      const metadata = await image.metadata();
      const stats = await image.stats();

      // Edge quality assessment (40% weight)
      const edgeQuality = (await this.assessEdgeSharpness(processedImagePath)) * 0.4;

      // Background cleanliness assessment (30% weight)
      const backgroundCleanliness =
        (await this.assessBackgroundCleanliness(processedImagePath, stats)) * 0.3;

      // Component preservation assessment (30% weight)
      const componentPreservation =
        (await this.assessComponentPreservation(processedImagePath, metadata)) * 0.3;

      return Math.min(1.0, edgeQuality + backgroundCleanliness + componentPreservation);
    } catch (error) {
      console.warn('Quality assessment failed:', error.message);
      return 0.5; // Default middle quality
    }
  }

  /**
   * Assess edge sharpness in the processed image
   */
  async assessEdgeSharpness(imagePath) {
    try {
      // Apply edge detection and measure variance as proxy for edge quality
      const edgeBuffer = await sharp(imagePath)
        .removeAlpha()
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        })
        .raw()
        .toBuffer();

      // Calculate variance of edge-detected image
      const values = Array.from(edgeBuffer);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

      // Normalize variance to 0-1 scale (higher variance = sharper edges)
      return Math.min(1.0, variance / 10000);
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Assess how clean the background is (less noise = better)
   */
  async assessBackgroundCleanliness(imagePath, stats) {
    try {
      // For images with alpha, check how much of the background was successfully removed
      const metadata = await sharp(imagePath).metadata();

      if (metadata.hasAlpha) {
        // Count transparent pixels vs total pixels as cleanliness metric
        const { data } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
        let transparentPixels = 0;
        const totalPixels = metadata.width * metadata.height;

        // Sample every 4th byte (alpha channel) for performance
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 128) {
            // Consider semi-transparent as background
            transparentPixels++;
          }
        }

        const transparencyRatio = transparentPixels / totalPixels;

        // Good background removal should have moderate transparency (not too much, not too little)
        if (transparencyRatio >= 0.2 && transparencyRatio <= 0.6) {
          return 1.0; // Optimal transparency range
        } else if (transparencyRatio < 0.1) {
          return 0.3; // Too little background removed
        } else if (transparencyRatio > 0.8) {
          return 0.2; // Too much removed (likely damaged component)
        } else {
          return 0.7; // Acceptable range
        }
      } else {
        // For non-alpha images, use color variance as cleanliness metric
        const avgVariance =
          (stats.channels || []).reduce((sum, channel) => sum + (channel.stdev || 0), 0) /
          (stats.channels || []).length;

        return Math.min(1.0, avgVariance / 50);
      }
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Assess how well the component itself was preserved
   */
  async assessComponentPreservation(imagePath, metadata) {
    try {
      // Check if the processed image maintains reasonable component structure
      const area = metadata.width * metadata.height;

      // Large images are more likely to preserve detail
      const sizeScore = Math.min(1.0, area / this.config.global.minimumComponentArea);

      // Aspect ratio should be reasonable for board game components
      const aspectRatio = metadata.width / metadata.height;
      const aspectScore = aspectRatio >= 0.2 && aspectRatio <= 5.0 ? 1.0 : 0.5;

      return sizeScore * 0.6 + aspectScore * 0.4;
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Main processing function with retry logic and fallbacks
   */
  async processComponentImage(imagePath, componentType = 'default', options = {}) {
    const maxRetries = options.maxRetries || this.config.global.maxRetries;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`Processing attempt ${attempt + 1} for ${path.basename(imagePath)}`);

        // Step 1: Analyze image characteristics
        const characteristics = await this.analyzeImageCharacteristics(imagePath);

        // Step 2: Select optimal method
        const method = this.selectOptimalExtractionMethod(characteristics, componentType);

        // Step 3: Get component-specific configuration
        const config = this.getComponentSpecificConfig(componentType);

        // Step 4: Apply background removal
        const result = await this.enhancedBackgroundRemoval(imagePath, method, config);

        // Step 5: Validate quality
        if (result.quality >= config.qualityThreshold) {
          console.log(
            `✅ Processing successful: ${result.method} (quality: ${(result.quality * 100).toFixed(1)}%)`,
          );
          return {
            success: true,
            outputPath: result.path,
            quality: result.quality,
            method: result.method,
            characteristics,
            attempts: attempt + 1,
          };
        } else {
          console.log(
            `⚠️ Quality below threshold: ${(result.quality * 100).toFixed(1)}% < ${(config.qualityThreshold * 100).toFixed(1)}%`,
          );
        }
      } catch (error) {
        lastError = error;
        console.warn(`Processing attempt ${attempt + 1} failed:`, error.message);

        // Exponential backoff for retries
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    // If all attempts failed, try combined approach as last resort
    try {
      console.log('Attempting combined fallback approach...');
      const result = await this.combinedFallbackApproach(imagePath, componentType);

      return {
        success: true,
        outputPath: result.path,
        quality: result.quality,
        method: 'combined_fallback',
        attempts: maxRetries + 1,
        warning: 'Used fallback method after all primary methods failed',
      };
    } catch (combinedError) {
      return {
        success: false,
        error: `All processing attempts failed. Last error: ${lastError?.message || 'Unknown error'}`,
        attempts: maxRetries + 1,
      };
    }
  }

  /**
   * Process multiple components in parallel with controlled concurrency
   */
  async processComponentsParallel(componentList) {
    const results = [];
    const maxConcurrent = this.config.global.parallelProcessingLimit;

    for (let i = 0; i < componentList.length; i += maxConcurrent) {
      const batch = componentList.slice(i, i + maxConcurrent);

      console.log(
        `Processing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(componentList.length / maxConcurrent)}`,
      );

      const batchPromises = batch.map(async (component) => {
        if (!this.shouldProcessComponent(component)) {
          return { ...component, skipped: true, reason: 'Failed pre-processing filters' };
        }

        const result = await this.processComponentImage(component.imagePath, component.type);
        return { ...component, processing: result };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  // Utility methods

  shouldProcessComponent(component) {
    if (!component.imagePath || !component.area) return false;

    const minArea = this.config.global.minimumComponentArea;
    const maxAspectRatio = 10;

    return component.area >= minArea && (component.aspectRatio || 1) <= maxAspectRatio;
  }

  generateTempPath(originalPath, suffix, tempFilesList) {
    const dir = path.dirname(originalPath);
    const name = path.basename(originalPath, path.extname(originalPath));
    const ext = path.extname(originalPath);
    const tempPath = path.join(dir, `${name}_${suffix}_${Date.now()}${ext}`);

    if (tempFilesList) {
      tempFilesList.push(tempPath);
    }

    return tempPath;
  }

  async cleanupTempFiles(tempFiles) {
    for (const filePath of tempFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  async detectUniformBackground(imagePath, stats) {
    try {
      // Check if image has low color variance (indicating uniform background)
      const channels = stats.channels || [];
      const avgStdev = channels.reduce((sum, ch) => sum + (ch.stdev || 0), 0) / channels.length;

      return avgStdev < 30; // Low variance suggests uniform background
    } catch (error) {
      return true; // Default to assuming uniform background
    }
  }

  async detectComplexEdges(imagePath) {
    try {
      // Apply edge detection and count edge pixels
      const edgeBuffer = await sharp(imagePath)
        .removeAlpha()
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        })
        .threshold(50)
        .raw()
        .toBuffer();

      // Count non-zero (edge) pixels
      const edgePixels = Array.from(edgeBuffer).filter((pixel) => pixel > 0).length;
      const totalPixels = edgeBuffer.length;
      const edgeRatio = edgePixels / totalPixels;

      return edgeRatio > 0.15; // High edge density suggests complex edges
    } catch (error) {
      return false; // Default to simple edges
    }
  }

  async createColorMask(imagePath, targetColor, tolerance) {
    // Create a mask that removes pixels similar to target color
    return await sharp(imagePath)
      .removeAlpha()
      .greyscale()
      .linear(1, -targetColor.r) // Subtract target color intensity
      .threshold(255 - tolerance)
      .toBuffer();
  }

  async combinedFallbackApproach(imagePath, componentType) {
    // Last resort: try the most conservative approach
    const outputPath = this.generateTempPath(imagePath, 'combined-fallback', []);

    try {
      await sharp(imagePath)
        .removeAlpha()
        .ensureAlpha()
        .composite([
          {
            input: await sharp(imagePath)
              .removeAlpha()
              .greyscale()
              .threshold(250) // Very conservative threshold
              .negate()
              .toBuffer(),
            blend: 'dest-in',
          },
        ])
        .png()
        .toFile(outputPath);

      const quality = 0.6; // Assume reasonable quality for fallback
      return { path: outputPath, quality, method: 'combined_fallback' };
    } catch (error) {
      throw new Error(`Combined fallback approach failed: ${error.message}`);
    }
  }
}

// Export singleton instance
export const enhancedProcessor = new EnhancedImageProcessor();
export default EnhancedImageProcessor;
