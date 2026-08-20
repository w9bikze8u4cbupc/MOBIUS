const AUTO_LINK_CONFIDENCE_THRESHOLD = 0.9;
export const DEFAULT_NON_BRAND_REUSE_THRESHOLD = 3;
const OVERVIEW_TITLES = /\b(introduction|intro|overview|outro|conclusion|wrap[-\s]?up|opening shot)\b/i;
const REQUIRED_SCENE_TITLES = /\b(setup|action|turn|score|scoring|endgame|round|phase|gameplay)\b/i;
const VAGUE_COMPONENT_TERMS = new Set(['game', 'point', 'strategy', 'influence', 'timing']);
const PRIMARY_INTENTS = new Set(['game_overview', 'assembled_tableau', 'board_setup', 'component_closeup', 'card_action', 'token_action', 'rulebook_reference', 'brand_outro', 'operator_defined']);
const COVERAGE_STATUSES = new Set(['unresolved', 'partial', 'resolved', 'operator_override', 'blocked']);
const ASSET_ROLES = new Set(['primary', 'supporting', 'overview', 'brand', 'rulebook_reference']);
const VALID_SELECTION_METHODS = new Set(['approved_component_link', 'operator_selected', 'brand_asset', 'rulebook_reference', 'unresolved']);
const CONTEXTUAL_EVIDENCE_ROLES = Object.freeze({
  game_overview: new Set(['rulebook_reference']),
  assembled_tableau: new Set(['rulebook_reference']),
  board_setup: new Set(['board_setup_context']),
  rulebook_reference: new Set(['rulebook_reference']),
});
const CONTEXTUAL_EVIDENCE_KINDS = new Set(['contextual_page', 'contextual_crop']);

export function contextualEvidenceRoleIsAllowed(intent, role) {
  return CONTEXTUAL_EVIDENCE_ROLES[intent]?.has(role) === true;
}

export function contextualEvidenceAssignmentIsAllowed(intent, assignment) {
  if (!assignment || !CONTEXTUAL_EVIDENCE_KINDS.has(assignment.kind)
    || typeof assignment.assetId !== 'string' || !assignment.assetId.trim()
    || typeof assignment.pageId !== 'string' || !assignment.pageId.trim()
    || !/^[a-f0-9]{64}$/.test(assignment.documentSha256 || '')
    || !/^[a-f0-9]{64}$/.test(assignment.pageRasterSha256 || '')
    || typeof assignment.renderProfile !== 'string' || !assignment.renderProfile.trim()
    || !contextualEvidenceRoleIsAllowed(intent, assignment.role)) return false;
  if (assignment.kind === 'contextual_page' && assignment.assetId !== assignment.pageId) return false;
  if (assignment.kind === 'contextual_crop' && (typeof assignment.cropId !== 'string' || !assignment.cropId.trim() || assignment.assetId !== assignment.cropId)) return false;
  return assignment.role !== 'board_setup_context'
    || (assignment.kind === 'contextual_crop' && assignment.confirmed === true);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))];
}

function singularToken(value) {
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith('s') && value.length > 3 && !value.endsWith('ss')) return value.slice(0, -1);
  return value;
}

export function normalizeComponentReference(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singularToken)
    .join(' ');
}

function normalized(value) {
  return normalizeComponentReference(value);
}

function componentAliasValues(component) {
  if (!component || typeof component !== 'object') return [];
  return uniqueStrings([
    component.id, component.name, component.nameEn, component.name_en, component.nameFr, component.name_fr,
    component.frenchName, component.translatedName,
    ...(Array.isArray(component.aliases) ? component.aliases : []),
    ...(Array.isArray(component.synonyms) ? component.synonyms : []),
  ]);
}

function componentCatalog(components = []) {
  const aliases = new Map();
  (Array.isArray(components) ? components : []).forEach((component) => {
    const componentId = typeof component?.id === 'string' ? component.id.trim() : '';
    if (!componentId) return;
    componentAliasValues(component).forEach((alias) => {
      const key = normalized(alias);
      if (!key || VAGUE_COMPONENT_TERMS.has(key)) return;
      const existing = aliases.get(key) || [];
      if (!existing.some((entry) => entry.componentId === componentId)) {
        existing.push({ componentId, alias });
        aliases.set(key, existing);
      }
    });
  });
  return aliases;
}

function canonicalComponentLabels(components = [], componentIds = []) {
  const byId = new Map((Array.isArray(components) ? components : [])
    .filter((component) => typeof component?.id === 'string' && component.id.trim())
    .map((component) => [component.id.trim(), component]));
  return uniqueStrings(componentIds).reduce((labels, componentId) => {
    const component = byId.get(componentId);
    const label = [component?.name, component?.nameEn, component?.name_en, component?.nameFr,
      component?.name_fr, component?.translatedName, component?.frenchName]
      .find((value) => typeof value === 'string' && value.trim());
    if (label) labels[componentId] = label.trim();
    return labels;
  }, {});
}

