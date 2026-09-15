'use strict';

// The compiler intentionally works with rich evidence so it can make a safe
// binding decision. That working graph is not a safe persistence shape: the
// same asset and candidate may occur in selections, plans, scenes and review
// items. Keep the evidence exactly once in a project-owned sidecar and use
// stable references in the canonical state/API payload.

const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const CANONICAL_STATE_STORAGE_CONTRACT = 'mobius-canonical-production-state-storage-v3';
const LEGACY_CANONICAL_STATE_STORAGE_CONTRACTS = Object.freeze([
  'mobius-canonical-production-state-storage-v2',
  'mobius-canonical-production-state-storage-v1',
]);
const LEGACY_CANONICAL_STATE_STORAGE_CONTRACT = LEGACY_CANONICAL_STATE_STORAGE_CONTRACTS.at(-1);
const VISUAL_EVIDENCE_ARTIFACT_CONTRACT = 'mobius-canonical-visual-evidence-artifact-v2';
const LEGACY_VISUAL_EVIDENCE_ARTIFACT_CONTRACT = 'mobius-canonical-visual-evidence-artifact-v1';
const VISUAL_PLAN_COCKPIT_DERIVATION_CONTRACT = 'mobius-visual-plan-cockpit-derivation-v1';
const SELECTION_RANKING_REFERENCE_CONTRACT = 'mobius-source-selection-ranking-reference-v1';
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

const SCENE_MATERIALIZATION_FIELDS = Object.freeze([
  'instructionalSequence',
  'preparedTrackSequence',
  'preparedStatefulSequence',
  'preparedSemanticSequence',
  'preparedInstructionalDiagram',
  'preparedInstructionalStill',
]);

function materializationReference(value, materializationEvidence) {
  if (!value || typeof value !== 'object') return null;
  const key = digest(value);
  materializationEvidence[key] ||= value;
  return key;
}

function externalizeAssetSequences(value, materializationEvidence) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.instructionalSequences)) return value;
  const { instructionalSequences, ...rest } = value;
  const instructionalSequenceRefs = [...new Set(instructionalSequences
    .map((sequence) => materializationReference(sequence, materializationEvidence)).filter(Boolean))];
  return {
    ...rest,
    ...(instructionalSequenceRefs.length ? { instructionalSequenceRefs } : {}),
  };
}

function hydrateMaterializationReference(reference, artifact) {
  const value = artifact?.materializationEvidence?.[reference];
  if (!value || digest(value) !== reference) throw failure('Visual materialization evidence is missing or corrupt.');
  return value;
}

function hydrateAssetSequences(value, artifact) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.instructionalSequenceRefs)) return value;
  const { instructionalSequenceRefs, ...rest } = value;
  return {
    ...rest,
    instructionalSequences: instructionalSequenceRefs.map((reference) => hydrateMaterializationReference(reference, artifact)),
  };
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

function rankingReference(entry, candidateEvidence, assetIds, materializationEvidence) {
  if (!entry || typeof entry !== 'object' || !entry.candidate || typeof entry.candidate !== 'object') return entry;
  const { candidate, ...ranking } = entry;
  const id = assetId(candidate);
  if (!id) return entry;
  if (!assetIds.has(id)) {
    const compactCandidate = externalizeAssetSequences(candidate, materializationEvidence);
    const evidenceKey = digest(compactCandidate);
    candidateEvidence[evidenceKey] ||= compactCandidate;
    ranking.candidateEvidenceRef = evidenceKey;
  }
  return { ...ranking, candidateAssetId: id };
}

function selectionEvidence(selection, candidateEvidence, assetIds, materializationEvidence) {
  const {
    selectedAssets = [], suggestedAssets = [],
    selectedAssetIds: storedSelected = [], suggestedAssetIds: storedSuggested = [],
    reviewItem, rankedEntries, ranked = [], ...rest
  } = selection || {};
  const referentSelections = (rest.referentSelections || []).map((referent) => {
    const {
      selectedAssets: selected = [], suggestedAssets: suggested = [],
      selectedAssetIds: storedSelected = [], suggestedAssetIds: storedSuggested = [], ...entry
    } = referent || {};
    return {
      ...entry,
      selectedAssetIds: selected.length ? selected.map(assetId).filter(Boolean) : storedSelected,
      suggestedAssetIds: suggested.length ? suggested.map(assetId).filter(Boolean) : storedSuggested,
    };
  });
  return {
    ...rest,
    rankingReferenceContract: SELECTION_RANKING_REFERENCE_CONTRACT,
    ranked: ranked.map((entry) => rankingReference(entry, candidateEvidence, assetIds, materializationEvidence)),
    selectedAssetIds: selectedAssets.length ? selectedAssets.map(assetId).filter(Boolean) : storedSelected,
    suggestedAssetIds: suggestedAssets.length ? suggestedAssets.map(assetId).filter(Boolean) : storedSuggested,
    referentSelections,
  };
}

