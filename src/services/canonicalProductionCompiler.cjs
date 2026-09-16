'use strict';

const { derivePhysicalGameState, normalizePhysicalGameState, verifiedInstructionalSequence } = require('./physicalGameState.cjs');
const { compileVisualPlans } = require('./visualPlan.cjs');
const {
  loadAuthorizedCandidateManifests,
  normalizeCandidate,
  normalizeVisualReferents,
  buildVisualReviewItem,
  resolveInstructionalSequenceSources,
  resolveSourceAssets,
  SOURCE_ASSET_RESOLVER_CONTRACT,
} = require('./sourceAssetResolver.cjs');
const { runProductionQualityGate } = require('./productionQualityGate.cjs');
const { canonicalTeachingPresentation } = require('./visualPlanMaterializer.cjs');
const { buildKnowledgeTeachingPlan, productionVisualRequirementForAtom } = require('./rulebookKnowledge.cjs');

const CANONICAL_PRODUCTION_COMPILER_CONTRACT = 'mobius-canonical-production-compiler-v13';

const SCENE_STATE_REQUIREMENT_KEYS = Object.freeze([
  'requiredState', 'requiredOrientation', 'requiredQuantities', 'requiredRelationship',
  'beforeState', 'actionState', 'afterState', 'transitionRequired', 'setupPlacementRequired',
  'layeredStateRequired', 'faceStateRequired', 'trackStateRequired', 'oneShotMarkerRequired',
  'progressiveScoringRequired', 'comparisonGroupRequired', 'physicalState',
  'physicalStateRequirement', 'discardPileRequired', 'deckIdentityRequired',
]);

function sceneSpecificVisualRequirement(requirement = {}) {
  return SCENE_STATE_REQUIREMENT_KEYS.some((key) => {
    const value = requirement[key];
    return value != null && value !== false && (!Array.isArray(value) || value.length > 0);
  });
}

/**
 * A component source is selected in two distinct contracts:
 *
 * 1. an exact COMPONENT measurement proves the real object is visible,
 * complete and readable; and
 * 2. a final composition measurement proves the source objects teach the
 * requested placement, transition, relationship or state together.
 *
 * Sending the full second contract to the first resolver asks a photograph of
 * a card or token to prove an animation before the materializer has made it.
 * This projection intentionally keeps provenance and semantic identity while
 * removing only scene-state assertions.  It is never a final visual pass.
 */
function componentIdentityRequirement(requirement = {}, referent, atomId) {
  const identity = { ...requirement };
  for (const key of SCENE_STATE_REQUIREMENT_KEYS) delete identity[key];
  return {
    ...identity,
    actualGameAssetRequired: true,
    requiredObjects: [referent],
    evidenceSceneId: `component-identity:${atomId}:${referent}`,
    componentIdentityOnly: true,
  };
}

function uniqueAssets(assets = []) {
  const byId = new Map();
  for (const raw of assets) {
    const asset = normalizeCandidate(raw);
    if (!asset.id) continue;
    const prior = byId.get(asset.id);
    if (!prior || asset.sourceAuthorityRank > prior.sourceAuthorityRank
      || (asset.sourceAuthorityRank === prior.sourceAuthorityRank && asset.width * asset.height > prior.width * prior.height)) {
      byId.set(asset.id, asset);
    }
  }
  return [...byId.values()];
}

// A resolver ranking contains a rich candidate so it can make its decision.
// Once that decision is made, scene state must retain only the assessment;
// the canonical asset catalogue and the per-referent assessment table own the
// source pixels/provenance.  Retaining the candidate here multiplied a 431
// asset catalogue by every teaching atom before persistence could compact it.
function compactRankingAssessment(entry) {
  return {
    assetId: entry?.candidate?.id || entry?.assetId || null,
    authority: entry?.candidate?.sourceAuthority || entry?.authority || null,
    authorityRank: entry?.candidate?.sourceAuthorityRank || entry?.authorityRank || 0,
    confidence: entry?.confidence || 0,
    semanticScore: entry?.semanticScore || 0,
    trueSourcePixelsPerDisplayPixel: entry?.trueSourcePixelsPerDisplayPixel || 0,
    valid: entry?.valid === true,
    violations: entry?.hardViolations || entry?.violations || [],
  };
}

