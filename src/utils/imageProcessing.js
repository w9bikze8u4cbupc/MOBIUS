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
    webWidth = 1920,
    thumbWidth = 300
  } = opts;

  const masterPath = path.resolve(outDir, `${basename}.png`);
  
  // Only copy if paths are different
  if (path.resolve(inputPath) !== path.resolve(masterPath)) {
    await sharp(inputPath)
      .png({ compressionLevel: 0 })
      .toFile(masterPath);
  }

  const img = sharp(masterPath);
  const meta = await img.metadata();

  let pipeline = sharp(masterPath);
  try {
    pipeline = pipeline.trim();
  } catch (e) {}

  pipeline = pipeline
    .flatten({ background: '#ffffff' })
    .linear(1.02, -4)
    .gamma(1.02)
    .sharpen()
    .withMetadata();

  const tempPath = path.resolve(outDir, `${basename}_temp.png`);
  await pipeline.toFile(tempPath);
  
  // Replace original with processed version
  if (fs.existsSync(tempPath)) {
    fs.renameSync(tempPath, masterPath);
  }

  const thumbPath = path.resolve(outDir, `${basename}-thumb.jpg`);
  await sharp(masterPath)
    .resize({ width: thumbWidth, fit: 'inside' })
    .jpeg({ quality: 84 })
    .toFile(thumbPath);

  let webPath = null;
  if (generateWebP) {
    webPath = path.resolve(outDir, `${basename}-web.jpg`);
    await sharp(masterPath)
      .resize({ width: webWidth, fit: 'inside' })
      .jpeg({ quality: 90, progressive: true })
      .toFile(webPath);
  }

  const metadata = {
    width: meta.width,
    height: meta.height,
    dpi: meta.density || null,
    bbox: { x: 0, y: 0, w: meta.width, h: meta.height }
  };

  return {
    masterPath,
    webPath,
    thumbPath,
    metadata
  };
}

module.exports = { processImage };