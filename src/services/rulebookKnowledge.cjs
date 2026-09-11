const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT,
  buildDomainSynthesisPackets,
} = require('./rulebookDomainSynthesis.cjs');

const RULEBOOK_KNOWLEDGE_MODEL_VERSION = 'mobius-rulebook-knowledge-v1.2';
const RULEBOOK_INTELLIGENCE_PIPELINE_VERSION = 'mobius-rulebook-intelligence-multipass-v1.3.0';
const RULEATOM_CONTRACT_VERSION = 'mobius-rule-atom-v1.1';
const TUTORIAL_COVERAGE_VERSION = 'mobius-tutorial-coverage-v1.2';
const RULEBOOK_DOCUMENT_MAP_VERSION = 'mobius-rulebook-document-map-v1';
const RULE_REVIEW_QUEUE_VERSION = 'mobius-cockpit-rule-review-queue-v3';

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
const slug = (value) => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

// These are retrieval hints, not game facts. They deliberately cover both the
// source language and the fr-CA tutorial language so an English rulebook can
// still produce a French production without losing evidence provenance.
const DOMAIN_RETRIEVAL_PATTERNS = Object.freeze({
  identity_theme: /\b(game overview|overview|introduction|theme|welcome|présentation|aperçu)\b/i,
  objective: /\b(objective|goal|win|winner|victory|objectif|but|gagne|victoire)\b/i,
  components: /\b(components?|contents?|component description|matériel|contenu)\b/i,
  complete_setup: /\b(set[ -]?up|preparation|prepare|mise en place|installer)\b/i,
  first_player_rule: /\b(first player|starting player|start the game|premier joueur)\b/i,
  turn_round_age_structure: /\b(turn|round|phase|sequence|playing a turn|tour|manche|phase)\b/i,
  mandatory_actions: /\b(actions?|play(?:ing)? cards?|move|purchase|confront|capture|jouer|déplacer|acheter|affronter|capturer)\b/i,
  alternative_actions: /\b(instead|alternative|or you may|au lieu|alternativement)\b/i,
  optional_actions: /\b(optional|may choose|not mandatory|facultatif|peut choisir|non obligatoire)\b/i,
  costs_resources_payment: /\b(cost|pay|fuel|resource|money|coin|coût|payer|ressource|carburant|pièce)\b/i,
  component_placement_orientation: /\b(place|position|face down|face up|orientation|discard pile|placer|positionner|face cachée|face visible)\b/i,
  triggered_effects: /\b(when |whenever|after |trigger|effect|lorsque|quand|après|effet)\b/i,
  major_special_systems: /\b(character|criminal|mission|bounty|track|gauge|deckbuilding|personnage|mission|piste|jauge)\b/i,
  end_condition: /\b(end(?:ing)? the game|game ends|end of game|fin de partie|la partie se termine)\b/i,
  immediate_victories: /\b(immediate victory|instantly win|victoire immédiate|gagne immédiatement)\b/i,
  final_scoring: /\b(score|scoring|points?|renown|décompte|points?|score)\b/i,
  tie_breakers: /\b(tie|tiebreak|égalité|départage)\b/i,
  first_game_pitfalls: /\b(important|remember|note that|warning|attention|rappel)\b/i,
  reference_aids_score_sheet: /\b(reference|score sheet|aid|résumé|feuille de score|aide)\b/i,
});

