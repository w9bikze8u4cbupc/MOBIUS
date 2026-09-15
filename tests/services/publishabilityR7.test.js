const fs = require('node:fs');
const path = require('node:path');
const { normalizeVisualPlan } = require('../../src/services/visualPlan.cjs');

describe('R7 reusable visual polish contracts', () => {
  test.each(['REAL_COMPONENT_FLOW', 'REAL_MILITARY_DEMONSTRATION'])(
    'accepts generator-native composition type %s',
    (compositionType) => {
      const plan = normalizeVisualPlan({
        ruleAtomId: 'synthetic-action',
        instructionalPurpose: 'Show a source-grounded physical procedure.',
        compositionType,
        actualGameAssetRequired: true,
        actualGameAssetIds: ['component-a'],
        reviewState: 'accepted',
      });
      expect(plan.compositionType).toBe(compositionType);
    },
  );

  test('R7 keeps game-specific source bindings in project data', () => {
    const project = JSON.parse(fs.readFileSync(path.resolve('config/projects/7-wonders-duel/visual-plan.r7.json'), 'utf8'));
    const discard = project.plans.find((plan) => plan.ruleAtomId === 'discard-for-coins');
    const military = project.plans.find((plan) => plan.ruleAtomId === 'military-system');
    expect(project.policy.sceneMatchedBackground).toBe(true);
    expect(project.policy.sequenceArrowStyle).toBe('RESTRAINED_GOLD');
    expect(discard.compositionType).toBe('REAL_COMPONENT_FLOW');
    expect(discard.summaryLine).toMatch(/2 pièces.*carte jaune/);
    expect(military.compositionType).toBe('REAL_MILITARY_DEMONSTRATION');
    expect(military.actualGameAssetIds).toEqual(expect.arrayContaining(['r6-military-board', 'r7-conflict-pawn-cutout']));
  });

  test('R7 narration regeneration is targeted and idempotent', () => {
    const assembly = JSON.parse(fs.readFileSync(path.resolve('config/projects/7-wonders-duel/tutorial-assembly.r7.json'), 'utf8'));
    expect(assembly.narrationRegenerateSceneIds).toEqual(['tie-breaker']);
    expect(assembly.narrationSeedManifest).toMatch(/publishability-r6/);
  });
});
