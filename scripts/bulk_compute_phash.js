#!/usr/bin/env node
/**
 * scripts/bulk_compute_phash.js
 *
 * Scans a directory of images and writes a library.json with {id, title, phash}
 *
 * Usage:
 *   node scripts/bulk_compute_phash.js path/to/images output-library.json
 */

const fs = require('fs');
const path = require('path');
const { computeImageHash } = require('../src/utils/imageMatching');

async function run() {
  const dir = process.argv[2];
  const out = process.argv[3] || 'library.json';
  if (!dir) {
    console.error('Usage: node scripts/bulk_compute_phash.js images_dir output_library.json');
    process.exit(2);
  }
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  const items = [];
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const phash = await computeImageHash(p);
      items.push({ id: f, title: f, phash });
      console.log('Hashed', f, phash.slice(0, 12) + '...');
    } catch (err) {
      console.warn('Failed to hash', f, err.message);
    }
  }
  fs.writeFileSync(out, JSON.stringify({ items }, null, 2), 'utf8');
  console.log('Library written to', out);
}

run().catch(e => { console.error(e); process.exit(1); });