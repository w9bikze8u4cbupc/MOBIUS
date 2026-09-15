const fs = require('node:fs');
const path = require('node:path');
const { normalizeVisualPlan, validateVisualPlan } = require('../../src/services/visualPlan.cjs');

const realAsset = (id, overrides = {}) => ({
  id,
  filePath: __filename,
  containsActualGamePixels: true,
  visualClassification: 'REAL_COMPONENT',
  cropPurity: 'clean',
  cropCompleteness: 'complete',
  reviewState: 'accepted',
  sourceRefs: [{ page: 1 }],
  semanticTags: [],
  ...overrides,
});

describe('R8 generator-native fidelity and teaching contracts', () => {
  test('quantity fidelity fails a misleading quantity and passes an exact one', () => {
    const wrong = realAsset('coins', { representedQuantity: 3 });
    const plan = normalizeVisualPlan({
      ruleAtomId: 'setup-coins',
      actualGameAssetIds: ['coins'],
      quantityFidelity: [{ componentRef: 'coins', requiredQuantity: 7, assetId: 'coins' }],
      reviewState: 'accepted',
    }, { id: 'setup-coins', domain: 'setup', componentRefs: ['coins'] });
    expect(validateVisualPlan(plan, [wrong]).violations).toContain('quantity-fidelity:coins');
    expect(validateVisualPlan(plan, [{ ...wrong, representedQuantity: 7 }]).valid).toBe(true);
  });

  test('representative families cannot silently collapse to one decorative object', () => {
    const plan = normalizeVisualPlan({
      ruleAtomId: 'card-family',
      actualGameAssetIds: ['a'],
      minimumRepresentativeAssets: 3,
      reviewState: 'accepted',
    }, { id: 'card-family', domain: 'components', componentRefs: ['cards'] });
    expect(validateVisualPlan(plan, [realAsset('a')]).violations).toContain('representative-asset-density-below-minimum');
  });

  test('motion cues require real source assets and bounded forward timing', () => {
    const plan = normalizeVisualPlan({
      ruleAtomId: 'track-motion',
      actualGameAssetIds: ['track', 'pawn'],
      motionCues: [{ assetId: 'pawn', relativeToAssetId: 'track', startRatio: 0.1, endRatio: 0.6 }],
      reviewState: 'accepted',
    }, { id: 'track-motion', domain: 'special-system', componentRefs: ['track', 'pawn'] });
    expect(validateVisualPlan(plan, [realAsset('track'), realAsset('pawn')]).valid).toBe(true);
    expect(validateVisualPlan({ ...plan, motionCues: [{ assetId: 'missing', relativeToAssetId: 'track', startRatio: 0.6, endRatio: 0.2 }] }, [realAsset('track')]).violations)
      .toEqual(expect.arrayContaining(['motion-cue-asset-missing', 'motion-cue-time-invalid']));
  });

  test('progressive scoring requires an authoritative scorepad and a complete example', () => {
    const scorepad = realAsset('scorepad', { semanticTags: ['carnet de score officiel'] });
    const plan = normalizeVisualPlan({
      ruleAtomId: 'score',
      compositionType: 'REAL_PROGRESSIVE_SCOREPAD',
      actualGameAssetIds: ['scorepad'],
      scoreExample: { rows: [{ label: 'Bâtiments', value: '4' }], total: { label: 'TOTAL', value: '4' } },
      reviewState: 'accepted',
    }, { id: 'score', domain: 'scoring', componentRefs: ['scorepad'] });
    expect(validateVisualPlan(plan, [scorepad]).valid).toBe(true);
    expect(validateVisualPlan({ ...plan, scoreExample: null }, [scorepad]).violations).toContain('progressive-score-example-missing');
  });

  test('R8 project data preserves narration while adding quantity, Age/Guild, motion, and scorepad evidence', () => {
    const r8 = JSON.parse(fs.readFileSync(path.resolve('config/projects/7-wonders-duel/visual-plan.r8.json'), 'utf8'));
    const setup = r8.plans.find((plan) => plan.ruleAtomId === 'setup-central');
    const ages = r8.plans.find((plan) => plan.ruleAtomId === 'setup-age-decks');
    const military = r8.plans.find((plan) => plan.ruleAtomId === 'military-system');
    const scoring = r8.plans.find((plan) => plan.ruleAtomId === 'scoring-ledger');
    expect(setup.quantityFidelity).toContainEqual(expect.objectContaining({ componentRef: 'coins', requiredQuantity: 7 }));
    expect(ages.compositionType).toBe('REAL_AGE_GUILD_IDENTITY');
    expect(ages.actualGameAssetIds).toHaveLength(4);
    expect(military.motionCues[0]).toMatchObject({ assetId: 'r7-conflict-pawn-cutout', relativeToAssetId: 'r6-military-board' });
    expect(scoring.compositionType).toBe('REAL_PROGRESSIVE_SCOREPAD');
    expect(scoring.scoreExample.total.value).toBe('19');
  });

  test('R8 reuses all narration and keeps the R7 seed immutable', () => {
    const assembly = JSON.parse(fs.readFileSync(path.resolve('config/projects/7-wonders-duel/tutorial-assembly.r8.json'), 'utf8'));
    expect(assembly.narrationRegenerateSceneIds).toEqual([]);
    expect(assembly.narrationSeedManifest).toMatch(/publishability-r7/);
    expect(assembly.baseline.immutableGold).toMatchObject({
      version: 'r5',
      directorStatus: 'HUMAN_PUBLISHABLE_GOLD_BASELINE',
      published: false,
    });
    expect(assembly.baseline.predecessor).toMatchObject({ version: 'r7', preserved: true });
  });
});
