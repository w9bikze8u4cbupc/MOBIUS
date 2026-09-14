const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { materializeMeasuredObjectCrop } = require('../../src/services/objectAwareCrop.cjs');
const sourcePath = path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png');
const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
let outputDir;
beforeEach(() => { outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-measured-crop-')); });
afterEach(() => fs.rmSync(outputDir, { recursive: true, force: true }));
const input = () => ({ sourcePath, sourceSha256, sourceId: 'source-fixture', sourcePage: 3,
  sourcePdfSha256: 'a'.repeat(64), objectId: 'component', bbox: [.15, .15, .85, .85], outputDir });

test('measured geometry crops source pixels without upscaling or inventing quality', async () => {
  const first = await materializeMeasuredObjectCrop(input());
  expect(first.cropCompleteness).toBe('unknown');
  expect(first.cropPurity).toBe('unknown');
  expect(first.provenance.parentSha256).toBe(sourceSha256);
  expect(first.provenance.requiresPixelVerification).toBe(true);
  const m = await sharp(first.file_path).metadata();
  expect(first.original_dimensions).toEqual({ width: m.width, height: m.height });
  expect(m.width).toBeLessThan(100);
  expect(await materializeMeasuredObjectCrop(input())).toEqual(first);
  expect(fs.readdirSync(outputDir)).toHaveLength(1);
});

test.each([[0, 0, 1, 1], [.7, .1, .2, .9], [-.1, .1, .8, .9]])('clipped or invalid localization is refused: %j', async (...bbox) => {
  await expect(materializeMeasuredObjectCrop({ ...input(), bbox })).rejects.toThrow();
  expect(fs.readdirSync(outputDir)).toHaveLength(0);
});

test('changed parent pixels cannot reuse localization', async () => {
  await expect(materializeMeasuredObjectCrop({ ...input(), sourceSha256: '0'.repeat(64) })).rejects.toThrow('SHA mismatch');
});
