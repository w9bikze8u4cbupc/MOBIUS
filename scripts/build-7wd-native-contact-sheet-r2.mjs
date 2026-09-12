#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const dir = path.join(root, 'out', 'publishability-r2', '7-wonders-duel');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'native-visual-manifest.json'), 'utf8'));
const assets = manifest.assets;
const cellW = 360; const cellH = 300; const cols = 3; const rows = Math.ceil(assets.length / cols);
function label(text) { return Buffer.from(`<svg width="${cellW}" height="${cellH}"><rect width="100%" height="30" fill="#211a16"/><text x="12" y="21" fill="#f7ecd2" font-family="Arial" font-size="16">${text}</text></svg>`); }
const composites = [];
for (let i = 0; i < assets.length; i += 1) {
  const asset = assets[i];
  const buffer = await sharp(asset.filePath).resize({ width: cellW - 24, height: cellH - 58, fit: 'contain', background: '#211a16' }).png().toBuffer();
  const tile = await sharp({ create: { width: cellW, height: cellH, channels: 3, background: '#211a16' } }).composite([{ input: buffer, left: 12, top: 34 }, { input: label(`${asset.id} | p.${asset.page} | ${asset.width}x${asset.height}`), left: 0, top: 0 }]).png().toBuffer();
  composites.push({ input: tile, left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH });
}
const output = path.join(dir, 'native-contact-sheet.png');
await sharp({ create: { width: cellW * cols, height: cellH * rows, channels: 3, background: '#211a16' } }).composite(composites).png().toFile(output);
const metadata = await sharp(output).metadata();
if (metadata.format !== 'png' || !metadata.width || !metadata.height || fs.statSync(output).size === 0) throw new Error('Invalid native contact sheet');
console.log(JSON.stringify({ output, width: metadata.width, height: metadata.height, assets: assets.length }, null, 2));
