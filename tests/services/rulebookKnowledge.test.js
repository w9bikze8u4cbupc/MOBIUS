const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildRulebookKnowledgeModel,
  buildTutorialCoverageMatrix,
  runMultiPassRulebookIntelligence,
  validateRuleAtom,
} = require('../../src/services/rulebookKnowledge.cjs');

describe('canonical rulebook intelligence', () => {
  test('the reviewed benchmark seed produces complete source-grounded atoms', () => {
    const seed = JSON.parse(fs.readFileSync(path.resolve('config/projects/7-wonders-duel/rulebook-knowledge.v1.json'), 'utf8'));
    const model = buildRulebookKnowledgeModel({ projectSeed: seed });
    expect(model.ruleAtoms).toHaveLength(30);
    expect(model.ruleAtoms.every((atom) => validateRuleAtom(atom).valid)).toBe(true);
    expect(model.completenessCritic.incompleteAtoms).toEqual([]);
    expect(model.contradictionCheck.status).toBe('PASS');
    expect(model.ruleAtoms.find((atom) => atom.id === 'setup-age-layouts').visualRequirement).toEqual(expect.objectContaining({
      diagramKind: 'AGE_LAYOUT_FOCUS',
      ageIndexes: [0],
    }));
    expect(model.ruleAtoms.find((atom) => atom.id === 'scoring-buildings').visualRequirement).toEqual(expect.objectContaining({
      diagramKind: 'SCORING_LEDGER_HIGHLIGHT',
      highlightLabel: 'Bâtiments',
    }));
    const ids = model.ruleAtoms.map((atom) => atom.id);
    const coverage = buildTutorialCoverageMatrix(model, { includedAtomIds: ids, storyboardAtomIds: ids, visualizedAtomIds: ids, narratedAtomIds: ids });
    expect(coverage.status).toBe('PASS');
    expect(coverage.missingHighPriorityDomains).toEqual([]);
  });

  test('an action name without procedure, state and result is rejected', () => {
    const atom = buildRulebookKnowledgeModel({ projectSeed: {
      projectId: 'fixture', sourcePdfSha256: 'a'.repeat(64),
      ruleAtoms: [{ id: 'build', domain: 'action', title: 'Construire', choice: 'Une carte', sourceRefs: [{ page: 2 }], componentRefs: ['card'], visualRequirement: { purpose: 'Construire', requiredObjects: ['card'] }, confidence: 0.9 }],
    } }).ruleAtoms[0];
    expect(validateRuleAtom(atom)).toEqual(expect.objectContaining({ valid: false }));
    expect(validateRuleAtom(atom).issues).toEqual(expect.arrayContaining(['missing-procedure', 'missing-state-change', 'missing-state-after', 'missing-result']));
  });

  test('an unseen points-only fixture uses the same model and coverage gate', () => {
    const seed = {
      projectId: 'unseen-fixture', sourcePdfSha256: 'b'.repeat(64),
      coverageApplicability: { final_scoring: true, immediate_victories: false },
      ruleAtoms: [{
        id: 'score', domain: 'scoring', coverageDomains: ['final_scoring'], title: 'Compter les étoiles',
        procedureSteps: ['Compter les étoiles visibles.'], stateChange: 'Les étoiles deviennent des points.', stateAfter: 'Le score est connu.', result: 'Le plus haut score gagne.',
        componentRefs: ['star-token'], sourceRefs: [{ page: 8 }], confidence: 0.95, reviewState: 'accepted',
        visualRequirement: { purpose: 'Montrer les étoiles comptées.', requiredObjects: ['star-token'] },
        teaching: { majorSection: 'Décompte', heading: 'Les étoiles', narration: 'Comptez vos étoiles.', displayLines: ['Une étoile = un point'], sequence: 10 },
      }],
    };
    const model = buildRulebookKnowledgeModel({ projectSeed: seed });
    expect(model.scoringRules.map((atom) => atom.id)).toEqual(['score']);
    expect(model.victoryConditions).toEqual([]);
  });

  test('multi-pass cache is keyed and reused without another pass', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-knowledge-'));
    const cachePath = path.join(directory, 'knowledge.json');
    const seed = { projectId: 'cache-fixture', sourcePdfSha256: 'c'.repeat(64), gameIdentity: { locale: 'fr-CA', edition: 'test' }, ruleAtoms: [] };
    const first = await runMultiPassRulebookIntelligence({ projectSeed: seed, cachePath });
    const second = await runMultiPassRulebookIntelligence({ projectSeed: seed, cachePath });
    expect(first.cacheHit).toBe(false); expect(first.passesExecuted).toBe(5);
    expect(second.cacheHit).toBe(true); expect(second.passesExecuted).toBe(0);
    const changed = await runMultiPassRulebookIntelligence({ projectSeed: { ...seed, modelVersion: '1.1.0' }, cachePath });
    expect(changed.cacheHit).toBe(false); expect(changed.passesExecuted).toBe(5);
    const changedEvidence = await runMultiPassRulebookIntelligence({ projectSeed: { ...seed, modelVersion: '1.1.0', ruleAtoms: [{ id: 'new-source-grounded-atom' }] }, cachePath });
    expect(changedEvidence.cacheHit).toBe(false); expect(changedEvidence.passesExecuted).toBe(5);
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
