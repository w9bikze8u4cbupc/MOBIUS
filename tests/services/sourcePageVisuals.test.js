import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { generateFocusedPageCrops } from '../../src/services/sourcePageVisuals.js';

test('generates stable layout-derived crops with bounded provenance', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-focused-crops-'));
  const pageDir = path.join(root, 'pages');
  const outputDir = path.join(root, 'crops');
  fs.mkdirSync(pageDir, { recursive: true });
  try {
    await sharp({ create: { width: 200, height: 120, channels: 3, background: { r: 30, g: 120, b: 80 } } }).png().toFile(path.join(pageDir, 'page-2.png'));
    const pages = [{ number: 2, blocks: [
      { text: 'MATERIAL', x: 10, width: 30, fontSize: 12 },
      { text: 'SELL CARDS', x: 120, width: 45, fontSize: 12 },
    ] }];
    const first = await generateFocusedPageCrops({ pageDir, pages, outputDir, sourceSha256: 'pdf-sha' });
    const second = await generateFocusedPageCrops({ pageDir, pages, outputDir, sourceSha256: 'pdf-sha' });

    expect(first.assets).toHaveLength(2);
    expect(second.assets.map((asset) => asset.contentHash)).toEqual(first.assets.map((asset) => asset.contentHash));
    expect(first.assets[0]).toMatchObject({ source_page: 2, page_index: 1, visual_kind: 'focused-page-crop', sourcePdfSha256: 'pdf-sha' });
    expect(first.assets[0].bbox.x).toBeGreaterThanOrEqual(0);
    expect(first.assets[0].bbox.x + first.assets[0].bbox.width).toBeLessThanOrEqual(200);
  expect(first.assets[0].provenance.extraction).toBe('layout-derived-column-crop');
  expect(first.assets[0].layout_text).toContain('MATERIAL');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('derives a tighter visual region from a large layout gap', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-focused-region-'));
  const pageDir = path.join(root, 'pages');
  const outputDir = path.join(root, 'crops');
  fs.mkdirSync(pageDir, { recursive: true });
  try {
    await sharp({ create: { width: 200, height: 400, channels: 3, background: { r: 30, g: 120, b: 80 } } }).png().toFile(path.join(pageDir, 'page-2.png'));
    const pages = [{ number: 2, blocks: [
      { text: 'PLAYER SETUP', x: 10, y: 20, width: 70, fontSize: 12 },
      { text: 'GAME SETUP', x: 120, y: 20, width: 70, fontSize: 12 },
      { text: 'details', x: 10, y: 110, width: 70, fontSize: 10 },
      { text: 'details', x: 120, y: 110, width: 70, fontSize: 10 },
      { text: 'footer', x: 10, y: 330, width: 70, fontSize: 10 },
    ] }];
    const result = await generateFocusedPageCrops({ pageDir, pages, outputDir, sourceSha256: 'pdf-sha' });
    const region = result.assets.find((asset) => asset.id === 'focused-region-p2-right');
    expect(region).toMatchObject({ visual_kind: 'focused-page-region', source_page: 2, page_index: 1 });
    expect(region.bbox.y).toBeGreaterThan(0);
    expect(region.bbox.y + region.bbox.height).toBeLessThanOrEqual(400);
    expect(region.provenance.extraction).toBe('layout-derived-visual-region');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
