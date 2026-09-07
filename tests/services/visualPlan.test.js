const {
  auditVisualCoverage,
  compileVisualPlans,
  normalizeVisualPlan,
  validateVisualPlan,
} = require('../../src/services/visualPlan.cjs');

const atom = {
  id: 'synthetic-build-card',
  domain: 'action',
  title: 'Construire une carte',
  componentRefs: ['age-card'],
  confidence: 0.96,
  reviewState: 'accepted',
  visualRequirement: { purpose: 'Montrer la carte et sa destination.', requiredObjects: ['carte Âge', 'cité'] },
};

const realAsset = {
  id: 'real-card',
  filePath: __filename,
  containsActualGamePixels: true,
  visualClassification: 'REAL_CARD_OR_WONDER',
  cropPurity: 'clean',
  cropCompleteness: 'complete',
  reviewState: 'accepted',
  sourceRefs: [{ page: 4 }],
  sourceType: 'NATIVE_EMBEDDED',
};

const grounded = {
  referentEvidence: [
    { referent: 'carte Âge', assetId: 'real-card', visibleAtNarration: true },
    { referent: 'cité', assetId: 'real-card', visibleAtNarration: true },
  ],
};

describe('canonical VisualPlan', () => {
  test('physical atoms cannot fall back to an empty or abstract proxy plan', () => {
    const empty = normalizeVisualPlan({ ruleAtomId: atom.id, reviewState: 'accepted' }, atom);
    expect(validateVisualPlan(empty, []).violations).toContain('actual-game-asset-required');
    const abstract = { ...realAsset, id: 'abstract', containsActualGamePixels: false, visualClassification: 'ABSTRACT_SUPPORTING_DIAGRAM' };
    const plan = normalizeVisualPlan({ ruleAtomId: atom.id, actualGameAssetIds: ['abstract'], reviewState: 'accepted' }, atom);
    expect(validateVisualPlan(plan, [abstract]).violations).toEqual(expect.arrayContaining(['actual-game-asset-required', 'abstract-proxy-as-component']));
  });

  test('real source-grounded assets satisfy centered contain defaults', () => {
    const [plan] = compileVisualPlans({
      atoms: [atom],
      projectPlans: [{ ruleAtomId: atom.id, compositionType: 'REAL_COMPONENT_SEQUENCE', actualGameAssetIds: ['real-card'], ...grounded, reviewState: 'accepted' }],
      assets: [realAsset],
    });
    expect(plan.validation.valid).toBe(true);
    expect(plan.alignment).toEqual({ horizontal: 'CENTER', vertical: 'CENTER', fit: 'CONTAIN' });
  });

  test('contaminated or incomplete crops fail hard', () => {
    const plan = normalizeVisualPlan({ ruleAtomId: atom.id, actualGameAssetIds: ['real-card'], reviewState: 'accepted' }, atom);
    expect(validateVisualPlan(plan, [{ ...realAsset, cropPurity: 'contaminated' }]).violations).toContain('crop-contamination');
    expect(validateVisualPlan(plan, [{ ...realAsset, cropCompleteness: 'incomplete' }]).violations).toContain('incomplete-crop');
  });

  test('R4-style proxy fixture fails the real-component coverage gate', () => {
    const proxy = { ...realAsset, id: 'generic-circle', containsActualGamePixels: false, visualClassification: 'INVALID_PROXY' };
    const plans = compileVisualPlans({
      atoms: [atom],
      projectPlans: [{ ruleAtomId: atom.id, actualGameAssetIds: ['generic-circle'], reviewState: 'accepted' }],
      assets: [proxy],
    });
    const audit = auditVisualCoverage({ atoms: [atom], plans, assets: [proxy] });
    expect(audit.status).toBe('FAIL');
    expect(audit.metrics.instructionalScenesWithoutActualGameAsset).toBe(1);
    expect(audit.metrics.abstractProxyAsComponentCount).toBe(1);
  });

  test('unseen synthetic fixture inherits real-component requirements', () => {
    const unseen = { ...atom, id: 'unseen-place-token', domain: 'setup', title: 'Placer un jeton' };
    const plan = normalizeVisualPlan({
      ruleAtomId: unseen.id,
      actualGameAssetIds: ['real-card'],
      ...grounded,
      setupPlacements: [
        { referent: 'carte Âge', destination: 'zone de jeu', visibleRelationship: true },
        { referent: 'cité', destination: 'devant le joueur', visibleRelationship: true },
      ],
      reviewState: 'accepted',
    }, unseen);
    expect(plan.actualGameAssetRequired).toBe(true);
    expect(validateVisualPlan(plan, [realAsset]).valid).toBe(true);
  });

  test('clause-level focus cues survive canonical plan normalization', () => {
    const focusCues = [{
      narrationClause: 'le coût de construction',
      assetId: 'real-card',
      semanticRegion: 'constructionCost',
      startRatio: 0.1,
      endRatio: 0.4,
    }];
    const plan = normalizeVisualPlan({
      ruleAtomId: atom.id,
      actualGameAssetIds: ['real-card'],
      focusCues,
      lowerZonePurpose: 'A source-grounded state label occupies the lower zone.',
      reviewState: 'accepted',
    }, atom);
    expect(plan.focusCues).toEqual(focusCues);
    expect(plan.lowerZonePurpose).toBe('A source-grounded state label occupies the lower zone.');
  });

  test('a repeatedly Director-rejected derivative cannot be reused unchanged', () => {
    const plan = normalizeVisualPlan({ ruleAtomId: atom.id, actualGameAssetIds: ['real-card'], reviewState: 'accepted' }, atom);
    const rejected = { ...realAsset, directorRejectedForSameDefect: true };
    expect(validateVisualPlan(plan, [rejected]).violations).toContain('rejected-asset-reused');
  });

  test('a narrated setup component requires visible placement evidence', () => {
    const setupAtom = {
      id: 'setup-military', domain: 'setup', componentRefs: ['military-token'],
      visualRequirement: { requiredObjects: ['quatre jetons Militaire'] },
    };
    const plan = normalizeVisualPlan({
      ruleAtomId: setupAtom.id,
      actualGameAssetIds: ['real-card'],
      requiredReferents: ['quatre jetons Militaire'],
      referentGroundingRequired: true,
      referentEvidence: [],
      setupPlacementEvidenceRequired: true,
      setupPlacements: [],
      reviewState: 'accepted',
    }, setupAtom);
    expect(validateVisualPlan(plan, [realAsset]).violations).toEqual(expect.arrayContaining([
      'physical-referent-absent:quatre jetons Militaire',
      'setup-placement-evidence-missing:quatre jetons Militaire',
    ]));
  });

  test('card-family identity cannot be accepted without grounded family referents', () => {
    const familyAtom = {
      id: 'families', domain: 'components', componentRefs: ['age-cards'],
      visualRequirement: { requiredObjects: ['brunes', 'grises', 'jaunes', 'rouges', 'bleues', 'vertes', 'guildes'] },
    };
    const plan = normalizeVisualPlan({
      ruleAtomId: familyAtom.id,
      actualGameAssetIds: ['real-card'],
      requiredReferents: familyAtom.visualRequirement.requiredObjects,
      referentGroundingRequired: true,
      referentEvidence: [{ referent: 'brunes', assetId: 'real-card', visibleAtNarration: true }],
      reviewState: 'accepted',
    }, familyAtom);
    expect(validateVisualPlan(plan, [realAsset]).violations).toContain('physical-referent-absent:guildes');
  });
});
