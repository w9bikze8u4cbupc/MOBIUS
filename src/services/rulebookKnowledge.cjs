const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RULEBOOK_KNOWLEDGE_MODEL_VERSION = 'mobius-rulebook-knowledge-v1';
const RULEBOOK_INTELLIGENCE_PIPELINE_VERSION = 'mobius-rulebook-intelligence-multipass-v1.1.1';
const TUTORIAL_COVERAGE_VERSION = 'mobius-tutorial-coverage-v1';

const COVERAGE_DOMAINS = Object.freeze([
  'identity_theme',
  'objective',
  'components',
  'complete_setup',
  'first_player_rule',
  'turn_round_age_structure',
  'mandatory_actions',
  'alternative_actions',
  'optional_actions',
  'costs_resources_payment',
  'component_placement_orientation',
  'triggered_effects',
  'major_special_systems',
  'end_condition',
  'immediate_victories',
  'final_scoring',
  'tie_breakers',
  'first_game_pitfalls',
  'reference_aids_score_sheet',
]);

const HIGH_PRIORITY_DOMAINS = Object.freeze(new Set([
  'identity_theme',
  'objective',
  'components',
  'complete_setup',
  'first_player_rule',
  'turn_round_age_structure',
  'mandatory_actions',
  'alternative_actions',
  'costs_resources_payment',
  'component_placement_orientation',
  'triggered_effects',
  'major_special_systems',
  'end_condition',
  'immediate_victories',
  'final_scoring',
]));

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const hashValue = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizeSourceRefs(sourceRefs = []) {
  return (Array.isArray(sourceRefs) ? sourceRefs : []).map((ref) => ({
    page: Number.isInteger(Number(ref?.page)) && Number(ref.page) > 0 ? Number(ref.page) : null,
    section: clean(ref?.section) || null,
    quote: clean(ref?.quote) || null,
    sourcePdfSha256: clean(ref?.sourcePdfSha256) || null,
  })).filter((ref) => ref.page || ref.section);
}

function inferVisualRequirement(atom = {}) {
  const domain = clean(atom.domain);
  const text = clean([
    atom.title,
    atom.trigger,
    atom.choice,
    atom.placement,
    atom.orientation,
    atom.stateBefore,
    atom.stateChange,
    atom.stateAfter,
    atom.result,
    ...(atom.procedureSteps || []),
  ].filter(Boolean).join(' ')).toLocaleLowerCase('fr-CA');
  const components = unique((atom.componentRefs || []).map(String));
  const transitionRequired = Boolean(atom.stateBefore || atom.stateChange || atom.stateAfter)
    || /(?:avant|après|apres|retirer|déplacer|deplacer|placer|construire|défausser|defausser|révéler|reveler|consomm)/i.test(text);
  const layered = /(?:face cachée|face cachee|face visible|face retournée|face retournee|recouvr|accessible|sous la carte|pile)/i.test(text);
  const setup = domain === 'setup' || /mise en place|prépar/i.test(text);
  const scoring = domain === 'scoring' || /score|point|décompte|decompte/i.test(text);
  const track = /piste|track|curseur|marqueur|pion.*(?:avance|déplace|deplace)/i.test(text);
  const oneShot = /(?:une seule fois|première fois|premiere fois|retir|rang|hors jeu|consomm)/i.test(text)
    && /(?:jeton|tuile|marqueur|seuil|zone)/i.test(text);
  const discard = /défauss|defauss|discard/i.test(text);
  const deckIdentity = /(?:paquet|deck|dos de carte|âge|age|manche|guilde)/i.test(text);
  const cardFamily = /(?:famille|couleur|tableau personnel|ville|cité|cite|cartes? (?:brunes?|grises?|jaunes?|rouges?|bleues?|vertes?|violettes?))/i.test(text);
  const comparison = /(?:compar|différenc|differenc|versus|contre|même symbole|meme symbole)/i.test(text);
  const focus = /(?:coût|cout|symbole|icône|icone|points? de victoire|effet|production)/i.test(text);
  return {
    purpose: clean(atom.title || atom.choice || atom.result),
    requiredObjects: components,
    requiredState: clean(atom.stateAfter || atom.stateChange) || null,
    requiredOrientation: clean(atom.orientation) || null,
    requiredRelationship: clean(atom.placement || atom.stateChange) || null,
    beforeState: clean(atom.stateBefore) || null,
    actionState: clean(atom.stateChange || atom.choice) || null,
    afterState: clean(atom.stateAfter || atom.result) || null,
    transitionRequired,
    setupPlacementRequired: setup && components.length > 0,
    layeredStateRequired: layered,
    faceStateRequired: layered,
    cardFamilyRequired: cardFamily,
    trackStateRequired: track,
    oneShotMarkerRequired: oneShot,
    progressiveScoringRequired: scoring,
    comparisonGroupRequired: comparison,
    semanticFocusRequired: focus,
    discardPileRequired: discard,
    deckIdentityRequired: deckIdentity,
    representativeExamplesRequired: cardFamily || comparison || scoring,
    actualGameAssetRequired: components.length > 0 || ['components', 'setup', 'action', 'triggered_effect', 'scoring', 'victory', 'end_condition'].includes(domain),
  };
}