function hydrateSelectionEvidence(evidence, artifact, assetsById) {
  if (evidence?.rankingReferenceContract !== SELECTION_RANKING_REFERENCE_CONTRACT) return evidence;
  const ranked = (evidence.ranked || []).map((reference) => {
    if (!reference?.candidateAssetId) return reference;
    const candidate = assetsById.get(reference.candidateAssetId)
      || artifact.candidateEvidence?.[reference.candidateEvidenceRef];
    if (!candidate || (reference.candidateEvidenceRef && digest(candidate) !== reference.candidateEvidenceRef)) {
      throw failure('Visual source-selection ranking evidence is missing or corrupt.');
    }
    const { candidateAssetId, candidateEvidenceRef, ...ranking } = reference;
    return { ...ranking, candidate: hydrateAssetSequences(candidate, artifact) };
  });
  const { rankingReferenceContract, ...rest } = evidence;
  return { ...rest, ranked };
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

function externalizeReviewItem(item, candidates, materializationEvidence) {
  if (!item || typeof item !== 'object') return item;
  return {
    ...item,
    candidates: (item.candidates || []).map((candidate) => {
      const compactCandidate = externalizeAssetSequences(candidate, materializationEvidence);
      const evidenceKey = digest(compactCandidate);
      candidates[evidenceKey] ||= compactCandidate;
      return { assetId: assetId(candidate), candidateEvidenceRef: evidenceKey };
    }),
  };
}

function compactPlan(plan, candidateEvidence, materializationEvidence) {
  if (!plan || typeof plan !== 'object') return plan;
  const hasValidation = plan.validation !== undefined;
  const validation = plan.validation && typeof plan.validation === 'object'
    ? (() => {
      const { selectedAssets, ...validationFields } = plan.validation;
      return {
        ...validationFields,
        ...(Array.isArray(selectedAssets) ? { selectedAssetIds: selectedAssets.map(assetId).filter(Boolean) } : {}),
      };
    })()
    : plan.validation;
  if (!plan.cockpit || typeof plan.cockpit !== 'object') {
    return { ...plan, ...(hasValidation ? { validation } : {}) };
  }
  const { cockpit, ...rawPlanFields } = plan;
  const planFields = { ...rawPlanFields, ...(hasValidation ? { validation } : {}) };
  const { assetCandidates, sourceReferences, ...cockpitFields } = cockpit;
  const derivedFields = Object.keys(cockpitFields)
    .filter((key) => Object.hasOwn(planFields, key) && isDeepStrictEqual(cockpitFields[key], planFields[key]));
  const uniqueCockpit = Object.fromEntries(Object.entries(cockpitFields)
    .filter(([key]) => !derivedFields.includes(key)));
  const derivation = {
    contract: VISUAL_PLAN_COCKPIT_DERIVATION_CONTRACT,
    derivedFields,
  };
  if (assetCandidates !== undefined) {
    derivation.assetCandidatesDeclared = true;
    derivation.assetCandidateEvidenceRefs = (assetCandidates || []).map((candidate) => {
      const compactCandidate = externalizeAssetSequences(candidate, materializationEvidence);
      const key = digest(compactCandidate);
      candidateEvidence[key] ||= compactCandidate;
      return { assetId: assetId(candidate), candidateEvidenceRef: key };
    });
  }
  if (sourceReferences !== undefined) {
    derivation.sourceReferencesDeclared = true;
    if (isDeepStrictEqual(sourceReferences, planFields.sourceRefs)) derivation.sourceReferencesMirrorPlan = true;
    else derivation.sourceReferences = sourceReferences;
  }
  return {
    ...planFields,
    ...(Object.keys(uniqueCockpit).length ? { cockpit: uniqueCockpit } : {}),
    cockpitDerivation: derivation,
  };
}

function hydratePlan(plan, artifact, assetsById) {
  if (!plan || typeof plan !== 'object') return plan;
  const hasValidation = plan.validation !== undefined;
  const validation = plan.validation && typeof plan.validation === 'object' && Array.isArray(plan.validation.selectedAssetIds)
    ? (() => {
      const { selectedAssetIds, ...validationFields } = plan.validation;
      return { ...validationFields, selectedAssets: selectedAssetIds.map((id) => assetsById.get(id)).filter(Boolean) };
    })()
    : plan.validation;
  if (!plan.cockpitDerivation) return { ...plan, ...(hasValidation ? { validation } : {}) };
  const { cockpitDerivation, cockpit = {}, ...planFields } = plan;
  if (cockpitDerivation.contract !== VISUAL_PLAN_COCKPIT_DERIVATION_CONTRACT) {
    throw failure('Visual Plan Cockpit derivation uses an unsupported contract.');
  }
  const derived = Object.fromEntries((cockpitDerivation.derivedFields || [])
    .filter((key) => Object.hasOwn(planFields, key)).map((key) => [key, planFields[key]]));
  if (cockpitDerivation.assetCandidatesDeclared) {
    derived.assetCandidates = (cockpitDerivation.assetCandidateEvidenceRefs || []).map((reference) => {
      const candidate = artifact?.candidateEvidence?.[reference?.candidateEvidenceRef];
      if (!candidate || digest(candidate) !== reference.candidateEvidenceRef) {
        throw failure('Visual Plan Cockpit candidate evidence is missing or corrupt.');
      }
      return hydrateAssetSequences(candidate, artifact);
    });
  }
  if (cockpitDerivation.sourceReferencesDeclared) {
    derived.sourceReferences = cockpitDerivation.sourceReferencesMirrorPlan
      ? (planFields.sourceRefs || []) : (cockpitDerivation.sourceReferences || []);
  }
  return { ...planFields, ...(hasValidation ? { validation } : {}), cockpit: { ...derived, ...cockpit } };
}

function compactScene(scene, materializationEvidence) {
  if (!scene || typeof scene !== 'object') return scene;
  const { visualPlan, canonicalVisualPlan, physicalState, ...sceneFields } = scene;
  const rest = { ...sceneFields };
  const materializationEvidenceRefs = {};
  for (const field of SCENE_MATERIALIZATION_FIELDS) {
    if (!rest[field]) continue;
    materializationEvidenceRefs[field] = materializationReference(rest[field], materializationEvidence);
    delete rest[field];
  }
  return {
    ...rest,
    ...(Object.keys(materializationEvidenceRefs).length ? { materializationEvidenceRefs } : {}),
    visualPlanId: canonicalVisualPlan?.ruleAtomId || visualPlan?.ruleAtomId || scene.atomId || null,
    physicalStateId: physicalState?.ruleAtomId || scene.atomId || null,
  };
}

function hydrateScene(scene, artifact) {
  if (!scene?.materializationEvidenceRefs) return scene;
  const { materializationEvidenceRefs, ...rest } = scene;
  return {
    ...rest,
    ...Object.fromEntries(Object.entries(materializationEvidenceRefs)
      .map(([field, reference]) => [field, hydrateMaterializationReference(reference, artifact)])),
  };
}

function compactVisualPlanMaterialization(value, materializationEvidence) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.records)) return value;
  return {
    ...value,
    records: value.records.map((record) => ({
      materializationEvidenceRef: materializationReference(record, materializationEvidence),
    })),
  };
}

