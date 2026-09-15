const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { materializeVisualPlanFrames, compositionReviewEnvironment } = require('../../src/services/visualPlanMaterializer.cjs');

const fixture = path.resolve(__dirname, '../../src/assets/branding/les-jeux-mobius-banner-canonical.png');
const outputDir = path.resolve(__dirname, '../../out/test-visual-plan-materializer');

test('composition review may use an explicitly bounded sub-stage ledger group', () => {
  expect(compositionReviewEnvironment({ MOBIUS_VISUAL_BUDGET_GROUP: 'source' }).MOBIUS_VISUAL_BUDGET_GROUP).toBe('source');
  expect(compositionReviewEnvironment({
    MOBIUS_VISUAL_BUDGET_GROUP: 'source',
    MOBIUS_VISUAL_COMPOSITION_BUDGET_GROUP: 'composition',
  }).MOBIUS_VISUAL_BUDGET_GROUP).toBe('composition');
  expect(() => compositionReviewEnvironment({ MOBIUS_VISUAL_REQUIRE_BUDGET_LEDGER: 'true' })).toThrow('VISUAL_BUDGET_LEDGER_REQUIRED');
});

test('track preparation prefers stronger measured state evidence before native area', () => {
  const { chooseTrackCandidate } = require('../../src/services/visualPlanMaterializer.cjs');
  const candidate = (id, overrides = {}) => ({
    asset: { id, nativeWidthPx: 1000, nativeHeightPx: 1000 },
    component: { isolated: true, confidence: .99 },
    track: { isolated: true, confidence: .99, stateStages: [{ position: 1 }, { position: 2 }, { position: 3 }] },
    ...overrides,
  });
  const largerButWeaker = candidate('larger', { asset: { id: 'larger', nativeWidthPx: 3000, nativeHeightPx: 3000 },
    track: { isolated: false, confidence: .96, stateStages: [{ position: 1 }, { position: 2 }] } });
  expect(chooseTrackCandidate([largerButWeaker, candidate('measured-sequence')]).asset.id).toBe('measured-sequence');
});

test('mono-image still uses the real storyboard renderer and never auto-certifies composition', async () => {
  const { materializeInstructionalStill } = require('../../src/services/visualPlanMaterializer.cjs');
  const state = { projectId: 'test-normal-still', assets: [{ id: 'asset', filePath: fixture, width: 1600, height: 900 }],
    sourceSelections: [{ ruleAtomId: 'atom', status: 'AUTO_ACCEPTED' }],
    scenes: [{ id: 'still', atomId: 'atom', section: 'components', narration: 'Un objet', on_screen_text: 'Un objet',
      source_pages: [2], visualRequirement: { requiredObjects: ['object'] }, renderVisual: { assetId: 'asset' } }] };
  const result = await materializeInstructionalStill({ state, sceneId: 'still', outputDir });
  expect(result).toMatchObject({ produced: true, validated: false, sourceAssetId: 'asset' });
  expect(await sharp(result.outputPath).metadata()).toMatchObject({ width: 1920, height: 1080 });
  expect(await sharp(result.phonePath).metadata()).toMatchObject({ width: 390, height: 219 });
  expect(fs.readdirSync(outputDir).some(f => f.endsWith('.mp4'))).toBe(false);
}, 30000);

test('missing transition composition cannot be replaced by a recognized standalone component', async () => {
  const { materializeInstructionalStill } = require('../../src/services/visualPlanMaterializer.cjs');
  const state = { assets: [], sourceSelections: [], scenes: [{ id: 'transition', visualRequirement: { requiredObjects: ['board'], transitionRequired: true } }] };
  expect(await materializeInstructionalStill({ state, sceneId: 'transition', outputDir, allowReviewCandidate: true })).toMatchObject({ produced: false, validated: false });
});