function normalizeVisualRequirement(requirement = {}, atom = {}) {
  const inferred = inferVisualRequirement(atom);
  const merged = { ...inferred, ...requirement };
  return {
    purpose: clean(merged.purpose),
    requiredObjects: unique(merged.requiredObjects?.map(clean)),
    requiredQuantities: Array.isArray(merged.requiredQuantities) ? merged.requiredQuantities : [],
    requiredState: clean(merged.requiredState) || null,
    requiredOrientation: clean(merged.requiredOrientation) || null,
    requiredLabels: unique(merged.requiredLabels?.map(clean)),
    requiredRelationship: clean(merged.requiredRelationship) || null,
    beforeState: clean(merged.beforeState) || null,
    actionState: clean(merged.actionState) || null,
    afterState: clean(merged.afterState) || null,
    transitionRequired: merged.transitionRequired === true,
    setupPlacementRequired: merged.setupPlacementRequired === true,
    layeredStateRequired: merged.layeredStateRequired === true,
    faceStateRequired: merged.faceStateRequired === true,
    cardFamilyRequired: merged.cardFamilyRequired === true,
    trackStateRequired: merged.trackStateRequired === true,
    oneShotMarkerRequired: merged.oneShotMarkerRequired === true,
    progressiveScoringRequired: merged.progressiveScoringRequired === true,
    comparisonGroupRequired: merged.comparisonGroupRequired === true,
    semanticFocusRequired: merged.semanticFocusRequired === true,
    discardPileRequired: merged.discardPileRequired === true,
    deckIdentityRequired: merged.deckIdentityRequired === true,
    representativeExamplesRequired: merged.representativeExamplesRequired === true,
    actualGameAssetRequired: merged.actualGameAssetRequired !== false,
    physicalState: merged.physicalState && typeof merged.physicalState === 'object' ? merged.physicalState : null,
    preferredComposition: clean(merged.preferredComposition) || 'SPLIT_CONTAIN_CENTERED',
    diagramKind: clean(merged.diagramKind) || null,
    ageIndexes: [...new Set((merged.ageIndexes || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0))],
    highlightLabel: clean(merged.highlightLabel) || null,
    forbiddenContent: unique(merged.forbiddenContent?.map(clean)),
    textLanguagePreference: clean(merged.textLanguagePreference) || 'fr-CA-or-text-light',
    minimumEffectiveResolution: {
      width: Math.max(1, Number(merged.minimumEffectiveResolution?.width) || 960),
      height: Math.max(1, Number(merged.minimumEffectiveResolution?.height) || 540),
      maxScalePreferred: Math.max(1, Number(merged.minimumEffectiveResolution?.maxScalePreferred) || 1.15),
      maxScaleHard: Math.max(1, Number(merged.minimumEffectiveResolution?.maxScaleHard) || 1.35),
    },
    cropCompleteness: clean(merged.cropCompleteness) || 'all-required-semantic-content-visible',
    cropPurity: clean(merged.cropPurity) || 'unrelated-content-absent-or-subordinate',
  };
}

