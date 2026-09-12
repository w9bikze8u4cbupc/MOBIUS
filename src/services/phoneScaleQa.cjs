'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const PHONE_SCALE_QA_CONTRACT = 'mobius-phone-scale-qa-sheet-v1';

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

async function buildPhoneScaleQaSheet({ scenes = [], outputPath, columns = 4, tileWidth = 420, tileHeight = 260 } = {}) {
  if (!outputPath) throw new Error('Phone-scale QA requires an outputPath.');
  const rows = Math.max(1, Math.ceil(scenes.length / columns));
  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const composites = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const x = (index % columns) * tileWidth;
    const y = Math.floor(index / columns) * tileHeight;
    const visualPath = scene.renderVisual?.path;
    if (visualPath && fs.existsSync(path.resolve(visualPath))) {
      const image = await sharp(path.resolve(visualPath), { limitInputPixels: false }).rotate().resize(tileWidth - 24, tileHeight - 58, {
        fit: 'contain', background: { r: 27, g: 20, b: 16, alpha: 1 }, withoutEnlargement: true,
      }).png().toBuffer();
      composites.push({ input: image, left: x + 12, top: y + 10 });
    }
    const status = scene.visualReviewState === 'matched' || scene.visualPlan?.coverageStatus === 'resolved' ? 'PASS' : 'REVIEW';
    const label = `${scene.id || `scene-${index + 1}`} · ${status}`;
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="48"><rect width="100%" height="100%" fill="#241914"/><text x="16" y="31" font-family="Arial,sans-serif" font-size="18" fill="${status === 'PASS' ? '#f3ead7' : '#ffcc70'}">${escapeXml(label)}</text></svg>`);
    composites.push({ input: svg, left: x, top: y + tileHeight - 48 });
  }
  await fs.promises.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: { r: 18, g: 13, b: 11, alpha: 1 } } })
    .composite(composites).png().toFile(path.resolve(outputPath));
  return { contract: PHONE_SCALE_QA_CONTRACT, outputPath: path.resolve(outputPath), width, height, scenes: scenes.length, columns, rows };
}

module.exports = { PHONE_SCALE_QA_CONTRACT, buildPhoneScaleQaSheet };
