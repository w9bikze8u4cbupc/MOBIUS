#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const out = path.resolve(root, process.argv[2] || 'out/source-audit/bgg-sheets');
fs.mkdirSync(out, { recursive: true });

for (let page = 1; page <= 9; page += 1) {
  const endpoint = `https://boardgamegeek.com/api/images?ajax=1&gallery=game&nosession=1&objectid=173346&objecttype=thing&pageid=${page}&showcount=60&size=thumb&sort=hot`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`BGG audit request failed: ${response.status}`);
  const payload = await response.json();
  const width = 1200;
  const cellWidth = 200;
  const cellHeight = 190;
  const rows = Math.ceil(payload.images.length / 6);
  const layers = [];
  for (let index = 0; index < payload.images.length; index += 1) {
    const item = payload.images[index];
    const imageResponse = await fetch(item['imageurl@2x'] || item.imageurl);
    if (!imageResponse.ok) continue;
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const image = await sharp(buffer).resize(190, 150, { fit: 'contain', background: '#17110d' }).png().toBuffer();
    const x = (index % 6) * cellWidth + 5;
    const y = Math.floor(index / 6) * cellHeight + 5;
    const label = Buffer.from(`<svg width="190" height="30"><rect width="190" height="30" fill="#21150f"/><text x="95" y="22" text-anchor="middle" fill="#f4e6ca" font-family="Arial" font-size="18" font-weight="700">${item.imageid}</text></svg>`);
    layers.push({ input: image, left: x, top: y }, { input: label, left: x, top: y + 152 });
  }
  await sharp({ create: { width, height: rows * cellHeight, channels: 3, background: '#17110d' } })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toFile(path.join(out, `bgg-gallery-${String(page).padStart(2, '0')}.jpg`));
}