function normalizeRuleAtom(atom = {}, sourcePdfSha256 = null) {
  const sourceRefs = normalizeSourceRefs(atom.sourceRefs).map((ref) => ({ ...ref, sourcePdfSha256: ref.sourcePdfSha256 || sourcePdfSha256 }));
  return {
    id: clean(atom.id),
    domain: clean(atom.domain),
    coverageDomains: unique((atom.coverageDomains || []).map(clean)),
    title: clean(atom.title),
    actor: clean(atom.actor) || null,
    trigger: clean(atom.trigger) || null,
    mandatoryOrOptional: ['mandatory', 'optional', 'conditional'].includes(atom.mandatoryOrOptional) ? atom.mandatoryOrOptional : 'mandatory',
    prerequisites: unique((atom.prerequisites || []).map(clean)),
    choice: clean(atom.choice) || null,
    costs: Array.isArray(atom.costs) ? atom.costs.map((cost) => ({ ...cost, description: clean(cost.description) })).filter((cost) => cost.description || cost.formula) : [],
    procedureSteps: (atom.procedureSteps || []).map(clean).filter(Boolean),
    placement: clean(atom.placement) || null,
    orientation: clean(atom.orientation) || null,
    stateBefore: clean(atom.stateBefore) || null,
    stateChange: clean(atom.stateChange) || null,
    stateAfter: clean(atom.stateAfter) || null,
    result: clean(atom.result) || null,
    followUp: clean(atom.followUp) || null,
    exceptions: unique((atom.exceptions || []).map(clean)),
    componentRefs: unique((atom.componentRefs || []).map(String)),
    terminologyRefs: unique((atom.terminologyRefs || []).map(String)),
    visualRequirement: normalizeVisualRequirement(atom.visualRequirement, atom),
    sourceRefs,
    confidence: Math.max(0, Math.min(1, Number(atom.confidence) || 0)),
    reviewState: atom.reviewState || (sourceRefs.length && Number(atom.confidence) >= 0.8 ? 'accepted' : 'review-required'),
    teaching: atom.teaching ? {
      majorSection: clean(atom.teaching.majorSection),
      heading: clean(atom.teaching.heading || atom.title),
      narration: clean(atom.teaching.narration),
      displayLines: (atom.teaching.displayLines || []).map(clean).filter(Boolean),
      profile: clean(atom.teaching.profile) || 'AMELIE_TEACHING_WARM_R10',
      sequence: Number(atom.teaching.sequence) || 0,
      pauseCue: clean(atom.teaching.pauseCue) || null,
    } : null,
  };
}

function validateRuleAtom(atom) {
  const issues = [];
  if (!atom.id) issues.push('missing-id');
  if (!atom.domain) issues.push('missing-domain');
  if (!atom.title) issues.push('missing-title');
  if (!atom.sourceRefs.length) issues.push('missing-source-refs');
  if (!atom.visualRequirement.purpose) issues.push('missing-visual-purpose');
  if (!atom.visualRequirement.requiredObjects.length) issues.push('missing-required-objects');
  if (atom.domain === 'action') {
    if (!atom.choice) issues.push('missing-choice');
    if (!atom.procedureSteps.length) issues.push('missing-procedure');
    if (!atom.stateChange) issues.push('missing-state-change');
    if (!atom.stateAfter) issues.push('missing-state-after');
    if (!atom.result) issues.push('missing-result');
    if (!atom.componentRefs.length) issues.push('missing-components');
  }
  return { valid: issues.length === 0, issues };
}

