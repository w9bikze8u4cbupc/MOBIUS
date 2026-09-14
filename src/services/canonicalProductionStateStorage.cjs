'use strict';

// The compiler intentionally works with rich evidence so it can make a safe
// binding decision. That working graph is not a safe persistence shape: the
// same asset and candidate may occur in selections, plans, scenes and review
// items. Keep the evidence exactly once in a project-owned sidecar and use
// stable references in the canonical state/API payload.

const { createHash } = require('node:crypto');

const CANONICAL_STATE_STORAGE_CONTRACT = 'mobius-canonical-production-state-storage-v1';
const VISUAL_EVIDENCE_ARTIFACT_CONTRACT = 'mobius-canonical-visual-evidence-artifact-v1';
const CANONICAL_STATE_BUDGET_BYTES = 14 * 1024 * 1024;
const VISUAL_EVIDENCE_ARTIFACT_BUDGET_BYTES = 128 * 1024 * 1024;

function json(value) { return JSON.stringify(value); }
function bytes(value) { return Buffer.byteLength(json(value), 'utf8'); }
function digest(value) { return createHash('sha256').update(json(value)).digest('hex'); }

function failure(message, code = 'PROJECT_STATE_INVALID') {
  return Object.assign(new Error(message), {
    code,
    statusCode: code === 'PROJECT_STATE_TOO_LARGE' ? 413 : 400,
    classification: 'recovery_required',
  });
}

function assertBudget(value, budget, label) {
  const size = bytes(value);
  if (size > budget) throw failure(`${label} is ${size} UTF-8 bytes; budget is ${budget}. Explicit recovery is required.`, 'PROJECT_STATE_TOO_LARGE');
  return size;
}

function assetId(value) {
  return typeof value?.id === 'string' ? value.id : (typeof value?.assetId === 'string' ? value.assetId : null);
}

function assetReference(value) {
  const id = assetId(value);
  return id ? { assetId: id } : value;
}

function assetSummary(asset) {
  if (!asset || typeof asset !== 'object') return asset;
  const id = assetId(asset);
  if (!id) return asset;
  return {
    id,
    category: asset.category || null,
    componentId: asset.componentId || null,
    pageNumber: Number(asset.pageNumber || asset.page || asset.sourceRefs?.[0]?.page || 0) || null,
    width: Number(asset.width || 0) || null,
    height: Number(asset.height || 0) || null,
    sourceAuthority: asset.sourceAuthority || asset.authority || null,
    sourceAuthorityRank: Number(asset.sourceAuthorityRank || asset.authorityRank || 0) || null,
    thumbnailPath: asset.thumbnailPath || asset.filePath || null,
  };
}

function selectionEvidence(selection) {
  const { selectedAssets = [], suggestedAssets = [], reviewItem, rankedEntries, ...rest } = selection || {};
  const referentSelections = (rest.referentSelections || []).map((referent) => {
    const { selectedAssets: selected = [], suggestedAssets: suggested = [], ...entry } = referent || {};
    return { ...entry, selectedAssetIds: selected.map(assetId).filter(Boolean), suggestedAssetIds: suggested.map(assetId).filter(Boolean) };
  });
  return {
    ...rest,
    selectedAssetIds: selectedAssets.map(assetId).filter(Boolean),
    suggestedAssetIds: suggestedAssets.map(assetId).filter(Boolean),
    referentSelections,
  };
}

function selectionReference(selection, evidenceKey) {
  return {
    ruleAtomId: selection?.ruleAtomId || null,
    status: selection?.status || null,
    confidence: Number(selection?.confidence || 0),
    reviewState: selection?.reviewState || null,
    reason: selection?.reason || null,
    selectedAssetIds: (selection?.selectedAssets || []).map(assetId).filter(Boolean),
    suggestedAssetIds: (selection?.suggestedAssets || []).map(assetId).filter(Boolean),
    reviewItemId: selection?.reviewItem?.id || null,
    visualEvidenceSelectionRef: evidenceKey,
  };
}