function recordMatch(matches, componentId, matchedToken, sourceField) {
  if (!componentId || matches.some((match) => match.componentId === componentId)) return;
  matches.push({ componentId, matchedToken, sourceField });
}

function resolvedAlias(alias, aliases) {
  const candidates = aliases.get(normalized(alias)) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

function textIncludesAlias(text, alias) {
  const source = ` ${normalized(text)} `;
  const target = normalized(alias);
  return Boolean(target) && !VAGUE_COMPONENT_TERMS.has(target) && source.includes(` ${target} `);
}

/** Resolves only explicit, explainable component mentions to canonical component IDs. */
export function resolveSceneComponentReferences(scene, components = []) {
  const aliases = componentCatalog(components);
  const matches = [];
  const directions = Array.isArray(scene?.visualDirections) ? scene.visualDirections : [];
  directions.forEach((direction, directionIndex) => {
    uniqueStrings(direction?.componentRefs).forEach((reference) => {
      const resolved = resolvedAlias(reference, aliases);
      if (resolved) recordMatch(matches, resolved.componentId, reference, `visualDirections[${directionIndex}].componentRefs`);
      else if (aliases.size === 0) recordMatch(matches, reference, reference, `visualDirections[${directionIndex}].componentRefs`);
    });
  });
  if (aliases.size === 0) return matches;
  const fields = [
    ...directions.flatMap((direction, directionIndex) => [
      { value: direction?.instruction, sourceField: `visualDirections[${directionIndex}].instruction` },
      { value: direction?.onScreenText, sourceField: `visualDirections[${directionIndex}].onScreenText` },
    ]),
    { value: scene?.title, sourceField: 'title' },
    { value: scene?.spokenText, sourceField: 'spokenText' },
  ];
  fields.forEach(({ value, sourceField }) => {
    if (typeof value !== 'string' || !value.trim()) return;
    aliases.forEach((entries, aliasKey) => {
      if (entries.length !== 1 || VAGUE_COMPONENT_TERMS.has(aliasKey)) return;
      const entry = entries[0];
      if (textIncludesAlias(value, entry.alias)) recordMatch(matches, entry.componentId, entry.alias, sourceField);
    });
  });
  return matches;
}

function visualRequirementText(scene) {
  return [
    scene?.title,
    ...(scene?.visualDirections || []).flatMap((direction) => [direction?.instruction, direction?.onScreenText]),
    ...(scene?.overlay?.onScreenText || []),
  ].filter((value) => typeof value === 'string').join(' ');
}

function hasVisualPhrase(text, expression) {
  return expression.test(String(text || ''));
}

const BRAND_OUTRO_CUES = /\b(game title|title card|brand|outro|conclusion|wrap[-\s]?up)\b/i;
const ASSEMBLED_TABLEAU_CUES = /\b(assembled game|completed tableau|full game table|player tableau)\b/i;
const OVERVIEW_CUES = /\b(opening shot|game overview|overview|introduction|intro)\b/i;
const BOARD_SETUP_CUES = /\b(setup|set\s+up|place\s+(?:the\s+)?board|board\s+in\s+the\s+center|overhead\s+table|arrange|layout|player\s+areas?|treasury|starting\s+position|ordered\s+setup|step\s+by\s+step)\b/i;
const CARD_OBJECT_CUES = /\b(cards?|exploration|council|lords?|locations?)\b/i;
const TOKEN_OBJECT_CUES = /\b(tokens?|keys?|pearls?|monsters?)\b/i;
const ACTION_CUES = /\b(reveal|draw|play|discard|rotate|pay|fight|recruit|take)\b/i;

function isBoardReference(componentId, match) {
  return /\b(board|layout|tableau)\b/i.test(`${componentId || ''} ${match?.matchedToken || ''}`);
}

function primaryIntentForVisualText(text, visualComponentRefs) {
  // Explicit pedagogical scene semantics always precede component/action vocabulary.
  // `text` deliberately excludes spoken narration so narration cannot manufacture visual intent.
  if (hasVisualPhrase(text, /\b(rulebook|page|reference)\b/i)) return 'rulebook_reference';
  if (hasVisualPhrase(text, BRAND_OUTRO_CUES)) return 'brand_outro';
  if (hasVisualPhrase(text, ASSEMBLED_TABLEAU_CUES)) return 'assembled_tableau';
  if (hasVisualPhrase(text, OVERVIEW_CUES)) return 'game_overview';
  if (hasVisualPhrase(text, BOARD_SETUP_CUES)) return 'board_setup';
  if (visualComponentRefs.length && hasVisualPhrase(text, CARD_OBJECT_CUES) && hasVisualPhrase(text, ACTION_CUES)) return 'card_action';
  if (visualComponentRefs.length && hasVisualPhrase(text, TOKEN_OBJECT_CUES) && hasVisualPhrase(text, ACTION_CUES)) return 'token_action';
  return visualComponentRefs.length ? 'component_closeup' : 'operator_defined';
}

/**
 * Requirements deliberately use title, visual directions, and overlay context only.
 * Spoken narration remains useful for explainability but cannot manufacture a visual requirement.
 */
export function deriveSceneVisualRequirements(scene, components = []) {
  const componentRefMatches = resolveSceneComponentReferences(scene, components);
  const visualMatches = componentRefMatches.filter((match) => match.sourceField === 'title' || match.sourceField.startsWith('visualDirections['));
  const directMatches = visualMatches.filter((match) => match.sourceField.endsWith('.componentRefs'));
  const visualComponentRefs = uniqueStrings(visualMatches.map((match) => match.componentId));
  const directComponentRefs = uniqueStrings(directMatches.map((match) => match.componentId));
  const primaryIntent = primaryIntentForVisualText(visualRequirementText(scene), visualComponentRefs);

  let primaryComponentRefs = [];
  if (primaryIntent === 'board_setup') {
    // Setup materials remain supporting context. Only an explicitly identified board/layout
    // can remain primary; confirmed contextual board evidence can satisfy setup regardless.
    primaryComponentRefs = visualMatches.filter((match) => isBoardReference(match.componentId, match)).map((match) => match.componentId);
  } else if (['component_closeup', 'card_action', 'token_action'].includes(primaryIntent)) {
    primaryComponentRefs = directComponentRefs.length ? directComponentRefs : visualComponentRefs;
  }
  primaryComponentRefs = uniqueStrings(primaryComponentRefs);
  const supportingComponentRefs = visualComponentRefs.filter((componentId) => !primaryComponentRefs.includes(componentId));
  const componentLabels = canonicalComponentLabels(components, [...primaryComponentRefs, ...supportingComponentRefs, ...visualComponentRefs]);
  return {
    primaryIntent,
    primaryComponentRefs,
    supportingComponentRefs,
    componentLabels,
    componentRefMatches,
  };
}

export function deriveSceneComponentRefs(scene, components = []) {
  return resolveSceneComponentReferences(scene, components).map((match) => match.componentId);
}

export function isOverviewVisualException(scene, components = []) {
  const intent = deriveSceneVisualRequirements(scene, components).primaryIntent;
  return ['game_overview', 'assembled_tableau', 'brand_outro', 'rulebook_reference'].includes(intent)
    || (deriveSceneComponentRefs(scene, components).length === 0 && OVERVIEW_TITLES.test(String(scene?.title || '')) && !REQUIRED_SCENE_TITLES.test(String(scene?.title || '')));
}

export function requiresExplicitVisualPlan() { return true; }

function imageIsCuratedCandidate(image) {
  const curation = image?.curation || image?.metadata?.curation || {};
  return image && curation.candidate !== false && !curation.isDuplicate && !curation.lowInformation;
}

function imageMatchesComponent(image, componentId) {
  const reference = normalized(componentId);
  if (!reference) return false;
  const values = [image?.componentId, image?.componentRef, image?.name, image?.title, ...(image?.tags || []), ...(image?.metadata?.tags || [])]
    .map(normalized).filter(Boolean);
  return values.some((value) => value === reference || value.includes(reference) || reference.includes(value));
}

function approvedLinkDetail(detail, policy) {
  if (!detail) return false;
  if (detail.origin === 'manual' || detail.origin === 'legacy') return true;
  return detail.origin === 'auto' && policy?.allowAutomaticComponentLinks === true && Number(detail.confidence) >= AUTO_LINK_CONFIDENCE_THRESHOLD;
}

function sourceReferences(scene) {
  return (scene?.sources || []).map((source) => ({ section: source.section, startOffset: source.startOffset, endOffset: source.endOffset }));
}

function candidateRecord(assetId, componentId, source, approved, image, requirementRole) {
  return { assetId, componentId: componentId || null, source, approved, requirementRole, curationScore: image?.curation?.score ?? image?.metadata?.curation?.score ?? null };
}

function validSelectionMethod(value) { return VALID_SELECTION_METHODS.has(value) ? value : 'unresolved'; }

function validAssetRole(value) { return ASSET_ROLES.has(value) ? value : 'supporting'; }

function normaliseAssignments(priorAssignments, selectedAssetIds, requirements, candidates, selectionMethod) {
  const selected = new Set(selectedAssetIds);
  const candidateByAsset = new Map();
  candidates.forEach((candidate) => {
    const matches = candidateByAsset.get(candidate.assetId) || [];
    matches.push(candidate);
    candidateByAsset.set(candidate.assetId, matches);
  });
  const existing = new Map((Array.isArray(priorAssignments) ? priorAssignments : [])
    .filter((assignment) => selected.has(assignment?.assetId))
    .map((assignment) => [assignment.assetId, assignment]));
  return selectedAssetIds.map((assetId) => {
    const prior = existing.get(assetId);
    const candidate = (candidateByAsset.get(assetId) || []).find((entry) => entry.requirementRole === 'primary')
      || (candidateByAsset.get(assetId) || [])[0];
    let role = validAssetRole(prior?.role);
    let componentId = typeof prior?.componentId === 'string' ? prior.componentId : null;
    if (!prior) {
      if (selectionMethod === 'brand_asset') role = 'brand';
      else if (selectionMethod === 'rulebook_reference') role = 'rulebook_reference';
      else if (candidate?.requirementRole === 'primary') role = 'primary';
      else if (candidate?.requirementRole === 'supporting') role = 'supporting';
      else if (requirements.primaryIntent === 'operator_defined' && selectionMethod === 'operator_selected') role = 'primary';
      else if (requirements.primaryComponentRefs.length === 1 && selectionMethod === 'operator_selected') role = 'primary';
    }
    if (prior && role === 'primary' && componentId
      && !requirements.primaryComponentRefs.includes(componentId)
      && requirements.supportingComponentRefs.includes(componentId)) role = 'supporting';
    if (role === 'primary' && !componentId) {
      componentId = candidate?.requirementRole === 'primary'
        ? candidate.componentId
        : (requirements.primaryComponentRefs.length === 1 ? requirements.primaryComponentRefs[0] : null);
    }
    if (role === 'supporting' && !componentId && candidate?.requirementRole === 'supporting') componentId = candidate.componentId;
    return { assetId, role, componentId };
  });
}

function normaliseContextualEvidenceAssignments(priorAssignments, intent) {
  const seen = new Set();
  return (Array.isArray(priorAssignments) ? priorAssignments : []).filter((assignment) => {
    if (!contextualEvidenceAssignmentIsAllowed(intent, assignment)) return false;
    const key = `${assignment.kind}:${assignment.assetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((assignment) => ({
    kind: assignment.kind,
    assetId: assignment.assetId,
    documentSha256: assignment.documentSha256,
    pageId: assignment.pageId,
    pageRasterSha256: assignment.pageRasterSha256,
    cropId: assignment.kind === 'contextual_crop' ? assignment.cropId : null,
    renderProfile: assignment.renderProfile,
    role: assignment.role,
    confirmed: assignment.confirmed === true,
  }));
}

function operatorOverrideReason(priorPlan) {
  const reason = priorPlan?.operatorOverride?.reason;
  return typeof reason === 'string' && reason.trim().length >= 3 ? reason.trim() : '';
}

function intentEvidenceSatisfied(intent, assignments, contextualAssignments, priorPlan, requirements) {
  const roles = new Set(assignments.map((assignment) => assignment.role));
  contextualAssignments.forEach((assignment) => roles.add(assignment.role));
  if (intent === 'brand_outro') return priorPlan?.overviewSelectionConfirmed === true && (roles.has('brand') || roles.has('rulebook_reference'));
  if (intent === 'rulebook_reference') return roles.has('rulebook_reference');
  if (intent === 'game_overview' || intent === 'assembled_tableau') return priorPlan?.overviewSelectionConfirmed === true && (roles.has('overview') || roles.has('brand') || roles.has('rulebook_reference'));
  // A confirmed board-setup crop documents the assembled setup itself. An explicit board
  // requirement remains useful for project-asset matching, but must not block that evidence.
  if (intent === 'board_setup') return contextualAssignments.some((assignment) => assignment.role === 'board_setup_context' && assignment.confirmed === true);
  return null;
}

function derivedSchematicComponentEvidence(scene, requirements) {
  const visualText = visualRequirementText(scene);
  if (!/\b(?:3|three)\s+keys?\b/i.test(visualText) || sourceReferences(scene).length === 0) return [];
  return requirements.primaryComponentRefs.flatMap((componentId) => {
    const label = requirements.componentLabels?.[componentId] || componentId;
    if (!/\bkey\s*tokens?\b/i.test(label)) return [];
    return [{
      componentId,
      kind: 'counted_symbol_overlay',
      symbol: 'key',
      count: 3,
      label: '3 Keys',
      source: 'explicit_scene_visual_direction',
    }];
  });
}

function coverageFor(requirements, assignments, contextualAssignments, priorPlan, priorBlocked, schematicComponentEvidence = []) {
  const primaryEvidence = requirements.primaryComponentRefs.map((componentId) => ({
    requirement: 'primary_component', componentId,
    assetIds: assignments.filter((assignment) => assignment.role === 'primary' && assignment.componentId === componentId).map((assignment) => assignment.assetId),
    schematicEvidence: schematicComponentEvidence.filter((evidence) => evidence.componentId === componentId),
  }));
  const supportingEvidence = requirements.supportingComponentRefs.map((componentId) => ({
    requirement: 'supporting_component', componentId,
    assetIds: assignments.filter((assignment) => assignment.role === 'supporting' && assignment.componentId === componentId).map((assignment) => assignment.assetId),
  }));
  const intentSatisfied = intentEvidenceSatisfied(requirements.primaryIntent, assignments, contextualAssignments, priorPlan, requirements);
  const allPrimarySatisfied = primaryEvidence.length > 0 && primaryEvidence.every((evidence) => (
    evidence.assetIds.length > 0 || evidence.schematicEvidence.length > 0
  ));
  const operatorDefinedSatisfied = requirements.primaryIntent === 'operator_defined' && assignments.some((assignment) => assignment.role === 'primary');
  const operatorReason = operatorOverrideReason(priorPlan);
  const hasAnyEvidence = assignments.length > 0 || contextualAssignments.length > 0;
  const hasSupportingEvidence = supportingEvidence.some((evidence) => evidence.assetIds.length > 0);
  let coverageStatus = 'unresolved';
  let coverageReason = 'No primary visual evidence has been selected.';
  if (priorBlocked) {
    coverageStatus = 'blocked';
    coverageReason = priorPlan.reviewReason || 'Operator blocked this visual plan.';
  } else if (operatorReason && (hasAnyEvidence || requirements.primaryIntent === 'brand_outro')) {
    // A generated, approved channel outro is a legitimate explicit visual for a brand-outro
    // scene even when it is not represented by a per-project rulebook asset. This exception
    // never applies to gameplay, rules, component, setup, or scoring scenes.
    coverageStatus = 'operator_override';
    coverageReason = `Operator override: ${operatorReason}`;
  } else if (intentSatisfied === true || allPrimarySatisfied || operatorDefinedSatisfied) {
    coverageStatus = 'resolved';
    coverageReason = intentSatisfied === true
      ? `Resolved with explicit ${requirements.primaryIntent.replace(/_/g, ' ')} evidence.`
      : operatorDefinedSatisfied
        ? 'Resolved by an explicit operator-defined primary visual.'
        : schematicComponentEvidence.length
          ? 'Resolved by primary component and explicit schematic visual evidence.'
          : 'Resolved by primary component evidence.';
  } else if (hasAnyEvidence || hasSupportingEvidence) {
    coverageStatus = 'partial';
    coverageReason = requirements.primaryComponentRefs.length
      ? 'Partial — primary visual evidence is still missing.'
      : `Partial — ${requirements.primaryIntent.replace(/_/g, ' ')} evidence is still missing.`;
  }
  const coverageEvidence = [
    ...primaryEvidence.map((evidence) => ({ ...evidence, satisfied: evidence.assetIds.length > 0 || evidence.schematicEvidence.length > 0 })),
    ...supportingEvidence.map((evidence) => ({ ...evidence, satisfied: evidence.assetIds.length > 0 })),
    ...(assignments.length ? [{ requirement: 'intent_role', intent: requirements.primaryIntent, assetIds: assignments.map((assignment) => assignment.assetId), satisfied: intentSatisfied === true || allPrimarySatisfied }] : []),
    ...(contextualAssignments.length ? [{ requirement: 'contextual_evidence', intent: requirements.primaryIntent, assetIds: contextualAssignments.map((assignment) => assignment.assetId), satisfied: intentSatisfied === true, contextual: true }] : []),
    ...(operatorReason ? [{ requirement: 'operator_override', assetIds: assignments.map((assignment) => assignment.assetId), satisfied: coverageStatus === 'operator_override', reason: operatorReason }] : []),
  ];
  return { coverageStatus, coverageReason, coverageEvidence };
}

export function resolveSceneVisualPlan(scene, {
  images = [], componentImageLinks = {}, componentImageLinkDetails = {}, components = [],
  policy = { allowAutomaticComponentLinks: false, maxNonBrandAssetReuse: DEFAULT_NON_BRAND_REUSE_THRESHOLD },
} = {}) {
  const inventory = new Map((images || []).filter((image) => image?.id).map((image) => [image.id, image]));
  const requirements = deriveSceneVisualRequirements(scene, components);
  const componentRefs = requirements.componentRefMatches.map((match) => match.componentId);
  const overviewExceptionAllowed = isOverviewVisualException(scene, components);
  const priorPlan = scene?.visualPlan && typeof scene.visualPlan === 'object' ? scene.visualPlan : {};
  const candidates = [];
  const componentRequirementRole = (componentId) => requirements.primaryComponentRefs.includes(componentId) ? 'primary'
    : requirements.supportingComponentRefs.includes(componentId) ? 'supporting' : 'context';
  componentRefs.forEach((componentId) => {
    const requirementRole = componentRequirementRole(componentId);
    uniqueStrings(componentImageLinks?.[componentId]).forEach((assetId) => {
      const image = inventory.get(assetId);
      if (!image) return;
      const detail = componentImageLinkDetails?.[componentId]?.[assetId];
      candidates.push(candidateRecord(assetId, componentId, 'component_link', approvedLinkDetail(detail, policy), image, requirementRole));
    });
    (images || []).filter((image) => imageIsCuratedCandidate(image) && imageMatchesComponent(image, componentId))
      .forEach((image) => candidates.push(candidateRecord(image.id, componentId, 'curated_suggestion', false, image, requirementRole)));
  });
  const assetCandidates = [];
  const seenCandidateIds = new Set();
  candidates.forEach((candidate) => {
    const key = `${candidate.componentId || ''}:${candidate.assetId}`;
    if (!seenCandidateIds.has(key)) { seenCandidateIds.add(key); assetCandidates.push(candidate); }
  });

  const hasExplicitPlanSelection = Array.isArray(priorPlan.selectedAssetIds);
  const requestedIds = uniqueStrings(hasExplicitPlanSelection ? priorPlan.selectedAssetIds : scene?.imageAssetIds);
  const validSelectedIds = requestedIds.filter((id) => inventory.has(id));
  const invalidSelection = requestedIds.length > validSelectedIds.length;
  const primaryApprovedIds = uniqueStrings(assetCandidates.filter((candidate) => candidate.approved && candidate.requirementRole === 'primary').map((candidate) => candidate.assetId));
  let selectedAssetIds = validSelectedIds;
  let selectionMethod = validSelectionMethod(priorPlan.selectionMethod);
  if (selectedAssetIds.length === 0 && !invalidSelection && !priorPlan.manualSelectionReviewed && primaryApprovedIds.length > 0) {
    selectedAssetIds = primaryApprovedIds;
    selectionMethod = 'approved_component_link';
  }
  const selectedIdsAreApprovedPrimary = selectedAssetIds.length > 0 && selectedAssetIds.every((assetId) => primaryApprovedIds.includes(assetId));
  if (selectedAssetIds.length > 0 && (selectionMethod === 'unresolved' || (selectionMethod === 'approved_component_link' && !selectedIdsAreApprovedPrimary))) selectionMethod = 'operator_selected';

  const assetAssignments = normaliseAssignments(priorPlan.assetAssignments, selectedAssetIds, requirements, assetCandidates, selectionMethod);
  const priorContextualEvidenceAssignments = Array.isArray(priorPlan.contextualEvidenceAssignments)
    ? priorPlan.contextualEvidenceAssignments : [];
  const contextualEvidenceAssignments = normaliseContextualEvidenceAssignments(priorContextualEvidenceAssignments, requirements.primaryIntent);
  const incompatibleContextualEvidence = contextualEvidenceAssignments.length < priorContextualEvidenceAssignments.length;
  const priorBlocked = priorPlan.reviewState === 'blocked' || priorPlan.coverageStatus === 'blocked' || scene?.visualReviewState === 'blocked';
  const schematicComponentEvidence = derivedSchematicComponentEvidence(scene, requirements);
  const coverage = coverageFor(requirements, assetAssignments, contextualEvidenceAssignments, priorPlan, priorBlocked, schematicComponentEvidence);
  const releaseResolved = coverage.coverageStatus === 'resolved' || coverage.coverageStatus === 'operator_override';
  const reviewState = priorBlocked ? 'blocked' : (releaseResolved ? 'resolved' : 'needs_visual_review');
  const invalidationReasons = [
    invalidSelection ? 'One or more selected assets are not present in the current project inventory.' : null,
    incompatibleContextualEvidence ? 'One or more contextual evidence assignments are incompatible with the corrected visual intent or provenance policy.' : null,
  ].filter(Boolean);
  const reviewReason = priorBlocked
    ? (priorPlan.reviewReason || coverage.coverageReason)
    : invalidationReasons.join(' ') || coverage.coverageReason;

  return {
    componentRefs,
    componentRefMatches: requirements.componentRefMatches,
    primaryIntent: PRIMARY_INTENTS.has(requirements.primaryIntent) ? requirements.primaryIntent : 'operator_defined',
    primaryComponentRefs: requirements.primaryComponentRefs,
    supportingComponentRefs: requirements.supportingComponentRefs,
    componentLabels: requirements.componentLabels,
    coverageStatus: COVERAGE_STATUSES.has(coverage.coverageStatus) ? coverage.coverageStatus : 'unresolved',
    coverageReason: coverage.coverageReason,
    coverageEvidence: coverage.coverageEvidence,
    assetAssignments,
    contextualEvidenceAssignments,
    schematicComponentEvidence,
    assetReuse: Array.isArray(priorPlan.assetReuse) ? priorPlan.assetReuse : [],
    operatorOverride: operatorOverrideReason(priorPlan) ? { reason: operatorOverrideReason(priorPlan) } : null,
    sourceReferences: sourceReferences(scene),
    assetCandidates,
    selectedAssetIds,
    selectionMethod: releaseResolved ? selectionMethod : 'unresolved',
    reviewState,
    reviewReason,
    requiresExplicitVisual: requiresExplicitVisualPlan(scene),
    overviewExceptionAllowed,
    overviewSelectionConfirmed: priorPlan.overviewSelectionConfirmed === true,
    manualSelectionReviewed: priorPlan.manualSelectionReviewed === true,
  };
}

function contiguousSequenceGroups(scenes = []) {
  const ordered = [...scenes].sort((left, right) => (Number(left?.order) || 0) - (Number(right?.order) || 0));
  const groups = new Map();
  let priorKey = null;
  let sequence = 0;
  ordered.forEach((scene) => {
    const key = `${scene?.sectionId || scene?.sourceId || ''}::${normalized(scene?.title || '')}`;
    if (!key || key !== priorKey) sequence += 1;
    groups.set(scene?.id, `sequence-${sequence}`);
    priorKey = key;
  });
  return groups;
}

function annotateAssetReuse(scenes, policy = {}) {
  const threshold = Number.isInteger(policy.maxNonBrandAssetReuse) ? policy.maxNonBrandAssetReuse : DEFAULT_NON_BRAND_REUSE_THRESHOLD;
  const sequenceGroups = contiguousSequenceGroups(scenes);
  const usage = new Map();
  scenes.forEach((scene) => (scene.visualPlan?.assetAssignments || []).forEach((assignment) => {
    const entries = usage.get(assignment.assetId) || [];
    entries.push({ sceneId: scene.id, sequenceGroup: sequenceGroups.get(scene.id), role: assignment.role });
    usage.set(assignment.assetId, entries);
  }));
  return scenes.map((scene) => {
    const assetReuse = (scene.visualPlan?.assetAssignments || []).map((assignment) => {
      const entries = usage.get(assignment.assetId) || [];
      const sequenceEntries = new Map();
      entries.forEach((entry) => {
        const groupEntries = sequenceEntries.get(entry.sequenceGroup) || [];
        groupEntries.push(entry);
        sequenceEntries.set(entry.sequenceGroup, groupEntries);
      });
      const count = sequenceEntries.size;
      const exempt = assignment.role === 'brand';
      const currentSequenceSceneIds = sequenceEntries.get(sequenceGroups.get(scene.id))?.map((entry) => entry.sceneId) || [];
      return {
        assetId: assignment.assetId,
        count,
        rawCount: entries.length,
        threshold,
        exempt,
        exceedsThreshold: !exempt && count > threshold,
        sceneIds: entries.map((entry) => entry.sceneId),
        currentSequenceSceneIds,
      };
    });
    return { ...scene, visualPlan: { ...scene.visualPlan, assetReuse } };
  });
}

function consensusPrimaryComponentsByAsset(scenes = []) {
  const componentIdsByAsset = new Map();
  scenes.filter((scene) => scene?.visualPlan?.coverageStatus === 'resolved').forEach((scene) => {
    const primaryRequirements = new Set(scene.visualPlan?.primaryComponentRefs || []);
    (scene.visualPlan?.assetAssignments || []).forEach((assignment) => {
      if (assignment?.role !== 'primary' || !primaryRequirements.has(assignment.componentId) || !assignment.assetId) return;
      const components = componentIdsByAsset.get(assignment.assetId) || new Set();
      components.add(assignment.componentId);
      componentIdsByAsset.set(assignment.assetId, components);
    });
  });
  return new Map([...componentIdsByAsset].filter(([, componentIds]) => componentIds.size === 1)
    .map(([assetId, componentIds]) => [assetId, [...componentIds][0]]));
}

function repairRedundantComponentAssignments(scene, consensusByAsset) {
  const plan = scene?.visualPlan || {};
  if (plan.coverageStatus === 'resolved' || plan.coverageStatus === 'operator_override') return scene;
  const primaryRequirements = new Set(plan.primaryComponentRefs || []);
  if (!primaryRequirements.size) return scene;
  const assignments = (plan.assetAssignments || []).map((assignment) => ({ ...assignment }));
  const evidenceCount = new Map();
  assignments.forEach((assignment) => {
    if (assignment.role === 'primary' && primaryRequirements.has(assignment.componentId)) {
      evidenceCount.set(assignment.componentId, (evidenceCount.get(assignment.componentId) || 0) + 1);
    }
  });
  let repaired = false;
  assignments.forEach((assignment) => {
    const consensusComponent = consensusByAsset.get(assignment.assetId);
    if (assignment.role !== 'primary' || !consensusComponent || !primaryRequirements.has(consensusComponent)
      || assignment.componentId === consensusComponent || (evidenceCount.get(consensusComponent) || 0) > 0
      || (evidenceCount.get(assignment.componentId) || 0) < 2) return;
    evidenceCount.set(assignment.componentId, evidenceCount.get(assignment.componentId) - 1);
    evidenceCount.set(consensusComponent, 1);
    assignment.componentId = consensusComponent;
    repaired = true;
  });
  return repaired ? { ...scene, visualPlan: { ...plan, assetAssignments: assignments } } : scene;
}

function withResolvedVisualPlan(scene, context) {
  const visualPlan = resolveSceneVisualPlan(scene, context);
  return {
    ...scene,
    componentRefs: visualPlan.componentRefs,
    visualPlan,
    imageAssetIds: visualPlan.selectedAssetIds,
    visualReviewState: visualPlan.reviewState === 'resolved' ? 'matched' : visualPlan.reviewState,
    status: visualPlan.reviewState === 'blocked' ? 'blocked' : (scene.status === 'blocked' ? 'draft' : scene.status || 'draft'),
  };
}

export function reconcileStoryboardVisualPlans(manifest, context = {}) {
  if (!manifest || manifest.version !== '1.2.0' || !Array.isArray(manifest.scenes)) return manifest;
  const initiallyResolvedScenes = manifest.scenes.map((scene) => withResolvedVisualPlan(scene, context));
  const consensusByAsset = consensusPrimaryComponentsByAsset(initiallyResolvedScenes);
  const repairedScenes = initiallyResolvedScenes.map((scene) => {
    const repaired = repairRedundantComponentAssignments(scene, consensusByAsset);
    return repaired === scene ? scene : withResolvedVisualPlan(repaired, context);
  });
  return { ...manifest, scenes: annotateAssetReuse(repairedScenes, context.policy) };
}

export function validateStoryboardVisualPlans(manifest, context = {}) {
  if (!manifest || manifest.version !== '1.2.0' || !Array.isArray(manifest.scenes)) return { valid: true, code: null, sceneIds: [], summary: null };
  const reconciled = reconcileStoryboardVisualPlans(manifest, context);
  const scenes = reconciled.scenes || [];
  const incomplete = scenes.filter((scene) => scene.visualPlan?.requiresExplicitVisual
    && !['resolved', 'operator_override'].includes(scene.visualPlan?.coverageStatus));
  const reuseFailures = scenes.filter((scene) => (scene.visualPlan?.assetReuse || []).some((reuse) => reuse.exceedsThreshold));
  const summary = {
    total: scenes.length,
    resolved: scenes.filter((scene) => scene.visualPlan?.coverageStatus === 'resolved').length,
    partial: scenes.filter((scene) => scene.visualPlan?.coverageStatus === 'partial').length,
    unresolved: scenes.filter((scene) => scene.visualPlan?.coverageStatus === 'unresolved').length,
    overrides: scenes.filter((scene) => scene.visualPlan?.coverageStatus === 'operator_override').length,
    blocked: scenes.filter((scene) => scene.visualPlan?.coverageStatus === 'blocked').length,
    approvedComponentLinked: scenes.filter((scene) => scene.visualPlan?.selectionMethod === 'approved_component_link').length,
    operatorSelected: scenes.filter((scene) => scene.visualPlan?.selectionMethod === 'operator_selected').length,
    overviewExceptions: scenes.filter((scene) => scene.visualPlan?.overviewExceptionAllowed && scene.visualPlan?.coverageStatus === 'resolved').length,
    reuseWarnings: scenes.flatMap((scene) => (scene.visualPlan?.assetReuse || []).filter((reuse) => reuse.exceedsThreshold).map((reuse) => ({ sceneId: scene.id, ...reuse }))),
  };
  if (incomplete.length) return { valid: false, code: 'VISUAL_PLAN_INCOMPLETE', sceneIds: incomplete.map((scene) => scene.id), summary, manifest: reconciled };
  if (reuseFailures.length) return { valid: false, code: 'VISUAL_ASSET_REUSE_EXCEEDED', sceneIds: reuseFailures.map((scene) => scene.id), summary, manifest: reconciled };
  return { valid: true, code: null, sceneIds: [], summary, manifest: reconciled };
}