function buildDocumentMap(pages = [], seedSections = []) {
  const map = [];
  for (const section of seedSections || []) {
    map.push({ title: clean(section.title), pageStart: Number(section.pageStart), pageEnd: Number(section.pageEnd || section.pageStart), role: clean(section.role) || null, source: 'reviewed-project-seed' });
  }
  for (const page of pages || []) {
    const text = clean(page.text || page.content || '');
    if (!text) continue;
    const heading = text.match(/^(CONTENTS|PREPARATION|GAME OVERVIEW|END OF GAME|MILITARY|SCIENCE|SCORING|SETUP|COMPONENTS?)[^.!?]*/i)?.[0];
    if (heading && !map.some((entry) => entry.pageStart === Number(page.page || page.number))) {
      map.push({ title: clean(heading), pageStart: Number(page.page || page.number), pageEnd: Number(page.page || page.number), role: 'detected', source: 'deterministic-heading-map' });
    }
  }
  return map.sort((a, b) => a.pageStart - b.pageStart || a.title.localeCompare(b.title));
}

function resolveCrossReferences(atoms, terminology) {
  const terms = new Map((terminology || []).map((term) => [String(term.id), term]));
  return atoms.map((atom) => ({
    ...atom,
    resolvedTerminology: atom.terminologyRefs.map((id) => terms.get(id)).filter(Boolean).map((term) => ({ id: term.id, display: term.displayFrCa || term.display || term.source, definition: term.definition, sourceRefs: normalizeSourceRefs(term.sourceRefs) })),
  }));
}

function findContradictions(atoms) {
  const byId = new Map();
  const conflicts = [];
  for (const atom of atoms) {
    if (!byId.has(atom.id)) byId.set(atom.id, atom);
    else if (hashValue(byId.get(atom.id)) !== hashValue(atom)) conflicts.push({ atomId: atom.id, issue: 'duplicate-id-with-different-content', sourceRefs: [...byId.get(atom.id).sourceRefs, ...atom.sourceRefs] });
  }
  return conflicts;
}

function buildTutorialCoverageMatrix(model, pipelineState = {}) {
  const includedAtomIds = new Set(pipelineState.includedAtomIds || model.ruleAtoms.filter((atom) => atom.teaching?.narration).map((atom) => atom.id));
  const storyboardAtomIds = new Set(pipelineState.storyboardAtomIds || []);
  const visualizedAtomIds = new Set(pipelineState.visualizedAtomIds || []);
  const narratedAtomIds = new Set(pipelineState.narratedAtomIds || []);
  const applicability = model.coverageApplicability || {};
  const domains = COVERAGE_DOMAINS.map((domain) => {
    const atoms = model.ruleAtoms.filter((atom) => atom.coverageDomains.includes(domain));
    const applicable = applicability[domain] !== undefined ? Boolean(applicability[domain]) : atoms.length > 0;
    const accepted = atoms.filter((atom) => atom.reviewState === 'accepted' && atom.confidence >= 0.8);
    const sourceEvidenceExists = !applicable || (atoms.length > 0 && atoms.every((atom) => atom.sourceRefs.length > 0));
    const extracted = !applicable || accepted.length === atoms.length;
    const reviewed = !applicable || atoms.every((atom) => atom.reviewState === 'accepted');
    const includedInScript = !applicable || atoms.every((atom) => includedAtomIds.has(atom.id));
    const includedInStoryboard = !applicable || atoms.every((atom) => storyboardAtomIds.has(atom.id));
    const visualized = !applicable || atoms.every((atom) => visualizedAtomIds.has(atom.id));
    const narrationGenerated = !applicable || atoms.every((atom) => narratedAtomIds.has(atom.id));
    const complete = sourceEvidenceExists && extracted && reviewed && includedInScript && includedInStoryboard && visualized && narrationGenerated;
    return { domain, highPriority: HIGH_PRIORITY_DOMAINS.has(domain), applicable, atomIds: atoms.map((atom) => atom.id), sourceEvidenceExists, extracted, reviewed, includedInScript, includedInStoryboard, visualized, narrationGenerated, qaState: !applicable ? 'NOT_APPLICABLE' : complete ? 'PASS' : 'MISSING' };
  });
  return {
    contract: TUTORIAL_COVERAGE_VERSION,
    projectId: model.projectId,
    sourcePdfSha256: model.sourcePdfSha256,
    domains,
    missingHighPriorityDomains: domains.filter((entry) => entry.applicable && entry.highPriority && entry.qaState !== 'PASS').map((entry) => entry.domain),
    status: domains.some((entry) => entry.applicable && entry.highPriority && entry.qaState !== 'PASS') ? 'FAIL' : 'PASS',
  };
}

