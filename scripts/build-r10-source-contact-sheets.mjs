#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const sourceRoot = path.resolve('C:/mobius-games-tutorial-generator-runtime/data/6b-7-wonders-duel-8b05c4ce1c4f/hephaestus/images/all');
const outputRoot = path.join(ROOT, 'out/publishability-r10/source-audit/native-contact-sheets');
const pageGroups = [1, 6, 7, 8, 9, 10, 11, 13];
const cell = { width: 320, height: 300 };
const columns = 4;

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

fs.mkdirSync(outputRoot, { recursive: true });
const all = fs.readdirSync(sourceRoot).filter((name) => /\.(?:png|jpe?g)$/i.test(name));
const outputs = [];

for (const page of pageGroups) {
  const matcher = new RegExp(`^component_p${page}_`);
  const files = all.filter((name) => matcher.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!files.length) continue;
  const tiles = [];
  for (let index = 0; index < files.length; index += 1) {
    const name = files[index];
    const source = path.join(sourceRoot, name);
    const metadata = await sharp(source).metadata();
    const image = await sharp(source)
      .resize({ width: cell.width - 24, height: cell.height - 68, fit: 'contain', background: '#21150f' })
      .png()
      .toBuffer();
    const label = Buffer.from(`<svg width="${cell.width}" height="${cell.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="44" fill="#21150f"/><text x="12" y="20" fill="#f4e6ca" font-family="Arial" font-size="14">${escapeXml(name)}</text><text x="12" y="38" fill="#d5a65f" font-family="Arial" font-size="13">${metadata.width}×${metadata.height}</text></svg>`);
    const tile = await sharp({ create: { width: cell.width, height: cell.height, channels: 3, background: '#21150f' } })
      .composite([{ input: image, left: 12, top: 54 }, { input: label, left: 0, top: 0 }])
      .png()
      .toBuffer();
    tiles.push({ input: tile, left: (index % columns) * cell.width, top: Math.floor(index / columns) * cell.height });
  }
  const rows = Math.ceil(files.length / columns);
  const output = path.join(outputRoot, `native-page-${String(page).padStart(2, '0')}.png`);
  await sharp({ create: { width: columns * cell.width, height: rows * cell.height, channels: 3, background: '#130c09' } })
    .composite(tiles)
    .png({ compressionLevel: 9 })
    .toFile(output);
  outputs.push({ page, output, files: files.length });
}

fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({ contract: 'mobius-r10-native-source-contact-sheets-v1', generatedAt: new Date().toISOString(), sourceRoot, outputs }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: 'PASS', outputs }, null, 2)}\n`);