function hydrateVisualPlanMaterialization(value, artifact) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.records)) return value;
  return {
    ...value,
    records: value.records.map((record) => (record?.materializationEvidenceRef
      ? hydrateMaterializationReference(record.materializationEvidenceRef, artifact) : record)),
  };
}

function validateArtifact(artifact, descriptor = null) {
  if (!artifact || ![VISUAL_EVIDENCE_ARTIFACT_CONTRACT, LEGACY_VISUAL_EVIDENCE_ARTIFACT_CONTRACT].includes(artifact.contract)
    || !artifact.projectId || !artifact.assetCatalog || !artifact.selectionEvidence || !artifact.candidateEvidence) {
    throw failure('Visual evidence artifact is missing or uses an unsupported contract.');
  }
  if (artifact.contract === VISUAL_EVIDENCE_ARTIFACT_CONTRACT
    && (!artifact.materializationEvidence || typeof artifact.materializationEvidence !== 'object'
      || Array.isArray(artifact.materializationEvidence))) {
    throw failure('Visual materialization evidence dictionary is missing.');
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
  for (const [key, evidence] of Object.entries(artifact.materializationEvidence || {})) {
    if (digest(evidence) !== key) throw failure('Visual materialization evidence checksum mismatch.');
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
  const materializationEvidence = Object.create(null);
  const assetIds = new Set((state.assets || []).map(assetId).filter(Boolean));
  const selectionEvidenceById = Object.create(null);
  const compactSelections = (state.sourceSelections || []).map((selection) => {
    const evidence = selectionEvidence(selection, candidateEvidence, assetIds, materializationEvidence);
    const key = digest(evidence);
    selectionEvidenceById[key] ||= evidence;
    return selectionReference(selection, key);
  });
  const compactReviews = (state.reviewItems || []).map((item) => externalizeReviewItem(item, candidateEvidence, materializationEvidence));
  const compactPlans = (state.visualPlans || []).map((plan) => compactPlan(plan, candidateEvidence, materializationEvidence));
  const compactScenes = (state.scenes || []).map((scene) => compactScene(scene, materializationEvidence));
  const compactMaterialization = compactVisualPlanMaterialization(state.visualPlanMaterialization, materializationEvidence);
  const artifact = {
    contract: VISUAL_EVIDENCE_ARTIFACT_CONTRACT,
    projectId,
    sourceSha256: sourceSha256 || null,
    assetCatalog: (state.assets || []).map((asset) => externalizeAssetSequences(asset, materializationEvidence)),
    selectionEvidence: selectionEvidenceById,
    candidateEvidence,
    materializationEvidence,
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
    materializationEvidenceCount: Object.keys(artifact.materializationEvidence).length,
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
    visualPlans: compactPlans,
    scenes: compactScenes,
    reviewItems: compactReviews,
    visualPlanMaterialization: compactMaterialization,
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
      return { ...hydrateAssetSequences(evidence, artifact), ...inline };
    }),
  };
}