function buildRulebookKnowledgeModel({ projectSeed = {}, pages = [], gameplayModel = null, endgameModel = null } = {}) {
  const sourcePdfSha256 = clean(projectSeed.sourcePdfSha256);
  const rawAtoms = [...(projectSeed.ruleAtoms || [])];
  if (gameplayModel) {
    for (const action of gameplayModel.actions || []) {
      if (rawAtoms.some((atom) => atom.id === action.id)) continue;
      rawAtoms.push({
      id: action.id,
      domain: 'action',
      coverageDomains: ['mandatory_actions'],
      title: action.name,
      actor: 'joueur actif',
      choice: action.purpose,
      procedureSteps: [action.stateChange?.action].filter(Boolean),
      stateBefore: action.stateChange?.before,
      stateChange: action.stateChange?.action,
      stateAfter: action.stateChange?.after,
      result: action.nextState,
      componentRefs: action.componentRefs,
      sourceRefs: action.sourceRefs,
      confidence: action.confidence,
      reviewState: action.reviewState,
      visualRequirement: { purpose: action.purpose, requiredObjects: action.componentRefs, beforeState: action.stateChange?.before, afterState: action.stateChange?.after },
      });
    }
  }
  if (endgameModel) {
    for (const category of endgameModel.scoringCategories || []) {
      const id = `scoring-${category.id}`;
      if (rawAtoms.some((atom) => atom.id === id)) continue;
      rawAtoms.push({
      id,
      domain: 'scoring',
      coverageDomains: ['final_scoring'],
      title: category.label,
      result: category.description,
      componentRefs: category.componentRefs,
      sourceRefs: category.sourceRefs,
      confidence: category.confidence,
      reviewState: category.reviewState,
      visualRequirement: { purpose: category.description, requiredObjects: category.componentRefs },
      });
    }
  }
  const atoms = resolveCrossReferences(rawAtoms.map((atom) => normalizeRuleAtom(atom, sourcePdfSha256)), projectSeed.terminology || []);
  const validations = atoms.map((atom) => ({ atomId: atom.id, ...validateRuleAtom(atom) }));
  const contradictions = findContradictions(atoms);
  const uncertainties = [
    ...(projectSeed.uncertainties || []),
    ...validations.filter((item) => !item.valid).map((item) => ({ atomId: item.atomId, issues: item.issues })),
    ...contradictions,
  ];
  const model = {
    contract: RULEBOOK_KNOWLEDGE_MODEL_VERSION,
    pipelineVersion: RULEBOOK_INTELLIGENCE_PIPELINE_VERSION,
    projectId: projectSeed.projectId || null,
    gameIdentity: projectSeed.gameIdentity || null,
    sourcePdfSha256,
    terminology: projectSeed.terminology || [],
    components: projectSeed.components || [],
    setupSteps: atoms.filter((atom) => atom.domain === 'setup'),
    turnStructure: projectSeed.turnStructure || null,
    actions: atoms.filter((atom) => atom.domain === 'action'),
    triggeredEffects: atoms.filter((atom) => atom.domain === 'triggered_effect'),
    optionalRules: atoms.filter((atom) => atom.mandatoryOrOptional === 'optional'),
    endConditions: atoms.filter((atom) => atom.domain === 'end_condition'),
    victoryConditions: atoms.filter((atom) => atom.domain === 'victory'),
    scoringRules: atoms.filter((atom) => atom.domain === 'scoring'),
    tieBreakers: atoms.filter((atom) => atom.domain === 'tie_breaker'),
    examples: projectSeed.examples || [],
    referenceAids: atoms.filter((atom) => atom.domain === 'reference_aid'),
    diagramData: projectSeed.diagramData || {},
    ruleAtoms: atoms,
    documentMap: buildDocumentMap(pages, projectSeed.documentMap || []),
    coverageApplicability: projectSeed.coverageApplicability || {},
    sourceMap: Object.fromEntries(atoms.map((atom) => [atom.id, atom.sourceRefs])),
    uncertainties,
    contradictionCheck: { status: contradictions.length ? 'REVIEW_REQUIRED' : 'PASS', conflicts: contradictions },
    completenessCritic: {
      incompleteAtoms: validations.filter((item) => !item.valid),
      unmodeledDocumentSections: (projectSeed.documentMap || []).filter((section) => !(section.atomIds || []).length).map((section) => section.title),
    },
    modelVersion: projectSeed.modelVersion || '1.0.0',
    generatedAt: new Date().toISOString(),
  };
  model.coverage = buildTutorialCoverageMatrix(model);
  model.cacheKey = hashValue({
    sourcePdfSha256,
    extractionModel: projectSeed.extractionModel || 'deterministic-source-review',
    promptSchemaVersion: RULEBOOK_INTELLIGENCE_PIPELINE_VERSION,
    projectDataVersion: projectSeed.modelVersion || null,
    // Project data can evolve without a schema-version bump during a bounded
    // editorial repair. The cache must follow the actual canonical seed, not
    // only its label, or corrected narration/rule evidence can be shadowed by
    // a stale knowledge model.
    projectSeedHash: hashValue(projectSeed),
    locale: projectSeed.gameIdentity?.locale || 'fr-CA',
    edition: projectSeed.gameIdentity?.edition || null,
  });
  return model;
}

