const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { materializeMeasuredObjectCrop, deriveEvidenceBoundObjectCrop, DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT } = require('../../src/services/objectAwareCrop.cjs');
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

function measuredEvidence(overrides = {}) {
  return {
    contract: 'mobius-object-visual-evidence-v2', method: 'provider-pixel-analysis', visualRole: 'COMPONENT',
    assetId: 'measured-parent', imageSha256: sourceSha256, requiredObject: 'component', sceneId: 'scene',
    present: true, complete: true, isolated: true, stateCompatible: true, confidence: 0.99,
    bbox: [.15, .15, .85, .85], evidencePacketHash: 'packet', model: 'model', reason: 'Measured complete component.',
    ...overrides,
  };
}

test('evidence-bound crop preserves a complete measured parent only with exact pixel lineage', async () => {
  const component = measuredEvidence();
  const track = measuredEvidence({ visualRole: 'TRACK', trackPoints: [{ value: 1, x: .2, y: .2 }, { value: 2, x: .7, y: .7 }],
    stateStages: [{ position: 1 }, { position: 2 }] });
  const crop = await deriveEvidenceBoundObjectCrop({
    parentAsset: { id: 'measured-parent', filePath: sourcePath, source_page: 3, sourcePdfSha256: 'a'.repeat(64), sourceAuthority: 'NATIVE_EMBEDDED' },
    componentEvidence: component, linkedEvidence: [track], outputDir,
  });
  expect(crop.objectVisualEvidence).toHaveLength(2);
  expect(crop.objectVisualEvidence.every((row) => row.contract === DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT)).toBe(true);
  expect(crop.objectVisualEvidence.every((row) => row.derivedFrom.transform === 'exact-parent-pixel-crop-v1')).toBe(true);
  expect(crop.objectVisualEvidence.every((row) => row.bbox[0] > 0 && row.bbox[2] < 1)).toBe(true);
  expect(crop.provenance.evidenceBoundCrop.parentEvidenceHashes).toHaveLength(2);
  const { objectEvidenceFor } = require('../../src/services/sourceAssetResolver.cjs');
  const candidate = { ...crop, id: crop.id, filePath: crop.file_path, sourcePdfSha256: 'a'.repeat(64) };
  expect(objectEvidenceFor(candidate, 'component', 'scene')).toMatchObject({ visualRole: 'COMPONENT', complete: true });
  const tampered = { ...candidate, provenance: { ...candidate.provenance, evidenceBoundCrop: { ...candidate.provenance.evidenceBoundCrop, parentEvidenceHashes: [] } } };
  expect(objectEvidenceFor(tampered, 'component', 'scene')).toBeNull();
});

test('evidence-bound crop preserves true source detail instead of derivative canvas dimensions', async () => {
  const crop = await deriveEvidenceBoundObjectCrop({
    parentAsset: { id: 'measured-parent', filePath: sourcePath, source_page: 3, sourcePdfSha256: 'a'.repeat(64),
      sourceAuthority: 'NATIVE_EMBEDDED', original_dimensions: { width: 50, height: 50 }, dimensions: { width: 100, height: 100 } },
    componentEvidence: measuredEvidence(), outputDir,
  });
  const rendered = await sharp(crop.file_path).metadata();
  expect(crop.dimensions).toEqual({ width: rendered.width, height: rendered.height });
  expect(crop.trueDetailDimensions.width).toBeCloseTo(rendered.width / 2, 3);
  expect(crop.trueDetailDimensions.height).toBeCloseTo(rendered.height / 2, 3);
  expect(crop.original_dimensions).toEqual(crop.trueDetailDimensions);
  expect(crop.provenance.derivativeSourceDimensions).toEqual({ width: 100, height: 100 });
});

test('evidence-bound crop refuses an incomplete parent instead of manufacturing proof', async () => {
  await expect(deriveEvidenceBoundObjectCrop({
    parentAsset: { id: 'measured-parent', filePath: sourcePath, source_page: 3 },
    componentEvidence: measuredEvidence({ complete: false }), outputDir,
  })).rejects.toThrow('complete measured component verdict');
});
