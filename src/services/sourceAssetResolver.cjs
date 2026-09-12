'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { candidateDetailRatio, sourceAuthorityRank } = require('./sourceDetailLineage.cjs');

const SOURCE_ASSET_RESOLVER_CONTRACT = 'mobius-canonical-source-asset-resolver-v2';
const VISUAL_REFERENT_NORMALIZATION_CONTRACT = 'mobius-visual-referent-normalization-v1';
const AUTO_ACCEPT_CONFIDENCE = 0.82;
const AUTO_ACCEPT_MARGIN = 0.08;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizedTokens = (values) => new Set((Array.isArray(values) ? values : [values])
  .flatMap((value) => clean(value).toLocaleLowerCase('fr-CA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/))
  .filter((token) => token.length >= 3));

function assetPath(asset = {}) {
  return asset.displayPath || asset.renderPath || asset.filePath || asset.file_path || asset.path || asset.localPath || asset.sourceImage || null;
}

function normalizeAuthority(asset = {}) {
  const raw = String(asset.sourceAuthority || asset.sourceType || asset.extractionMethod || '').toUpperCase();
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
  const width = Number(asset.nativeWidthPx || asset.trueDetailDimensions?.width || asset.original_dimensions?.width || asset.sourceDimensions?.width || asset.width || asset.dimensions?.width || 0);
  const height = Number(asset.nativeHeightPx || asset.trueDetailDimensions?.height || asset.original_dimensions?.height || asset.sourceDimensions?.height || asset.height || asset.dimensions?.height || 0);
  const semanticObjects = [
    ...(asset.semanticObjects || []), ...(asset.semanticTags || []),
    asset.componentRef, asset.componentName, asset.label, asset.category, asset.description,
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
function normalizeVisualReferents({ componentEvidence = {}, sourceAssets = [] } = {}) {
  const evidenceAssets = new Map((componentEvidence.assets || []).filter((asset) => asset?.id).map((asset) => [asset.id, asset]));
  const bindingsByAssetId = new Map();
  for (const binding of componentEvidence.componentBindings || []) {
    if (!binding?.assetId) continue;
    const rows = bindingsByAssetId.get(binding.assetId) || [];
    rows.push(binding);
    bindingsByAssetId.set(binding.assetId, rows);
  }
  const rawById = new Map((sourceAssets || []).filter((asset) => asset?.id).map((asset) => [asset.id, asset]));
  const ids = new Set([...rawById.keys(), ...evidenceAssets.keys()]);
  const assets = [...ids].map((id) => {
    const raw = rawById.get(id) || {};
    const evidence = evidenceAssets.get(id) || {};
    const bindings = bindingsByAssetId.get(id) || [];
    const semanticObjects = uniqueStrings([
      ...(raw.semanticObjects || []), ...(raw.semanticTags || []), raw.label, raw.componentName, raw.category,
      ...(evidence.semanticObjects || []), evidence.componentName, evidence.category, evidence.surroundingTextEvidence,
      ...bindings.flatMap((binding) => [binding.componentId, binding.componentName, binding.category]),
    ]);
    const componentRefs = uniqueStrings(bindings.map((binding) => binding.componentId));
    const aliases = uniqueStrings(bindings.flatMap((binding) => [binding.componentName, binding.category]));
    const sourcePage = evidence.pageNumber || raw.source_page || raw.sourcePage || (Number.isInteger(Number(raw.page_index)) ? Number(raw.page_index) + 1 : null);
    return normalizeCandidate({
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
  });
  return {
    contract: VISUAL_REFERENT_NORMALIZATION_CONTRACT,
    assets,
    bindings: (componentEvidence.componentBindings || []).map((binding) => ({ ...binding })),
    unresolvedBindings: (componentEvidence.componentBindings || []).filter((binding) => binding.reviewState === 'needs_review' || binding.reviewRequired === true),
  };
}

function semanticScore(candidate, requiredObjects = []) {
  const wanted = normalizedTokens(requiredObjects);
  if (!wanted.size) return 0.75;
  const found = normalizedTokens([
    ...(candidate.semanticObjects || []), ...(candidate.componentRefs || []), ...(candidate.referentAliases || []),
  ]);
  const overlap = [...wanted].filter((token) => found.has(token)).length;
  return overlap / wanted.size;
}

function evaluateCandidate(candidate, requirement = {}, displayBounds = { width: 900, height: 700 }) {
  const fileExists = Boolean(candidate.filePath && fs.existsSync(candidate.filePath));
  const detailRatio = candidateDetailRatio(candidate, displayBounds);
  const semantic = semanticScore(candidate, requirement.requiredObjects || []);
  const authority = Math.min(1, candidate.sourceAuthorityRank / 50);
  const detail = Math.min(1, detailRatio);
  const complete = candidate.cropCompleteness === 'complete';
  const pure = candidate.cropPurity === 'clean';
  const accepted = candidate.reviewState === 'accepted';
  const invalid = candidate.invalidated === true || candidate.directorRejectedForSameDefect === true;
  const hardViolations = [];
  if (!fileExists) hardViolations.push('missing-file');
  if (candidate.sourceAuthority === 'THUMBNAIL') hardViolations.push('thumbnail-final-use');
  if (detailRatio < 0.8) hardViolations.push('source-detail-insufficient');
  if (!complete) hardViolations.push('crop-completeness-unverified');
  if (!pure) hardViolations.push('crop-purity-unverified');
  if (semantic < 0.5) hardViolations.push('semantic-object-mismatch');
  if (candidate.bindingReviewRequired && Number(candidate.bindingConfidence || 0) < 0.65) hardViolations.push('component-identity-unverified');
  const requiredState = requirement.physicalStateRequirement || requirement.physicalState || {};
  for (const [key, expected] of Object.entries(requiredState || {})) {
    if (expected == null || expected === 'UNKNOWN') continue;
    const actual = candidate.physicalState?.[key] ?? candidate[key];
    if (actual == null || actual === 'UNKNOWN') hardViolations.push(`physical-state-unverified:${key}`);
    else if (String(actual).toUpperCase() !== String(expected).toUpperCase()) hardViolations.push(`physical-state-mismatch:${key}`);
  }
  if (invalid) hardViolations.push('invalidated-asset');
  const confidence = Math.max(0, Math.min(1,
    semantic * 0.38 + authority * 0.24 + detail * 0.18 + (complete ? 0.08 : 0) + (pure ? 0.06 : 0) + (accepted ? 0.06 : 0)));
  return {
    candidate,
    confidence: Number(confidence.toFixed(4)),
    semanticScore: Number(semantic.toFixed(4)),
    trueSourcePixelsPerDisplayPixel: Number(detailRatio.toFixed(4)),
    hardViolations,
    valid: hardViolations.length === 0,
  };
}

function classifyFailure(ranked = []) {
  if (!ranked.length) return ['TRUE_ASSET_MISSING'];
  const codes = new Set(ranked.flatMap((entry) => entry.hardViolations || []));
  const classes = [];
  if ([...codes].some((code) => code.includes('semantic-object-mismatch'))) classes.push('SEMANTIC_MATCH_TOO_WEAK');
  if ([...codes].some((code) => code.includes('component-identity-unverified'))) classes.push('COMPONENT_IDENTITY_MISMATCH');
  if ([...codes].some((code) => code.includes('source-detail'))) classes.push('DETAIL_RESOLUTION_TOO_WEAK');
  if ([...codes].some((code) => code.includes('crop-'))) classes.push('CROP_OR_SILHOUETTE_FAILURE');
  if ([...codes].some((code) => code.includes('physical-state-'))) classes.push('PHYSICAL_STATE_MISMATCH');
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
    candidateIds: ranked.slice(0, 8).map((entry) => entry.candidate.id),
    candidates: ranked.slice(0, 8).map((entry) => ({
      assetId: entry.candidate.id,
      thumbnailPath: entry.candidate.filePath || null,
      sourceRefs: entry.candidate.sourceRefs || [],
      provenance: entry.candidate.provenance || null,
      semanticScore: entry.semanticScore,
      detailRatio: entry.trueSourcePixelsPerDisplayPixel,
      confidence: entry.confidence,
      valid: entry.valid,
      rejectionReasons: entry.hardViolations,
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

function resolveSourceAssets({ atom, requirement = atom?.visualRequirement || {}, candidates = [], displayBounds, minimumAssets = 1 } = {}) {
  const ranked = rankSourceAssetCandidates({ requirement, candidates, displayBounds });
  const valid = ranked.filter((entry) => entry.valid);
  const selected = valid.slice(0, Math.max(1, minimumAssets));
  const best = selected[0];
  const margin = best ? best.confidence - Number(valid[selected.length]?.confidence || 0) : 0;
  const autoAccept = Boolean(best && best.confidence >= AUTO_ACCEPT_CONFIDENCE && (valid.length <= selected.length || margin >= AUTO_ACCEPT_MARGIN));
  const reason = !best ? 'no-candidate-passed-source-semantic-detail-and-crop-gates'
    : !autoAccept ? 'candidate-requires-operator-review-due-to-confidence-or-ranking-margin'
      : 'source-authority-detail-and-semantic-thresholds-passed';
  const reviewItem = autoAccept ? null : buildVisualReviewItem({ atom, requirement, ranked, reason });
  return {
    contract: SOURCE_ASSET_RESOLVER_CONTRACT,
    ruleAtomId: atom?.id || null,
    status: autoAccept ? 'AUTO_ACCEPTED' : (best ? 'REVIEW_REQUIRED' : 'UNRESOLVED'),
    selectedAssets: autoAccept ? selected.map((entry) => entry.candidate) : [],
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
    confidence: best?.confidence || 0,
    reviewState: autoAccept ? 'accepted' : 'needs_review',
    reason,
    reviewItem,
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
        provenance: { manifestPath: absolute, authority: payload.authority || null, sourceUrl: row.sourceUrl || row.canonicalLink || null },
      }));
    }
    provenance.push({ path: absolute, contract: payload.contract || payload.schemaVersion || null, authority: payload.authority || null });
  }
  return { contract: 'mobius-authorized-source-candidate-manifests-v1', candidates, provenance };
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
  SOURCE_ASSET_RESOLVER_CONTRACT,
  evaluateCandidate,
  loadAuthorizedCandidateManifests,
  normalizeCandidate,
  normalizeVisualReferents,
  VISUAL_REFERENT_NORMALIZATION_CONTRACT,
  buildVisualReviewItem,
  rankSourceAssetCandidates,
  recoverAuthorizedBggCandidates,
  rectifyAuthorizedCandidate,
  resolveSourceAssets,
};
