import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { generateFocusedPageCrops, materializeHighDetailSourcePages, sourceLocalizationPages } from '../../src/services/sourcePageVisuals.js';

test('high-detail official page cache is replayable and remains localization-only evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-source-page-hdpi-'));
  const sourcePdfPath = path.join(root, 'rulebook.pdf');
  const pageDir = path.join(root, 'pages');
  const outputDir = path.join(pageDir, 'high-detail-pages');
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(sourcePdfPath, 'fixture pdf bytes');
  const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePdfPath)).digest('hex');
  await sharp({ create: { width: 200, height: 280, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toFile(path.join(pageDir, 'page-1.png'));
  let renders = 0;
  const renderPages = async ({ outputDir: target, pages, dpi }) => {
    renders += 1;
    await Promise.all(pages.map((page) => sharp({ create: { width: dpi * 2, height: dpi * 3, channels: 3, background: { r: 40, g: 80, b: 120 } } })
      .png().toFile(path.join(target, `page-${String(page).padStart(2, '0')}-${dpi}dpi.png`))));
  };
  try {
    const first = await materializeHighDetailSourcePages({ sourcePdfPath, sourceSha256, outputDir, pages: [1], dpi: 300, renderPages });
    const replay = await materializeHighDetailSourcePages({ sourcePdfPath, sourceSha256, outputDir, pages: [1], dpi: 300, renderPages });
    const assets = await sourceLocalizationPages({ pageDir, pages: [{ number: 1, normalizedText: 'Board setup' }], sourceSha256, highDetailManifest: first });

    expect(first.contract).toBe('mobius-source-page-high-detail-v1');
    expect(first.pages[0]).toMatchObject({ page: 1, width: 600, height: 900 });
    expect(replay.reused).toBe(true);
    expect(renders).toBe(1);
    expect(assets).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'source-localization-page-1-hdpi', source_page: 1,
      sourceAuthority: 'HIGH_DPI_PAGE_CROP', cropCompleteness: 'unknown', cropPurity: 'unknown', is_component: null })]));
    const hdpi = assets.find((asset) => asset.id === 'source-localization-page-1-hdpi');
    expect(hdpi.provenance).toMatchObject({ extraction: 'pymupdf-source-page-raster', dpi: 300 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
    expect(first.assets[0]).toMatchObject({ cropCompleteness: 'unknown', cropPurity: 'unknown', is_component: null, confidence: null, visual_metrics: { nearBlank: null } });
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
    expect(region).toMatchObject({ cropCompleteness: 'unknown', cropPurity: 'unknown', is_component: null, confidence: null });
    expect(region.bbox.y).toBeGreaterThan(0);
    expect(region.bbox.y + region.bbox.height).toBeLessThanOrEqual(400);
    expect(region.provenance.extraction).toBe('layout-derived-visual-region');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
