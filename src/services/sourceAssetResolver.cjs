'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { candidateDetailRatio, sourceAuthorityRank } = require('./sourceDetailLineage.cjs');
const { teachingSceneLayout, containedDisplayBounds } = require('./presentationDesignSystem.cjs');
const { verifiedInstructionalSequence, instructionalSequenceSourceAssets } = require('./physicalGameState.cjs');
const { DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT } = require('./objectAwareCrop.cjs');
const { componentTrust } = require('./ruleVisualReferentRecovery.cjs');

const SOURCE_ASSET_RESOLVER_CONTRACT = 'mobius-canonical-source-asset-resolver-v8';
const VISUAL_REFERENT_NORMALIZATION_CONTRACT = 'mobius-visual-referent-normalization-v5';
const OBJECT_VISUAL_EVIDENCE_CONTRACT = 'mobius-object-visual-evidence-v2';
// This version is also a dependency of the orchestration checkpoint.  Keep it
// exported so a recovery implementation change cannot be silently hidden by a
// still-valid outer checkpoint.
const OFFICIAL_PUBLISHER_SOURCE_RECOVERY_CONTRACT = 'mobius-official-publisher-source-recovery-v3';
const AUTO_ACCEPT_CONFIDENCE = 0.82;
const AUTO_ACCEPT_MARGIN = 0.08;
const fileShaCache = new Map();

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizedTokens = (values) => new Set((Array.isArray(values) ? values : [values])
  .flatMap((value) => clean(value).toLocaleLowerCase('fr-CA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/))
  .filter((token) => token.length >= 3));

function sha256File(filePath) {
  const absolute = path.resolve(filePath);
  const stat = fs.statSync(absolute);
  const signature = `${stat.size}:${stat.mtimeMs}`;
  const cached = fileShaCache.get(absolute);
  if (cached?.signature === signature) return cached.sha256;
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  fileShaCache.set(absolute, { signature, sha256 });
  return sha256;
}

function assetPath(asset = {}) {
  return asset.displayPath || asset.renderPath || asset.filePath || asset.file_path || asset.path || asset.localPath || asset.sourceImage || null;
}

function normalizeAuthority(asset = {}) {
  const raw = String(asset.sourceAuthority || asset.sourceType || asset.extractionMethod || '').toUpperCase().replace(/[\s-]+/g, '_');
  const region=asset.provenance?.sourceRegion;
  if(region?.method==='pymupdf-native-raster-cluster' && region.sourcePdfSha256===asset.sourcePdfSha256
    && region.nativeRasterContributors?.length && assetPath(asset) && fs.existsSync(assetPath(asset))
    && sha256File(assetPath(asset))===region.sha256)return 'NATIVE_EMBEDDED';
  if (/PUBLISHER|PRESS/.test(raw)) return 'OFFICIAL_PUBLISHER_HIGH_RES';
  if (/AUTHORIZED_EXACT_EDITION|OFFICIAL_HIGH_RES/.test(raw)) return 'AUTHORIZED_EXACT_EDITION_HIGH_RES';
  if (/BGG/.test(raw)) return 'OFFICIAL_BGG_ASSET';
  if (/XOBJECT|NATIVE_EMBEDDED|PYMUPDF_NATIVE/.test(raw)) return 'NATIVE_EMBEDDED';
  if (/HIGH_DPI|PAGE_CROP|FOCUSED/.test(raw)) return 'HIGH_DPI_PAGE_CROP';
  if (/THUMBNAIL/.test(raw)) return 'THUMBNAIL';
  return raw || 'UNKNOWN';
}

function normalizeCandidate(asset = {}) {
  const file = assetPath(asset);
  // `dimensions` is often a display/upscaled derivative in a PDF manifest.
  // Keep the native/source dimensions separate so a 3x derivative can never
  // masquerade as more instructional detail than the original source has.
  const width = Number(asset.trueDetailDimensions?.width || asset.nativeWidthPx || asset.original_dimensions?.width || asset.sourceDimensions?.width || asset.width || asset.dimensions?.width || 0);
  const height = Number(asset.trueDetailDimensions?.height || asset.nativeHeightPx || asset.original_dimensions?.height || asset.sourceDimensions?.height || asset.height || asset.dimensions?.height || 0);
  const semanticObjects = [
    ...(asset.semanticObjects || []), ...(asset.semanticTags || []),
    asset.componentRef, asset.componentName, asset.label, asset.caption, asset.title, asset.alt, asset.category, asset.description,
  ].filter(Boolean);
  return {
    ...asset,
    id: clean(asset.id || asset.assetId || asset.imageId),
    filePath: file ? path.resolve(file) : null,
    width,
    height,
    nativeWidthPx: width,
    nativeHeightPx: height,
    sourceAuthority: normalizeAuthority(asset),
    sourceAuthorityRank: sourceAuthorityRank(normalizeAuthority(asset)),
    semanticObjects,
    componentRefs: [...new Set([...(asset.componentRefs || []), asset.componentRef].filter(Boolean))],
    referentAliases: [...new Set([...(asset.referentAliases || []), ...(asset.aliases || [])].filter(Boolean))],
    containsActualGamePixels: asset.containsActualGamePixels !== false,
    visualClassification: asset.visualClassification || (/board|track/i.test(`${asset.category} ${asset.label}`) ? 'REAL_BOARD_OR_TRACK'
      : /card|wonder/i.test(`${asset.category} ${asset.label}`) ? 'REAL_CARD_OR_WONDER' : 'REAL_COMPONENT'),
    cropCompleteness: asset.cropCompleteness === true ? 'complete' : (asset.cropCompleteness || 'unknown'),
    cropPurity: asset.cropPurity === true ? 'clean' : (asset.cropPurity || 'unknown'),
    sourceRefs: asset.sourceRefs?.length ? asset.sourceRefs : (asset.provenance ? [asset.provenance] : []),
    reviewState: asset.reviewState || 'needs_review',
    physicalState: asset.physicalState || null,
    faceState: asset.faceState || null,
    orientation: asset.orientation || null,
    location: asset.location || null,
    bindingConfidence: asset.bindingConfidence == null ? null : Number(asset.bindingConfidence),
    bindingReviewRequired: asset.bindingReviewRequired === true,
  };
}

function normalizeReferent(value) {
  return clean(value).toLocaleLowerCase('fr-CA').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

/**
 * Joins source-grounded component inventory terms to extracted image evidence.
 * It does not decide that a weak binding is safe: low-confidence bindings are
 * preserved as candidates and surfaced to Cockpit with their provenance.
 */
function normalizeVisualReferents({ componentEvidence = {}, sourceAssets = [], components = [] } = {}) {
  const componentCatalog = new Map((components || []).filter((component) => component?.id)
    .map((component) => [component.id, { ...component, trust: componentTrust(component) }]));
  const classifyBinding = (binding) => ({
    ...binding,
    componentTrust: componentCatalog.get(binding.componentId)?.trust || {
      state: 'REVIEW_ONLY_EXTRACTION_HYPOTHESIS',
      confidence: 0,
      reasons: ['component-catalog-record-missing'],
    },
  });
  const componentBindings = (componentEvidence.componentBindings || []).map(classifyBinding);
  const evidenceAssets = new Map((componentEvidence.assets || []).filter((asset) => asset?.id).map((asset) => [asset.id, asset]));
  const bindingsByAssetId = new Map();
  for (const binding of componentBindings) {
    if (!binding?.assetId) continue;
    const rows = bindingsByAssetId.get(binding.assetId) || [];
    rows.push(binding);
    bindingsByAssetId.set(binding.assetId, rows);
  }
  const rawById = new Map((sourceAssets || []).filter((asset) => asset?.id).map((asset) => [asset.id, asset]));
  const ids = new Set([...rawById.keys(), ...evidenceAssets.keys()]);
  const knownComponentIds = new Set(componentBindings
    .filter((binding) => binding.componentTrust.state !== 'REJECTED_EXTRACTION_FRAGMENT')
    .map((binding) => binding.componentId).filter(Boolean));
  const assets = [...ids].map((id) => {
    const raw = rawById.get(id) || {};
    const evidence = evidenceAssets.get(id) || {};
    const bindings = bindingsByAssetId.get(id) || [];
    const semanticObjects = uniqueStrings([
      ...(raw.semanticObjects || []), ...(raw.semanticTags || []), raw.label, raw.componentName, raw.category,
      ...(evidence.semanticObjects || []), evidence.componentName, evidence.category, evidence.surroundingTextEvidence,
    ]);
    const componentRefs = uniqueStrings(raw.componentRefs || []);
    const aliases = uniqueStrings(raw.referentAliases || []);
    const sourcePage = evidence.pageNumber || raw.source_page || raw.sourcePage || (Number.isInteger(Number(raw.page_index)) ? Number(raw.page_index) + 1 : null);
    const candidate = normalizeCandidate({
      ...raw,
      ...evidence,
      id,
      filePath: assetPath(raw) || assetPath(evidence),
      renderPath: assetPath(raw) || assetPath(evidence),
      nativeWidthPx: raw.original_dimensions?.width || raw.nativeWidthPx || evidence.nativeWidthPx || raw.width || raw.dimensions?.width || 0,
      nativeHeightPx: raw.original_dimensions?.height || raw.nativeHeightPx || evidence.nativeHeightPx || raw.height || raw.dimensions?.height || 0,
      sourceAuthority: raw.sourceAuthority || evidence.sourceAuthority || evidence.extractionMethod || raw.extractionMethod,
      category: raw.category || evidence.category || bindings[0]?.category || null,
    componentRefs,
    referentAliases: aliases,
      bindingHypotheses: bindings,
      objectVisualEvidence: raw.objectVisualEvidence || evidence.objectVisualEvidence || [],
      objectAnalysisAttempts: raw.objectAnalysisAttempts || [],
      bindingConfidence: bindings.length ? Math.max(...bindings.map((binding) => Number(binding.confidence || 0))) : null,
      bindingReviewRequired: bindings.some((binding) => binding.reviewState === 'needs_review'
        || (binding.reviewRequired === true && binding.reviewState !== 'accepted')),
      semanticObjects,
      sourceRefs: [
        ...(raw.sourceRefs || []), ...(evidence.sourceRefs || []),
        ...(sourcePage ? [{ page: Number(sourcePage), source: 'hephaestus-component-evidence' }] : []),
      ],
      provenance: {
        ...(raw.provenance || {}), ...(evidence.provenance || {}),
        componentBindings: bindings.map((binding) => ({
          componentId: binding.componentId || null,
          componentName: binding.componentName || null,
          category: binding.category || null,
          confidence: Number(binding.confidence || 0),
          reviewState: binding.reviewState || null,
          sourcePage: binding.sourcePage || null,
        })),
      },
      // A native XObject is not automatically an isolated, complete object.
      // Preserve explicit crop evidence only; unknown stays review-required.
      cropCompleteness: raw.cropCompleteness || evidence.cropCompleteness || 'unknown',
      cropPurity: raw.cropPurity || evidence.cropPurity || 'unknown',
    });
    // HEPHAESTUS' coarse binding is a hypothesis. A source-pixel COMPONENT
    // verdict for the exact current asset can corroborate that hypothesis, but
    // never replaces scene/state proof or a source-derived component ID.
    const pixelVerifiedComponentRefs = uniqueStrings((candidate.objectVisualEvidence || [])
      .map((row) => row.requiredObject)
      .filter((componentId) => knownComponentIds.has(componentId))
      .filter((componentId) => {
        const proof = objectEvidenceFor(candidate, componentId, null, { allowReusableIdentity: true });
        return proof?.present === true && proof.complete === true && proof.isolated === true
          && proof.stateCompatible === true && Number(proof.confidence) >= 0.9
          && (proof.visualRole === 'COMPONENT' || (proof.contract === 'mobius-object-visual-evidence-v1' && !proof.visualRole));
      }));
    return normalizeCandidate({
      ...candidate,
      componentRefs: uniqueStrings([...(candidate.componentRefs || []), ...pixelVerifiedComponentRefs]),
      pixelVerifiedComponentRefs,
      bindingReviewRequired: bindings.some((binding) => (binding.reviewState === 'needs_review'
        || (binding.reviewRequired === true && binding.reviewState !== 'accepted'))
        && !pixelVerifiedComponentRefs.includes(binding.componentId)),
    });
  });
  // The extraction binding records where HEPHAESTUS first hypothesized a
  // component. Pixel analysis may subsequently prove that same canonical
  // component in a different native, publisher, or source-faithful derived
  // asset. Reconcile by source-grounded component identity, not by preserving
  // the coarse hypothesis' asset id. The new asset/provenance supersedes only
  // the binding hypothesis; it does not establish any scene-specific state.
  const pixelVerifiedBindings = [];
  const seenVerifiedBindings = new Set();
  for (const binding of componentBindings) {
    for (const asset of assets.filter((candidate) => (candidate.pixelVerifiedComponentRefs || []).includes(binding.componentId))) {
      const key = `${binding.componentId}:${asset.id}`;
      if (seenVerifiedBindings.has(key)) continue;
      seenVerifiedBindings.add(key);
      pixelVerifiedBindings.push({
        ...binding,
        assetId: asset.id,
        hypothesisAssetId: binding.assetId || null,
        reviewState: 'accepted',
        reviewRequired: false,
        confidence: Math.max(Number(binding.confidence || 0), ...asset.objectVisualEvidence
          .filter((row) => row.requiredObject === binding.componentId)
          .map((row) => Number(row.confidence || 0))),
        reconciliation: binding.assetId === asset.id
          ? 'pixel-verified-component-identity'
          : 'pixel-verified-component-identity-supersedes-coarse-asset-hypothesis',
        provenance: {
          coarseBindingAssetId: binding.assetId || null,
          verifiedAssetId: asset.id,
          verifiedAssetSourceRefs: asset.sourceRefs || [],
          verifiedAssetProvenance: asset.provenance || null,
        },
      });
    }
  }
  return {
    contract: VISUAL_REFERENT_NORMALIZATION_CONTRACT,
    assets,
    bindings: componentBindings,
    pixelVerifiedBindings,
    rejectedExtractionBindings: componentBindings.filter((binding) => binding.componentTrust.state === 'REJECTED_EXTRACTION_FRAGMENT')
      .map((binding) => ({ ...binding, reviewState: 'rejected', reviewRequired: false,
        rejectionReason: 'Source extraction row is not a canonical physical-component identity.' })),
    unresolvedBindings: componentBindings.filter((binding) => binding.componentTrust.state !== 'REJECTED_EXTRACTION_FRAGMENT')
      .filter((binding) => (binding.reviewState === 'needs_review' || binding.reviewRequired === true)
      && !pixelVerifiedBindings.some((resolved) => resolved.componentId === binding.componentId)),
  };
}

function semanticScore(candidate, requiredObjects = []) {
  const ids = requiredObjects.filter((value) => /^(comp|component)[-_]/i.test(value));
  if (ids.length) return ids.filter((id) => (candidate.componentRefs || []).includes(id)
    || (candidate.objectVisualEvidence || []).some((row) => row.requiredObject === id && row.present === true)).length / ids.length;
  const wanted = normalizedTokens(requiredObjects);
  if (!wanted.size) return 0.75;
  const found = normalizedTokens([
    ...(candidate.semanticObjects || []), ...(candidate.componentRefs || []), ...(candidate.referentAliases || []),
  ]);
  const overlap = [...wanted].filter((token) => found.has(token)).length;
  return overlap / wanted.size;
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validEvidenceBoundCrop(row, candidate, childSha) {
  if (row.contract !== DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT || row.method !== 'deterministic-evidence-bound-crop'
    || row.assetId !== candidate.id || row.imageSha256 !== childSha) return false;
  const parent = row.parentEvidence;
  const lineage = row.derivedFrom;
  const recorded = candidate.provenance?.evidenceBoundCrop;
  if (!parent || !lineage || !recorded || parent.method !== 'provider-pixel-analysis'
    || !['COMPONENT', 'TRACK'].includes(parent.visualRole)
    || parent.assetId !== lineage.parentAssetId || parent.imageSha256 !== lineage.parentImageSha256
    || hashJson(parent) !== lineage.parentEvidenceHash || !recorded.parentEvidenceHashes?.includes(lineage.parentEvidenceHash)
    || lineage.parentAssetId !== recorded.parentAssetId || lineage.parentImageSha256 !== recorded.parentImageSha256
    || lineage.transform !== 'exact-parent-pixel-crop-v1' || recorded.transform !== lineage.transform) return false;
  const parentPath = candidate.provenance?.parentPath;
  if (!parentPath || !fs.existsSync(parentPath)
    || sha256File(parentPath) !== lineage.parentImageSha256) return false;
  const parentPdf = candidate.provenance?.sourcePdfSha256 || candidate.sourcePdfSha256 || null;
  if ((lineage.sourcePdfSha256 || null) !== (parentPdf || null)
    || (recorded.sourcePdfSha256 || null) !== (parentPdf || null)) return false;
  const expectedBox = candidate.provenance?.bbox;
  if (!expectedBox || JSON.stringify(expectedBox) !== JSON.stringify(lineage.cropBox)
    || JSON.stringify(expectedBox) !== JSON.stringify(recorded.cropBox)) return false;
  return Array.isArray(row.bbox) && row.bbox.length === 4 && row.bbox.every(Number.isFinite)
    && row.bbox[0] > 0 && row.bbox[1] > 0 && row.bbox[2] < 1 && row.bbox[3] < 1;
}

function objectEvidenceFor(candidate, referent, sceneId = null, { allowReusableIdentity = false } = {}) {
  const rows = (candidate.objectVisualEvidence || []).filter((row) => (row.contract === OBJECT_VISUAL_EVIDENCE_CONTRACT
    || (row.contract === 'mobius-object-visual-evidence-v1' && !row.visualRole)
    || row.contract === DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT)
    && row.requiredObject === referent && row.assetId === candidate.id);
  if (!rows.length || !candidate.filePath || !fs.existsSync(candidate.filePath)) return null;
  const sha = sha256File(candidate.filePath);
  const valid = rows.filter((row) => row.imageSha256 === sha && row.evidencePacketHash && row.model && row.reason
    && (row.method === 'provider-pixel-analysis' || validEvidenceBoundCrop(row, candidate, sha)));
  const scoped = valid.find((row) => !sceneId || row.sceneId === sceneId);
  if (scoped) return scoped;
  // An exact, provider-measured COMPONENT proof establishes only the visual
  // identity of the same physical object. It can be reused by a different
  // static scene, but never as proof of a relationship, state, transition or
  // placement that was not measured in that scene.
  if (!allowReusableIdentity || !sceneId) return null;
  return valid.find((row) => (row.visualRole === 'COMPONENT'
      || (row.contract === 'mobius-object-visual-evidence-v1' && !row.visualRole))
    && row.present === true && row.complete === true && row.isolated === true
    && row.stateCompatible === true && Number(row.confidence) >= 0.9) || null;
}

function requiresSceneSpecificEvidence(requirement = {}) {
  // Component discovery and identity binding deliberately run before a
  // stateful scene is composed.  A measured card, token or board can prove
  // that its own pixels are real and complete, but it cannot by itself prove
  // a later movement, pile, placement or relationship.  The compiler marks
  // this bounded first phase explicitly; the final composition remains
  // mandatory for the full scene requirement.
  if (requirement.componentIdentityOnly === true) return false;
  return Boolean(requirement.transitionRequired || requirement.setupPlacementRequired
    || requirement.layeredStateRequired || requirement.trackStateRequired
    || requirement.requiredRelationship || requirement.requiredState
    || requirement.beforeState || requirement.actionState || requirement.afterState
    || requirement.requiredOrientation || requirement.faceStateRequired
    || requirement.requiredQuantities?.length || Object.keys(requirement.physicalStateRequirement || requirement.physicalState || {}).length);
}

function evaluateCandidate(candidate, requirement = {}, displayBounds = { width: 900, height: 700 }) {
  const fileExists = Boolean(candidate.filePath && fs.existsSync(candidate.filePath));
  const sequence=verifiedInstructionalSequence(candidate,requirement,requirement.evidenceSceneId);
  let actualDisplayBounds = displayBounds;
  if (displayBounds?.presentationScene) {
    const s = displayBounds.presentationScene;
    const layout = teachingSceneLayout({ ...s, layout: {
      ...s.layout,
      visualAspectRatio: candidate.width / candidate.height || 1,
      maximumImageWidthPx: Number(candidate.nativeWidthPx || candidate.width || 0) / 0.8,
      maximumImageHeightPx: Number(candidate.nativeHeightPx || candidate.height || 0) / 0.8,
    } }, displayBounds.width, displayBounds.height);
    actualDisplayBounds = containedDisplayBounds(candidate, { width: layout.imageWidth, height: layout.imageHeight });
  }
  if(sequence)actualDisplayBounds=sequence.frames[0].actualDisplayBounds;
  const detailRatio = candidateDetailRatio(candidate, actualDisplayBounds);
  const semantic = semanticScore(candidate, requirement.requiredObjects || []);
  const authority = Math.min(1, candidate.sourceAuthorityRank / 50);
  const detail = Math.min(1, detailRatio);
  const sceneSpecificEvidence = requiresSceneSpecificEvidence(requirement);
  const proofs = (requirement.requiredObjects || []).map((id) => objectEvidenceFor(candidate, id, requirement.evidenceSceneId, {
    // A final, source-bound composition verdict owns the scene-specific
    // transition/relationship proof.  It is therefore safe to reuse an exact
    // COMPONENT identity measurement for the source pixels used in that
    // composition.  Without such a verdict, a stateful scene still requires
    // its own evidence and cannot inherit a component label.
    allowReusableIdentity: Boolean(sequence) || !sceneSpecificEvidence,
  }));
  const complete = proofs.length ? proofs.every((proof) => proof?.complete === true) : candidate.cropCompleteness === 'complete';
  const pure = proofs.length ? proofs.every((proof) => proof?.isolated === true) : candidate.cropPurity === 'clean';
  const accepted = candidate.reviewState === 'accepted';
  const invalid = candidate.invalidated === true || candidate.directorRejectedForSameDefect === true;
  const hardViolations = [];
  if (requirement.actualGameAssetRequired && !proofs.length) hardViolations.push('required-referent-unresolved');
  for (let index = 0; index < proofs.length; index += 1) {
    const proof = proofs[index];
    const id = requirement.requiredObjects[index];
    if (!proof) { hardViolations.push(`object-pixel-evidence-missing:${id}`); continue; }
    if (proof.contract === OBJECT_VISUAL_EVIDENCE_CONTRACT && !['LOCALIZATION', 'COMPONENT'].includes(proof.visualRole)) hardViolations.push(`object-role-unverified:${id}`);
    if (proof.visualRole === 'LOCALIZATION') hardViolations.push(`localization-not-display-evidence:${id}`);
    if (proof.visualRole === 'COMPONENT' && sceneSpecificEvidence && !sequence) hardViolations.push(`composition-state-verification-required:${id}`);
    if (proof.present !== true || Number(proof.confidence) < 0.9) hardViolations.push(`object-identity-unverified:${id}`);
    const box = proof.bbox;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)
      || box[0] < 0 || box[1] < 0 || box[2] > 1 || box[3] > 1 || box[2] <= box[0] || box[3] <= box[1]) {
      hardViolations.push(`object-bounds-unverified:${id}`);
    } else {
      if ((box[2] - box[0]) * (box[3] - box[1]) < 0.5) hardViolations.push(`object-focus-insufficient:${id}`);
      const nativeBoundary = candidate.nativeSourceEvidence?.nativeImage === true
        && candidate.nativeSourceEvidence.assetSha256 === proof.imageSha256
        && candidate.nativeSourceEvidence.sourcePdfSha256 === candidate.sourcePdfSha256
        && proof.visualRole === 'COMPONENT' && proof.complete === true && proof.isolated === true;
      if ((box[0] <= 0 || box[1] <= 0 || box[2] >= 1 || box[3] >= 1) && !nativeBoundary) hardViolations.push(`object-edge-unverified:${id}`);
    }
    if (proof.stateCompatible !== true) hardViolations.push(`object-state-unverified:${id}`);
    // The final composition packet, when present, already binds the exact
    // scene requirement to the rendered frames.  Its component identity proof
    // may be reused for the source pixels; do not require that old identity
    // proof to redundantly claim this scene's transition/relationship.
    if (sceneSpecificEvidence && !sequence) {
      for (const key of ['requiredState', 'requiredOrientation', 'requiredQuantities', 'requiredRelationship', 'beforeState', 'actionState', 'afterState', 'transitionRequired', 'setupPlacementRequired', 'layeredStateRequired', 'faceStateRequired', 'trackStateRequired']) {
        const expected = requirement[key];
        if (expected == null || expected === false || (Array.isArray(expected) && !expected.length)) continue;
        if (JSON.stringify(proof.evidenceRequirement?.[key]) !== JSON.stringify(expected)) hardViolations.push(`object-evidence-state-scope-mismatch:${key}`);
      }
    }
  }
  if (!fileExists) hardViolations.push('missing-file');
  if (candidate.sourceAuthority === 'THUMBNAIL') hardViolations.push('thumbnail-final-use');
  if (detailRatio < 0.8) hardViolations.push('source-detail-insufficient');
  if (!complete) hardViolations.push('crop-completeness-unverified');
  if (!pure) hardViolations.push('crop-purity-unverified');
  if (semantic < 0.5) hardViolations.push('semantic-object-mismatch');
  if (candidate.bindingReviewRequired && Number(candidate.bindingConfidence || 0) < 0.65 && !proofs.some((proof) => proof?.present === true)) hardViolations.push('component-identity-unverified');
  const requiredState = requirement.physicalStateRequirement || requirement.physicalState || {};
  for (const [key, expected] of Object.entries(requiredState || {})) {
    if (expected == null || expected === 'UNKNOWN') continue;
    const actual = candidate.physicalState?.[key] ?? candidate[key];
    if (actual == null || actual === 'UNKNOWN') hardViolations.push(`physical-state-unverified:${key}`);
    else if (String(actual).toUpperCase() !== String(expected).toUpperCase()) hardViolations.push(`physical-state-mismatch:${key}`);
  }
  if (invalid) hardViolations.push('invalidated-asset');
  const measuredEvidenceBonus = proofs.length && proofs.every(Boolean)
    ? Math.min(0.06, Math.min(...proofs.map((proof) => Number(proof.confidence || 0))) * 0.06)
    : 0;
  const confidence = Math.max(0, Math.min(1,
    semantic * 0.38 + authority * 0.24 + detail * 0.18 + (complete ? 0.08 : 0) + (pure ? 0.06 : 0)
      + Math.max(accepted ? 0.06 : 0, measuredEvidenceBonus)));
  return {
    candidate,
    confidence: Number(confidence.toFixed(4)),
    semanticScore: Number(semantic.toFixed(4)),
    trueSourcePixelsPerDisplayPixel: Number(detailRatio.toFixed(4)),
    actualDisplayBounds: { width: actualDisplayBounds.width, height: actualDisplayBounds.height },
    hardViolations,
    valid: hardViolations.length === 0,
  };
}

function classifyFailure(ranked = []) {
  if (!ranked.length) return ['TRUE_ASSET_MISSING'];
  const codes = new Set(ranked.flatMap((entry) => entry.hardViolations || []));
  const classes = [];
  if ([...codes].some((code) => code.includes('semantic-object-mismatch'))) classes.push('SEMANTIC_MATCH_TOO_WEAK');
  if ([...codes].some((code) => code.includes('component-identity-unverified') || code.startsWith('object-pixel-') || code.startsWith('object-identity-'))) classes.push('COMPONENT_IDENTITY_MISMATCH');
  if ([...codes].some((code) => code.includes('source-detail'))) classes.push('DETAIL_RESOLUTION_TOO_WEAK');
  if ([...codes].some((code) => code.includes('crop-') || code.startsWith('object-edge-') || code.startsWith('object-focus-') || code.startsWith('object-bounds-'))) classes.push('CROP_OR_SILHOUETTE_FAILURE');
  if ([...codes].some((code) => code.includes('physical-state-') || code.startsWith('object-state-') || code.startsWith('object-evidence-state-'))) classes.push('PHYSICAL_STATE_MISMATCH');
  if ([...codes].some((code) => code.includes('missing-file'))) classes.push('SOURCE_CANDIDATE_NOT_GENERATED');
  if (!classes.length) classes.push('MISSING_COMPONENT_BINDING');
  return classes;
}

function recommendedOperatorAction({ ranked = [], failureClassification = [] } = {}) {
  if (!ranked.length) return 'Locate or add an authoritative source asset for the required referent; do not substitute decorative imagery.';
  if (failureClassification.includes('DETAIL_RESOLUTION_TOO_WEAK') || failureClassification.includes('CROP_OR_SILHOUETTE_FAILURE')) {
    return 'Select a complete, higher-detail authoritative source or a deterministic source-faithful crop; reject the listed weak derivatives.';
  }
  if (failureClassification.includes('SEMANTIC_MATCH_TOO_WEAK')) return 'Choose the candidate that visibly represents the named component, or mark the referent/source relationship unresolved.';
  if (failureClassification.includes('PHYSICAL_STATE_MISMATCH')) return 'Choose evidence that shows the required face/orientation/location/state, or provide a source-grounded state visual.';
  return 'Choose one unambiguous, source-grounded candidate from the ranked evidence, or confirm that source evidence is insufficient.';
}

function buildVisualReviewItem({ atom, requirement = {}, ranked = [], reason, referent = null } = {}) {
  const failureClassification = classifyFailure(ranked);
  const idSuffix = referent ? `:${normalizeReferent(referent).replace(/\s+/g, '-') || 'referent'}` : '';
  return {
    id: `visual-review:${atom?.id || 'unknown'}${idSuffix}`,
    contract: 'mobius-cockpit-visual-review-item-v2',
    scopeType: 'VISUAL_REQUIREMENT',
    kind: 'visual-source-selection',
    sceneId: atom?.id ? `knowledge-${atom.id}` : null,
    visualPlanId: atom?.id || null,
    ruleAtomId: atom?.id || null,
    ruleAtomIds: atom?.id ? [atom.id] : [],
    status: 'needs_visual_review',
    requiredObject: referent || null,
    requiredObjects: requirement.requiredObjects || [],
    teachingPurpose: requirement.purpose || atom?.title || null,
    physicalStateRequirement: requirement.physicalStateRequirement || requirement.physicalState || null,
    reason,
    failureClassification,
    candidateIds: [...new Set(ranked.map((entry) => entry.candidate.id))],
    candidates: [...new Map(ranked.map((entry) => [entry.candidate.id, entry])).values()].map((entry) => ({
      assetId: entry.candidate.id,
      thumbnailPath: entry.candidate.filePath || null,
      sourceRefs: entry.candidate.sourceRefs || [],
      provenance: entry.candidate.provenance || null,
      semanticScore: entry.semanticScore,
      detailRatio: entry.trueSourcePixelsPerDisplayPixel,
      confidence: entry.confidence,
      valid: entry.valid,
      rejectionReasons: entry.hardViolations,
      objectVisualEvidence: entry.candidate.objectVisualEvidence || [],
      objectAnalysisAttempts: entry.candidate.objectAnalysisAttempts || [],
      evidenceStatus: (entry.candidate.objectVisualEvidence || []).length ? 'MEASURED_NOT_NECESSARILY_VALID' : 'UNKNOWN',
      bindingHypotheses: entry.candidate.bindingHypotheses || [],
    })),
    recommendedOperatorAction: recommendedOperatorAction({ ranked, failureClassification }),
  };
}

function rankSourceAssetCandidates({ requirement = {}, candidates = [], displayBounds } = {}) {
  const normalized = candidates.map(normalizeCandidate);
  const evaluated = normalized.map((candidate) => evaluateCandidate(candidate, requirement, displayBounds));
  return evaluated.sort((left, right) => {
    if (left.valid !== right.valid) return left.valid ? -1 : 1;
    return right.confidence - left.confidence
      || right.candidate.sourceAuthorityRank - left.candidate.sourceAuthorityRank
      || right.trueSourcePixelsPerDisplayPixel - left.trueSourcePixelsPerDisplayPixel
      || left.candidate.id.localeCompare(right.candidate.id);
  });
}

function candidateEquivalenceKey(entry, requirement = {}) {
  const referents = requirement.requiredObjects || [];
  const proofKeys = referents.map((referent) => {
    const proof = objectEvidenceFor(entry.candidate, referent, requirement.evidenceSceneId, {
      allowReusableIdentity: !requiresSceneSpecificEvidence(requirement),
    });
    if (!proof) return null;
    return entry.candidate.provenance?.evidenceBoundCrop?.componentEvidenceHash
      || proof.derivedFrom?.parentEvidenceHash || hashJson(proof);
  });
  if (proofKeys.length && proofKeys.every(Boolean)) return `evidence:${hashJson(proofKeys)}`;
  const exactPixelSha = entry.candidate.contentHash
    || (entry.candidate.filePath && fs.existsSync(entry.candidate.filePath)
      ? sha256File(entry.candidate.filePath) : null);
  return exactPixelSha ? `pixels:${exactPixelSha}` : `asset:${entry.candidate.id}`;
}

function groupEquivalentCandidates(entries = [], requirement = {}) {
  const groups = new Map();
  for (const entry of entries) {
    const key = candidateEquivalenceKey(entry, requirement);
    const group = groups.get(key) || { key, representative: entry, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function resolveSourceAssets({ atom, requirement = atom?.visualRequirement || {}, candidates = [], displayBounds, minimumAssets = 1 } = {}) {
  const ranked = rankSourceAssetCandidates({ requirement, candidates, displayBounds });
  const valid = ranked.filter((entry) => entry.valid);
  // A native candidate and a deterministic crop carrying the exact same
  // measured component proof are presentation variants, not independent
  // semantic choices. Compare confidence margins between distinct evidence
  // groups while retaining every variant for Cockpit/provenance.
  const equivalentGroups = groupEquivalentCandidates(valid, requirement);
  const selectedGroups = equivalentGroups.slice(0, Math.max(1, minimumAssets));
  const selected = selectedGroups.map((group) => group.representative);
  const best = selected[0];
  const margin = best ? best.confidence - Number(equivalentGroups[selectedGroups.length]?.representative?.confidence || 0) : 0;
  const autoAccept = Boolean(best && best.confidence >= AUTO_ACCEPT_CONFIDENCE
    && (equivalentGroups.length <= selectedGroups.length || margin >= AUTO_ACCEPT_MARGIN));
  const reason = !best ? 'no-candidate-passed-source-semantic-detail-and-crop-gates'
    : !autoAccept ? 'candidate-requires-operator-review-due-to-confidence-or-ranking-margin'
      : 'source-authority-detail-and-semantic-thresholds-passed';
  const reviewItem = autoAccept ? null : buildVisualReviewItem({ atom, requirement, ranked, reason });
  return {
    contract: SOURCE_ASSET_RESOLVER_CONTRACT,
    ruleAtomId: atom?.id || null,
    status: autoAccept ? 'AUTO_ACCEPTED' : (best ? 'REVIEW_REQUIRED' : 'UNRESOLVED'),
    selectedAssets: autoAccept ? selected.map((entry) => ({...entry.candidate,
      cropCompleteness:'complete',cropPurity:'clean',reviewState:'accepted',
      qualification:{contract:SOURCE_ASSET_RESOLVER_CONTRACT,sceneId:requirement.evidenceSceneId,
        requiredObjects:requirement.requiredObjects,confidence:entry.confidence,
        actualDisplayBounds:entry.actualDisplayBounds,sourcePixelsPerDisplayPixel:entry.trueSourcePixelsPerDisplayPixel,
        evidence:'canonical-source-resolver-all-hard-gates-passed'}})) : [],
    suggestedAssets: selected.map((entry) => entry.candidate),
    // Internal compiler evidence retains the candidate object; public `ranked`
    // below stays JSON-safe and stable for Cockpit/project persistence.
    rankedEntries: ranked,
    ranked: ranked.map((entry) => ({
      assetId: entry.candidate.id,
      authority: entry.candidate.sourceAuthority,
      authorityRank: entry.candidate.sourceAuthorityRank,
      confidence: entry.confidence,
      semanticScore: entry.semanticScore,
      trueSourcePixelsPerDisplayPixel: entry.trueSourcePixelsPerDisplayPixel,
      valid: entry.valid,
      violations: entry.hardViolations,
    })),
    candidateEquivalenceGroups: equivalentGroups.map((group) => ({
      key: group.key,
      representativeAssetId: group.representative.candidate.id,
      assetIds: group.entries.map((entry) => entry.candidate.id),
    })),
    confidence: best?.confidence || 0,
    reviewState: autoAccept ? 'accepted' : 'needs_review',
    reason,
    reviewItem,
  };
}

/**
 * A final instructional sequence is an alternate, stricter source-selection
 * proof for a multi-referent rule. The normal single-asset resolver cannot
 * express a verified composition whose exact source pixels are distributed
 * across several assets: asking each source asset to prove the entire scene
 * would incorrectly discard a composition that the provider has already
 * checked as one whole. Reuse is allowed only when every source asset and the
 * ordered rendered frames still match the exact requirement.
 */
function resolveInstructionalSequenceSources({ atom, requirement = atom?.visualRequirement || {}, candidates = [], displayBounds } = {}) {
  const sceneId = requirement.evidenceSceneId || (atom?.id ? `knowledge-${atom.id}` : null);
  if (!sceneId || !(requirement.requiredObjects || []).length) return null;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const choices = new Map();
  for (const candidate of candidates) {
    const sequence = verifiedInstructionalSequence(candidate, requirement, sceneId);
    if (!sequence) continue;
    // One normalizer is shared with physical-state validation, so a verified
    // historical track sequence cannot disappear at source selection replay.
    const sequenceSources = instructionalSequenceSourceAssets(sequence);
    const sourceIds = [...new Set(sequenceSources.map((source) => source.assetId).filter(Boolean))];
    if (!sourceIds.length) continue;
    const selected = sourceIds.map((id) => byId.get(id)).filter(Boolean);
    if (selected.length !== sourceIds.length) continue;
    const measured = requirement.requiredObjects.map((referent) => ({ referent, asset: selected.find((asset) => {
      const proof = objectEvidenceFor(asset, referent, sceneId, { allowReusableIdentity: true });
      return proof?.present === true && proof.complete === true && proof.isolated === true
        && proof.stateCompatible === true && Number(proof.confidence) >= 0.9;
    }) }));
    if (measured.some((entry) => !entry.asset)) continue;
    const key = hashJson({ sceneId, requirement: { ...requirement, evidenceSceneId: undefined }, sourceIds,
      frames: (sequence.frames || []).map((frame) => ({ id: frame.id, image: frame.outputPath, phone: frame.phonePath })) });
    const confidence = Math.min(0.99, ...measured.map(({ asset, referent }) =>
      Number(objectEvidenceFor(asset, referent, sceneId, { allowReusableIdentity: true })?.confidence || 0)));
    choices.set(key, { sequence, selected, confidence });
  }
  const valid = [...choices.values()].sort((left, right) => right.confidence - left.confidence
    || String(left.sequence.assetId || '').localeCompare(String(right.sequence.assetId || '')));
  if (valid.length !== 1) return null;
  const choice = valid[0];
  const selectedAssets = choice.selected.map((asset) => ({
    ...asset,
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    // Every source component used by this exact final composition has already
    // passed complete + isolated COMPONENT pixel evidence above. Preserve that
    // measured silhouette fact for the VisualPlan validator instead of asking
    // a weaker metadata heuristic to veto the stronger final-pixel proof.
    cardSilhouetteState: 'COMPLETE',
    reviewState: 'accepted',
    qualification: {
      contract: SOURCE_ASSET_RESOLVER_CONTRACT,
      sceneId,
      requiredObjects: requirement.requiredObjects,
      confidence: choice.confidence,
      actualDisplayBounds: choice.sequence.frames?.[0]?.actualDisplayBounds || displayBounds || null,
      evidence: 'final-source-grounded-instructional-sequence-passed',
      sequenceContract: choice.sequence.contract,
    },
  }));
  return {
    contract: SOURCE_ASSET_RESOLVER_CONTRACT,
    ruleAtomId: atom?.id || null,
    status: 'AUTO_ACCEPTED',
    selectedAssets,
    suggestedAssets: selectedAssets,
    rankedEntries: selectedAssets.map((candidate) => ({ candidate, confidence: choice.confidence, semanticScore: 1,
      trueSourcePixelsPerDisplayPixel: Number(choice.sequence.frames?.[0]?.sourcePixelsPerDisplayPixel || 0), valid: true, hardViolations: [] })),
    ranked: selectedAssets.map((candidate) => ({ assetId: candidate.id, authority: candidate.sourceAuthority,
      authorityRank: candidate.sourceAuthorityRank, confidence: choice.confidence, semanticScore: 1,
      trueSourcePixelsPerDisplayPixel: Number(choice.sequence.frames?.[0]?.sourcePixelsPerDisplayPixel || 0), valid: true, violations: [] })),
    confidence: choice.confidence,
    reviewState: 'accepted',
    reason: 'final-source-grounded-instructional-sequence-passed',
    instructionalSequence: choice.sequence,
    reviewItem: null,
  };
}

function loadAuthorizedCandidateManifests(manifestPaths = []) {
  const candidates = [];
  const provenance = [];
  for (const manifestPath of manifestPaths.filter(Boolean)) {
    const absolute = path.resolve(manifestPath);
    if (!fs.existsSync(absolute)) continue;
    const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    const rows = payload.candidates || payload.assets || payload.images || [];
    for (const row of rows) {
      if (row.status && !['RECOVERED', 'ACCEPTED', 'accepted'].includes(row.status)) continue;
      candidates.push(normalizeCandidate({
        ...row,
        sourceAuthority: row.sourceAuthority || (/bgg/i.test(payload.authority || '') ? 'OFFICIAL_BGG_ASSET' : payload.authority),
        // Preserve the source-specific recovery provenance (for example a
        // publisher gallery caption/kind) while adding the manifest that made
        // it available to this production run.  A candidate must remain
        // traceable through the same project/Cockpit evidence path.
        provenance: { ...(row.provenance || {}), manifestPath: absolute, authority: payload.authority || null,
          sourceUrl: row.sourceUrl || row.canonicalLink || null },
      }));
    }
    provenance.push({ path: absolute, contract: payload.contract || payload.schemaVersion || null, authority: payload.authority || null });
  }
  return { contract: 'mobius-authorized-source-candidate-manifests-v1', candidates, provenance };
}

/**
 * Generates bounded local template targets from already measured source pixels.
 * A template is only a feature-search input; it is deliberately not a source
 * selection, identity approval, or quality assertion for a recovered asset.
 */
function buildAuthorizedRecoveryTargets({ assets = [], requiredComponentIds = [] } = {}) {
  const required = new Set(requiredComponentIds.filter(Boolean));
  const targets = {};
  const provenance = {};
  for (const asset of assets) {
    const file = assetPath(asset);
    if (!file || !fs.existsSync(file)) continue;
    for (const row of asset.objectVisualEvidence || []) {
      const componentId = row.requiredObject;
      if (!componentId || (required.size && !required.has(componentId))) continue;
      if (row.visualRole !== 'COMPONENT' || row.present !== true || row.complete !== true || row.isolated !== true
        || row.stateCompatible !== true || Number(row.confidence) < 0.9) continue;
      const previous = provenance[componentId];
      const candidate = {
        assetId: asset.id,
        path: path.resolve(file),
        imageSha256: row.imageSha256 || null,
        confidence: Number(row.confidence),
        sourceRefs: asset.sourceRefs || [],
      };
      if (!previous || candidate.confidence > previous.confidence
        || (candidate.confidence === previous.confidence && String(candidate.assetId).localeCompare(String(previous.assetId)) < 0)) {
        targets[componentId] = candidate.path;
        provenance[componentId] = candidate;
      }
    }
  }
  return {
    contract: 'mobius-authorized-source-recovery-targets-v1',
    targets,
    provenance,
  };
}

/** Converts recovered candidate manifests into the same source-visual input
 * contract used for HEPHAESTUS assets. The matcher still inspects pixels and
 * may reject every candidate. */
function authorizedCandidatesForVisualAnalysis(manifestPaths = []) {
  const { candidates, provenance } = loadAuthorizedCandidateManifests(manifestPaths);
  return {
    contract: 'mobius-authorized-source-visual-analysis-input-v1',
    provenance,
    assets: candidates.filter((candidate) => candidate.id && candidate.filePath && fs.existsSync(candidate.filePath)).map((candidate) => {
      // External recovery can nominate a bounded set of referents for pixel
      // search. These are deliberately distinct from canonical componentRefs:
      // a product-page image is not made semantically correct by a tag.
      const componentRefs = uniqueStrings([...(candidate.componentRefs || []), ...(candidate.targets || [])]);
      const retrievalComponentRefs = uniqueStrings([...(candidate.retrievalComponentRefs || []), ...componentRefs]);
      return {
        id: candidate.id,
        file_path: candidate.filePath,
        source_page: null,
        sourceAuthority: candidate.sourceAuthority,
        sourceRefs: candidate.sourceRefs || [],
        semanticObjects: uniqueStrings([...(candidate.semanticObjects || []), ...componentRefs]),
        componentRefs,
        component_bindings: retrievalComponentRefs.map((componentId) => ({
          componentId, componentName: componentId, category: candidate.category || null, confidence: null, reviewState: 'hypothesis',
        })),
        dimensions: { width: candidate.width, height: candidate.height },
        original_dimensions: { width: candidate.nativeWidthPx || candidate.width, height: candidate.nativeHeightPx || candidate.height },
        trueDetailDimensions: candidate.trueDetailDimensions || { width: candidate.width, height: candidate.height },
        category: candidate.category || 'authorized-exact-game-gallery-candidate',
        label: candidate.caption || candidate.label || candidate.id,
        provenance: candidate.provenance || {},
      };
    }),
  };
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, env: options.env || process.env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(args[0] || command)} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return result;
}

/**
 * Canonical exact-game BGG recovery coordinator. It is deliberately bounded to
 * an already-known BGG object id and local authoritative component templates;
 * it does not perform arbitrary image search. The produced originals remain
 * candidates until the normal resolver's authority/detail/identity gates pass.
 */
function recoverAuthorizedBggCandidates({ root, objectId, targetsPath, outputDir, python = process.env.PYTHON || 'python', pages = 9 } = {}) {
  if (!root || !objectId || !targetsPath || !outputDir) throw new Error('Authorized BGG recovery requires root, objectId, targetsPath and outputDir.');
  const absoluteRoot = path.resolve(root);
  const absoluteTargets = path.resolve(targetsPath);
  const absoluteOutput = path.resolve(outputDir);
  if (!fs.existsSync(absoluteTargets)) throw new Error(`Authorized component target manifest is missing: ${absoluteTargets}`);
  fs.mkdirSync(absoluteOutput, { recursive: true });
  const featureReport = path.join(absoluteOutput, 'feature-match-report.json');
  const originalManifest = path.join(absoluteOutput, 'original-candidate-manifest.json');
  const detailReport = path.join(absoluteOutput, 'component-detail-ranking.json');
  const cacheReused = [featureReport, originalManifest, detailReport].every((file) => fs.existsSync(file));
  if (!fs.existsSync(featureReport)) runChecked(python, [
    path.join(absoluteRoot, 'scripts', 'audit-authorized-bgg-card-matches.py'),
    '--object-id', String(objectId), '--output', absoluteOutput, '--targets', absoluteTargets, '--pages', String(pages),
  ], { cwd: absoluteRoot });
  if (!fs.existsSync(originalManifest)) runChecked(python, [
    path.join(absoluteRoot, 'scripts', 'recover-bgg-original-candidates.py'),
    '--object-id', String(objectId), '--feature-report', featureReport, '--output', absoluteOutput, '--pages', String(pages),
  ], { cwd: absoluteRoot });
  if (!fs.existsSync(detailReport)) runChecked(python, [
    path.join(absoluteRoot, 'scripts', 'rank-bgg-original-component-detail.py'),
    '--feature-report', featureReport, '--original-manifest', originalManifest, '--output', detailReport,
  ], { cwd: absoluteRoot });
  return {
    contract: 'mobius-canonical-authorized-bgg-recovery-v1',
    objectId: String(objectId),
    featureReport,
    originalManifest,
    detailReport,
    cacheReused,
  };
}

function externalTitleKey(value) {
  return clean(value).toLocaleLowerCase('en-CA').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function publisherOriginsFromDocumentMap(documentMap = {}) {
  const pages = Array.isArray(documentMap) ? documentMap : (documentMap.pages || []);
  const rows = [];
  for (const page of pages) {
    const text = String(page?.normalizedText || page?.text || '');
    const urls = text.match(/(?:https?:\/\/|www\.)[^\s<>()\]\["']+/gi) || [];
    for (const raw of urls) {
      try {
        const url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || /^(localhost|127\.0\.0\.1|::1)$/i.test(url.hostname)) continue;
        rows.push({ origin: url.origin, page: Number(page.humanPageNumber || page.pageNumber || page.page), sourceUrl: url.href });
      } catch { /* Source prose can contain a non-URL token. */ }
    }
  }
  return [...new Map(rows.filter(row => Number.isInteger(row.page) && row.page > 0)
    .map(row => [`${row.origin}:${row.page}`, row])).values()];
}

function htmlDecode(value = '') {
  return String(value).replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function stripHtml(value = '') {
  return htmlDecode(String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function samePublicOrigin(url, origin) {
  try { return new URL(url).origin === new URL(origin).origin; } catch { return false; }
}

function productLinksFromSearch(html, origin, title) {
  const wanted = externalTitleKey(title);
  const links = [];
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let match; (match = anchor.exec(String(html)));) {
    try {
      const href = new URL(htmlDecode(match[1]), origin).href;
      const signal = `${stripHtml(match[2])} ${href}`;
      if (samePublicOrigin(href, origin) && externalTitleKey(signal).includes(wanted)) links.push(href);
    } catch { /* Ignore malformed links. */ }
  }
  return [...new Set(links)].slice(0, 12);
}

function productLinksFromSearchJson(value, origin, title) {
  const wanted = externalTitleKey(title);
  const rows = Array.isArray(value) ? value : (value?.items || value?.results || []);
  return [...new Set(rows.flatMap((row) => {
    const href = row?.url || row?.link || row?.permalink || null;
    const label = stripHtml(row?.title || row?.name || '');
    return href && externalTitleKey(label) === wanted && samePublicOrigin(href, origin) ? [new URL(href, origin).href] : [];
  }))].slice(0, 12);
}

function jsonLdProductNodes(value, nodes = []) {
  if (Array.isArray(value)) value.forEach((entry) => jsonLdProductNodes(entry, nodes));
  else if (value && typeof value === 'object') {
    if (String(value['@type'] || '').toLowerCase().split(/[\s,]+/).includes('product')) nodes.push(value);
    if (value['@graph']) jsonLdProductNodes(value['@graph'], nodes);
  }
  return nodes;
}

function htmlAttribute(tag = '', name = '') {
  const wanted = String(name).toLowerCase();
  const attributes = /\b([a-z][a-z0-9:_-]*)\s*=\s*(["'])([\s\S]*?)\2/gi;
  for (let match; (match = attributes.exec(String(tag)));) {
    if (match[1].toLowerCase() === wanted) return htmlDecode(match[3]);
  }
  return '';
}

function isImageUrl(value = '') {
  try {
    const parsed = new URL(value, 'https://mobius.invalid');
    return /^https?:$/i.test(parsed.protocol) && /(?:\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])|\/image\/)/i.test(`${parsed.pathname}${parsed.search}`);
  } catch { return false; }
}

// A publisher page may use a CMS gallery rather than placing every product
// image in JSON-LD.  We only admit explicitly marked gallery/lightbox links
// from a page whose Product JSON-LD has already matched the exact title.
// The gallery caption remains a retrieval hint, never a component binding.
function publisherGalleryImages(html = '') {
  const images = new Map();
  const anchors = /<a\b[^>]*>/gi;
  for (let match; (match = anchors.exec(String(html)));) {
    const tag = match[0];
    const href = htmlAttribute(tag, 'href');
    const className = htmlAttribute(tag, 'class');
    const fancybox = htmlAttribute(tag, 'data-fancybox');
    const gallery = /(?:gallery|lightbox|product-gallery)/i.test(`${className} ${fancybox}`);
    if (!gallery || !isImageUrl(href)) continue;
    const image = {
      url: href,
      caption: clean(htmlAttribute(tag, 'data-caption') || htmlAttribute(tag, 'title') || htmlAttribute(tag, 'aria-label')) || null,
      sourceKind: 'publisher-product-page-gallery',
    };
    // Gallery templates often repeat the same lightbox URL in a thumbnail
    // whose markup has no caption. Retain the most descriptive source-owned
    // retrieval hint instead of letting that duplicate erase it. The caption
    // remains only a candidate-search term; pixel evidence still decides
    // component identity and acceptance.
    const previous = images.get(image.url);
    if (!previous || (!previous.caption && image.caption)) images.set(image.url, image);
  }
  return [...images.values()];
}

function productEvidenceFromHtml(html, title) {
  const wanted = externalTitleKey(title);
  const nodes = [];
  const scripts = String(html).match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const content = script.replace(/^.*?>/s, '').replace(/<\/script>$/i, '');
    try { jsonLdProductNodes(JSON.parse(content), nodes); } catch { /* Ignore unrelated malformed JSON-LD. */ }
  }
  const product = nodes.find((node) => externalTitleKey(node.name) === wanted) || null;
  if (!product) return null;
  const image = Array.isArray(product.image) ? product.image : [product.image];
  const jsonLdImages = image.map((entry) => typeof entry === 'string' ? entry : entry?.url).filter(Boolean)
    .map((url) => ({ url, caption: null, sourceKind: 'product-jsonld' }));
  const images = [...new Map([...jsonLdImages, ...publisherGalleryImages(html)]
    .map((entry) => [entry.url, entry])).values()];
  return { title: stripHtml(product.name), images };
}

async function fetchExternalText(fetchImpl, url, accept = 'text/html,application/json;q=0.9') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(url, { headers: { accept, 'user-agent': 'MOBIUS-source-resolver/1.0' }, signal: controller.signal });
    if (!response?.ok) return null;
    return { url: response.url || url, contentType: response.headers?.get?.('content-type') || '', text: await response.text() };
  } catch { return null; } finally { clearTimeout(timer); }
}

async function downloadOfficialImage(fetchImpl, url, target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetchImpl(url, { headers: { accept: 'image/avif,image/webp,image/*;q=0.8', 'user-agent': 'MOBIUS-source-resolver/1.0' }, signal: controller.signal });
    if (!response?.ok) return null;
    const length = Number(response.headers?.get?.('content-length') || 0);
    if (length > 20 * 1024 * 1024) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) return null;
    const metadata = await sharp(bytes, { limitInputPixels: 64e6 }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 240 || metadata.height < 180) return null;
    await fs.promises.writeFile(target, bytes);
    return { width: metadata.width, height: metadata.height, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  } catch { return null; } finally { clearTimeout(timer); }
}

/**
 * Recover image candidates only from an exact-title product page hosted on a
 * domain printed in the authoritative rulebook. Product discovery produces
 * retrieval hypotheses, not component bindings or a visual acceptance.
 */
async function recoverOfficialPublisherCandidates({ title, documentMap, sourceSha256, requiredComponentIds = [], outputDir, fetchImpl = fetch } = {}) {
  if (!title || !outputDir || !/^[a-f0-9]{64}$/i.test(String(sourceSha256 || ''))) throw new Error('Official publisher recovery requires title, source SHA and output directory.');
  const origins = publisherOriginsFromDocumentMap(documentMap);
  const input = { contract: OFFICIAL_PUBLISHER_SOURCE_RECOVERY_CONTRACT, title, sourceSha256,
    origins, requiredComponentIds: [...new Set(requiredComponentIds)].sort() };
  const inputHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const absoluteOutput = path.resolve(outputDir);
  const manifestPath = path.join(absoluteOutput, 'official-publisher-candidate-manifest.json');
  await fs.promises.mkdir(absoluteOutput, { recursive: true });
  try {
    const previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (previous.inputHash === inputHash) return { ...previous, originalManifest: manifestPath, reused: true };
    // A source-recovery contract upgrade is evidence, not a reason to discard
    // the prior candidate decision.  Archive it before writing the new
    // canonical manifest so Cockpit/history can still audit the old run.
    if (previous?.inputHash) {
      const archivePath = path.join(absoluteOutput, 'history', `official-publisher-candidate-manifest.${previous.inputHash}.json`);
      await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
      if (!fs.existsSync(archivePath)) await fs.promises.writeFile(archivePath, JSON.stringify(previous, null, 2));
    }
  } catch { /* Fresh or incompatible recovery. */ }
  const productPages = [];
  for (const originRecord of origins) {
    const query = encodeURIComponent(title);
    const searchUrls = [
      new URL(`/?s=${query}&post_type=product`, originRecord.origin).href,
      new URL(`/?s=${query}`, originRecord.origin).href,
      new URL(`/wp-json/wp/v2/search?search=${query}&per_page=10`, originRecord.origin).href,
    ];
    for (const searchUrl of searchUrls) {
      const search = await fetchExternalText(fetchImpl, searchUrl);
      if (!search || !samePublicOrigin(search.url, originRecord.origin)) continue;
      let links = [];
      if (/json/i.test(search.contentType)) {
        try { links = productLinksFromSearchJson(JSON.parse(search.text), originRecord.origin, title); } catch { links = []; }
      } else links = productLinksFromSearch(search.text, originRecord.origin, title);
      productPages.push(...links.map((url) => ({ url, originRecord })));
    }
  }
  const candidates = [];
  const visitedPages = new Set();
  const visitedImageUrls = new Set();
  const visitedImageHashes = new Set();
  for (const { url, originRecord } of productPages) {
    if (visitedPages.has(url) || candidates.length >= 12) continue;
    visitedPages.add(url);
    const page = await fetchExternalText(fetchImpl, url);
    if (!page || !samePublicOrigin(page.url, originRecord.origin)) continue;
    const product = productEvidenceFromHtml(page.text, title);
    if (!product) continue;
    for (const image of product.images.slice(0, 12)) {
      let absoluteImage;
      try { absoluteImage = new URL(image.url, page.url).href; } catch { continue; }
      if (visitedImageUrls.has(absoluteImage)) continue;
      visitedImageUrls.add(absoluteImage);
      const id = `official-publisher-${crypto.createHash('sha256').update(absoluteImage).digest('hex').slice(0, 20)}`;
      const extension = path.extname(new URL(absoluteImage).pathname).replace(/[^a-z0-9.]/gi, '').slice(0, 8) || '.img';
      const localPath = path.join(absoluteOutput, 'images', `${id}${extension}`);
      await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
      const detail = fs.existsSync(localPath)
        ? await sharp(localPath, { limitInputPixels: 64e6 }).metadata().then(meta => ({ width: meta.width, height: meta.height, sha256: crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex') })).catch(() => null)
        : await downloadOfficialImage(fetchImpl, absoluteImage, localPath);
      if (!detail) continue;
      if (visitedImageHashes.has(detail.sha256)) continue;
      visitedImageHashes.add(detail.sha256);
      candidates.push({ id, status: 'RECOVERED', localPath, filePath: localPath, sourceUrl: absoluteImage, canonicalLink: page.url,
        width: detail.width, height: detail.height, trueDetailDimensions: { width: detail.width, height: detail.height }, sha256: detail.sha256,
        sourceAuthority: 'OFFICIAL_PUBLISHER_HIGH_RES', retrievalComponentRefs: [...new Set(requiredComponentIds)],
        sourceRefs: [{ page: originRecord.page, sourceUrl: originRecord.sourceUrl, source: 'rulebook-disclosed-publisher-domain' }],
        caption: image.caption,
        provenance: { contract: input.contract, productTitle: product.title, productUrl: page.url, discoverySource: originRecord.sourceUrl,
          retrievalKind: image.sourceKind } });
    }
  }
  const result = { ...input, inputHash, authority: 'rulebook-disclosed-publisher-exact-title-product-page',
    status: candidates.length ? 'RECOVERED' : 'NO_EXACT_PUBLISHER_PRODUCT_CANDIDATE', candidates };
  await fs.promises.writeFile(manifestPath, JSON.stringify(result, null, 2));
  return { ...result, originalManifest: manifestPath, reused: false };
}

/**
 * Deterministically rectifies an already-authorized source candidate. Project
 * evidence supplies either the exact corner geometry or a low-resolution
 * identity template. Output pixels always come from the authoritative source;
 * the result remains a candidate until normal resolver and Cockpit gates pass.
 */
function rectifyAuthorizedCandidate({
  root,
  id,
  sourcePath,
  outputPath,
  reportPath,
  templatePath = null,
  points = null,
  width,
  height,
  padding = 8,
  minimumInliers = 12,
  python = process.env.PYTHON || 'python',
  sourceAuthority = 'OFFICIAL_BGG_ASSET',
  semanticObjects = [],
  sourceRefs = [],
} = {}) {
  if (!root || !id || !sourcePath || !outputPath || !reportPath || !width || !height) {
    throw new Error('Authorized rectification requires root, id, sourcePath, outputPath, reportPath, width and height.');
  }
  const absoluteRoot = path.resolve(root);
  const source = path.resolve(sourcePath);
  const output = path.resolve(outputPath);
  const report = path.resolve(reportPath);
  if (!fs.existsSync(source)) throw new Error(`Authorized rectification source is missing: ${source}`);
  const cacheReused = fs.existsSync(output) && fs.existsSync(report);
  if (!cacheReused) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.mkdirSync(path.dirname(report), { recursive: true });
    if (templatePath) {
      const template = path.resolve(templatePath);
      if (!fs.existsSync(template)) throw new Error(`Authorized rectification template is missing: ${template}`);
      runChecked(python, [
        path.join(absoluteRoot, 'scripts', 'rectify-matched-source-asset.py'),
        '--template', template, '--source', source, '--output', output, '--report', report,
        '--width', String(width), '--height', String(height), '--minimum-inliers', String(minimumInliers), '--padding', String(padding),
      ], { cwd: absoluteRoot });
    } else if (Array.isArray(points) && points.length === 4) {
      runChecked(python, [
        path.join(absoluteRoot, 'scripts', 'rectify-source-asset.py'),
        '--input', source, '--output', output, '--points', JSON.stringify(points),
        '--width', String(width), '--height', String(height), '--padding', String(padding),
      ], { cwd: absoluteRoot });
      fs.writeFileSync(report, `${JSON.stringify({
        schemaVersion: 'project-geometry-rectification-v1', source: { path: source }, output: { path: output, width, height },
        geometry: { points, evidenceOwner: 'canonical-project-state' },
        contentPolicy: { inventedPixels: false, completeSilhouetteRequired: true, physicalReviewRequired: true },
      }, null, 2)}\n`);
    } else {
      throw new Error('Authorized rectification requires a templatePath or four project-evidence points.');
    }
  }
  const evidence = JSON.parse(fs.readFileSync(report, 'utf8'));
  const corners = evidence.matching?.sourceCorners || evidence.geometry?.points;
  const distance = (left, right) => Math.hypot(Number(right[0]) - Number(left[0]), Number(right[1]) - Number(left[1]));
  const trueWidth = Array.isArray(corners) && corners.length === 4
    ? Math.round((distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2)
    : Number(width);
  const trueHeight = Array.isArray(corners) && corners.length === 4
    ? Math.round((distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2)
    : Number(height);
  return normalizeCandidate({
    id,
    filePath: output,
    width: trueWidth,
    height: trueHeight,
    derivativeWidthPx: Number(width),
    derivativeHeightPx: Number(height),
    trueDetailDimensions: { width: trueWidth, height: trueHeight },
    sourceAuthority,
    extractionMethod: templatePath ? 'SIFT_RANSAC_AUTHORIZED_RECTIFICATION' : 'PROJECT_GEOMETRY_AUTHORIZED_RECTIFICATION',
    semanticObjects,
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    reviewState: 'needs_review',
    sourceRefs,
    provenance: { reportPath: report, sourcePath: source, cacheReused, physicalReviewRequired: true },
  });
}

module.exports = {
  AUTO_ACCEPT_CONFIDENCE,
  AUTO_ACCEPT_MARGIN,
  OBJECT_VISUAL_EVIDENCE_CONTRACT,
  OFFICIAL_PUBLISHER_SOURCE_RECOVERY_CONTRACT,
  objectEvidenceFor,
  SOURCE_ASSET_RESOLVER_CONTRACT,
  evaluateCandidate,
  loadAuthorizedCandidateManifests,
  buildAuthorizedRecoveryTargets,
  authorizedCandidatesForVisualAnalysis,
  normalizeCandidate,
  normalizeVisualReferents,
  VISUAL_REFERENT_NORMALIZATION_CONTRACT,
  buildVisualReviewItem,
  rankSourceAssetCandidates,
  recoverAuthorizedBggCandidates,
  recoverOfficialPublisherCandidates,
  productEvidenceFromHtml,
  publisherOriginsFromDocumentMap,
  rectifyAuthorizedCandidate,
  resolveInstructionalSequenceSources,
  resolveSourceAssets,
};
