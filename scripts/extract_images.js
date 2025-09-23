#!/usr/bin/env node
/**
 * scripts/extract_images.js
 *
 * Usage:
 *   node scripts/extract_images.js input.pdf output_dir
 *
 * Behavior:
 *  - Prefer `pdfimages -png` (poppler) to extract lossless images.
 *  - Fallback to `pdftoppm -png` to render each page to PNG.
 *  - Post-process images with Sharp and emit metadata JSON for each image.
 *
 * Outputs:
 *  output_dir/images/*.png
 *  output_dir/images.json  -- array of metadata objects
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { processImage } = require('../src/utils/imageProcessing');
const { computeImageHash } = require('../src/utils/imageMatching');

function which(cmd) {
  try {
    return execSync(`which ${cmd}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return null;
  }
}

async function main() {
  const [,, inputPdf, outDirArg] = process.argv;
  if (!inputPdf || !outDirArg) {
    console.error('Usage: node scripts/extract_images.js input.pdf output_dir');
    process.exit(2);
  }
  const outDir = path.resolve(outDirArg);
  const imagesDir = path.join(outDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const baseName = path.basename(inputPdf, path.extname(inputPdf));
  console.log('Input PDF:', inputPdf);
  console.log('Output dir:', outDir);

  let extractedFiles = [];

  const pdfimagesPath = which('pdfimages');
  const pdftoppmPath = which('pdftoppm');

  try {
    if (pdfimagesPath) {
      console.log('Using pdfimages for lossless extraction (preferred).');
      // pdfimages -png input.pdf outprefix
      const prefix = path.join(imagesDir, `${baseName}-img`);
      spawnSync('pdfimages', ['-png', inputPdf, prefix], { stdio: 'inherit' });
      const files = fs.readdirSync(imagesDir)
        .filter(f => f.startsWith(`${baseName}-img`) && /\.(png|ppm|jpg|jpeg)$/i.test(f))
        .map(f => path.join(imagesDir, f));
      extractedFiles = files.sort();
    } else if (pdftoppmPath) {
      console.log('pdfimages not found — falling back to pdftoppm (renders pages).');
      const prefix = path.join(imagesDir, `${baseName}-p`);
      spawnSync('pdftoppm', ['-png', inputPdf, prefix], { stdio: 'inherit' });
      const files = fs.readdirSync(imagesDir)
        .filter(f => f.startsWith(path.basename(prefix)) && f.endsWith('.png'))
        .map(f => path.join(imagesDir, f));
      extractedFiles = files.sort();
    } else {
      throw new Error('Neither pdfimages nor pdftoppm found on PATH. Install poppler utilities.');
    }
  } catch (err) {
    console.error('Extraction failed:', err);
    process.exit(3);
  }

  if (extractedFiles.length === 0) {
    console.warn('No images/pages extracted. Exiting with no artifacts.');
    fs.writeFileSync(path.join(outDir, 'images.json'), JSON.stringify([], null, 2), 'utf8');
    process.exit(0);
  }

  console.log(`Found ${extractedFiles.length} extracted images/pages. Processing...`);
  const metadata = [];

  for (let i = 0; i < extractedFiles.length; i++) {
    const src = extractedFiles[i];
    const seq = String(i + 1).padStart(4, '0');
    const masterFilename = `${baseName}-${seq}.png`;
    const masterPath = path.join(imagesDir, masterFilename);

    try {
      if (path.resolve(src) !== path.resolve(masterPath)) {
        fs.copyFileSync(src, masterPath);
      }
    } catch (err) {
      console.warn('Could not copy file, continuing with original file:', err.message);
    }

    try {
      const processed = await processImage(masterPath, {
        outDir: imagesDir,
        basename: `${baseName}-${seq}`,
        generateWebP: true,
        generateThumbnail: true,
        losslessMaster: true
      });

      const phash = await computeImageHash(processed.masterPath);

      const item = {
        source_pdf: inputPdf,
        seq,
        filename: path.relative(outDir, processed.masterPath),
        masterPath: processed.masterPath,
        webPath: processed.webPath ? path.relative(outDir, processed.webPath) : null,
        thumbPath: processed.thumbPath ? path.relative(outDir, processed.thumbPath) : null,
        width: processed.metadata.width,
        height: processed.metadata.height,
        dpi: processed.metadata.dpi || null,
        bbox: processed.metadata.bbox || null,
        phash
      };

      metadata.push(item);
      console.log('Processed:', item.filename);
    } catch (err) {
      console.error('Processing failed for', masterPath, err);
    }
  }

  const metaPath = path.join(outDir, 'images.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    images: metadata
  }, null, 2), 'utf8');

  console.log('Extraction + processing complete. Metadata written to', metaPath);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(10);
});