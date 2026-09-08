import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHephaestusEvidence } from '../../src/services/hephaestusEvidence.js';

test('builds one canonical evidence contract with accepted, review and rejected states', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-heph-'));
  const image = path.join(process.cwd(), 'tests', 'fixtures', 'images', 'test-bg-100x100.png');
  const manifest = path.join(temp, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ images: [
    { id: 'component-card', file_path: image, type: 'card', is_component: true, confidence: 1, page_index: 1, label: 'Project card', dimensions: { width: 100, height: 100 }, contentHash: 'card' },
    { id: 'duplicate-card', file_path: image, type: 'card', is_component: true, confidence: 1, page_index: 2, label: 'Project card duplicate', dimensions: { width: 100, height: 100 }, contentHash: 'card' },
    { id: 'decorative', file_path: image, type: 'other', is_component: false, confidence: 0.1, page_index: 1, label: 'decorative icon', dimensions: { width: 24, height: 24 } },
  ], stats: { total_items: 3 } }));

  const result = buildHephaestusEvidence({
    manifestPath: manifest,
    projectId: 'fixture-game',
    sourcePdfSha256: 'a'.repeat(64),
    gameIdentity: { displayName: 'Fixture Game' },
    components: [{ id: 'component-1', name: 'Project card', category: 'card', sourcePage: 2, quantity: 1 }],
    setupSteps: [{ id: 'setup-1', text: 'Place the project card.', componentRefs: ['component-1'] }],
  });

  expect(result.contract).toBe('hephaestus-component-evidence-v1');
  expect(result.assets.every((asset) => asset.provenance && asset.reviewState)).toBe(true);
  expect(result.acceptedVisuals.length).toBe(1);
  expect(result.assets.find((asset) => asset.id === 'duplicate-card').dedupIdentity.isDuplicate).toBe(true);
  expect(result.setupBindings[0]).toMatchObject({ setupStepId: 'setup-1', componentRefs: ['component-1'] });
  expect(result.validation.acceptedFilesExist).toBe(true);
});

test('rejects a canonical manifest belonging to another project source', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-heph-mismatch-'));
  const manifest = path.join(temp, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({
    contract: 'mobius-hephaestus-materialization-v1',
    projectId: 'wrong-project',
    sourcePdfSha256: 'b'.repeat(64),
    images: [],
  }));
  expect(() => buildHephaestusEvidence({
    manifestPath: manifest,
    projectId: 'fixture-game',
    sourcePdfSha256: 'a'.repeat(64),
  })).toThrow(/HEPHAESTUS_MANIFEST_IDENTITY_MISMATCH/);
});
