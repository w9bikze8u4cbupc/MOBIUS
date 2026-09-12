import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { curateHephaestusAssets } from './hephaestusCuration.js';
import { HEPHAESTUS_MANIFEST_CONTRACT } from './hephaestusMaterialization.js';

export const HEPHAESTUS_EVIDENCE_CONTRACT = 'hephaestus-component-evidence-v1';

function sha256File(filePath) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); } catch { return null; }
}

function resolveAssetPath(asset, manifestPath) {
  const dir = path.dirname(manifestPath);
  const candidates = [asset.file_path, asset.filePath, asset.fileKey, asset.renderPath]
    .filter(Boolean)
    .flatMap((value) => [path.resolve(dir, String(value)), String(value), path.join(dir, 'images', 'all', path.basename(String(value))), path.join(dir, path.basename(String(value)))]);
  return candidates.map((value) => path.resolve(value)).find((value) => fs.existsSync(value)) || null;
}

function tokens(value) {
  return new Set(String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter((token) => token.length >= 3));
}

function assetPage(asset) {
  const explicit = asset.source_page ?? asset.sourcePage;
  if (explicit !== undefined && explicit !== null) {
    const number = Number(explicit);
    return Number.isInteger(number) ? number : null;
  }
  const native = Number(asset.page_index ?? asset.pageIndex);
  return Number.isInteger(native) ? native + 1 : null;
}

function evidenceLevel(asset, renderPath) {
  const curation = asset.curation || {};
  const score = Number(curation.score ?? asset.confidence ?? asset.classification_confidence ?? 0);
  const isCandidate = curation.candidate !== false && curation.isDuplicate !== true && curation.lowInformation !== true;
  const usable = Boolean(renderPath && fs.statSync(renderPath).size > 0);
  if (usable && isCandidate && score >= 0.65) return { reviewState: 'accepted', confidence: Math.min(1, score), reviewRequired: false };
  if (usable && isCandidate && score >= 0.35) return { reviewState: 'needs_review', confidence: Math.max(0, score), reviewRequired: true };
  return { reviewState: 'rejected', confidence: Math.max(0, score), reviewRequired: true };
}

function canonicalAsset(asset, manifestPath, { projectId, sourcePdfSha256, gameIdentity } = {}) {
  const renderPath = resolveAssetPath(asset, manifestPath);
  const state = evidenceLevel(asset, renderPath);
  const page = assetPage(asset);
  const bbox = asset.bbox || asset.normalized_bbox || asset.provenance?.bbox || null;
  const sourceHash = sha256File(renderPath);
  const visualKind = asset.visual_kind || asset.classification || asset.type || 'unknown';
  const focused = ['focused-page-crop', 'focused-page-region', 'focused-crop'].includes(visualKind);
  return {
    id: asset.id || null,
    projectId: projectId || null,
    gameIdentity: gameIdentity || null,
    sourcePdfSha256: sourcePdfSha256 || asset.sourcePdfSha256 || asset.provenance?.sourcePdfSha256 || null,
    pageNumber: page,
    sourceImage: renderPath,
    sourceImageSha256: sourceHash,
    boundingBox: bbox,
    componentName: asset.componentName || asset.label || null,
    category: asset.category || asset.type || asset.classification || 'other',
    quantity: Number.isInteger(asset.quantity) ? asset.quantity : null,
    colorPlayerAssociation: asset.colorPlayerAssociation || null,
    surroundingTextEvidence: asset.surroundingTextEvidence || asset.layout_text || null,
    extractionMethod: asset.extractionMethod || (focused ? 'layout-derived-focused-crop' : 'pymupdf-native-raster'),
    classificationConfidence: Number(asset.classification_confidence ?? asset.confidence ?? 0),
    confidence: state.confidence,
    pedagogicalUsefulness: state.reviewState === 'accepted'
      ? (focused ? 0.92 : (asset.is_component ? 0.76 : 0.35))
      : 0,
    dedupIdentity: {
      contentHash: asset.contentHash || sourceHash,
      duplicateGroupId: asset.curation?.duplicateGroupId || null,
      canonicalAssetId: asset.curation?.canonicalAssetId || asset.id || null,
      isDuplicate: asset.curation?.isDuplicate === true,
    },
    provenance: {
      manifestPath: path.resolve(manifestPath),
      sourcePage: page,
      bbox,
      extraction: asset.provenance?.extraction || (focused ? 'layout-derived-focused-crop' : 'pymupdf-native-raster'),
      originalAssetId: asset.id || null,
    },
    reviewState: state.reviewState,
    reviewRequired: state.reviewRequired,
    renderPath,
    curation: asset.curation || null,
  };
}

