const fs = require('node:fs');
const path = require('node:path');
const editorial = require('../../src/services/editorialStandard.cjs');
const { traceAssetSourceDetail, evaluatePeerQualityParity } = require('../../src/services/sourceDetailLineage.cjs');
const { normalizeVisualPlan, validateVisualPlan } = require('../../src/services/visualPlan.cjs');

const real = (id, overrides = {}) => ({
  id, filePath: __filename, containsActualGamePixels: true,
  visualClassification: 'REAL_CARD_OR_WONDER', cropPurity: 'clean', cropCompleteness: 'complete',
  reviewState: 'accepted', sourceRefs: [{ page: 1 }], sourceType: 'NATIVE_EMBEDDED',
  cardSilhouetteState: 'COMPLETE', edgeIntersectionState: 'CLEAR', correctCardAspectRatio: true,
  ...overrides,
});

describe('R11 precision-lock contracts', () => {
  test('literal Roman deck numerals become natural spoken cardinals only in context', () => {
    expect(editorial.normalizeSpokenSymbols('Repérez les dos : I, II et III.'))
      .toBe('Repérez les dos : un, deux et trois.');
    expect(editorial.normalizeSpokenSymbols('Âge I, Âge II et Âge III.'))
      .toBe('âge un, âge deux et âge trois.');
    expect(editorial.normalizeSpokenSymbols('La lettre I reste I.')).toBe('La lettre I reste I.');
  });

  test('a large derivative cannot hide measured low object detail', () => {
    const report = traceAssetSourceDetail({
      asset: { id: 'rectified', sourceType: 'AUTHORIZED_EXACT_EDITION_HIGH_RES', width: 900, height: 1390, sourceDimensions: { width: 900, height: 1390 }, trueDetailDimensions: { width: 219, height: 339 } },
      finalBounds: { x: 0, y: 0, width: 360, height: 557 },
    });
    expect(report.qualityState).toBe('SOURCE_DETAIL_FAIL');
    expect(report.traces[0].underlyingNativeWidthPx).toBe(219);
  });

  test('an inferior card fails when a higher-authority display-ready candidate exists', () => {
    const report = traceAssetSourceDetail({
      asset: {
        id: 'tiny-card', sourceType: 'NATIVE_EMBEDDED', width: 219, height: 339,
        sourceDimensions: { width: 219, height: 339 },
        authoritativeAlternatives: [{ id: 'press-card', sourceType: 'OFFICIAL_PRESS_ASSET', width: 2640, height: 4081 }],
      },
      finalBounds: { x: 0, y: 0, width: 219, height: 339 },
    });
    expect(report.qualityState).toBe('SOURCE_DETAIL_FAIL');
    expect(report.betterAuthoritativeCandidate.id).toBe('press-card');
  });

  test('peer parity ignores invisible headroom above one source pixel per display pixel', () => {
    expect(evaluatePeerQualityParity([
      { assetId: 'a', sourcePixelsPerDisplayPixel: 1.02, displayScale: 1 },
      { assetId: 'b', sourcePixelsPerDisplayPixel: 4.6, displayScale: 1 },
    ]).valid).toBe(true);
    expect(evaluatePeerQualityParity([
      { assetId: 'a', sourcePixelsPerDisplayPixel: 0.55, displayScale: 1 },
      { assetId: 'b', sourcePixelsPerDisplayPixel: 1.2, displayScale: 1 },
    ]).violations).toContain('peer-source-detail-parity');
  });

  test('layered layouts require both face states and a cover relationship', () => {
    const atom = { id: 'layered', domain: 'action', componentRefs: ['cards'] };
    const plan = normalizeVisualPlan({
      ruleAtomId: 'layered', actualGameAssetIds: ['card'], reviewState: 'accepted',
      layeredCardState: { required: true }, cardLayout: [{ assetId: 'card', faceState: 'FACE_UP', accessible: true }],
    }, atom);
    expect(validateVisualPlan(plan, [real('card')]).violations).toEqual(expect.arrayContaining([
      'layered-layout-face-states-incomplete', 'layered-layout-cover-relationship-missing',
    ]));
  });

  test('complete silhouettes and one-shot removal are mandatory', () => {
    const atom = { id: 'trigger', domain: 'action', componentRefs: ['card', 'marker'] };
    const plan = normalizeVisualPlan({
      ruleAtomId: atom.id, actualGameAssetIds: ['card', 'marker'], completeCardAssetIds: ['card'],
      oneShotMarkers: [{ id: 'threshold', assetId: 'marker', beforeState: 'PRESENT', afterState: 'PRESENT', removeAtTrigger: false, reentryEffect: 'REPEAT' }],
      reviewState: 'accepted',
    }, atom);
    const result = validateVisualPlan(plan, [real('card', { cardSilhouetteState: 'INCOMPLETE' }), real('marker')]);
    expect(result.violations).toEqual(expect.arrayContaining([
      'complete-card-silhouette:card', 'one-shot-marker-state-invalid',
      'one-shot-marker-reentry-must-be-none', 'one-shot-marker-removal-not-visualized',
    ]));
  });

  test('physical token orientation must agree with verified project placement evidence', () => {
    const atom = { id: 'board', domain: 'action', componentRefs: ['token'] };
    const plan = normalizeVisualPlan({
      ruleAtomId: atom.id, actualGameAssetIds: ['token'], reviewState: 'accepted',
      physicalPlacements: [{ assetId: 'token', destinationId: 'threshold', positionVerified: true, orientation: 'VERTICAL', expectedOrientation: 'HORIZONTAL' }],
    }, atom);
    expect(validateVisualPlan(plan, [real('token')]).violations).toContain('physical-placement-orientation-mismatch');
  });

  test('R11 project state replaces the seven rejected R10 scene assets', () => {
    const file = path.resolve('config/projects/7-wonders-duel/visual-plan.r11.json');
    if (!fs.existsSync(file)) return;
    const project = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(new Set(project.assets.map((asset) => asset.id)).size).toBe(project.assets.length);
    const selected = project.plans.flatMap((plan) => plan.actualGameAssetIds || []);
    for (const id of ['r10-chain-baths', 'r10-chain-aqueduct', 'r10-chain-palisade', 'r10-chain-fortifications', 'r10-guild-builders', 'r10-guild-scientists', 'r10-guild-shipowners', 'r10-discard-pile-clean']) {
      expect(selected).not.toContain(id);
    }
    expect(project.plans.find((plan) => plan.ruleAtomId === 'accessible-card').layeredCardState.required).toBe(true);
    expect(project.plans.find((plan) => plan.ruleAtomId === 'military-system').oneShotMarkers[0]).toMatchObject({ afterState: 'REMOVED', reentryEffect: 'NONE' });
    expect(project.assets.find((asset) => asset.id === 'r11-chain-baths-hd')).toMatchObject({ sourceType: 'AUTHORIZED_EXACT_EDITION_HIGH_RES' });
    expect(project.assets.find((asset) => asset.id === 'r11-guild-scientists-hd')).toMatchObject({ sourceType: 'AUTHORIZED_EXACT_EDITION_HIGH_RES' });
  });
});
