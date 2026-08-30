import fs from 'fs';
import path from 'path';
import { curateHephaestusAssets } from './hephaestusCuration.js';

const TYPE_KEYWORDS = {
  board: ['plateau', 'board', 'piste', 'track', 'emplacement', 'site', 'temple', 'recherche', 'supply'],
  card: ['carte', 'card', 'deck', 'paquet', 'rangée', 'artefact', 'objet', 'jouer'],
  token: ['jeton', 'token', 'ressource', 'pièce', 'garde', 'idole', 'marqueur', 'diamant', 'tablette'],
  tile: ['tuile', 'tile', 'site', 'plateau', 'lieu'],
  marker: ['marqueur', 'pion', 'explorateur', 'archéologue', 'assistant'],
  dice: ['dé', 'dice'],
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assetType(asset) {
  return String(asset.type || asset.classification || asset.label || 'unknown').toLowerCase();
}

function resolveAssetPath(asset, manifestPath) {
  const manifestDir = path.dirname(manifestPath);
  const candidates = [
    asset.renderPath,
    asset.file_path,
    asset.fileKey,
    asset.path,
    asset.file_name && path.join(manifestDir, 'images', 'all', asset.file_name),
    asset.file_name && path.join(manifestDir, asset.file_name),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function inferVisualTypes(scene = {}) {
  const explicit = Array.isArray(scene.visual_types) ? scene.visual_types : [];
  const text = normalize([
    scene.section,
    scene.narration,
    scene.on_screen_text,
    scene.visual_intent,
  ].filter(Boolean).join(' '));
  const inferred = Object.entries(TYPE_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(normalize(keyword))))
    .map(([type]) => type);
  return [...new Set([...explicit.map((value) => normalize(value)), ...inferred])];
}

function sourcePageScore(asset, sourcePages) {
  const pages = new Set((Array.isArray(sourcePages) ? sourcePages : []).map(Number));
  const assetPage = Number(asset.page_index ?? asset.pageIndex ?? asset.source_page);
  // HEPHAESTUS records zero-based PDF pages while storyboard source evidence
  // is one-based. Accept both representations without weakening other gates.
  return pages.has(assetPage) || pages.has(assetPage + 1) ? 0.32 : 0;
}

function typeScore(asset, desiredTypes) {
  if (!desiredTypes.length) return 0.08;
  const type = normalize(assetType(asset));
  return desiredTypes.includes(type) ? 0.34 : 0;
}

function dimensionsScore(asset) {
  const dimensions = asset.dimensions || {};
  const width = Number(asset.width || dimensions.width || 0);
  const height = Number(asset.height || dimensions.height || 0);
  const area = width * height;
  return Math.min(0.15, Math.log10(Math.max(1, area)) / 40);
}

/**
 * Load and curate a Hephaestus manifest into renderer-ready candidate assets.
 * Files whose historical absolute paths are stale are resolved from the manifest
 * directory by filename, making project copies and CI workspaces portable.
 */
export function loadSourceVisualCatalog(manifestPath, options = {}) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { manifestPath: manifestPath || null, assets: [], warnings: ['asset manifest unavailable'] };
  }
  const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const qualityReportPath = options.qualityReportPath;
  const semanticReportPath = options.semanticReportPath;
  const qualityByAssetId = new Map();
  const semanticBySceneId = new Map();
  if (qualityReportPath && fs.existsSync(qualityReportPath)) {
    const qualityReport = JSON.parse(fs.readFileSync(qualityReportPath, 'utf8'));
    for (const judgement of qualityReport.assets || []) {
      if (judgement?.asset_id) qualityByAssetId.set(judgement.asset_id, judgement);
    }
  }
  if (semanticReportPath && fs.existsSync(semanticReportPath)) {
    const semanticReport = JSON.parse(fs.readFileSync(semanticReportPath, 'utf8'));
    for (const sceneMatch of semanticReport.scenes || []) {
      if (sceneMatch?.scene_id) semanticBySceneId.set(sceneMatch.scene_id, sceneMatch);
    }
  }
  const rawAssets = Array.isArray(payload.images) ? payload.images : [];
  const curated = curateHephaestusAssets(rawAssets);
  const assets = curated.assets
    .map((asset) => ({
      ...asset,
      renderPath: resolveAssetPath(asset, manifestPath),
      visualQuality: qualityByAssetId.get(asset.id) || null,
    }))
    .filter((asset) => Boolean(asset.renderPath));
  const warnings = [];
  if (assets.length === 0) warnings.push('asset manifest contains no readable component images');
  if (qualityReportPath && !fs.existsSync(qualityReportPath)) warnings.push('visual quality report unavailable');
  if (semanticReportPath && !fs.existsSync(semanticReportPath)) warnings.push('semantic visual report unavailable');
  return {
    manifestPath,
    qualityReportPath: qualityReportPath || null,
    semanticReportPath: semanticReportPath || null,
    semanticBySceneId,
    assets,
    warnings,
    stats: curated.stats,
  };
}

