const AUTO_LINK_CONFIDENCE_THRESHOLD = 0.9;
const OVERVIEW_TITLES = /\b(introduction|intro|overview|outro|conclusion|wrap[-\s]?up)\b/i;
const REQUIRED_SCENE_TITLES = /\b(setup|action|turn|score|scoring|endgame|round|phase|gameplay)\b/i;
const VALID_SELECTION_METHODS = new Set([
  'approved_component_link',
  'operator_selected',
  'brand_asset',
  'rulebook_reference',
  'unresolved',
]);

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))];
}

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function deriveSceneComponentRefs(scene) {
  return uniqueStrings((scene?.visualDirections || []).flatMap((direction) => direction?.componentRefs || []));
}

export function isOverviewVisualException(scene) {
  const componentRefs = deriveSceneComponentRefs(scene);
  const title = String(scene?.title || '');
  return componentRefs.length === 0 && OVERVIEW_TITLES.test(title) && !REQUIRED_SCENE_TITLES.test(title);
}

export function requiresExplicitVisualPlan() {
  return true;
}

function imageIsCuratedCandidate(image) {
  const curation = image?.curation || image?.metadata?.curation || {};
  return image && curation.candidate !== false && !curation.isDuplicate && !curation.lowInformation;
}

function imageMatchesComponent(image, componentId) {
  const reference = normalized(componentId);
  if (!reference) return false;
  const values = [
    image?.componentId,
    image?.componentRef,
    image?.name,
    image?.title,
    ...(image?.tags || []),
    ...(image?.metadata?.tags || []),
  ].map(normalized).filter(Boolean);
  return values.some((value) => value === reference || value.includes(reference) || reference.includes(value));
}

function approvedLinkDetail(detail, policy) {
  if (!detail) return false;
  if (detail.origin === 'manual' || detail.origin === 'legacy') return true;
  if (detail.origin !== 'auto') return false;
  return policy?.allowAutomaticComponentLinks === true
    && Number(detail.confidence) >= AUTO_LINK_CONFIDENCE_THRESHOLD;
}

function sourceReferences(scene) {
  return (scene?.sources || []).map((source) => ({
    section: source.section,
    startOffset: source.startOffset,
    endOffset: source.endOffset,
  }));
}

function candidateRecord(assetId, componentId, source, approved, image) {
  return {
    assetId,
    componentId: componentId || null,
    source,
    approved,
    curationScore: image?.curation?.score ?? image?.metadata?.curation?.score ?? null,
  };
}

function validSelectionMethod(value) {
  return VALID_SELECTION_METHODS.has(value) ? value : 'unresolved';
}

