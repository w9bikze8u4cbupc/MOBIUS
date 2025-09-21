// alphaOps.js - Node.js transparency utilities for Sharp
import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

export class AlphaOps {
  /**
   * Ensure image has alpha channel (RGBA format).
   * Equivalent to Java's ensureArgb() function.
   */
  static async ensureAlpha(inputBuffer) {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    // If image already has alpha, return as-is
    if (metadata.channels === 4) {
      return await image.png().toBuffer();
    }

    // Add alpha channel with full opacity
    return await image
      .ensureAlpha(1.0) // Add full opacity alpha channel
      .png()
      .toBuffer();
  }

  /**
   * Create a transparent PNG buffer with specified dimensions.
   * Equivalent to Java's newTransparent() function.
   */
  static async newTransparent(width, height) {
    return await sharp({
      create: {
        width: width,
        height: height,
        channels: 4, // RGBA
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent
      },
    })
      .png()
      .toBuffer();
  }

  /**
   * Force all pixels to be fully opaque while preserving color.
   * Equivalent to Java's forceOpaque() function.
   */
  static async forceOpaque(inputBuffer) {
    return await sharp(inputBuffer)
      .ensureAlpha(1.0) // Force full opacity
      .png()
      .toBuffer();
  }

  /**
   * Composite transparent image onto solid background.
   * Equivalent to Java's flattenOnto() function.
   * Only use when you WANT to remove transparency.
   */
  static async flattenOntoBackground(inputBuffer, backgroundColor = { r: 255, g: 255, b: 255 }) {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    return await image
      .flatten({ background: backgroundColor })
      .jpeg({ quality: 90 }) // JPEG doesn't support transparency
      .toBuffer();
  }

  /**
   * Write PNG preserving alpha channel.
   * Equivalent to Java's writePng() function.
   */
  static async writePngWithAlpha(inputBuffer, outputPath) {
    try {
      const alphaBuffer = await AlphaOps.ensureAlpha(inputBuffer);
      await sharp(alphaBuffer)
        .png({
          compressionLevel: 6,
          adaptiveFiltering: false,
          force: true, // Force PNG format
        })
        .toFile(outputPath);
      return true;
    } catch (error) {
      console.error('Error writing PNG with alpha:', error);
      return false;
    }
  }

  /**
   * Load image file preserving alpha channel.
   */
  static async loadWithAlpha(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const image = sharp(filePath);
      const metadata = await image.metadata();

      // Ensure alpha channel is preserved
      return await image
        .png() // Convert to PNG to ensure alpha support
        .toBuffer();
    } catch (error) {
      console.error('Error loading image with alpha:', error);
      return null;
    }
  }

  /**
   * Generate preview with proper alpha handling.
   * Improves the existing generatePreviewImage function.
   */
  static async generatePreviewWithAlpha(
    filePath,
    outputPath = 'uploads/tmp',
    quality = 75,
    size = 300,
  ) {
    try {
      const previewDir = path.dirname(outputPath);
      await fs.promises.mkdir(previewDir, { recursive: true });

      const image = sharp(filePath);
      const metadata = await image.metadata();

      // Handle transparency properly in previews
      if (metadata.channels === 4 || metadata.hasAlpha) {
        // For transparent images, create PNG preview
        const previewPath = outputPath.replace(/\.(jpe?g|webp)$/i, '.png');
        await image
          .resize(size, size, {
            fit: 'inside',
            withoutEnlargement: true,
            background: { r: 0, g: 0, b: 0, alpha: 0 }, // Preserve transparency
          })
          .png({ compressionLevel: 6 })
          .toFile(previewPath);
        return previewPath;
      } else {
        // For opaque images, use JPEG
        await image
          .resize(size, size, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality })
          .toFile(outputPath);
        return outputPath;
      }
    } catch (error) {
      console.error('Error generating preview with alpha:', error);
      return null;
    }
  }

  /**
   * Crop image while preserving alpha channel.
   * Improves the existing cropping functionality.
   */
  static async cropWithAlpha(inputPath, outputPath, { x, y, width, height }) {
    try {
      const image = sharp(inputPath);
      const metadata = await image.metadata();

      // Ensure coordinates are valid
      const cropOptions = {
        left: Math.max(0, Math.floor(x)),
        top: Math.max(0, Math.floor(y)),
        width: Math.min(width, metadata.width - Math.max(0, Math.floor(x))),
        height: Math.min(height, metadata.height - Math.max(0, Math.floor(y))),
      };

      // Handle alpha channel properly
      if (metadata.channels === 4 || metadata.hasAlpha) {
        await image
          .extract(cropOptions)
          .png() // Preserve alpha in PNG
          .toFile(outputPath);
      } else {
        await image
          .extract(cropOptions)
          .png() // Still use PNG for consistency
          .toFile(outputPath);
      }

      return true;
    } catch (error) {
      console.error('Error cropping with alpha:', error);
      return false;
    }
  }
}

// Example usage for the existing Sharp functions
export async function generatePreviewImageAlphaSafe(
  filePath,
  outputPath = 'uploads/tmp',
  quality = 75,
) {
  return await AlphaOps.generatePreviewWithAlpha(filePath, outputPath, quality);
}

// Validation function similar to the Java version
export async function validateAlphaHandling(inputPath, outputPath) {
  try {
    console.log('Starting alpha validation...');

    // Load image with alpha preservation
    const buffer = await AlphaOps.loadWithAlpha(inputPath);
    if (!buffer) {
      throw new Error(`Could not load ${inputPath}`);
    }

    // Get metadata
    const metadata = await sharp(buffer).metadata();
    console.log(
      `Input: ${metadata.width}x${metadata.height}, channels: ${metadata.channels}, hasAlpha: ${metadata.hasAlpha}`,
    );

    // Ensure alpha and make a test transparent area
    const image = sharp(buffer);

    // Create a small transparent overlay for testing
    const transparentOverlay = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0 }, // Transparent red
      },
    })
      .png()
      .toBuffer();

    // Composite the transparent overlay onto the image
    const result = await image
      .composite([
        {
          input: transparentOverlay,
          top: 5,
          left: 5,
          blend: 'over',
        },
      ])
      .png()
      .toBuffer();

    // Save with alpha preservation
    const success = await AlphaOps.writePngWithAlpha(result, outputPath);

    if (success) {
      console.log(`Successfully wrote ${outputPath} with alpha preservation`);
      console.log(
        'Open the file in an image viewer with checkerboard background to verify transparency',
      );
      return true;
    } else {
      console.log(`Failed to write ${outputPath}`);
      return false;
    }
  } catch (error) {
    console.error('Alpha validation failed:', error);
    return false;
  }
}

// For command-line testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node alphaOps.js <input.png> <output.png>');
    process.exit(1);
  }

  validateAlphaHandling(args[0], args[1])
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}
