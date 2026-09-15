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

test('mono-image still uses the real storyboard renderer and does not certify unmeasured composition', async () => {
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

test('static single-object identity still is deterministically certified from an accepted exact source binding', async () => {
  const crypto = require('node:crypto');
  const { materializeInstructionalStill } = require('../../src/services/visualPlanMaterializer.cjs');
  const imageSha256 = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const asset = { id: 'board-asset', filePath: fixture, width: 1600, height: 900, nativeWidthPx: 1600, nativeHeightPx: 900,
    sourceAuthority: 'NATIVE_EMBEDDED', sourceAuthorityRank: 35, sourcePdfSha256: 'a'.repeat(64),
    nativeSourceEvidence: { nativeImage: true, sourcePdfSha256: 'a'.repeat(64), assetSha256: imageSha256,
      sourcePage: 4, originalDimensions: { width: 1600, height: 900 } },
    sourceRefs: [{ page: 4 }], semanticObjects: ['board'], reviewState: 'accepted',
    objectVisualEvidence: [{ contract: 'mobius-object-visual-evidence-v2', assetId: 'board-asset', requiredObject: 'board',
      imageSha256, evidencePacketHash: 'packet-board', model: 'fixture-model', method: 'provider-pixel-analysis',
      visualRole: 'COMPONENT', sceneId: 'identity', present: true, complete: true, isolated: true,
      stateCompatible: true, confidence: .99, bbox: [0, 0, 1, 1], reason: 'The complete board is visible.' }] };
  const requirement = { actualGameAssetRequired: true, requiredObjects: ['board'], requiredQuantities: [] };
  const state = { projectId: 'test-identity-still', assets: [asset],
    visualPlans: [{ ruleAtomId: 'atom', mobileMinimumAssetWidthPx: 180 }],
    sourceSelections: [{ ruleAtomId: 'atom', status: 'AUTO_ACCEPTED', selectedAssetIds: [asset.id] }],
    scenes: [{ id: 'identity', atomId: 'atom', section: 'components', narration: 'Le plateau de jeu.', on_screen_text: 'Le plateau de jeu',
      source_pages: [4], visualRequirement: requirement, renderVisual: { assetId: 'board-asset' } }] };
  const result = await materializeInstructionalStill({ state, sceneId: 'identity', outputDir });
  expect(result).toMatchObject({ produced: true, preparedOnly: false, validated: true,
    deterministicValidation: { contract: 'mobius-deterministic-static-identity-composition-v1', valid: true,
      requiredObject: 'board', sourceAuthority: 'NATIVE_EMBEDDED' } });
  expect(result.deterministicValidation.phoneDisplayBounds.width).toBeGreaterThanOrEqual(180);
  expect(result.deterministicValidation.sourcePixelsPerDisplayPixel).toBeGreaterThanOrEqual(.8);
}, 30000);

test('normal production materializer promotes only a validated static identity still to the render visual', async () => {
  const crypto = require('node:crypto');
  const imageSha256 = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const asset = { id: 'production-board', filePath: fixture, width: 1600, height: 900, nativeWidthPx: 1600, nativeHeightPx: 900,
    sourceAuthority: 'NATIVE_EMBEDDED', sourceAuthorityRank: 35, sourcePdfSha256: 'b'.repeat(64),
    nativeSourceEvidence: { nativeImage: true, sourcePdfSha256: 'b'.repeat(64), assetSha256: imageSha256,
      sourcePage: 4, originalDimensions: { width: 1600, height: 900 } },
    sourceRefs: [{ page: 4 }], semanticObjects: ['board'], reviewState: 'accepted',
    objectVisualEvidence: [{ contract: 'mobius-object-visual-evidence-v2', assetId: 'production-board', requiredObject: 'board',
      imageSha256, evidencePacketHash: 'packet-production-board', model: 'fixture-model', method: 'provider-pixel-analysis',
      visualRole: 'COMPONENT', sceneId: 'production-identity', present: true, complete: true, isolated: true,
      stateCompatible: true, confidence: .99, bbox: [0, 0, 1, 1], reason: 'The complete board is visible.' }] };
  const state = { projectId: 'normal-production-static-identity', assets: [asset],
    visualPlans: [{ ruleAtomId: 'atom', mobileMinimumAssetWidthPx: 180, actualGameAssetIds: [asset.id] }],
    sourceSelections: [{ ruleAtomId: 'atom', status: 'AUTO_ACCEPTED', selectedAssetIds: [asset.id] }],
    scenes: [{ id: 'production-identity', atomId: 'atom', section: 'components', narration: 'Le plateau de jeu.',
      on_screen_text: 'Le plateau de jeu', source_pages: [4],
      canonicalVisualPlan: { actualGameAssetIds: [asset.id], mobileMinimumAssetWidthPx: 180 },
      visualRequirement: { actualGameAssetRequired: true, requiredObjects: ['board'], requiredQuantities: [] },
      renderVisual: { assetId: asset.id } }] };
  const result = await materializeVisualPlanFrames({ state, outputDir });
  expect(result.records).toHaveLength(1);
  expect(result.scenes[0]).toMatchObject({
    instructionalStill: { produced: true, validated: true, sourceAssetId: asset.id },
    renderVisual: { kind: 'automatic-visual-plan-composite', fullFrame: true, assetId: asset.id },
  });
}, 30000);

test('deterministic identity validation refuses a transition even with an accepted exact component', async () => {
  const crypto = require('node:crypto');
  const { materializeInstructionalStill } = require('../../src/services/visualPlanMaterializer.cjs');
  const imageSha256 = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const asset = { id: 'track-asset', filePath: fixture, width: 1600, height: 900, nativeWidthPx: 1600, nativeHeightPx: 900,
    sourceAuthority: 'NATIVE_EMBEDDED', sourceAuthorityRank: 35, sourcePdfSha256: 'a'.repeat(64), sourceRefs: [{ page: 4 }],
    semanticObjects: ['track'], reviewState: 'accepted', objectVisualEvidence: [{ contract: 'mobius-object-visual-evidence-v2',
      assetId: 'track-asset', requiredObject: 'track', imageSha256, evidencePacketHash: 'packet-track', model: 'fixture-model',
      method: 'provider-pixel-analysis', visualRole: 'COMPONENT', sceneId: 'transition-exact', present: true, complete: true,
      isolated: true, stateCompatible: true, confidence: .99, bbox: [0, 0, 1, 1], reason: 'The complete track is visible.' }] };
  const state = { projectId: 'test-transition-still', assets: [asset], visualPlans: [{ ruleAtomId: 'atom' }],
    sourceSelections: [{ ruleAtomId: 'atom', status: 'AUTO_ACCEPTED', selectedAssets: [asset] }],
    scenes: [{ id: 'transition-exact', atomId: 'atom', section: 'tour', narration: 'Déplacez le marqueur.', on_screen_text: 'Déplacez le marqueur',
      source_pages: [4], visualRequirement: { actualGameAssetRequired: true, requiredObjects: ['track'], transitionRequired: true },
      renderVisual: { assetId: 'track-asset' } }] };
  const result = await materializeInstructionalStill({ state, sceneId: 'transition-exact', outputDir });
  expect(result).toMatchObject({ produced: true, validated: false,
    deterministicValidation: { valid: false, reasons: expect.arrayContaining(['not-static-single-object-identity']) } });

  const production = await materializeVisualPlanFrames({
    state: { ...state, scenes: [{ ...state.scenes[0], canonicalVisualPlan: { actualGameAssetIds: [asset.id] } }] },
    outputDir,
  });
  expect(production.records).toHaveLength(0);
  expect(production.scenes[0].instructionalStill).toBeUndefined();
  expect(production.scenes[0].preparedInstructionalStill).toBeUndefined();
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
  expect(result).toMatchObject({ contract: 'mobius-source-measured-state-sequence-v2', materializerContract: 'mobius-visual-plan-materializer-v7', sceneId: 'stateful', preparedOnly: true });
  expect(result.sourceAssets).toHaveLength(2);
  expect(result.frames).toHaveLength(2);
  expect(await sharp(result.frames[0].outputPath).metadata()).toMatchObject({ width: 1920, height: 1080 });
  const unchanged = { ...scene, physicalState: { ...scene.physicalState, stages: scene.physicalState.stages.map((stage) => ({ ...stage, items: stage.items.map((item) => ({ ...item, visibility: 'VISIBLE', removed: false, faceState: 'FACE_UP' })) })) } };
  await expect(materializeStatefulInstructionalFrames({ projectId: 'stateful-fixture', scene: unchanged, assets, outputDir })).resolves.toBeNull();
}, 60000);

test('stateful source detail is measured at the exact bounded render footprint', () => {
  const {
    sourceMeasuredComponentCandidate,
    statefulComponentDisplayBounds,
  } = require('../../src/services/visualPlanMaterializer.cjs');
  const crypto = require('node:crypto');
  const imageSha256 = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const asset = {
    id: 'bounded-component', filePath: fixture,
    width: 529, height: 302, nativeWidthPx: 529, nativeHeightPx: 302,
    sourceAuthority: 'OFFICIAL_RULEBOOK', sourceAuthorityRank: 50,
    sourcePdfSha256: 'a'.repeat(64), sourceRefs: [{ page: 7 }], semanticObjects: ['fuel-track'],
    objectVisualEvidence: [{ contract: 'mobius-object-visual-evidence-v2', assetId: 'bounded-component',
      requiredObject: 'fuel-track', imageSha256, evidencePacketHash: 'bounded-component-packet', model: 'fixture-model',
      method: 'provider-pixel-analysis', visualRole: 'COMPONENT', present: true, complete: true, isolated: true,
      stateCompatible: true, confidence: .99, bbox: [.01, .01, .99, .99], reason: 'Complete source component.' }],
  };
  const scene = { id: 'bounded-scene' };
  expect(statefulComponentDisplayBounds(asset, { referentCount: 1, position: 0 })).toEqual({ width: 608, height: 347 });
  const selected = sourceMeasuredComponentCandidate({ scene, referent: 'fuel-track', assets: [asset] });
  expect(selected).toBeTruthy();
  expect(selected.measured.trueSourcePixelsPerDisplayPixel).toBeGreaterThanOrEqual(.8);
  expect(selected.measured.actualDisplayBounds).toEqual({ width: 608, height: 347 });
});

test('stateful materializer never turns a large derivative canvas into source detail', () => {
  const { sourceMeasuredComponentCandidate, statefulComponentDisplayBounds } = require('../../src/services/visualPlanMaterializer.cjs');
  const crypto = require('node:crypto');
  const imageSha256 = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const asset = {
    id: 'false-detail-claim', filePath: fixture,
    width: 529, height: 302, nativeWidthPx: 529, nativeHeightPx: 302,
    // The source lineage proves that only a smaller native region carries
    // real detail.  Enlarging its container must not manufacture pixels.
    trueDetailDimensions: { width: 180, height: 100 },
    sourceAuthority: 'OFFICIAL_RULEBOOK', sourceAuthorityRank: 50,
    sourcePdfSha256: 'a'.repeat(64), sourceRefs: [{ page: 7 }], semanticObjects: ['fuel-track'],
    objectVisualEvidence: [{ contract: 'mobius-object-visual-evidence-v2', assetId: 'false-detail-claim',
      requiredObject: 'fuel-track', imageSha256, evidencePacketHash: 'false-detail-packet', model: 'fixture-model',
      method: 'provider-pixel-analysis', visualRole: 'COMPONENT', present: true, complete: true, isolated: true,
      stateCompatible: true, confidence: .99, bbox: [.01, .01, .99, .99], reason: 'Complete but low-detail source component.' }],
  };
  const bounds = statefulComponentDisplayBounds(asset, { referentCount: 1, position: 0 });
  expect(bounds.width).toBeLessThan(250);
  expect(bounds.height).toBeLessThan(150);
  const selected = sourceMeasuredComponentCandidate({ scene: { id: 'false-detail-scene' }, referent: 'fuel-track', assets: [asset] });
  expect(selected).toBeTruthy();
  expect(selected.measured.trueSourcePixelsPerDisplayPixel).toBeGreaterThanOrEqual(.8);
  expect(selected.measured.actualDisplayBounds).toEqual(bounds);
});

test('semantic materializer labels a cited transition without claiming a physical arrangement', async () => {
  const crypto = require('node:crypto');
  const { materializeSemanticInstructionalFrames, semanticTeachingStages } = require('../../src/services/visualPlanMaterializer.cjs');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const component = { contract: 'mobius-object-visual-evidence-v2', requiredObject: 'card', assetId: 'card-asset', imageSha256: hash,
    evidencePacketHash: 'semantic-packet', model: 'fixture-model', method: 'provider-pixel-analysis', visualRole: 'COMPONENT',
    present: true, complete: true, isolated: true, stateCompatible: true, confidence: .99, bbox: [.1, .1, .9, .9], reason: 'Complete source component.' };
  const scene = { id: 'semantic', atomId: 'atom', title: 'Résoudre une carte', narration: 'Résolvez cette carte.', on_screen_text: 'Résoudre une carte',
    source_pages: [4], sourceRefs: [{ page: 4, excerptHash: 'source-evidence' }], localizedTeaching: { visualTeaching: { beforeState: 'La carte est disponible en français.', actionState: 'Résolvez son effet en français.', afterState: 'Poursuivez votre tour en français.' } }, visualRequirement: { actualGameAssetRequired: true,
      requiredObjects: ['card'], transitionRequired: true, beforeState: 'La carte est disponible.', actionState: 'Résolvez son effet.', afterState: 'Poursuivez votre tour.' } };
  const assets = [{ id: 'card-asset', filePath: fixture, displayPath: fixture, width: 1600, height: 900, nativeWidthPx: 1600, nativeHeightPx: 900,
    sourceAuthority: 'OFFICIAL_RULEBOOK', sourceAuthorityRank: 50, sourcePdfSha256: 'a'.repeat(64), sourceRefs: [{ page: 4 }], semanticObjects: ['card'], objectVisualEvidence: [component] }];
  const result = await materializeSemanticInstructionalFrames({ projectId: 'semantic-fixture', scene, assets, outputDir });
  expect(result).toMatchObject({ contract: 'mobius-source-grounded-semantic-sequence-v2', materializerContract: 'mobius-visual-plan-materializer-v7', semanticTeaching: true, sceneId: 'semantic', preparedOnly: true });
  expect(result.sourceTeaching.map(stage => stage.instructionalText)).toEqual(['La carte est disponible en français.', 'Résolvez son effet en français.', 'Poursuivez votre tour en français.']);
  expect(result.frames).toHaveLength(3);
  expect(await sharp(result.frames[0].outputPath).metadata()).toMatchObject({ width: 1920, height: 1080 });
  expect(semanticTeachingStages({ ...scene, visualRequirement: { ...scene.visualRequirement, setupPlacementRequired: true } })).toEqual([]);
}, 60000);

test('canonical direct localized teaching survives the compiler/materializer boundary', () => {
  const { localizedVisualTeaching, semanticTeachingStages } = require('../../src/services/visualPlanMaterializer.cjs');
  const scene = {
    id: 'direct-localization',
    localizedTeaching: {
      beforeState: 'Avant en français.',
      actionState: 'Action en français.',
      afterState: 'Après en français.',
    },
    sourceRefs: [{ page: 8, excerptHash: 'official-source' }],
    visualRequirement: {
      actualGameAssetRequired: true,
      requiredObjects: ['card'],
      transitionRequired: true,
      beforeState: 'Before in English.',
      actionState: 'Action in English.',
      afterState: 'After in English.',
    },
  };
  expect(localizedVisualTeaching(scene)).toEqual({
    beforeState: 'Avant en français.',
    actionState: 'Action en français.',
    afterState: 'Après en français.',
  });
  expect(semanticTeachingStages(scene).map((stage) => stage.instructionalText)).toEqual([
    'Avant en français.', 'Action en français.', 'Après en français.',
  ]);
});

test('stateful teaching layout preserves canonical mobile type floors and source detail', () => {
  const { statefulTeachingLayout, statefulComponentDisplayBounds } = require('../../src/services/visualPlanMaterializer.cjs');
  const layout = statefulTeachingLayout(2);
  const phoneScale = 390 / 1920;
  expect(layout.typography.instructionalPx * phoneScale).toBeGreaterThanOrEqual(10);
  expect(layout.typography.headlinePx * phoneScale).toBeGreaterThanOrEqual(12);
  expect(layout.typography.componentLabelPx).toBeGreaterThanOrEqual(42);
  expect(layout.componentRegion.height).toBeGreaterThanOrEqual(500);
  const lowDetail = { nativeWidthPx: 1000, nativeHeightPx: 800, trueDetailDimensions: { width: 120, height: 96 } };
  const bounds = statefulComponentDisplayBounds(lowDetail, { referentCount: 2, position: 0 });
  expect(Math.min(120 / bounds.width, 96 / bounds.height)).toBeGreaterThanOrEqual(.8);
});

test('instructional diagram prepares concrete teaching from independently measured source components', async () => {
  const crypto = require('node:crypto');
  const { materializeSourceGroundedInstructionalDiagram, instructionalDiagramStages } = require('../../src/services/visualPlanMaterializer.cjs');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  const component = (requiredObject, assetId) => ({ contract: 'mobius-object-visual-evidence-v2', requiredObject, assetId, imageSha256: hash,
    evidencePacketHash: `diagram-${requiredObject}`, model: 'fixture-model', method: 'provider-pixel-analysis', visualRole: 'COMPONENT',
    present: true, complete: true, isolated: true, stateCompatible: true, confidence: .99, bbox: [.1, .1, .9, .9], reason: 'Complete source component.' });
  const scene = { id: 'diagram', atomId: 'atom', title: 'Placer le jeton', narration: 'Placez le jeton.', on_screen_text: 'Jeton sur plateau',
    source_pages: [5], sourceRefs: [{ page: 5, excerptHash: 'source-evidence' }], localizedTeaching: { visualTeaching: {
      beforeState: 'Le plateau est prêt.', actionState: 'Placez le jeton sur le plateau.', afterState: 'Le jeton reste sur le plateau.' } },
    visualRequirement: { actualGameAssetRequired: true, requiredObjects: ['board', 'token'], transitionRequired: true,
      requiredRelationship: 'Place token on board', beforeState: 'Board is ready', actionState: 'Place token', afterState: 'Token is on board' } };
  const assets = ['board', 'token'].map((id) => ({ id: `${id}-asset`, filePath: fixture, displayPath: fixture, width: 1600, height: 900,
    nativeWidthPx: 1600, nativeHeightPx: 900, sourceAuthority: 'OFFICIAL_RULEBOOK', sourceAuthorityRank: 50, sourcePdfSha256: 'a'.repeat(64),
    sourceRefs: [{ page: 5 }], semanticObjects: [id], objectVisualEvidence: [component(id, `${id}-asset`)] }));
  const result = await materializeSourceGroundedInstructionalDiagram({ projectId: 'diagram-fixture', scene, assets, outputDir });
  expect(result).toMatchObject({ contract: 'mobius-source-grounded-instructional-diagram-v2', materializerContract: 'mobius-visual-plan-materializer-v7', instructionalDiagram: true, sceneId: 'diagram', preparedOnly: true });
  expect(result.sourceAssets).toHaveLength(2);
  expect(result.frames).toHaveLength(3);
  expect(await sharp(result.frames[0].outputPath).metadata()).toMatchObject({ width: 1920, height: 1080 });
  expect(instructionalDiagramStages({ ...scene, sourceRefs: [] })).toEqual([]);
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