/**
 * Select the strongest component visual for a reviewed scene. Explicit scene
 * assignments always win; a rulebook page is returned only as a labelled
 * fallback, never disguised as a component match.
 */
export function selectSourceVisual(scene = {}, catalog = { assets: [] }, fallbackPath = null) {
  if (scene.visual_asset && fs.existsSync(scene.visual_asset)) {
    return {
      path: path.resolve(scene.visual_asset),
      kind: scene.visual_asset_kind || 'explicit-asset',
      confidence: 1,
      reason: scene.visual_asset_kind === 'automatic-asset'
        ? 'automatic-semantic-assignment'
        : 'reviewed-explicit-assignment',
      assetId: scene.visual_asset_id || null,
    };
  }

  const desiredTypes = inferVisualTypes(scene);
  const baseCandidates = (catalog.assets || [])
    .filter((asset) => asset.is_component !== false)
    // A visually informative duplicate may be the only extracted instance
    // located on the rulebook page cited by the scene. Keep it selectable,
    // while still excluding blank/tiny assets rejected by curation.
    .filter((asset) => asset.curation?.lowInformation !== true);
  const citedPageCandidates = baseCandidates.filter((asset) => sourcePageScore(asset, scene.source_pages) > 0);
  const qualityGateEnabled = Boolean(catalog.qualityReportPath);
  const passesVisualQa = (asset) => qualityGateEnabled
    ? (asset.visualQuality?.primary_explanatory === true && Number(asset.visualQuality.quality_score) >= 70)
    : true;
  // A cited page is the best deterministic evidence of the rule being taught.
  // When vision QA rejects every cited component, deliberately use the labelled
  // rulebook-page fallback rather than a persuasive but unrelated visual.
  const qualityCandidates = qualityGateEnabled
    ? citedPageCandidates.filter(passesVisualQa)
    : (citedPageCandidates.length > 0 ? citedPageCandidates.filter(passesVisualQa) : baseCandidates.filter(passesVisualQa));
  const semanticGateEnabled = Boolean(catalog.semanticReportPath);
  const semanticMatch = catalog.semanticBySceneId?.get(scene.id) || null;
  const candidatePool = semanticGateEnabled
    ? (semanticMatch?.status === 'matched'
      ? qualityCandidates.filter((asset) => asset.id === semanticMatch.selected_asset_id)
      : [])
    : qualityCandidates;
  const candidates = candidatePool
    .map((asset) => {
      const curationScore = Number(asset.curation?.score || asset.confidence || 0.5) * 0.28;
      const duplicatePenalty = asset.curation?.isDuplicate ? 0.035 : 0;
      const score = curationScore + sourcePageScore(asset, scene.source_pages) + typeScore(asset, desiredTypes) + dimensionsScore(asset) - duplicatePenalty;
      return { asset, score: Number(Math.min(1, score).toFixed(3)) };
    })
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (best && best.score >= 0.42) {
    return {
      path: best.asset.renderPath,
      kind: 'component',
      confidence: best.score,
      reason: `curated-component:${assetType(best.asset)}`,
      assetId: best.asset.id || null,
      sourcePage: Number.isFinite(Number(best.asset.page_index ?? best.asset.pageIndex))
        ? Number(best.asset.page_index ?? best.asset.pageIndex)
        : null,
      visualTypes: desiredTypes,
      visualQuality: best.asset.visualQuality || null,
      semanticMatch: semanticMatch || null,
    };
  }

  if (fallbackPath) {
    return {
      path: fallbackPath,
      kind: 'rulebook-page-fallback',
      confidence: 0.2,
      reason: 'no-suitable-curated-component',
      assetId: null,
      visualTypes: desiredTypes,
      warning: `Scene '${scene.id || 'unknown'}' fell back to a rulebook page because no curated component passed selection${semanticGateEnabled ? ' against the semantic scene match' : citedPageCandidates.length > 0 ? ' on the cited rule page' : ''}` ,
    };
  }

  return {
    path: null,
    kind: 'missing',
    confidence: 0,
    reason: 'no-visual-available',
    assetId: null,
    visualTypes: desiredTypes,
    warning: `Scene '${scene.id || 'unknown'}' has no available visual`,
  };
}

export { inferVisualTypes, resolveAssetPath };
