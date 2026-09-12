#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, source) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), source[index + 1]]);
  return pairs;
}, []));
if (!args.manifest || !args.out) throw new Error('Usage: --manifest <storyboard-manifest.json> --out <directory>');
const manifest = JSON.parse(fs.readFileSync(path.resolve(args.manifest), 'utf8'));
const outputDir = path.resolve(args.out);
fs.mkdirSync(outputDir, { recursive: true });
const columns = 2;
const rows = 3;
const cellWidth = 960;
const cellHeight = 590;
const pageSize = columns * rows;
const sheets = [];

for (let offset = 0; offset < manifest.frames.length; offset += pageSize) {
  const frames = manifest.frames.slice(offset, offset + pageSize);
  const composites = [];
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const image = await sharp(frame.filePath).resize(cellWidth, 540, { fit: 'contain', background: '#17100c' }).png().toBuffer();
    const label = Buffer.from(`<svg width="${cellWidth}" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="${cellWidth}" height="50" fill="#21150f"/><text x="18" y="34" fill="#f7ecd2" font-family="Arial,sans-serif" font-size="25">${String(offset + index + 1).padStart(2, '0')} — ${frame.ruleAtomId}</text></svg>`);
    const tile = await sharp({ create: { width: cellWidth, height: cellHeight, channels: 3, background: '#17100c' } })
      .composite([{ input: image, left: 0, top: 0 }, { input: label, left: 0, top: 540 }]).png().toBuffer();
    composites.push({ input: tile, left: (index % columns) * cellWidth, top: Math.floor(index / columns) * cellHeight });
  }
  const sheetPath = path.join(outputDir, `visual-review-sheet-${String(sheets.length + 1).padStart(2, '0')}.png`);
  await sharp({ create: { width: columns * cellWidth, height: rows * cellHeight, channels: 3, background: '#17100c' } }).composite(composites).png({ compressionLevel: 9 }).toFile(sheetPath);
  const metadata = await sharp(sheetPath).metadata();
  if (metadata.width !== 1920 || metadata.height !== 1770 || fs.statSync(sheetPath).size === 0) throw new Error(`Invalid sheet ${sheetPath}`);
  sheets.push({ filePath: sheetPath, width: metadata.width, height: metadata.height, frameIds: frames.map((frame) => frame.ruleAtomId) });
}

const output = { contract: 'mobius-visual-storyboard-review-sheets-v1', status: 'PASS', frameCount: manifest.frames.length, allFramesIncluded: sheets.flatMap((sheet) => sheet.frameIds).length === manifest.frames.length, sheets };
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