function resolveAtomSources(atom, assets, displayBounds) {
  const requirement = atom.visualRequirement || {};
  const referents = requirement.requiredObjects || [];
  // A source-grounded diagram is a deliberate visual form for a rule that has
  // no physical referent. It must not trigger a search through unrelated game
  // images, nor manufacture a Cockpit source-selection decision.
  if (!referents.length && requirement.actualGameAssetRequired === false) {
    return {
      contract: SOURCE_ASSET_RESOLVER_CONTRACT,
      ruleAtomId: atom.id,
      status: 'NOT_REQUIRED',
      selectedAssets: [],
      suggestedAssets: [],
      ranked: [],
      confidence: Number(atom.confidence || 0),
      reviewState: 'accepted',
      reason: 'source-grounded-diagram-no-physical-game-asset-required',
      reviewItem: null,
    };
  }
  if (!referents.length) return resolveSourceAssets({ atom, requirement, candidates: assets, displayBounds });
  // A final source-grounded composition has already demonstrated all
  // referents together. Prefer that stronger proof over asking each source
  // image to independently depict the whole relation or transition.
  const sequenceSelection = resolveInstructionalSequenceSources({ atom, requirement, candidates: assets, displayBounds });
  if (sequenceSelection) return sequenceSelection;
  const needsFinalComposition = sceneSpecificVisualRequirement(requirement);
  const perReferent = referents.map((referent) => resolveSourceAssets({
    atom,
    requirement: componentIdentityRequirement(requirement, referent, atom.id),
    candidates: assets,
    displayBounds,
    minimumAssets: 1,
  }));
  // Each per-referent resolver owns the complete, compact assessment table.
  // A review item is the sole persisted owner of that table when human action
  // is needed; keeping it again below in referentSelections made state size
  // grow with both candidate count and scene count before compaction.
  const reviewAssessments = perReferent.flatMap((selection) => selection.ranked || []);
  const accepted = perReferent.every((selection) => selection.status === 'AUTO_ACCEPTED');
  const selectedById = new Map(perReferent.flatMap((selection) => selection.selectedAssets).map((asset) => [asset.id, asset]));
  const suggestedById = new Map(perReferent.flatMap((selection) => selection.suggestedAssets).map((asset) => [asset.id, asset]));
  const reviewEvidence = perReferent.flatMap((selection) => (selection.rankedEntries || []).slice(0, 5));
  const identityAssets = [...selectedById.values()];
  const reason = !accepted ? 'one-or-more-physical-referents-require-cockpit-review'
    : needsFinalComposition ? 'component-identities-ready-final-composition-required'
      : 'all-physical-referents-passed-canonical-auto-accept-thresholds';
  return {
    contract: SOURCE_ASSET_RESOLVER_CONTRACT,
    ruleAtomId: atom.id,
    // Do not mark a stateful requirement complete before the normal
    // materializer and composition reviewer have inspected the final frames.
    // The catalog retains identity-ready source assets so the materializer can
    // create those frames without another extraction or provider call.
    status: accepted && !needsFinalComposition ? 'AUTO_ACCEPTED' : (identityAssets.length || suggestedById.size ? 'REVIEW_REQUIRED' : 'UNRESOLVED'),
    selectedAssets: accepted && !needsFinalComposition ? identityAssets : [],
    suggestedAssets: accepted ? identityAssets : [...suggestedById.values()],
    // Keep this transport-safe: the complete immutable asset lives once in
    // the catalog and Cockpit can dereference it by ID after hydration.
    identityValidatedAssetIds: accepted ? identityAssets.map((asset) => asset.id) : [],
    ranked: reviewEvidence.map(compactRankingAssessment),
    referentSelections: perReferent.map(({ rankedEntries, ranked, reviewItem, ...selection }, index) => ({
      ...selection, requiredObject: referents[index],
      // The review item owns the complete assessment table when review is
      // required.  Accepted selections can be deterministically replayed from
      // this catalogue/versioned resolver without retaining every rejection.
      assessmentColumns: ['assetId', 'authority', 'authorityRank', 'confidence', 'semanticScore', 'trueSourcePixelsPerDisplayPixel', 'valid', 'violations'],
      candidateAssessmentContract: 'mobius-source-selection-assessment-reference-v1',
      candidateAssessmentCount: ranked.length,
      candidateAssessmentOwner: accepted ? 'deterministic-catalog-replay' : `visual-review:${atom.id}`,
    })),
    confidence: perReferent.length ? Math.min(...perReferent.map((selection) => selection.confidence)) : 0,
    reviewState: accepted && !needsFinalComposition ? 'accepted' : 'needs_review',
    reason,
    reviewItem: accepted && !needsFinalComposition ? null : buildVisualReviewItem({
      atom,
      requirement,
      ranked: reviewAssessments,
      reason,
    }),
  };
}