function hydrateCanonicalProductionState(state, artifact) {
  if (!state || ![CANONICAL_STATE_STORAGE_CONTRACT, ...LEGACY_CANONICAL_STATE_STORAGE_CONTRACTS].includes(state.contract)) return state;
  validateArtifact(artifact, state.visualEvidenceArtifact);
  const hydratedAssets = artifact.assetCatalog.map((asset) => hydrateAssetSequences(asset, artifact));
  const byId = new Map(hydratedAssets.map((asset) => [assetId(asset), asset]));
  const reviewItems = (state.reviewItems || []).map((item) => hydrateVisualReviewItem(item, artifact));
  const reviewsById = new Map(reviewItems.filter((item) => item?.id).map((item) => [item.id, item]));
  const selections = (state.sourceSelections || []).map((reference) => {
    const evidence = artifact.selectionEvidence[reference.visualEvidenceSelectionRef];
    if (!evidence || digest(evidence) !== reference.visualEvidenceSelectionRef) throw failure('Visual selection evidence is missing or corrupt.');
    const hydratedEvidence = hydrateSelectionEvidence(evidence, artifact, byId);
    return {
      ...hydratedEvidence,
      selectedAssets: (hydratedEvidence.selectedAssetIds || []).map((id) => byId.get(id)).filter(Boolean),
      suggestedAssets: (hydratedEvidence.suggestedAssetIds || []).map((id) => byId.get(id)).filter(Boolean),
      ...(reference.reviewItemId ? { reviewItem: reviewsById.get(reference.reviewItemId) || { id: reference.reviewItemId } } : {}),
    };
  });
  return {
    ...state,
    contract: state.compilerContract || state.contract,
    assets: hydratedAssets,
    selectedAssets: (state.selectedAssets || []).map((reference) => byId.get(assetId(reference))).filter(Boolean),
    sourceSelections: selections,
    visualPlans: (state.visualPlans || []).map((plan) => hydratePlan(plan, artifact, byId)),
    scenes: (state.scenes || []).map((scene) => hydrateScene(scene, artifact)),
    reviewItems,
    visualPlanMaterialization: hydrateVisualPlanMaterialization(state.visualPlanMaterialization, artifact),
  };
}

module.exports = {
  CANONICAL_STATE_STORAGE_CONTRACT,
  LEGACY_CANONICAL_STATE_STORAGE_CONTRACT,
  LEGACY_CANONICAL_STATE_STORAGE_CONTRACTS,
  VISUAL_EVIDENCE_ARTIFACT_CONTRACT,
  LEGACY_VISUAL_EVIDENCE_ARTIFACT_CONTRACT,
  VISUAL_PLAN_COCKPIT_DERIVATION_CONTRACT,
  SELECTION_RANKING_REFERENCE_CONTRACT,
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
