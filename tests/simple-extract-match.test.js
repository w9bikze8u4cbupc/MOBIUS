/**
 * tests/simple-extract-match.test.js
 *
 * A minimal test harness that:
 *  - Generates 2 synthetic images (colored boxes) to act as "library"
 *  - Writes a "sample" PNG and runs processing + hashing + a match attempt
 *
 * Run: node tests/simple-extract-match.test.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { processImage } = require('../src/utils/imageProcessing');
const { computeImageHash, matchImageToLibrary } = require('../src/utils/imageMatching');

async function createSyntheticImage(out, color, text) {
  await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: color
    }
  })
    .composite([{
      input: Buffer.from(`<svg width="1200" height="200"><text x="20" y="150" font-size="120" fill="white">${text}</text></svg>`),
      gravity: 'northwest'
    }])
    .png()
    .toFile(out);
}

async function run() {
  const tmp = path.join(__dirname, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  const libA = path.join(tmp, 'lib-a.png');
  const libB = path.join(tmp, 'lib-b.png');
  await createSyntheticImage(libA, '#2a9d8f', 'Game-A');
  await createSyntheticImage(libB, '#e76f51', 'Game-B');

  const lib = [];
  lib.push({ id: 'A', title: 'Game A', phash: await computeImageHash(libA) });
  lib.push({ id: 'B', title: 'Game B', phash: await computeImageHash(libB) });

  const sampleIn = path.join(tmp, 'sample.png');
  await createSyntheticImage(sampleIn, '#2a9d8f', 'Game-A (scanned)');

  const processed = await processImage(sampleIn, { outDir: tmp, basename: 'sample', generateWebP: false, generateThumbnail: false });
  const sampleMeta = {
    filename: path.relative(tmp, processed.masterPath),
    masterPath: processed.masterPath,
    phash: await computeImageHash(processed.masterPath)
  };

  const report = await matchImageToLibrary(sampleMeta, lib, { autoAssignThreshold: 0.5, useEmbedding: false, phashWeight: 1.0 });

  console.log('Library:', lib);
  console.log('Sample metadata:', sampleMeta);
  console.log('Match report:', JSON.stringify(report, null, 2));

  if (report.chosen === 'A') {
    console.log('TEST OK: sample matched to A as expected.');
    process.exit(0);
  } else {
    console.error('TEST FAIL: sample did not auto-assign to A. Report:', report);
    process.exit(1);
  }
}

run().catch(err => { console.error(err); process.exit(2); });