import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCanonicalHephaestusManifest,
  ensureCanonicalHephaestusMaterialization,
  HEPHAESTUS_MANIFEST_CONTRACT,
  synchronizeCanonicalHephaestusMaterialization,
  validateCanonicalHephaestusManifest,
} from '../../src/services/hephaestusMaterialization.js';

const PROJECT = 'fixture-unseen-game';
const SHA = 'a'.repeat(64);
const source = (overrides = {}) => ({
  sourceId: `source-${SHA.slice(0, 32)}`,
  documentId: PROJECT,
  documentFingerprint: `document-${'b'.repeat(32)}`,
  filename: 'fixture-rulebook.pdf',
  sha256: SHA,
  bytes: 1234,
  pageCount: 20,
  provenance: 'direct_project_upload',
  ...overrides,
});

function extraction(outputDir, content = Buffer.from('fixture-image')) {
  const file = path.join(outputDir, 'images', 'all', 'component.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return {
    success: true,
    stats: { total_items: 1 },
    images: [{
      id: 'p0_img0_xref12', file_path: file, page_index: 0, native: true,
      type: 'card', classification: 'card', is_component: true, confidence: 1,
      original_dimensions: { width: 400, height: 600 }, dimensions: { width: 400, height: 600 },
    }],
  };
}

test('missing canonical manifest invokes HEPHAESTUS and materializes a valid source-bound contract', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-heph-materialize-'));
  const outputDir = path.join(root, 'data', PROJECT, 'hephaestus');
  let calls = 0;
  const result = await ensureCanonicalHephaestusMaterialization({
    projectId: PROJECT, sourceDescriptor: source(), sourcePdfPath: path.join(root, 'rulebook.pdf'), outputDir,
    extractor: async () => { calls += 1; return extraction(outputDir); },
  });
  expect(calls).toBe(1);
  expect(result.manifest.contract).toBe(HEPHAESTUS_MANIFEST_CONTRACT);
  expect(result.manifest.projectId).toBe(PROJECT);
  expect(result.manifest.sourcePdfSha256).toBe(SHA);
  expect(result.manifest.pageCount).toBe(20);
  expect(result.validation.valid).toBe(true);
});

test('corrupt manifest regenerates while a valid manifest replays without extraction', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-heph-replay-'));
  const outputDir = path.join(root, 'data', PROJECT, 'hephaestus');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), '{bad json', 'utf8');
  let calls = 0;
  const parameters = {
    projectId: PROJECT, sourceDescriptor: source(), sourcePdfPath: path.join(root, 'rulebook.pdf'), outputDir,
    extractor: async () => { calls += 1; return extraction(outputDir); },
  };
  const first = await ensureCanonicalHephaestusMaterialization(parameters);
  const second = await ensureCanonicalHephaestusMaterialization({ ...parameters, extractor: async () => { throw new Error('must not run'); } });
  expect(calls).toBe(1);
  expect(first.regenerated).toBe(true);
  expect(second.reused).toBe(true);
});

test('strict validation rejects wrong SHA and wrong project identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-heph-identity-'));
  const outputDir = path.join(root, 'hephaestus');
  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifest = buildCanonicalHephaestusManifest({ projectId: PROJECT, sourceDescriptor: source(), outputDir, extractionResult: extraction(outputDir) });
  expect(validateCanonicalHephaestusManifest(manifest, { manifestPath, projectId: PROJECT, sourceDescriptor: source() }).valid).toBe(true);
  expect(validateCanonicalHephaestusManifest(manifest, { manifestPath, projectId: PROJECT, sourceDescriptor: source({ sha256: 'c'.repeat(64), sourceId: `source-${'c'.repeat(32)}` }) }).errors).toContain('source-identity');
  expect(validateCanonicalHephaestusManifest(manifest, { manifestPath, projectId: 'different-project', sourceDescriptor: source({ documentId: 'different-project' }) }).errors).toContain('project-identity');
  const wrongSource = structuredClone(manifest);
  wrongSource.source.sourceId = `source-${'d'.repeat(32)}`;
  expect(validateCanonicalHephaestusManifest(wrongSource, { manifestPath, projectId: PROJECT, sourceDescriptor: source() }).errors).toContain('source-identity');
  const escaped = structuredClone(manifest);
  escaped.images[0].file_path = '../outside.png';
  const escapedValidation = validateCanonicalHephaestusManifest(escaped, { manifestPath, projectId: PROJECT, sourceDescriptor: source(), requireFiles: false });
  expect(escapedValidation.errors).toContain('assets');
  expect(escapedValidation.assetErrors[0]).toMatch(/:path$/);
});

test('cross-root synchronization downloads the API-owned artifact and normalizes portable paths', async () => {
  const apiRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-heph-api-root-'));
  const workerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-heph-worker-root-'));
  const apiOutput = path.join(apiRoot, 'data', PROJECT, 'hephaestus');
  const workerOutput = path.join(workerRoot, 'data', PROJECT, 'hephaestus');
  const remote = buildCanonicalHephaestusManifest({
    projectId: PROJECT,
    sourceDescriptor: source({ status: 'pending_contextual_render' }),
    outputDir: apiOutput,
    extractionResult: extraction(apiOutput, Buffer.from('cross-root-image')),
    assetUrlFor: (assetId) => `/api/projects/${PROJECT}/images/${assetId}/file`,
  });
  const bytes = fs.readFileSync(path.join(apiOutput, remote.images[0].file_path));
  const result = await synchronizeCanonicalHephaestusMaterialization({
    remoteManifest: remote, outputDir: workerOutput, projectId: PROJECT, sourceDescriptor: source({ status: 'available' }),
    fetchAsset: async () => bytes,
  });
  expect(result.validation.valid).toBe(true);
  expect(path.isAbsolute(result.manifest.images[0].file_path)).toBe(false);
  expect(fs.existsSync(path.join(workerOutput, result.manifest.images[0].file_path))).toBe(true);
});