function bindOneComponent(component, assets) {
  const componentTokens = tokens(`${component.name || ''} ${component.category || ''}`);
  const page = Number(component.sourcePage);
  const candidates = assets.filter((asset) => asset.reviewState === 'accepted' && !asset.dedupIdentity.isDuplicate)
    .map((asset) => {
      const labelTokens = tokens(`${asset.componentName || ''} ${asset.category || ''} ${asset.surroundingTextEvidence || ''}`);
      const overlap = [...componentTokens].filter((token) => labelTokens.has(token));
      const pageMatch = Number.isInteger(page) && page === asset.pageNumber;
      const score = (overlap.length ? Math.min(0.55, overlap.length * 0.18) : 0)
        + (pageMatch ? 0.3 : 0)
        + (asset.pedagogicalUsefulness * 0.15);
      return { asset, score: Number(score.toFixed(3)), overlap, pageMatch };
    }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const exactEnough = Boolean(best && (best.overlap.length > 0 || best.pageMatch) && best.score >= 0.3);
  return {
    componentId: component.id || null,
    componentName: component.name || null,
    category: component.category || null,
    quantity: Number.isInteger(component.quantity) ? component.quantity : null,
    sourcePage: Number.isInteger(page) ? page : null,
    assetId: exactEnough ? best.asset.id : null,
    focusedVisualPath: exactEnough ? best.asset.renderPath : null,
    confidence: exactEnough ? best.score : 0,
    reviewState: exactEnough && best.score >= 0.65 ? 'accepted' : 'needs_review',
    reviewRequired: !(exactEnough && best.score >= 0.65),
    evidence: exactEnough ? { overlap: best.overlap, pageMatch: best.pageMatch, candidateScore: best.score } : { reason: 'no-deterministic-component-identity-match' },
  };
}

export function buildHephaestusEvidence({ manifestPath, projectId, sourcePdfSha256, gameIdentity, components = [], setupSteps = [] } = {}) {
  if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error(`HEPHAESTUS_MANIFEST_MISSING: ${manifestPath}`);
  const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (payload.contract === HEPHAESTUS_MANIFEST_CONTRACT
    && (payload.projectId !== projectId || payload.sourcePdfSha256 !== sourcePdfSha256)) {
    const error = new Error('HEPHAESTUS_MANIFEST_IDENTITY_MISMATCH: manifest does not belong to the canonical project source.');
    error.code = 'HEPHAESTUS_MANIFEST_IDENTITY_MISMATCH';
    throw error;
  }
  const curated = curateHephaestusAssets(Array.isArray(payload.images) ? payload.images : []);
  const assets = curated.assets.map((asset) => canonicalAsset(asset, manifestPath, { projectId, sourcePdfSha256, gameIdentity }));
  const componentBindings = components.map((component) => bindOneComponent(component, assets));
  const accepted = assets.filter((asset) => asset.reviewState === 'accepted');
  const setupBindings = setupSteps.map((step) => {
    const refs = Array.isArray(step.componentRefs) ? step.componentRefs : [];
    const linked = componentBindings.filter((binding) => refs.includes(binding.componentId) && binding.assetId);
    return {
      setupStepId: step.id || null,
      instruction: step.text || step.instruction || '',
      componentRefs: refs,
      visualAssetIds: linked.map((binding) => binding.assetId),
      bindings: linked,
      reviewState: linked.length === refs.length && linked.length > 0
        ? (linked.every((binding) => binding.reviewState === 'accepted') ? 'accepted' : 'needs_review')
        : 'blocked',
      provenance: linked.map((binding) => ({ componentId: binding.componentId, sourcePage: binding.sourcePage, assetId: binding.assetId })),
    };
  });
  return {
    contract: HEPHAESTUS_EVIDENCE_CONTRACT,
    projectId: projectId || null,
    gameIdentity: gameIdentity || null,
    sourcePdfSha256: sourcePdfSha256 || null,
    sourceManifestPath: path.resolve(manifestPath),
    sourceManifestSha256: sha256File(manifestPath),
    sourceManifestContract: payload.contract || 'legacy-hephaestus-native-extraction',
    sourceManifestSchemaVersion: payload.schemaVersion || null,
    sourcePdfIdentity: payload.sourcePdfIdentity || payload.source || null,
    pageCount: payload.pageCount || payload.source?.pageCount || null,
    extractionRoot: payload.extractionRoot || path.dirname(path.resolve(manifestPath)),
    generatedAt: payload.generatedAt || null,
    checkpointIdentity: payload.checkpointIdentity || null,
    extractionStats: payload.stats || {},
    curationStats: curated.stats,
    assets,
    acceptedVisuals: accepted,
    reviewQueue: assets.filter((asset) => asset.reviewState === 'needs_review'),
    rejectedVisuals: assets.filter((asset) => asset.reviewState === 'rejected'),
    componentBindings,
    setupBindings,
    validation: {
      acceptedFilesExist: accepted.every((asset) => Boolean(asset.renderPath && fs.existsSync(asset.renderPath))),
      acceptedHaveProvenance: accepted.every((asset) => Boolean(asset.sourcePdfSha256 || asset.provenance?.manifestPath)),
      acceptedHaveSourcePage: accepted.every((asset) => Number.isInteger(asset.pageNumber)),
      duplicateAcceptedCount: accepted.filter((asset) => asset.dedupIdentity.isDuplicate).length,
    },
  };
}

export async function writeHephaestusEvidence(filePath, evidence) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return filePath;
}
