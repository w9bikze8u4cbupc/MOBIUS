const path = require('node:path');
const { normalizeRuleAtom, buildRulebookKnowledgeModel, buildTutorialCoverageMatrix } = require('../../src/services/rulebookKnowledge.cjs');
const { compileCanonicalProductionState } = require('../../src/services/canonicalProductionCompiler.cjs');

const existingFile = path.resolve(__dirname, '../../package.json');

function knowledge() {
  return buildRulebookKnowledgeModel({ projectSeed: {
    projectId: 'generic-proof', gameIdentity: { displayName: 'Generic Game' }, sourcePdfSha256: 'a'.repeat(64),
    coverageApplicability: { complete_setup: true },
    ruleAtoms: [{
      id: 'setup-board', domain: 'setup', coverageDomains: ['complete_setup'], title: 'Place the board',
      placement: 'center of table', componentRefs: ['game-board'], procedureSteps: ['Place the board.'],
      stateChange: 'board moves to table', stateAfter: 'board is centered', sourceRefs: [{ page: 2 }],
      confidence: 0.95, reviewState: 'accepted',
      teaching: { majorSection: 'Mise en place', heading: 'Le plateau', narration: 'Placez le plateau au centre.', displayLines: ['Plateau au centre'] },
    }],
  } });
}

test('normal compiler derives source selection, physical state, VisualPlan and Cockpit state', () => {
  const model = knowledge();
  const coverage = buildTutorialCoverageMatrix(model, { includedAtomIds: ['setup-board'], storyboardAtomIds: ['setup-board'], visualizedAtomIds: ['setup-board'], narratedAtomIds: ['setup-board'] });
  const result = compileCanonicalProductionState({
    projectId: 'generic-proof', knowledgeModel: model, coverageMatrix: coverage,
    sourceAssets: [{
      id: 'board-master', filePath: existingFile, width: 2400, height: 1600,
      sourceAuthority: 'OFFICIAL_PUBLISHER_HIGH_RES', semanticObjects: ['game-board'],
      cropCompleteness: 'complete', cropPurity: 'clean', reviewState: 'accepted', sourceRefs: [{ page: 2 }],
    }], displayBounds: { width: 900, height: 600 },
  });
  expect(result.CODEX_REQUIRED_FOR_NORMAL_PRODUCTION).toBe(false);
  expect(result.status).toBe('READY');
  expect(result.scenes[0]).toMatchObject({ visualReviewState: 'resolved', visualPlan: { coverageStatus: 'resolved' } });
  expect(result.visualPlans[0].compositionType).toBe('REAL_SETUP_PLACEMENT');
  expect(result.physicalStates[0].stages.length).toBe(2);
  expect(result.reviewItems).toHaveLength(0);
});

test('uncertain visual source becomes a Cockpit item instead of a weak fallback', () => {
  const model = knowledge();
  const coverage = buildTutorialCoverageMatrix(model, { includedAtomIds: ['setup-board'], storyboardAtomIds: ['setup-board'] });
  const result = compileCanonicalProductionState({ projectId: 'generic-proof', knowledgeModel: model, coverageMatrix: coverage, sourceAssets: [] });
  expect(result.status).toBe('REVIEW_REQUIRED');
  expect(result.reviewItems[0]).toMatchObject({ status: 'needs_visual_review', ruleAtomId: 'setup-board' });
  expect(result.scenes[0].renderVisual).toBeUndefined();
});

test('surfaces HEPHAESTUS review bindings in the same actionable Cockpit queue', () => {
  const model = knowledge();
  const coverage = buildTutorialCoverageMatrix(model, { includedAtomIds: ['setup-board'], storyboardAtomIds: ['setup-board'] });
  const result = compileCanonicalProductionState({
    projectId: 'generic-proof', knowledgeModel: model, coverageMatrix: coverage,
    componentEvidence: {
      assets: [{ id: 'weak-board', sourceImage: existingFile, pageNumber: 2, componentName: 'Native board', category: 'board', reviewState: 'accepted' }],
      componentBindings: [{ componentId: 'game-board', componentName: 'Game board', category: 'board', assetId: 'weak-board', confidence: 0.55, reviewState: 'needs_review', reviewRequired: true, sourcePage: 2 }],
    },
  });
  expect(result.visualReferentNormalization.contract).toBe('mobius-visual-referent-normalization-v1');
  expect(result.reviewItems[0]).toMatchObject({
    status: 'needs_visual_review',
    scopeType: 'VISUAL_REQUIREMENT',
    ruleAtomId: 'setup-board',
  });
  expect(result.reviewItems[0].recommendedOperatorAction).toEqual(expect.any(String));
  expect(result.reviewItems[0].candidates[0]).toMatchObject({ assetId: 'weak-board' });
});
