const {
  buildRuleVisualReferentRecoveryPacket,
  validateRuleVisualReferentRecovery,
  applyRuleVisualReferentRecovery,
} = require('../../src/services/ruleVisualReferentRecovery.cjs');
const { compileCanonicalProductionState } = require('../../src/services/canonicalProductionCompiler.cjs');
const { buildRulebookKnowledgeModel, buildTutorialCoverageMatrix } = require('../../src/services/rulebookKnowledge.cjs');

function model() {
  return buildRulebookKnowledgeModel({ projectSeed: {
    projectId: 'visual-referent-recovery-proof',
    sourcePdfSha256: 'a'.repeat(64),
    gameIdentity: { displayName: 'Generic Game' },
    components: [{ id: 'comp-board', name: 'Board', category: 'board', sourcePage: 2, sourceQuote: 'Place the board in the centre.' }],
    ruleAtoms: [{
      id: 'setup-board', domain: 'setup', title: 'Place the board', confidence: 0.95, reviewState: 'accepted',
      sourceRefs: [{ page: 2, quote: 'Place the board in the centre.' }],
      teaching: { majorSection: 'Mise en place', heading: 'Le plateau', narration: 'Placez le plateau.', displayLines: ['Placez le plateau'] },
      visualRequirement: { actualGameAssetRequired: true, requiredObjects: [], purpose: 'Place the board' },
    }],
  } });
}

test('accepts only a source-grounded existing component ID and applies it as a visual requirement', () => {
  const source = model();
  const packet = buildRuleVisualReferentRecoveryPacket(source);
  const result = {
    recoveries: [{
      ruleAtomId: 'setup-board', disposition: 'COMPONENTS_GROUNDED', componentRefs: ['comp-board'],
      evidence: [{ page: 2, quote: 'Place the board in the centre.' }], reason: 'The quoted setup instruction names the board.',
    }],
  };
  expect(validateRuleVisualReferentRecovery(packet, result).recoveries[0]).toMatchObject({ componentRefs: ['comp-board'] });
  const applied = applyRuleVisualReferentRecovery(source, { inputHash: 'recovery', result });
  expect(applied.ruleAtoms[0].componentRefs).toEqual(['comp-board']);
  expect(applied.ruleAtoms[0].visualRequirement.requiredObjects).toEqual(['comp-board']);
  expect(applied.ruleAtoms[0].visualRequirement.actualGameAssetRequired).toBe(true);
});

test('rejects a provider citation or component ID that was not in the recovery packet', () => {
  const packet = buildRuleVisualReferentRecoveryPacket(model());
  expect(() => validateRuleVisualReferentRecovery(packet, { recoveries: [{
    ruleAtomId: 'setup-board', disposition: 'COMPONENTS_GROUNDED', componentRefs: ['comp-invented'],
    evidence: [{ page: 19, quote: 'Invented quote' }], reason: 'No.',
  }] })).toThrow(/RULE_VISUAL_REFERENT_RECOVERY_(COMPONENT|EVIDENCE)_INVALID/);
});

test('reconciles one unique interleaved source span without accepting an out-of-packet citation', () => {
  const packet = buildRuleVisualReferentRecoveryPacket(model());
  const result = validateRuleVisualReferentRecovery(packet, { recoveries: [{
    ruleAtomId: 'setup-board', disposition: 'SOURCE_FAITHFUL_DIAGRAM', componentRefs: [],
    evidence: [{ page: 2, quote: 'Place board in centre' }], reason: 'The source text is sufficient for this diagram fixture.',
  }] });
  expect(result.recoveries[0].evidence[0].quote).toBe('Place the board in the centre');
  expect(result.recoveries[0].evidence[0].sourceProjection).toMatch(/unique-ordered/);
});

test('source-faithful diagram avoids an unrelated asset search without making a physical rule pass', () => {
  const source = model();
  const result = {
    recoveries: [{
      ruleAtomId: 'setup-board', disposition: 'SOURCE_FAITHFUL_DIAGRAM', componentRefs: [],
      evidence: [{ page: 2, quote: 'Place the board in the centre.' }], reason: 'This fixture declares a source-grounded rule diagram.',
    }],
  };
  const applied = applyRuleVisualReferentRecovery(source, { result });
  const coverage = buildTutorialCoverageMatrix(applied, { includedAtomIds: ['setup-board'], storyboardAtomIds: ['setup-board'] });
  const state = compileCanonicalProductionState({ projectId: applied.projectId, knowledgeModel: applied, coverageMatrix: coverage, sourceAssets: [] });
  expect(state.sourceSelections[0]).toMatchObject({ status: 'NOT_REQUIRED', reviewState: 'accepted' });
  expect(state.reviewItems).toHaveLength(0);
  expect(state.visualPlans[0]).toMatchObject({ actualGameAssetRequired: false, reviewState: 'accepted' });
});