function normalizeSourceRefs(sourceRefs = []) {
  return (Array.isArray(sourceRefs) ? sourceRefs : []).map((ref) => ({
    page: Number.isInteger(Number(ref?.page)) && Number(ref.page) > 0 ? Number(ref.page) : null,
    section: clean(ref?.section) || null,
    quote: clean(ref?.quote) || null,
    excerptHash: clean(ref?.excerptHash) || null,
    startOffset: Number.isInteger(Number(ref?.startOffset)) && Number(ref.startOffset) >= 0 ? Number(ref.startOffset) : null,
    endOffset: Number.isInteger(Number(ref?.endOffset)) && Number(ref.endOffset) >= 0 ? Number(ref.endOffset) : null,
    sourcePdfSha256: clean(ref?.sourcePdfSha256) || null,
  // Sections without a real, one-based source page are routing hints, never
  // canonical citations. Keeping them caused stale draft atoms to masquerade
  // as grounded evidence after a contract upgrade.
  })).filter((ref) => ref.page !== null);
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

function domainRequiredIssues(atom, coverageDomain = atom.domain) {
  const issues = [];
  if (coverageDomain === 'complete_setup' && (!atom.procedureSteps.length || !atom.componentRefs.length)) issues.push('setup-missing-procedure-or-components');
  if (coverageDomain === 'mandatory_actions' && (!atom.choice || !atom.procedureSteps.length || !atom.stateChange || !atom.stateAfter || !atom.result || !atom.componentRefs.length)) issues.push('action-transition-incomplete');
  if (coverageDomain === 'component_placement_orientation' && (!atom.componentRefs.length || !(atom.placement || atom.orientation || atom.stateChange))) issues.push('placement-orientation-incomplete');
  if (coverageDomain === 'final_scoring' && (!atom.result || !atom.sourceRefs.length)) issues.push('scoring-evidence-incomplete');
  return issues;
}

function validateRuleAtom(atom) {
  const issues = [];
  if (!atom.id) issues.push('missing-id');
  if (!atom.domain) issues.push('missing-domain');
  if (!atom.title) issues.push('missing-title');
  if (!atom.sourceRefs.length) issues.push('missing-source-refs');
  // A rule may be fully grounded before component binding is complete.  Only
  // domains that intrinsically describe physical objects require those refs;
  // identity and objective atoms must not become artificial review work.
  if (['setup', 'action', 'triggered_effect', 'scoring', 'victory', 'end_condition'].includes(atom.domain) && !atom.visualRequirement.purpose) issues.push('missing-visual-purpose');
  if (['setup', 'action'].includes(atom.domain) && !atom.visualRequirement.requiredObjects.length) issues.push('missing-required-objects');
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

function detectPageHeading(text) {
  const normalized = clean(text);
  const first = normalized.slice(0, 260);
  const match = first.match(/^(?:\d+\s*)?([A-Z][A-Za-zÀ-ÿ'’:&\- ]{2,80})(?=\s+(?:is|are|the|a|an|to|for|:|–|-)|$)/);
  return clean(match?.[1]) || null;
}

function buildDocumentMap(pages = [], seedSections = []) {
  let cursor = 0;
  const pageEntries = (pages || []).map((page, index) => {
    const physicalPage = Number(page.page ?? page.number);
    // The public/source-facing contract is one-based. Page 0 may exist in
    // parser diagnostics but is never a citeable rulebook page.
    const humanPage = Number.isInteger(physicalPage) && physicalPage > 0 ? physicalPage : index + 1;
    const text = clean(page.text || page.content || '');
    const startOffset = cursor;
    cursor += text.length + 2;
    const endOffset = cursor;
    const heading = clean(page.heading) || detectPageHeading(text);
    return {
      id: `pdf-page-${humanPage}`,
      pdfPageIndex: humanPage - 1,
      physicalPage,
      humanPageNumber: humanPage,
      pageStart: humanPage,
      pageEnd: humanPage,
      title: heading || `Page ${humanPage}`,
      heading,
      normalizedText: text,
      textHash: crypto.createHash('sha256').update(text).digest('hex'),
      startOffset,
      endOffset,
      extractionConfidence: text ? 1 : 0,
      contentKind: !text ? 'empty' : text.length < 80 ? 'image-dominant' : 'text-rich',
      role: 'source-page',
      provenance: { source: 'pdf-extraction', physicalPage: humanPage, citationConvention: 'one-based-pdf-page' },
    };
  }).filter((entry) => entry.humanPageNumber > 0);
  const sections = (seedSections || []).map((section, index) => ({
    id: clean(section.id) || `seed-section-${index + 1}`,
    title: clean(section.title) || `Section ${index + 1}`,
    pageStart: Math.max(1, Number(section.pageStart) || 1),
    pageEnd: Math.max(1, Number(section.pageEnd || section.pageStart) || 1),
    role: clean(section.role) || 'reviewed-project-seed',
    source: 'reviewed-project-seed',
    atomIds: Array.isArray(section.atomIds) ? section.atomIds : [],
  }));
  const detectedSections = [...sections, ...pageEntries.filter((entry) => entry.heading).map((entry) => ({ title: entry.heading, pageStart: entry.humanPageNumber, pageEnd: entry.humanPageNumber, role: 'detected', source: 'deterministic-heading-map', atomIds: [] }))]
    .sort((a, b) => a.pageStart - b.pageStart || a.title.localeCompare(b.title));
  return { contract: RULEBOOK_DOCUMENT_MAP_VERSION, citationConvention: 'one-based-pdf-page', pages: pageEntries, sections: detectedSections };
}

function sourceRefsForOffsets(sourceRefs, documentMap) {
  const pages = documentMap?.pages || [];
  const found = new Map();
  for (const ref of sourceRefs || []) {
    const start = Number(ref?.startOffset);
    const end = Number(ref?.endOffset);
    for (const page of pages) {
      if (Number.isFinite(start) && Number.isFinite(end) && end >= page.startOffset && start <= page.endOffset) {
        const quote = clean(page.normalizedText.slice(Math.max(0, start - page.startOffset), Math.min(page.normalizedText.length, end - page.startOffset))) || page.normalizedText.slice(0, 320);
        found.set(page.humanPageNumber, { page: page.humanPageNumber, section: page.heading || page.title, quote: quote.slice(0, 420), excerptHash: crypto.createHash('sha256').update(quote).digest('hex'), startOffset: start, endOffset: end });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.page - b.page);
}

function retrieveDomainEvidence(documentMap, domain) {
  const pattern = DOMAIN_RETRIEVAL_PATTERNS[domain];
  if (!pattern) return [];
  return (documentMap?.pages || []).filter((page) => pattern.test(`${page.heading || ''} ${page.normalizedText}`)).slice(0, 5).map((page) => {
    const matched = page.normalizedText.match(new RegExp(`.{0,160}${pattern.source}.{0,220}`, pattern.flags.replace('g', '')))?.[0] || page.normalizedText.slice(0, 420);
    const quote = clean(matched).slice(0, 420);
    return { page: page.humanPageNumber, section: page.heading || page.title, quote, excerptHash: crypto.createHash('sha256').update(quote).digest('hex') };
  });
}

function classifyCoverageDomains(text) {
  return COVERAGE_DOMAINS.filter((domain) => DOMAIN_RETRIEVAL_PATTERNS[domain]?.test(text));
}

function atomsFromSourceSections(projectSeed, documentMap) {
  const sections = projectSeed.rulebookSections || projectSeed.scriptPackage?.sections || [];
  return sections.flatMap((section, index) => {
    const text = clean([section.title, section.spokenText, section.narration, ...(section.visualDirections || []).map((item) => item.instruction || item.onScreenText || '')].join(' '));
    const coverageDomains = unique([...(section.coverageDomains || []), ...classifyCoverageDomains(text)]);
    if (!coverageDomains.length) return [];
    const refs = sourceRefsForOffsets(section.sources || section.sourceRefs || [], documentMap);
    const componentRefs = unique([...(section.componentRefs || []), ...(section.visualDirections || []).flatMap((item) => item.componentRefs || [])]);
    return coverageDomains.map((coverageDomain) => ({
      id: `source-evidence-${slug(section.id || section.title || index + 1)}-${coverageDomain}`,
      domain: coverageDomain === 'mandatory_actions' ? 'action' : coverageDomain === 'final_scoring' ? 'scoring' : coverageDomain === 'complete_setup' ? 'setup' : 'source_evidence',
      coverageDomains: [coverageDomain],
      title: clean(section.title) || coverageDomain,
      actor: null,
      choice: coverageDomain === 'mandatory_actions' ? clean(section.title) : null,
      procedureSteps: text ? [text] : [],
      stateChange: coverageDomain === 'mandatory_actions' ? text : null,
      stateAfter: null,
      result: coverageDomain === 'final_scoring' ? text : null,
      componentRefs,
      sourceRefs: refs,
      confidence: refs.length ? 0.68 : 0.35,
      reviewState: 'review-required',
      provenance: { stage: 'source-section-evidence', sectionId: section.id || null },
    }));
  });
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
  const knowledgeOnly = pipelineState.knowledgeOnly === true;
  const includedAtomIds = new Set(pipelineState.includedAtomIds || model.ruleAtoms.filter((atom) => atom.teaching?.narration).map((atom) => atom.id));
  const storyboardAtomIds = new Set(pipelineState.storyboardAtomIds || []);
  const visualizedAtomIds = new Set(pipelineState.visualizedAtomIds || []);
  const narratedAtomIds = new Set(pipelineState.narratedAtomIds || []);
  const applicability = model.coverageApplicability || {};
  const domains = COVERAGE_DOMAINS.map((domain) => {
    const atoms = model.ruleAtoms.filter((atom) => atom.coverageDomains.includes(domain));
    const applicable = applicability[domain] !== undefined ? Boolean(applicability[domain]) : atoms.length > 0;
    const accepted = atoms.filter((atom) => atom.reviewState === 'accepted' && atom.confidence >= 0.8 && domainRequiredIssues(atom, domain).length === 0);
    // A domain is covered by an accepted, evidence-bound atom.  Draft or
    // superseded candidates must not poison coverage merely because they have
    // the same broad domain label.
    const sourceEvidenceExists = !applicable || accepted.some((atom) => atom.sourceRefs.length > 0);
    const extracted = !applicable || accepted.length > 0;
    const reviewed = !applicable || accepted.length > 0;
    const includedInScript = knowledgeOnly || !applicable || accepted.every((atom) => includedAtomIds.has(atom.id));
    const includedInStoryboard = knowledgeOnly || !applicable || accepted.every((atom) => storyboardAtomIds.has(atom.id));
    const visualized = knowledgeOnly || !applicable || accepted.every((atom) => visualizedAtomIds.has(atom.id));
    const narrationGenerated = knowledgeOnly || !applicable || accepted.every((atom) => narratedAtomIds.has(atom.id));
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

function canonicalTeaching(atom, sequence) {
  const narration = clean(atom.procedureSteps?.join(' ') || atom.result || atom.stateChange || atom.title);
  if (!narration) return null;
  return {
    majorSection: atom.coverageDomains?.[0] || atom.domain || 'rules',
    heading: atom.title,
    narration,
    displayLines: [atom.title],
    profile: 'AMELIE_TEACHING_WARM_R10',
    sequence,
    pauseCue: null,
  };
}

function normalizedLegacyAtom(raw, sourcePdfSha256) {
  const normalized = normalizeRuleAtom(raw, sourcePdfSha256);
  // Legacy draft-derived action/endgame artifacts often carried section names
  // without a citeable page. They remain historical evidence, never canonical
  // RuleAtoms after the v1.1 evidence contract.
  return normalized.sourceRefs.length ? raw : null;
}

function buildRulebookKnowledgeModel({ projectSeed = {}, pages = [], gameplayModel = null, endgameModel = null, synthesizedAtoms = [], synthesisTelemetry = null } = {}) {
  const sourcePdfSha256 = clean(projectSeed.sourcePdfSha256);
  const documentMap = buildDocumentMap(pages, projectSeed.documentMap || []);
  const rawAtoms = (projectSeed.ruleAtoms || []).map((atom) => normalizedLegacyAtom(atom, sourcePdfSha256)).filter(Boolean);
  // Draft sections are retrieval routing only. They are not source authority
  // and cannot become canonical atoms until provider synthesis binds them to
  // document-map evidence.
  if (gameplayModel) {
    for (const action of gameplayModel.actions || []) {
      if (rawAtoms.some((atom) => atom.id === action.id)) continue;
      const candidate = normalizedLegacyAtom({
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
      }, sourcePdfSha256);
      if (candidate) rawAtoms.push(candidate);
    }
  }
  if (endgameModel) {
    for (const category of endgameModel.scoringCategories || []) {
      const id = `scoring-${category.id}`;
      if (rawAtoms.some((atom) => atom.id === id)) continue;
      const candidate = normalizedLegacyAtom({
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
      }, sourcePdfSha256);
      if (candidate) rawAtoms.push(candidate);
    }
  }
  const synthesized = (synthesizedAtoms || []).map((atom) => ({ ...atom, teaching: atom.teaching || canonicalTeaching(atom, 1000) }));
  const atoms = resolveCrossReferences([...rawAtoms, ...synthesized].map((atom) => normalizeRuleAtom(atom, sourcePdfSha256)), projectSeed.terminology || []);
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
    documentMap,
    coverageApplicability: projectSeed.coverageApplicability || Object.fromEntries(COVERAGE_DOMAINS.map((domain) => [domain, retrieveDomainEvidence(documentMap, domain).length > 0])),
    sourceMap: Object.fromEntries(atoms.map((atom) => [atom.id, atom.sourceRefs])),
    uncertainties,
    contradictionCheck: { status: contradictions.length ? 'REVIEW_REQUIRED' : 'PASS', conflicts: contradictions },
    completenessCritic: {
      incompleteAtoms: validations.filter((item) => !item.valid),
      unmodeledDocumentSections: documentMap.sections.filter((section) => !(section.atomIds || []).length).map((section) => section.title),
    },
    modelVersion: projectSeed.modelVersion || '1.0.0',
    generatedAt: new Date().toISOString(),
  };
  model.coverage = buildTutorialCoverageMatrix(model, { knowledgeOnly: true });
  // A missing domain is not immediately a human task. Record the bounded,
  // deterministic source search performed first, including usable excerpts so
  // the Cockpit can distinguish "no evidence found" from "evidence needs a
  // decision". A future structured provider pass may append to these same
  // attempts; it does not own a parallel knowledge store.
  model.coverageDrivenRetrieval = Object.fromEntries(model.coverage.domains
    .filter((entry) => entry.applicable && entry.qaState !== 'PASS')
    .map((entry) => {
      const evidence = retrieveDomainEvidence(documentMap, entry.domain);
      const existing = atoms.filter((atom) => atom.coverageDomains.includes(entry.domain) && atom.reviewState === 'accepted' && domainRequiredIssues(atom, entry.domain).length === 0);
      const synthesis = evidence.length
        ? { method: 'domain-specific-source-synthesis-v1', status: existing.length ? 'ACCEPTED' : 'PENDING_PROVIDER_SYNTHESIS', evidence, reason: existing.length ? 'Evidence-bound domain atoms were accepted.' : 'Official evidence was retrieved and awaits structured provider synthesis.' }
        : { method: 'domain-specific-source-synthesis-v1', status: 'NO_SOURCE_EVIDENCE_FOUND', evidence: [], reason: 'No matching authoritative source span was found by the bounded retrieval pass.' };
      return [entry.domain, {
        domain: entry.domain,
        status: 'EXHAUSTED_DETERMINISTIC_SOURCE_SEARCH',
        attempts: [{ method: 'document-map-keyword-retrieval-v1', evidence }, synthesis],
      }];
    }));
  model.cacheKey = hashValue({
    sourcePdfSha256,
    extractionModel: projectSeed.extractionModel || 'deterministic-source-review',
    promptSchemaVersion: RULEBOOK_INTELLIGENCE_PIPELINE_VERSION,
    ruleAtomContract: RULEATOM_CONTRACT_VERSION,
    synthesisContract: RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT,
    projectDataVersion: projectSeed.modelVersion || null,
    // Project data can evolve without a schema-version bump during a bounded
    // editorial repair. The cache must follow the actual canonical seed, not
    // only its label, or corrected narration/rule evidence can be shadowed by
    // a stale knowledge model.
    projectSeedHash: hashValue(projectSeed),
    locale: projectSeed.gameIdentity?.locale || 'fr-CA',
    edition: projectSeed.gameIdentity?.edition || null,
  });
  model.synthesisTelemetry = synthesisTelemetry || { contract: RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT, providerCalls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, packets: [] };
  return model;
}

function reviewSourceRefs(model, atomId = null, domain = null) {
  if (atomId) return model.ruleAtoms.find((atom) => atom.id === atomId)?.sourceRefs || [];
  const retrieval = model.coverageDrivenRetrieval?.[domain];
  return retrieval?.attempts?.flatMap((attempt) => attempt.evidence || []) || [];
}

function reviewItem({ model, category, domain = null, atomId = null, scopeType = null, missingFields = [], reason, priority = null, candidates = [] }) {
  const normalizedDomain = clean(domain) || null;
  const normalizedAtomId = clean(atomId) || null;
  const normalizedScopeType = scopeType || (normalizedAtomId ? 'RULE_ATOM' : normalizedDomain ? 'DOMAIN' : 'CROSS_DOMAIN');
  const sourceRefs = normalizeSourceRefs(reviewSourceRefs(model, normalizedAtomId, normalizedDomain));
  const key = [model.sourcePdfSha256, category, normalizedDomain, normalizedAtomId, ...missingFields].join('|');
  return {
    id: `rule-review-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`,
    category,
    severity: priority || (normalizedDomain && HIGH_PRIORITY_DOMAINS.has(normalizedDomain) ? 'P1' : 'P2'),
    priority: priority || (normalizedDomain && HIGH_PRIORITY_DOMAINS.has(normalizedDomain) ? 'HIGH' : 'NORMAL'),
    scopeType: normalizedScopeType,
    domain: normalizedDomain,
    affectedRuleAtomIds: normalizedAtomId ? [normalizedAtomId] : [],
    reason: clean(reason),
    missingOrContradictoryFields: unique(missingFields.map(clean)),
    sourceRefs,
    evidenceExcerpts: sourceRefs.map((ref) => ({ page: ref.page, section: ref.section, quote: ref.quote, excerptHash: ref.excerptHash })).filter((ref) => ref.quote),
    confidence: normalizedAtomId ? Number(model.ruleAtoms.find((atom) => atom.id === normalizedAtomId)?.confidence || 0) : 0,
    automaticAttempts: normalizedDomain ? model.coverageDrivenRetrieval?.[normalizedDomain]?.attempts || [] : [],
    candidates: Array.isArray(candidates) ? candidates : [],
    recommendedOperatorAction: normalizedDomain
      ? `Review the cited official-rulebook evidence for ${normalizedDomain} and confirm, correct, or mark the domain not applicable.`
      : 'Review the cited official-rulebook evidence and confirm or correct the affected rule atom.',
    status: 'OPEN',
    provenance: { contract: RULE_REVIEW_QUEUE_VERSION, sourcePdfSha256: model.sourcePdfSha256, generatedBy: 'rulebook-knowledge-completeness-critic-v1' },
  };
}

function buildRuleReviewItems(model, coverage = model.coverage) {
  const items = [];
  for (const incomplete of model.completenessCritic?.incompleteAtoms || []) {
    const atom = model.ruleAtoms.find((entry) => entry.id === incomplete.atomId);
    items.push(reviewItem({ model, category: 'INCOMPLETE_RULE_ATOM', domain: atom?.coverageDomains?.[0] || atom?.domain, atomId: incomplete.atomId, missingFields: incomplete.issues || [], reason: 'The source-grounded atom lacks required fields for its rule type.' }));
  }
  for (const conflict of model.contradictionCheck?.conflicts || []) {
    items.push(reviewItem({ model, category: 'CONTRADICTORY_EVIDENCE', atomId: conflict.atomId, missingFields: [conflict.issue], reason: 'Source-grounded rule candidates conflict and require operator adjudication.' }));
  }
  for (const uncertainty of model.uncertainties || []) {
    if (!uncertainty?.atomId || (uncertainty.issues || []).length === 0) continue;
    const atom = model.ruleAtoms.find((entry) => entry.id === uncertainty.atomId);
    items.push(reviewItem({ model, category: 'RULE_UNCERTAINTY', domain: atom?.coverageDomains?.[0] || atom?.domain, atomId: uncertainty.atomId, missingFields: uncertainty.issues, reason: 'Automatic extraction retained uncertainty rather than inventing a rule.' }));
  }
  for (const domain of coverage.missingHighPriorityDomains || []) {
    items.push(reviewItem({ model, category: 'MISSING_HIGH_PRIORITY_DOMAIN', domain, scopeType: 'DOMAIN', missingFields: ['accepted-source-grounded-coverage'], reason: 'Bounded retrieval and structured source synthesis did not produce an accepted, complete rule atom.' }));
  }
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

function reviewItemContractIssues(item) {
  const issues = [];
  if (!['RULE_ATOM', 'DOMAIN', 'CROSS_DOMAIN'].includes(item?.scopeType)) issues.push('missing-or-invalid-scope-type');
  if (!clean(item?.id) || !clean(item?.category) || !clean(item?.reason) || !clean(item?.recommendedOperatorAction)) issues.push('missing-required-review-field');
  if (item?.scopeType === 'RULE_ATOM' && !(item.affectedRuleAtomIds || []).length) issues.push('rule-atom-scope-missing-atom');
  if (item?.scopeType === 'DOMAIN') {
    if (!clean(item.domain)) issues.push('domain-scope-missing-domain');
    if (!Array.isArray(item.automaticAttempts) || !item.automaticAttempts.length) issues.push('domain-scope-missing-automatic-attempts');
  }
  if (Array.isArray(item?.sourceRefs) && item.sourceRefs.some((ref) => !Number.isInteger(Number(ref?.page)) || Number(ref.page) < 1)) issues.push('invalid-source-page');
  return issues;
}

function evidenceByDomain(documentMap, coverage) {
  return Object.fromEntries((coverage?.domains || [])
    .filter((entry) => entry.applicable && entry.qaState !== 'PASS')
    .map((entry) => [entry.domain, retrieveDomainEvidence(documentMap, entry.domain)]));
}

function providerAtomFromPacket(raw, packet, sourcePdfSha256, index) {
  const evidence = new Map((packet.evidence || []).map((entry) => [entry.id, entry]));
  const sourceRefs = (raw?.sourceRefs || []).map((ref) => evidence.get(clean(ref?.evidenceId))).filter(Boolean).map((ref) => ({
    page: ref.page,
    section: ref.section,
    quote: ref.quote,
    excerptHash: ref.excerptHash,
    sourcePdfSha256,
  }));
  const coverageDomains = unique((raw?.coverageDomains || []).map(clean)).filter((domain) => packet.domains.includes(domain));
  const allowedComponentIds = new Set((packet.components || []).map((component) => component.id));
  const componentRefs = unique((raw?.componentRefs || []).map(clean)).filter((id) => allowedComponentIds.has(id));
  const idSeed = {
    sourcePdfSha256,
    batch: packet.batchId,
    coverageDomains,
    title: clean(raw?.title),
    refs: sourceRefs.map((ref) => ({ page: ref.page, excerptHash: ref.excerptHash })),
    index,
  };
  return {
    ...raw,
    id: `rule-${crypto.createHash('sha256').update(JSON.stringify(idSeed)).digest('hex').slice(0, 20)}`,
    coverageDomains,
    componentRefs,
    sourceRefs,
    confidence: 0.9,
    reviewState: 'accepted',
    provenance: {
      contract: RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT,
      batchId: packet.batchId,
      evidenceIds: (raw?.sourceRefs || []).map((ref) => clean(ref?.evidenceId)).filter(Boolean),
    },
  };
}

function validateProviderAtoms({ rawAtoms = [], packet, sourcePdfSha256 }) {
  const accepted = [];
  const rejected = [];
  for (const [index, raw] of rawAtoms.entries()) {
    const atom = providerAtomFromPacket(raw, packet, sourcePdfSha256, index);
    const normalized = normalizeRuleAtom(atom, sourcePdfSha256);
    const validation = validateRuleAtom(normalized);
    const domainIssues = unique(normalized.coverageDomains.flatMap((domain) => domainRequiredIssues(normalized, domain)));
    if (!normalized.coverageDomains.length) validation.issues.push('coverage-domain-not-requested');
    if (!normalized.sourceRefs.length) validation.issues.push('citation-not-in-evidence-packet');
    if (validation.issues.length || domainIssues.length) {
      rejected.push({ title: clean(raw?.title) || `atom-${index + 1}`, issues: unique([...validation.issues, ...domainIssues]) });
      continue;
    }
    accepted.push({ ...normalized, teaching: canonicalTeaching(normalized, index + 1) });
  }
  return { accepted, rejected };
}

async function runMultiPassRulebookIntelligence({ projectSeed, pages = [], gameplayModel = null, endgameModel = null, cachePath = null, synthesisCacheDir = null, providerContract = null, domainSynthesize = null } = {}) {
  const key = hashValue({
    sourcePdfSha256: projectSeed?.sourcePdfSha256,
    extractionModel: projectSeed?.extractionModel || 'deterministic-source-review',
    promptSchemaVersion: RULEBOOK_INTELLIGENCE_PIPELINE_VERSION,
    projectDataVersion: projectSeed?.modelVersion || null,
    projectSeedHash: hashValue(projectSeed || {}),
    locale: projectSeed?.gameIdentity?.locale || 'fr-CA',
    edition: projectSeed?.gameIdentity?.edition || null,
    ruleAtomContract: RULEATOM_CONTRACT_VERSION,
    synthesisContract: RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT,
    providerContract,
  });
  if (cachePath && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.cacheKey === key && cached.contract === RULEBOOK_KNOWLEDGE_MODEL_VERSION) return { model: cached, cacheHit: true, passesExecuted: 0 };
  }
  const base = buildRulebookKnowledgeModel({ projectSeed, pages, gameplayModel, endgameModel });
  const domainEvidence = evidenceByDomain(base.documentMap, base.coverage);
  const packets = buildDomainSynthesisPackets({
    sourcePdfSha256: base.sourcePdfSha256,
    documentMap: base.documentMap,
    domainEvidence,
    components: base.components,
    providerContract,
  });
  const accepted = [];
  const diagnostics = [];
  const telemetry = { contract: RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT, providerCalls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, packets: [] };
  for (const packet of packets) {
    const localCachePath = synthesisCacheDir ? path.join(synthesisCacheDir, `${packet.cacheKey}.json`) : null;
    let response = null;
    let cacheHit = false;
    if (localCachePath && fs.existsSync(localCachePath)) {
      const cached = JSON.parse(fs.readFileSync(localCachePath, 'utf8'));
      if (cached?.cacheKey === packet.cacheKey && cached?.contract === RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT) {
        response = cached.response;
        cacheHit = true;
        telemetry.cacheHits += 1;
      }
    }
    if (!response && typeof domainSynthesize === 'function') {
      response = await domainSynthesize(packet);
      telemetry.providerCalls += 1;
      if (localCachePath) {
        fs.mkdirSync(path.dirname(localCachePath), { recursive: true });
        fs.writeFileSync(localCachePath, `${JSON.stringify({ contract: RULEBOOK_DOMAIN_SYNTHESIS_CONTRACT, cacheKey: packet.cacheKey, response }, null, 2)}\n`);
      }
    }
    const rawAtoms = response?.result?.atoms || response?.atoms || [];
    const validation = response ? validateProviderAtoms({ rawAtoms, packet, sourcePdfSha256: base.sourcePdfSha256 }) : { accepted: [], rejected: [{ title: packet.batchId, issues: ['provider-synthesis-unavailable'] }] };
    accepted.push(...validation.accepted);
    diagnostics.push(...validation.rejected.map((entry) => ({ batchId: packet.batchId, ...entry })));
    const usage = response?.usage || response?.provenance?.usage || {};
    telemetry.inputTokens += Number(usage.input_tokens || usage.prompt_tokens || 0);
    telemetry.outputTokens += Number(usage.output_tokens || usage.completion_tokens || 0);
    telemetry.packets.push({ batchId: packet.batchId, domains: packet.domains, cacheKey: packet.cacheKey, cacheHit, accepted: validation.accepted.length, rejected: validation.rejected, providerAttempts: response?.providerAttempts || response?.provenance?.attempts || [] });
  }
  const model = buildRulebookKnowledgeModel({ projectSeed, pages, gameplayModel, endgameModel, synthesizedAtoms: accepted, synthesisTelemetry: telemetry });
  // The persisted model cache is keyed by the complete production dependency
  // contract, including provider/model. The model's internal diagnostic key is
  // intentionally narrower; the on-disk replay key must never be.
  model.cacheKey = key;
  for (const [domain, entry] of Object.entries(model.coverageDrivenRetrieval || {})) {
    const synthesis = entry.attempts?.find((attempt) => attempt.method === 'domain-specific-source-synthesis-v1');
    const packetTelemetry = telemetry.packets.find((packet) => packet.domains.includes(domain));
    if (synthesis && packetTelemetry) {
      synthesis.status = packetTelemetry.accepted ? 'ACCEPTED' : packetTelemetry.rejected.length ? 'REJECTED_OR_INCOMPLETE' : 'NO_STRUCTURED_RULE_FOUND';
      synthesis.providerBacked = true;
      synthesis.batchId = packetTelemetry.batchId;
      synthesis.cacheHit = packetTelemetry.cacheHit;
      synthesis.rejected = packetTelemetry.rejected;
    }
  }
  if (cachePath) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(model, null, 2)}\n`);
  }
  return { model, cacheHit: false, passesExecuted: 1 + packets.length, telemetry };
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
  RULEATOM_CONTRACT_VERSION,
  RULEBOOK_DOCUMENT_MAP_VERSION,
  RULE_REVIEW_QUEUE_VERSION,
  TUTORIAL_COVERAGE_VERSION,
  buildDocumentMap,
  buildKnowledgeTeachingPlan,
  buildRulebookKnowledgeModel,
  buildTutorialCoverageMatrix,
  buildRuleReviewItems,
  reviewItemContractIssues,
  domainRequiredIssues,
  normalizeRuleAtom,
  normalizeVisualRequirement,
  inferVisualRequirement,
  runMultiPassRulebookIntelligence,
  validateRuleAtom,
};