export function resolveSceneVisualPlan(scene, {
  images = [],
  componentImageLinks = {},
  componentImageLinkDetails = {},
  policy = { allowAutomaticComponentLinks: false },
} = {}) {
  const inventory = new Map((images || []).filter((image) => image?.id).map((image) => [image.id, image]));
  const componentRefs = deriveSceneComponentRefs(scene);
  const overviewExceptionAllowed = isOverviewVisualException(scene);
  const priorPlan = scene?.visualPlan && typeof scene.visualPlan === 'object' ? scene.visualPlan : {};
  const candidates = [];

  componentRefs.forEach((componentId) => {
    uniqueStrings(componentImageLinks?.[componentId]).forEach((assetId) => {
      const image = inventory.get(assetId);
      if (!image) return;
      const detail = componentImageLinkDetails?.[componentId]?.[assetId];
      const approved = approvedLinkDetail(detail, policy);
      candidates.push(candidateRecord(assetId, componentId, 'component_link', approved, image));
    });
    (images || []).filter((image) => imageIsCuratedCandidate(image) && imageMatchesComponent(image, componentId))
      .forEach((image) => candidates.push(candidateRecord(image.id, componentId, 'curated_suggestion', false, image)));
  });

  const assetCandidates = [];
  const seenCandidateIds = new Set();
  candidates.forEach((candidate) => {
    const key = `${candidate.componentId || ''}:${candidate.assetId}`;
    if (!seenCandidateIds.has(key)) {
      seenCandidateIds.add(key);
      assetCandidates.push(candidate);
    }
  });

  const hasExplicitPlanSelection = Array.isArray(priorPlan.selectedAssetIds);
  const requestedIds = uniqueStrings(hasExplicitPlanSelection ? priorPlan.selectedAssetIds : scene?.imageAssetIds);
  const validSelectedIds = requestedIds.filter((id) => inventory.has(id));
  const invalidSelection = requestedIds.length > validSelectedIds.length;
  const approvedLinkedIds = uniqueStrings(assetCandidates.filter((candidate) => candidate.approved).map((candidate) => candidate.assetId));
  let selectedAssetIds = validSelectedIds;
  let selectionMethod = validSelectionMethod(priorPlan.selectionMethod);

  if (selectedAssetIds.length === 0 && !invalidSelection && !priorPlan.manualSelectionReviewed && approvedLinkedIds.length > 0) {
    selectedAssetIds = approvedLinkedIds;
    selectionMethod = 'approved_component_link';
  }
  const selectedIdsAreApproved = selectedAssetIds.length > 0
    && selectedAssetIds.every((assetId) => approvedLinkedIds.includes(assetId));
  if (selectedAssetIds.length > 0 && (selectionMethod === 'unresolved'
    || (selectionMethod === 'approved_component_link' && !selectedIdsAreApproved))) {
    selectionMethod = 'operator_selected';
  }

  const priorBlocked = priorPlan.reviewState === 'blocked' || scene?.visualReviewState === 'blocked';
  const selectionIsAllowedOverview = !overviewExceptionAllowed
    || ((selectionMethod === 'brand_asset' || selectionMethod === 'rulebook_reference')
      && priorPlan.overviewSelectionConfirmed === true);
  const resolved = !priorBlocked && selectedAssetIds.length > 0 && selectionIsAllowedOverview;
  const reviewState = priorBlocked ? 'blocked' : (resolved ? 'resolved' : 'needs_visual_review');
  const reviewReason = priorBlocked
    ? (priorPlan.reviewReason || 'Operator blocked this visual plan.')
    : invalidSelection
      ? 'One or more selected assets are not present in the current project inventory.'
      : resolved && selectionMethod === 'approved_component_link'
        ? 'Resolved from an approved component-image link explicitly referenced by this scene.'
        : resolved
          ? (priorPlan.reviewReason || 'Operator selected a project-owned visual asset.')
          : overviewExceptionAllowed
            ? 'Overview/outro requires an explicit project-owned brand asset or rulebook reference.'
            : componentRefs.length
              ? 'No approved project asset is linked to this scene’s referenced component.'
              : 'Instructional scene requires an explicit project-owned visual selection.';

  return {
    componentRefs,
    sourceReferences: sourceReferences(scene),
    assetCandidates,
    selectedAssetIds,
    selectionMethod: resolved ? selectionMethod : 'unresolved',
    reviewState,
    reviewReason,
    requiresExplicitVisual: requiresExplicitVisualPlan(scene),
    overviewExceptionAllowed,
    overviewSelectionConfirmed: priorPlan.overviewSelectionConfirmed === true,
    manualSelectionReviewed: priorPlan.manualSelectionReviewed === true,
  };
}

export function reconcileStoryboardVisualPlans(manifest, context = {}) {
  if (!manifest || manifest.version !== '1.2.0' || !Array.isArray(manifest.scenes)) return manifest;
  const scenes = manifest.scenes.map((scene) => {
    const visualPlan = resolveSceneVisualPlan(scene, context);
    return {
      ...scene,
      componentRefs: visualPlan.componentRefs,
      visualPlan,
      imageAssetIds: visualPlan.selectedAssetIds,
      visualReviewState: visualPlan.reviewState === 'resolved' ? 'matched' : visualPlan.reviewState,
      status: visualPlan.reviewState === 'blocked' ? 'blocked' : (scene.status === 'blocked' ? 'draft' : scene.status || 'draft'),
    };
  });
  return { ...manifest, scenes };
}

export function validateStoryboardVisualPlans(manifest, context = {}) {
  if (!manifest || manifest.version !== '1.2.0' || !Array.isArray(manifest.scenes)) {
    return { valid: true, code: null, sceneIds: [], summary: null };
  }
  const reconciled = reconcileStoryboardVisualPlans(manifest, context);
  const scenes = reconciled.scenes || [];
  const failures = scenes.filter((scene) => scene.visualPlan?.requiresExplicitVisual
    && (scene.visualPlan.reviewState !== 'resolved' || scene.visualPlan.selectedAssetIds.length === 0));
  const summary = {
    total: scenes.length,
    resolved: scenes.filter((scene) => scene.visualPlan?.reviewState === 'resolved').length,
    unresolved: scenes.filter((scene) => scene.visualPlan?.reviewState === 'needs_visual_review').length,
    blocked: scenes.filter((scene) => scene.visualPlan?.reviewState === 'blocked').length,
    approvedComponentLinked: scenes.filter((scene) => scene.visualPlan?.selectionMethod === 'approved_component_link').length,
    operatorSelected: scenes.filter((scene) => scene.visualPlan?.selectionMethod === 'operator_selected').length,
    overviewExceptions: scenes.filter((scene) => scene.visualPlan?.overviewExceptionAllowed && scene.visualPlan?.reviewState === 'resolved').length,
  };
  return failures.length
    ? { valid: false, code: 'VISUAL_PLAN_INCOMPLETE', sceneIds: failures.map((scene) => scene.id), summary, manifest: reconciled }
    : { valid: true, code: null, sceneIds: [], summary, manifest: reconciled };
}