function compileCanonicalProductionState({
  projectId,
  knowledgeModel,
  coverageMatrix,
  componentEvidence = {},
  sourceAssets = [],
  authorizedCandidateManifestPaths = [],
  projectPlans = [],
  displayBounds,
} = {}) {
  if (!knowledgeModel?.ruleAtoms) throw new Error('Canonical production compilation requires RulebookKnowledgeModel.ruleAtoms.');
  const authorized = loadAuthorizedCandidateManifests(authorizedCandidateManifestPaths);
  const referentNormalization = normalizeVisualReferents({ componentEvidence, sourceAssets, components: knowledgeModel.components || [] });
  const assets = uniqueAssets([
    ...referentNormalization.assets,
    ...authorized.candidates,
  ]);
  const teachingOrder = new Map(buildKnowledgeTeachingPlan(knowledgeModel).scenes.map((scene, index) => [scene.atomId, index]));
  const atoms = knowledgeModel.ruleAtoms.map((atom) => ({
    ...atom,
    visualRequirement: productionVisualRequirementForAtom(atom, knowledgeModel.components || []),
  })).sort((a, b) =>
    (teachingOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (teachingOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  let physicalStates = atoms.map(derivePhysicalGameState);
  const sourceSelections = atoms.map((atom, index) => resolveAtomSources(atom, assets, displayBounds || {
    presentationScene: canonicalTeachingPresentation({ id: `knowledge-${atom.id}`, section: atom.teaching?.majorSection,
      narration: atom.teaching?.narration, on_screen_text: atom.teaching?.displayLines?.join('\n'),
      source_pages: atom.sourceRefs?.map(r => r.page) }, index), width: 1920, height: 1080 }));
  for(const selected of sourceSelections.flatMap(s=>s.selectedAssets||[])){
    const index=assets.findIndex(a=>a.id===selected.id);if(index>=0)assets[index]=selected;
  }
  physicalStates=atoms.map((atom,index)=>{
    const selected=sourceSelections[index].selectedAssets?.[0];
    const sequence=selected&&verifiedInstructionalSequence(selected,atom.visualRequirement,`knowledge-${atom.id}`);
    if(!sequence || !sequence.trackEvidence)return physicalStates[index];
    return normalizePhysicalGameState({ruleAtomId:atom.id,transitionType:'BEFORE_ACTION_AFTER',
      stages:sequence.frames.map(f=>({id:f.id,label:f.stage.label,sourceRefs:atom.sourceRefs,
        items:[{id:atom.visualRequirement.requiredObjects[0],componentRef:atom.visualRequirement.requiredObjects[0],
          assetId:selected.id,trackPosition:f.stage.position,visibility:'VISIBLE',faceState:'NOT_APPLICABLE',
          sourceRefs:atom.sourceRefs,confidence:sequence.trackEvidence.confidence,reviewState:'accepted'}]})),
      sourceRefs:atom.sourceRefs,confidence:sequence.trackEvidence.confidence,reviewState:'accepted'},atom);
  });
  const plans = compileVisualPlans({ atoms, projectPlans, assets, sourceSelections, physicalStates });
  // HEPHAESTUS review bindings share this same Cockpit-visible data model.
  // A binding may remain unresolved even when no current teaching atom names
  // it; preserving it prevents hidden `needs_review` state from disappearing.
  const sourceReviewItems = sourceSelections.map((selection) => selection.reviewItem).filter(Boolean);
  const bindingReviewItems = referentNormalization.unresolvedBindings
    .filter((binding) => !atoms.some((atom) => (atom.componentRefs || atom.visualRequirement?.requiredObjects || []).includes(binding.componentId)))
    .map((binding) => resolveSourceAssets({
      atom: { id: `component-${binding.componentId}`, title: binding.componentName, sourceRefs: [{ page: binding.sourcePage }], visualRequirement: { requiredObjects: [binding.componentId], purpose: 'component-identity-binding' } },
      requirement: { requiredObjects: [binding.componentId], purpose: 'component-identity-binding', evidenceSceneId: `knowledge-component-${binding.componentId}` },
      candidates: assets.filter((asset) => asset.id === binding.assetId || asset.sourceRefs.some((ref) => Number(ref.page || ref.sourcePage) === Number(binding.sourcePage))),
      displayBounds,
    }).reviewItem).filter(Boolean);
  const reviewItems = [...sourceReviewItems, ...bindingReviewItems];
  const terms = new Map([
    ...(componentEvidence.componentBindings || []).map((c) => [c.componentId, { name: c.componentName, category: c.category, sourcePage: c.sourcePage }]),
    ...(knowledgeModel.components || []).map((c) => [c.id, { name: c.name, category: c.category, sourcePage: c.sourcePage, sourceQuote: c.sourceQuote }]),
  ]);
  for (const item of reviewItems) {
    item.requiredReferents = (item.requiredObjects || []).map((id) => ({ id, ...(terms.get(id) || {}), termIsPixelProof: false }));
    item.dependentSceneIds = atoms.filter((atom) => (atom.visualRequirement?.requiredObjects || []).some((id) => item.requiredObjects.includes(id))).map((atom) => `knowledge-${atom.id}`);
    item.autoAnalysisExhausted = false; // A bounded budget is not proof that all authoritative evidence was searched.
  }
  const selectedAssetIds = new Set(sourceSelections.flatMap((selection) => selection.selectedAssets || []).map((asset) => asset.id));
  const selectedAssets = assets.filter((asset) => selectedAssetIds.has(asset.id));
  const scenes = atoms.filter((atom) => atom.teaching).map((atom) => {
    const compiled = plans.find((plan) => plan.ruleAtomId === atom.id);
    const selection = sourceSelections.find((item) => item.ruleAtomId === atom.id);
    const selected = selection?.selectedAssets?.[0] || null;
    const sequence=selected&&verifiedInstructionalSequence(selected,atom.visualRequirement,`knowledge-${atom.id}`);
    return {
      id: `knowledge-${atom.id}`,
      atomId: atom.id,
      type: 'teaching_atom',
      title: atom.teaching.heading,
      section: atom.teaching.majorSection,
      spokenText: atom.teaching.narration,
      narration: atom.teaching.narration,
      deliveryProfile: atom.teaching.profile || 'AMELIE_TEACHING_WARM_R10',
      on_screen_text: atom.teaching.displayLines.join('\n'),
      source_pages: atom.sourceRefs.map((ref) => ref.page).filter(Boolean),
      sourceRefs: atom.sourceRefs,
      visualRequirement: atom.visualRequirement,
      localizedTeaching: atom.teaching?.visualTeaching || null,
      physicalState: physicalStates.find((state) => state.ruleAtomId === atom.id),
      visualPlan: compiled?.cockpit,
      canonicalVisualPlan: compiled,
      imageAssetIds: compiled?.cockpit?.selectedAssetIds || [],
      visualReviewState: compiled?.cockpit?.reviewState || 'needs_visual_review',
      ...(sequence?{instructionalSequence:{...sequence,preparedOnly:false,validated:compiled.validation.valid,
        validationBasis:'exact-source-and-sequence-hashes; measured-composition; canonical-source-and-physical-gates'}}:{}),
      ...(selected ? {
        renderVisual: {
          path: sequence?.frames[0].outputPath || selected.filePath,
          assetId: selected.id,
          kind: sequence?'automatic-visual-plan-composite':'automatic-component',
          ...(sequence?{fullFrame:true}:{}),
          confidence: selection.confidence,
          reason: selection.reason,
          sourcePage: selected.sourceRefs?.[0]?.page || selected.pageNumber || null,
          provenance: selected.sourceRefs,
        },
      } : {}),
    };
  });
  const qa = runProductionQualityGate({
    phase: 'canonical-state', knowledgeModel, coverageMatrix, plans, assets: selectedAssets, physicalStates, reviewItems,
  });
  return {
    contract: CANONICAL_PRODUCTION_COMPILER_CONTRACT,
    projectId,
    CODEX_REQUIRED_FOR_NORMAL_PRODUCTION: false,
    codexRequiredForNormalProduction: false,
    sourceResolverContract: SOURCE_ASSET_RESOLVER_CONTRACT,
    visualReferentNormalization: referentNormalization,
    knowledgeModelContract: knowledgeModel.contract,
    knowledgeModel,
    coverageMatrix,
    assets,
    selectedAssets,
    authorizedCandidateProvenance: authorized.provenance,
    physicalStates,
    // Per-referent selections intentionally retain rich ranked evidence.
    // Project-state transport/storage content-address duplicates losslessly;
    // dropping only rankedEntries here is NOT a size budget or compaction gate.
    sourceSelections: sourceSelections.map(({ rankedEntries, reviewItem, ...selection }) => ({
      ...selection,
      // The shared Cockpit queue owns the review object.  The selection keeps
      // only its stable link until storage converts it to an evidence ref.
      ...(reviewItem?.id ? { reviewItemId: reviewItem.id } : {}),
    })),
    visualPlans: plans,
    scenes,
    reviewItems,
    qa,
    status: reviewItems.length ? 'REVIEW_REQUIRED' : (qa.status === 'PASS' ? 'READY' : 'QA_FAILED'),
  };
}

module.exports = {
  CANONICAL_PRODUCTION_COMPILER_CONTRACT,
  compileCanonicalProductionState,
  resolveAtomSources,
};