async function runMultiPassRulebookIntelligence({ projectSeed, pages = [], gameplayModel = null, endgameModel = null, cachePath = null } = {}) {
  const key = hashValue({
    sourcePdfSha256: projectSeed?.sourcePdfSha256,
    extractionModel: projectSeed?.extractionModel || 'deterministic-source-review',
    promptSchemaVersion: RULEBOOK_INTELLIGENCE_PIPELINE_VERSION,
    projectDataVersion: projectSeed?.modelVersion || null,
    projectSeedHash: hashValue(projectSeed || {}),
    locale: projectSeed?.gameIdentity?.locale || 'fr-CA',
    edition: projectSeed?.gameIdentity?.edition || null,
  });
  if (cachePath && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.cacheKey === key && cached.contract === RULEBOOK_KNOWLEDGE_MODEL_VERSION) return { model: cached, cacheHit: true, passesExecuted: 0 };
  }
  const model = buildRulebookKnowledgeModel({ projectSeed, pages, gameplayModel, endgameModel });
  if (cachePath) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(model, null, 2)}\n`);
  }
  return { model, cacheHit: false, passesExecuted: 5 };
}

function buildKnowledgeTeachingPlan(model) {
  const atoms = model.ruleAtoms.filter((atom) => atom.reviewState === 'accepted' && atom.teaching?.narration).sort((a, b) => a.teaching.sequence - b.teaching.sequence || a.id.localeCompare(b.id));
  return {
    contract: 'mobius-knowledge-teaching-plan-v1',
    projectId: model.projectId,
    scenes: atoms.map((atom) => ({ atomId: atom.id, majorSection: atom.teaching.majorSection, heading: atom.teaching.heading, narration: atom.teaching.narration, displayLines: atom.teaching.displayLines, profile: atom.teaching.profile, pauseCue: atom.teaching.pauseCue, visualRequirement: atom.visualRequirement, sourceRefs: atom.sourceRefs })),
  };
}

module.exports = {
  COVERAGE_DOMAINS,
  HIGH_PRIORITY_DOMAINS,
  RULEBOOK_INTELLIGENCE_PIPELINE_VERSION,
  RULEBOOK_KNOWLEDGE_MODEL_VERSION,
  TUTORIAL_COVERAGE_VERSION,
  buildDocumentMap,
  buildKnowledgeTeachingPlan,
  buildRulebookKnowledgeModel,
  buildTutorialCoverageMatrix,
  normalizeRuleAtom,
  normalizeVisualRequirement,
  inferVisualRequirement,
  runMultiPassRulebookIntelligence,
  validateRuleAtom,
};
