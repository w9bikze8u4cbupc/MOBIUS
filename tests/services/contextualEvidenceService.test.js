import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
  CONTEXTUAL_EVIDENCE_VERSION,
  DEFAULT_RENDER_PROFILE,
  ContextualEvidenceError,
  createContextualEvidenceService,
} from '../../src/services/contextualEvidenceService.js';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

describe('contextual evidence service', () => {
  let temporaryRoot;
  let sourcePdfPath;
  let pages;

  beforeEach(async () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'contextual-evidence-'));
    sourcePdfPath = path.join(temporaryRoot, 'uploaded.pdf');
    fs.writeFileSync(sourcePdfPath, Buffer.from('%PDF-local-fixture'));
    pages = await Promise.all([
      sharp({ create: { width: 120, height: 100, channels: 3, background: { r: 20, g: 30, b: 40 } } }).png().toBuffer(),
      sharp({ create: { width: 96, height: 140, channels: 3, background: { r: 50, g: 60, b: 70 } } }).png().toBuffer(),
    ]);
  });

  afterEach(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  function rendererFor(buffers) {
    return jest.fn(async function* renderFixturePages() {
      for (const buffer of buffers) yield buffer;
    });
  }

  it('atomically records one canonical source, PNG page set, hashes, and a path-free inventory', async () => {
    const renderer = rendererFor(pages);
    const service = createContextualEvidenceService({ dataRoot: path.join(temporaryRoot, 'data'), renderPages: renderer });

    const inventory = await service.persistUpload('demo-project', sourcePdfPath, { filename: 'A Rulebook.pdf' });
    const evidenceRoot = path.join(temporaryRoot, 'data', 'demo-project', 'contextual-evidence');
    const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'manifest.json'), 'utf8'));
    const sourceHash = hash(Buffer.from('%PDF-local-fixture'));

    expect(renderer).toHaveBeenCalledWith(sourcePdfPath, DEFAULT_RENDER_PROFILE);
    expect(fs.existsSync(path.join(evidenceRoot, 'source', 'rulebook.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(evidenceRoot, 'pages', 'page-0001.png'))).toBe(true);
    expect(fs.existsSync(path.join(evidenceRoot, 'crop-cache'))).toBe(true);
    expect(manifest).toEqual(expect.objectContaining({
      version: CONTEXTUAL_EVIDENCE_VERSION,
      projectId: 'demo-project',
      source: { filename: 'A Rulebook.pdf', sha256: sourceHash, bytes: 18, pageCount: 2 },
      renderProfile: expect.objectContaining({ id: DEFAULT_RENDER_PROFILE.id, renderer: 'pdf-to-img', format: 'png', dpi: 144 }),
      validation: expect.objectContaining({ completed: true, sourceSha256: sourceHash, pageCount: 2 }),
    }));
    expect(manifest.pages[0]).toEqual(expect.objectContaining({
      number: 1,
      assetId: expect.stringMatching(/^page-/),
      sha256: hash(pages[0]),
      width: 120,
      height: 100,
      crops: [],
    }));
    expect(inventory).toEqual(expect.objectContaining({ available: true, version: 1, projectId: 'demo-project' }));
    expect(inventory.assets[0]).toEqual(expect.objectContaining({
      id: manifest.pages[0].assetId, kind: 'contextual_page', source: 'rulebook_context',
      url: expect.stringMatching(/\/contextual-assets\/page-[a-f0-9]+\/file\?variant=full$/),
      thumbnailUrl: expect.stringMatching(/variant=thumbnail$/),
    }));
    expect(JSON.stringify(inventory)).not.toContain(temporaryRoot);
  });

  it('keeps canonical crop descriptors and lazily materializes only a disposable crop-cache file', async () => {
    const service = createContextualEvidenceService({ dataRoot: path.join(temporaryRoot, 'data'), renderPages: rendererFor(pages) });
    const inventory = await service.persistUpload('demo-project', sourcePdfPath);
    const page = inventory.pages[0];
    const crop = await service.registerCrop('demo-project', page.id, {
      x: 20, y: 10, width: 40, height: 40, contextualConfirmation: true,
    });
    const evidenceRoot = path.join(temporaryRoot, 'data', 'demo-project', 'contextual-evidence');
    const expectedCachePath = path.join(evidenceRoot, 'crop-cache', page.id, `${crop.id}.png`);

    expect(crop).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^crop-/), kind: 'contextual_crop', source: 'rulebook_context',
      parentPageAssetId: page.id, documentSha256: page.documentSha256, pageRasterSha256: page.sha256,
      renderProfile: DEFAULT_RENDER_PROFILE.id, origin: 'operator_crop',
      capabilities: expect.arrayContaining(['overview', 'rulebook_reference', 'supporting', 'board_setup_context']),
    }));
    expect(fs.existsSync(expectedCachePath)).toBe(false);
    const resolved = await service.resolveAssetFile('demo-project', crop.id, 'thumbnail');
    expect(resolved).toEqual(expect.objectContaining({ path: expectedCachePath, contentType: 'image/png', kind: 'contextual_crop' }));
    await expect(sharp(expectedCachePath).metadata()).resolves.toEqual(expect.objectContaining({ width: 40, height: 40, format: 'png' }));
    await expect(service.registerCrop('demo-project', page.id, { x: 0, y: 0, width: 31, height: 40 }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_CROP_INVALID' });
    await expect(service.registerCrop('demo-project', page.id, { x: 100, y: 0, width: 32, height: 32 }))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_CROP_OUT_OF_BOUNDS' });
  });

  it('never publishes a partial manifest and fails closed for source/page tampering or malformed asset access', async () => {
    const failingRenderer = jest.fn(async function* () { throw new Error('fixture renderer failure'); });
    const dataRoot = path.join(temporaryRoot, 'data');
    const failingService = createContextualEvidenceService({ dataRoot, renderPages: failingRenderer });
    await expect(failingService.persistUpload('demo-project', sourcePdfPath)).rejects.toMatchObject({ code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' });
    expect(fs.existsSync(path.join(dataRoot, 'demo-project', 'contextual-evidence', 'manifest.json'))).toBe(false);
    const mismatchedRenderer = jest.fn(() => {
      const result = (async function* fixturePages() { yield pages[0]; })();
      result.pageCount = 2;
      return result;
    });
    const mismatchService = createContextualEvidenceService({ dataRoot, renderPages: mismatchedRenderer });
    await expect(mismatchService.persistUpload('count-mismatch', sourcePdfPath)).rejects.toMatchObject({ code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' });
    expect(fs.existsSync(path.join(dataRoot, 'count-mismatch', 'contextual-evidence', 'manifest.json'))).toBe(false);

    const service = createContextualEvidenceService({ dataRoot, renderPages: rendererFor(pages) });
    const inventory = await service.persistUpload('demo-project', sourcePdfPath);
    const crop = await service.registerCrop('demo-project', inventory.pages[0].id, { x: 10, y: 10, width: 32, height: 32 });
    await service.resolveAssetFile('demo-project', crop.id, 'full');
    const pageFile = path.join(dataRoot, 'demo-project', 'contextual-evidence', 'pages', 'page-0001.png');
    fs.writeFileSync(pageFile, Buffer.from('tampered'));
    await expect(service.resolveAssetFile('demo-project', inventory.pages[0].id, 'full'))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' });
    await expect(service.resolveAssetFile('demo-project', crop.id, 'full'))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' });
    await expect(service.resolveAssetFile('demo-project', '../unsafe', 'full'))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ASSET_INVALID' });
    await expect(service.resolveAssetFile('other-project', inventory.pages[0].id, 'full'))
      .rejects.toBeInstanceOf(ContextualEvidenceError);
    await expect(service.resolveAssetFile('demo-project', inventory.pages[0].id, 'original'))
      .rejects.toMatchObject({ code: 'CONTEXTUAL_ASSET_VARIANT_INVALID' });
  });
});
