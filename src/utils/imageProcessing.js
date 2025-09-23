/**
 * src/utils/imageProcessing.js
 *
 * Small utility functions for image post-processing.
 *
 * - Uses `sharp` for cropping, trimming, resizing, format conversion.
 * - Tries to auto-trim margins (sharp.trim), normalize contrast, and create derivatives.
 * - Keeps a lossless master PNG (if requested).
 *
 * Exports:
 *  - processImage(inputPath, options) => { masterPath, webPath, thumbPath, metadata }
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function processImage(inputPath, opts = {}) {
  const {
    outDir = path.dirname(inputPath),
    basename = path.basename(inputPath, path.extname(inputPath)),
    losslessMaster = true,
    generateWebP = true,
    webWidth = 1920,        // resize for video-friendly frame
    thumbWidth = 512
  } = opts;

  const masterPath = path.resolve(outDir, `${basename}.png`);
  // If master already in place and losslessMaster requested, leave it as-is.
  if (!fs.existsSync(masterPath) || path.resolve(inputPath) !== path.resolve(masterPath)) {
    // convert to PNG with sharp and write to masterPath
    await sharp(inputPath)
      .png({ compressionLevel: 0 }) // lossless
      .toFile(masterPath);
  }

  // Load image for metadata and processing
  const img = sharp(masterPath);
  const meta = await img.metadata();

  // Auto-trim / crop small borders
  // sharp.trim() trims based on top-left pixel; not perfect but helps a lot for scanned pages.
  let pipeline = sharp(masterPath);
  try {
    pipeline = pipeline.trim(); // may remove uniform borders
  } catch (e) {
    // trim may throw on older sharp versions; ignore
  }

  // Normalize: slight contrast and brightness adjustments (safe default)
  pipeline = pipeline
    .flatten({ background: '#ffffff' }) // remove alpha if any
    .linear(1.02, -4) // slight linear contrast/brightness tweak
    .withMetadata();

  // Create a temporary file name for the processed version
  const tempPath = path.resolve(outDir, `${basename}_temp.png`);
  await pipeline.toFile(tempPath);
  
  // Move the temp file to the final master path if they are different
  if (tempPath !== masterPath) {
    if (fs.existsSync(masterPath)) {
      fs.unlinkSync(masterPath);
    }
    fs.renameSync(tempPath, masterPath);
  }

  const normalizedMasterPath = masterPath;

  // Thumbnail
  const thumbPath = path.resolve(outDir, `${basename}-thumb.jpg`);
  await sharp(normalizedMasterPath)
    .resize({ width: thumbWidth, fit: 'inside' })
    .jpeg({ quality: 84 })
    .toFile(thumbPath);

  // Web derivative (sized for video editors; keep high quality but smaller file)
  let webPath = null;
  if (generateWebP) {
    webPath = path.resolve(outDir, `${basename}-web.jpg`);
    await sharp(normalizedMasterPath)
      .resize({ width: webWidth, fit: 'inside' })
      .jpeg({ quality: 92 })
      .toFile(webPath);
  }

  // produce simple bbox (full image by default)
  const metadata = {
    width: meta.width,
    height: meta.height,
    dpi: meta.density || null,
    bbox: { x: 0, y: 0, w: meta.width, h: meta.height }
  };

  return {
    masterPath: normalizedMasterPath,
    webPath,
    thumbPath,
    metadata
  };
}

module.exports = { processImage };