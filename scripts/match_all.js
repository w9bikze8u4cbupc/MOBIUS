#!/usr/bin/env node
/**
 * scripts/match_all.js
 *
 * Usage:
 *   node scripts/match_all.js extracted_components library.json
 *
 * Loads extracted images metadata (images.json) and matches each image against library.json.
 */

const fs = require('fs');
const path = require('path');
const { matchImageToLibrary } = require('../src/utils/imageMatching');

async function run() {
  const outDir = process.argv[2] || 'extracted_components';
  const libPath = process.argv[3] || 'library.json';
  const imagesMetaPath = path.join(outDir, 'images.json');
  if (!fs.existsSync(imagesMetaPath)) {
    console.error('Missing images.json in', outDir);
    process.exit(2);
  }
  if (!fs.existsSync(libPath)) {
    console.error('Missing library file:', libPath);
    process.exit(3);
  }
  const meta = JSON.parse(fs.readFileSync(imagesMetaPath, 'utf8'));
  const lib = JSON.parse(fs.readFileSync(libPath, 'utf8')).items || [];

  for (const img of meta.images || []) {
    try {
      const report = await matchImageToLibrary(img, lib, { autoAssignThreshold: 0.9, useEmbedding: false, phashWeight: 1.0 });
      console.log('IMAGE', img.filename, '->', report.chosen || 'NONE', 'confidence', report.confidence.toFixed(3));
    } catch (err) {
      console.error('Match failed for', img.filename, err.message);
    }
  }
}

run().catch(e => { console.error(e); process.exit(1); });