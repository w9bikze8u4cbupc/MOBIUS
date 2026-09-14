const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const sourcePath = path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png');
const sourceSha = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
let outputDir;

beforeEach(() => { outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-evidence-bound-pipeline-')); });
afterEach(() => fs.rmSync(outputDir, { recursive: true, force: true }));

function proof(overrides = {}) {
  return {
    contract: 'mobius-object-visual-evidence-v2', method: 'provider-pixel-analysis', model: 'model', evidencePacketHash: 'packet',
    assetId: 'parent', imageSha256: sourceSha, requiredObject: 'board', present: true, complete: true, isolated: true,
    stateCompatible: true, confidence: .99, bbox: [.15, .15, .85, .85], reason: 'Measured source object.', visualRole: 'COMPONENT',
    ...overrides,
  };
}

test('normal source-visual preparation reconnects measured parent evidence to a derived crop without a provider call', async () => {
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ images: [{
    id: 'parent', file_path: sourcePath, source_page: 3, sourcePdfSha256: 'a'.repeat(64), sourceAuthority: 'NATIVE_EMBEDDED',
  }] }));
  const semantic = { scenes: [{ scene_id: 'scene', candidates: [{ asset_id: 'parent', status: 'MEASURED', objects: [
    proof(), proof({ visualRole: 'TRACK', trackPoints: [{ value: 1, x: .2, y: .2 }, { value: 2, x: .7, y: .7 }], stateStages: [{ position: 1 }, { position: 2 }] }),
  ] }] }] };
  const { appendEvidenceBoundCrops } = require('../../src/services/evidenceBoundVisualCrop.cjs');
  const target = await appendEvidenceBoundCrops({ semantic, visualManifestPath: manifestPath, outputDir });
  const payload = JSON.parse(fs.readFileSync(target, 'utf8'));
  const child = payload.images.find((asset) => asset.id !== 'parent');
  expect(child).toBeDefined();
  expect(child.objectVisualEvidence.map((row) => row.visualRole).sort()).toEqual(['COMPONENT', 'TRACK']);
  expect(child.provenance.evidenceBoundCrop.transform).toBe('exact-parent-pixel-crop-v1');
  expect(fs.existsSync(child.file_path)).toBe(true);
});