function externalizeReviewItem(item, candidates) {
  if (!item || typeof item !== 'object') return item;
  return {
    ...item,
    candidates: (item.candidates || []).map((candidate) => {
      const evidenceKey = digest(candidate);
      candidates[evidenceKey] ||= candidate;
      return { assetId: assetId(candidate), candidateEvidenceRef: evidenceKey };
    }),
  };
}

function compactPlan(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  const cockpit = plan.cockpit && typeof plan.cockpit === 'object'
    ? {
      ...plan.cockpit,
      // Scores are retained once by the selection sidecar. The review queue
      // remains the source of operator-facing candidate evidence.
      assetCandidates: undefined,
      sourceReferences: undefined,
    }
    : plan.cockpit;
  return { ...plan, cockpit };
}

function compactScene(scene) {
  if (!scene || typeof scene !== 'object') return scene;
  const { visualPlan, canonicalVisualPlan, physicalState, ...rest } = scene;
  return {
    ...rest,
    visualPlanId: canonicalVisualPlan?.ruleAtomId || visualPlan?.ruleAtomId || scene.atomId || null,
    physicalStateId: physicalState?.ruleAtomId || scene.atomId || null,
  };
}

function validateArtifact(artifact, descriptor = null) {
  if (!artifact || artifact.contract !== VISUAL_EVIDENCE_ARTIFACT_CONTRACT
    || !artifact.projectId || !artifact.assetCatalog || !artifact.selectionEvidence || !artifact.candidateEvidence) {
    throw failure('Visual evidence artifact is missing or uses an unsupported contract.');
  }
  if (descriptor?.contentSha256 && digest(artifact) !== descriptor.contentSha256) {
    throw failure('Visual evidence artifact checksum mismatch.');
  }
  if (descriptor?.bytes && bytes(artifact) !== descriptor.bytes) {
    throw failure('Visual evidence artifact size mismatch.');
  }
  for (const [key, candidate] of Object.entries(artifact.candidateEvidence)) {
    if (digest(candidate) !== key) throw failure('Visual evidence candidate checksum mismatch.');
  }
  for (const [key, selection] of Object.entries(artifact.selectionEvidence)) {
    if (digest(selection) !== key) throw failure('Visual evidence selection checksum mismatch.');
  }
  return artifact;
}

function createCompactCanonicalProductionState(state, {
  projectId = state?.projectId,
  sourceSha256 = null,
  relativePath = 'production/visual-evidence-artifact.json',
} = {}) {
  if (!state || typeof state !== 'object' || !projectId) throw failure('Canonical state requires a project identity.');
  if (!/^(?![\\/])(?!(?:.*[\\/])?\.\.(?:[\\/]|$))[A-Za-z0-9._/-]+$/.test(relativePath)) {
    throw failure('Visual evidence artifact path is invalid.');
  }
  const candidateEvidence = Object.create(null);
  const selectionEvidenceById = Object.create(null);
  const compactSelections = (state.sourceSelections || []).map((selection) => {
    const evidence = selectionEvidence(selection);
    const key = digest(evidence);
    selectionEvidenceById[key] ||= evidence;
    return selectionReference(selection, key);
  });
  const compactReviews = (state.reviewItems || []).map((item) => externalizeReviewItem(item, candidateEvidence));
  const artifact = {
    contract: VISUAL_EVIDENCE_ARTIFACT_CONTRACT,
    projectId,
    sourceSha256: sourceSha256 || null,
    assetCatalog: (state.assets || []).map((asset) => asset),
    selectionEvidence: selectionEvidenceById,
    candidateEvidence,
  };
  const artifactBytes = assertBudget(artifact, VISUAL_EVIDENCE_ARTIFACT_BUDGET_BYTES, 'Visual evidence artifact');
  const artifactDescriptor = {
    contract: VISUAL_EVIDENCE_ARTIFACT_CONTRACT,
    relativePath: relativePath.replace(/\\/g, '/'),
    contentSha256: digest(artifact),
    bytes: artifactBytes,
    assetCount: artifact.assetCatalog.length,
    selectionCount: Object.keys(artifact.selectionEvidence).length,
    candidateEvidenceCount: Object.keys(artifact.candidateEvidence).length,
  };
  const normalization = state.visualReferentNormalization && typeof state.visualReferentNormalization === 'object'
    ? {
      ...state.visualReferentNormalization,
      assets: (state.visualReferentNormalization.assets || []).map(assetReference),
    }
    : state.visualReferentNormalization;
  const compact = {
    ...state,
    contract: CANONICAL_STATE_STORAGE_CONTRACT,
    compilerContract: state.contract || null,
    visualEvidenceArtifact: artifactDescriptor,
    visualReferentNormalization: normalization,
    assets: (state.assets || []).map(assetSummary),
    selectedAssets: (state.selectedAssets || []).map(assetReference),
    sourceSelections: compactSelections,
    visualPlans: (state.visualPlans || []).map(compactPlan),
    scenes: (state.scenes || []).map(compactScene),
    reviewItems: compactReviews,
  };
  const compactBytes = assertBudget(compact, CANONICAL_STATE_BUDGET_BYTES, 'Compact canonical production state');
  return { compact, artifact, artifactDescriptor, compactBytes, artifactBytes };
}

