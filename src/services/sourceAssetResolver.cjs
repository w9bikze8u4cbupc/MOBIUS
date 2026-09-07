'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { candidateDetailRatio, sourceAuthorityRank } = require('./sourceDetailLineage.cjs');

const SOURCE_ASSET_RESOLVER_CONTRACT = 'mobius-canonical-source-asset-resolver-v1';
const AUTO_ACCEPT_CONFIDENCE = 0.82;
const AUTO_ACCEPT_MARGIN = 0.08;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizedTokens = (values) => new Set((Array.isArray(values) ? values : [values])
  .flatMap((value) => clean(value).toLocaleLowerCase('fr-CA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/))
  .filter((token) => token.length >= 3));

function assetPath(asset = {}) {
  return asset.displayPath || asset.renderPath || asset.filePath || asset.path || asset.localPath || asset.sourceImage || null;
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
  const width = Number(asset.nativeWidthPx || asset.width || asset.sourceDimensions?.width || 0);
  const height = Number(asset.nativeHeightPx || asset.height || asset.sourceDimensions?.height || 0);
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
    containsActualGamePixels: asset.containsActualGamePixels !== false,
    visualClassification: asset.visualClassification || (/board|track/i.test(`${asset.category} ${asset.label}`) ? 'REAL_BOARD_OR_TRACK'
      : /card|wonder/i.test(`${asset.category} ${asset.label}`) ? 'REAL_CARD_OR_WONDER' : 'REAL_COMPONENT'),
    cropCompleteness: asset.cropCompleteness === true ? 'complete' : (asset.cropCompleteness || 'unknown'),
    cropPurity: asset.cropPurity === true ? 'clean' : (asset.cropPurity || 'unknown'),
    sourceRefs: asset.sourceRefs?.length ? asset.sourceRefs : (asset.provenance ? [asset.provenance] : []),
    reviewState: asset.reviewState || 'needs_review',
  };
}

function semanticScore(candidate, requiredObjects = []) {
  const wanted = normalizedTokens(requiredObjects);
  if (!wanted.size) return 0.75;
  const found = normalizedTokens(candidate.semanticObjects);
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
  const reviewItem = autoAccept ? null : {
    id: `visual-review:${atom?.id || 'unknown'}`,
    kind: 'visual-source-selection',
    ruleAtomId: atom?.id || null,
    status: 'needs_visual_review',
    reason,
    requiredObjects: requirement.requiredObjects || [],
    candidateIds: ranked.slice(0, 8).map((entry) => entry.candidate.id),
    evidence: ranked.slice(0, 8).map((entry) => ({
      assetId: entry.candidate.id,
      confidence: entry.confidence,
      authority: entry.candidate.sourceAuthority,
      detailRatio: entry.trueSourcePixelsPerDisplayPixel,
      violations: entry.hardViolations,
    })),
  };
  return {
    contract: SOURCE_ASSET_RESOLVER_CONTRACT,
    ruleAtomId: atom?.id || null,
    status: autoAccept ? 'AUTO_ACCEPTED' : (best ? 'REVIEW_REQUIRED' : 'UNRESOLVED'),
    selectedAssets: autoAccept ? selected.map((entry) => entry.candidate) : [],
    suggestedAssets: selected.map((entry) => entry.candidate),
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
  rankSourceAssetCandidates,
  recoverAuthorizedBggCandidates,
  rectifyAuthorizedCandidate,
  resolveSourceAssets,
};