test('stateful materializer prepares a source-bound multi-component sequence only when canonical state changes', async () => {
  const crypto = require('node:crypto');
  const { materializeStatefulInstructionalFrames } = require('../../src/services/visualPlanMaterializer.cjs');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const proof = (requiredObject) => ({ contract: 'mobius-object-visual-evidence-v2', requiredObject, assetId: `${requiredObject}-asset`,
    imageSha256: hash, evidencePacketHash: `packet-${requiredObject}`, model: 'fixture-model', method: 'provider-pixel-analysis',
    visualRole: 'COMPONENT', present: true, complete: true, isolated: true, stateCompatible: true, confidence: .99,
    bbox: [.1, .1, .9, .9], reason: 'Complete fixture component' });
  const assets = ['card', 'discard'].map((referent) => ({ id: `${referent}-asset`, filePath: fixture, displayPath: fixture,
    width: 1600, height: 900, nativeWidthPx: 1600, nativeHeightPx: 900, sourceAuthority: 'OFFICIAL_RULEBOOK', sourceAuthorityRank: 50,
    sourcePdfSha256: 'a'.repeat(64), sourceRefs: [{ page: 2 }], semanticObjects: [referent], objectVisualEvidence: [proof(referent)] }));
  const scene = { id: 'stateful', atomId: 'atom', title: 'Défausser', narration: 'Montrez le changement.', on_screen_text: 'Défaussez les cartes.', source_pages: [2],
    visualRequirement: { actualGameAssetRequired: true, requiredObjects: ['card', 'discard'], transitionRequired: true },
    physicalState: { reviewState: 'accepted', stages: [
      { id: 'before', label: 'Avant', sourceRefs: [{ page: 2 }], items: [{ id: 'card', componentRef: 'card', visibility: 'VISIBLE', faceState: 'FACE_UP' }, { id: 'discard', componentRef: 'discard', visibility: 'VISIBLE', faceState: 'FACE_DOWN' }] },
      { id: 'after', label: 'Après', sourceRefs: [{ page: 2 }], items: [{ id: 'card', componentRef: 'card', visibility: 'REMOVED', removed: true, faceState: 'FACE_UP' }, { id: 'discard', componentRef: 'discard', visibility: 'VISIBLE', faceState: 'FACE_UP' }] },
    ] },
  };
  const result = await materializeStatefulInstructionalFrames({ projectId: 'stateful-fixture', scene, assets, outputDir });
  expect(result).toMatchObject({ contract: 'mobius-source-measured-state-sequence-v1', sceneId: 'stateful', preparedOnly: true });
  expect(result.sourceAssets).toHaveLength(2);
  expect(result.frames).toHaveLength(2);
  expect(await sharp(result.frames[0].outputPath).metadata()).toMatchObject({ width: 1920, height: 1080 });
  const unchanged = { ...scene, physicalState: { ...scene.physicalState, stages: scene.physicalState.stages.map((stage) => ({ ...stage, items: stage.items.map((item) => ({ ...item, visibility: 'VISIBLE', removed: false, faceState: 'FACE_UP' })) })) } };
  await expect(materializeStatefulInstructionalFrames({ projectId: 'stateful-fixture', scene: unchanged, assets, outputDir })).resolves.toBeNull();
}, 60000);

afterAll(() => fs.rmSync(outputDir, { recursive: true, force: true }));

test('normal materializer turns a multi-asset VisualPlan into a provenance-preserving render visual', async () => {
  const assets = ['board', 'token'].map((id) => ({ id, filePath: fixture, sourceRefs: [{ page: 2 }], containsActualGamePixels: true }));
  const state = {
    assets,
    scenes: [{
      id: 'knowledge-setup', atomId: 'setup', source_pages: [2], sourceRefs: [{ page: 2 }],
      canonicalVisualPlan: { compositionType: 'REAL_SETUP_PLACEMENT', actualGameAssetIds: ['board', 'token'], confidence: 0.95 },
    }],
  };
  const result = await materializeVisualPlanFrames({ state, outputDir, width: 800, height: 500 });
  expect(result.records).toHaveLength(1);
  expect(result.scenes[0].renderVisual.kind).toBe('automatic-visual-plan-composite');
  expect(result.scenes[0].renderVisual.provenance.sourceAssetIds).toEqual(['board', 'token']);
  const metadata = await sharp(result.records[0].outputPath).metadata();
  expect(metadata).toMatchObject({ width: 800, height: 500 });
});
