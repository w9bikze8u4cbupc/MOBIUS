'use strict';

const { derivePhysicalGameState } = require('./physicalGameState.cjs');
const { compileVisualPlans } = require('./visualPlan.cjs');
const {
  loadAuthorizedCandidateManifests,
  normalizeCandidate,
  resolveSourceAssets,
  SOURCE_ASSET_RESOLVER_CONTRACT,
} = require('./sourceAssetResolver.cjs');
const { runProductionQualityGate } = require('./productionQualityGate.cjs');

const CANONICAL_PRODUCTION_COMPILER_CONTRACT = 'mobius-canonical-production-compiler-v1';

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

function resolveAtomSources(atom, assets, displayBounds) {
  const requirement = atom.visualRequirement || {};
  const referents = requirement.requiredObjects || [];
  if (!referents.length) return resolveSourceAssets({ atom, requirement, candidates: assets, displayBounds });
  const perReferent = referents.map((referent) => resolveSourceAssets({
    atom,
    requirement: { ...requirement, requiredObjects: [referent] },
    candidates: assets,
    displayBounds,
    minimumAssets: 1,
  }));
  const accepted = perReferent.every((selection) => selection.status === 'AUTO_ACCEPTED');
  const selectedById = new Map(perReferent.flatMap((selection) => selection.selectedAssets).map((asset) => [asset.id, asset]));
  const suggestedById = new Map(perReferent.flatMap((selection) => selection.suggestedAssets).map((asset) => [asset.id, asset]));
  const reviewEvidence = perReferent.flatMap((selection) => selection.ranked.slice(0, 5));
  return {
    contract: SOURCE_ASSET_RESOLVER_CONTRACT,
    ruleAtomId: atom.id,
    status: accepted ? 'AUTO_ACCEPTED' : (suggestedById.size ? 'REVIEW_REQUIRED' : 'UNRESOLVED'),
    selectedAssets: accepted ? [...selectedById.values()] : [],
    suggestedAssets: [...suggestedById.values()],
    ranked: reviewEvidence,
    confidence: perReferent.length ? Math.min(...perReferent.map((selection) => selection.confidence)) : 0,
    reviewState: accepted ? 'accepted' : 'needs_review',
    reason: accepted ? 'all-physical-referents-passed-canonical-auto-accept-thresholds' : 'one-or-more-physical-referents-require-cockpit-review',
    reviewItem: accepted ? null : {
      id: `visual-review:${atom.id}`,
      kind: 'visual-source-selection',
      ruleAtomId: atom.id,
      status: 'needs_visual_review',
      reason: 'One or more required physical referents need an operator source choice.',
      requiredObjects: referents,
      candidateIds: [...suggestedById.keys()],
      evidence: reviewEvidence,
    },
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
  displayBounds = { width: 1080, height: 760 },
} = {}) {
  if (!knowledgeModel?.ruleAtoms) throw new Error('Canonical production compilation requires RulebookKnowledgeModel.ruleAtoms.');
  const authorized = loadAuthorizedCandidateManifests(authorizedCandidateManifestPaths);
  const assets = uniqueAssets([
    ...(componentEvidence.assets || []),
    ...(componentEvidence.acceptedVisuals || []),
    ...sourceAssets,
    ...authorized.candidates,
  ]);
  const atoms = knowledgeModel.ruleAtoms;
  const physicalStates = atoms.map(derivePhysicalGameState);
  const sourceSelections = atoms.map((atom) => resolveAtomSources(atom, assets, displayBounds));
  const plans = compileVisualPlans({ atoms, projectPlans, assets, sourceSelections, physicalStates });
  const reviewItems = sourceSelections.map((selection) => selection.reviewItem).filter(Boolean);
  const selectedAssetIds = new Set(sourceSelections.flatMap((selection) => selection.selectedAssets || []).map((asset) => asset.id));
  const selectedAssets = assets.filter((asset) => selectedAssetIds.has(asset.id));
  const scenes = atoms.filter((atom) => atom.teaching).map((atom) => {
    const compiled = plans.find((plan) => plan.ruleAtomId === atom.id);
    const selection = sourceSelections.find((item) => item.ruleAtomId === atom.id);
    const selected = selection?.selectedAssets?.[0] || null;
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
      physicalState: physicalStates.find((state) => state.ruleAtomId === atom.id),
      visualPlan: compiled?.cockpit,
      canonicalVisualPlan: compiled,
      imageAssetIds: compiled?.cockpit?.selectedAssetIds || [],
      visualReviewState: compiled?.cockpit?.reviewState || 'needs_visual_review',
      ...(selected ? {
        renderVisual: {
          path: selected.filePath,
          assetId: selected.id,
          kind: 'automatic-component',
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
    knowledgeModelContract: knowledgeModel.contract,
    knowledgeModel,
    coverageMatrix,
    assets,
    selectedAssets,
    authorizedCandidateProvenance: authorized.provenance,
    physicalStates,
    sourceSelections,
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