function hydrateVisualReviewItem(item, artifact) {
  const needsArtifact = (item?.candidates || []).some((candidate) => Boolean(candidate?.candidateEvidenceRef));
  if (needsArtifact) validateArtifact(artifact);
  return {
    ...item,
    candidates: (item?.candidates || []).map((candidate) => {
      if (!candidate?.candidateEvidenceRef) return candidate;
      const evidence = artifact.candidateEvidence[candidate.candidateEvidenceRef];
      if (!evidence || digest(evidence) !== candidate.candidateEvidenceRef) throw failure('Visual review candidate evidence is missing or corrupt.');
      const { candidateEvidenceRef, ...inline } = candidate;
      return { ...evidence, ...inline };
    }),
  };
}

function hydrateCanonicalProductionState(state, artifact) {
  if (!state || state.contract !== CANONICAL_STATE_STORAGE_CONTRACT) return state;
  validateArtifact(artifact, state.visualEvidenceArtifact);
  const byId = new Map(artifact.assetCatalog.map((asset) => [assetId(asset), asset]));
  const selections = (state.sourceSelections || []).map((reference) => {
    const evidence = artifact.selectionEvidence[reference.visualEvidenceSelectionRef];
    if (!evidence || digest(evidence) !== reference.visualEvidenceSelectionRef) throw failure('Visual selection evidence is missing or corrupt.');
    return {
      ...evidence,
      selectedAssets: (evidence.selectedAssetIds || []).map((id) => byId.get(id)).filter(Boolean),
      suggestedAssets: (evidence.suggestedAssetIds || []).map((id) => byId.get(id)).filter(Boolean),
    };
  });
  const reviewItems = (state.reviewItems || []).map((item) => hydrateVisualReviewItem(item, artifact));
  return {
    ...state,
    contract: state.compilerContract || state.contract,
    assets: artifact.assetCatalog,
    selectedAssets: (state.selectedAssets || []).map((reference) => byId.get(assetId(reference))).filter(Boolean),
    sourceSelections: selections,
    reviewItems,
  };
}

module.exports = {
  CANONICAL_STATE_STORAGE_CONTRACT,
  VISUAL_EVIDENCE_ARTIFACT_CONTRACT,
  CANONICAL_STATE_BUDGET_BYTES,
  VISUAL_EVIDENCE_ARTIFACT_BUDGET_BYTES,
  bytes,
  digest,
  failure,
  validateArtifact,
  createCompactCanonicalProductionState,
  hydrateVisualReviewItem,
  hydrateCanonicalProductionState,
};
