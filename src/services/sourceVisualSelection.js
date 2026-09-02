import fs from 'fs';
import path from 'path';
import { curateHephaestusAssets } from './hephaestusCuration.js';
import editorialStandard from './editorialStandard.cjs';

const { classifyVisualLanguage } = editorialStandard;

const TYPE_KEYWORDS = {
  component: ['composant', 'composants', 'component', 'components', 'matériel', 'materiel'],
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
  return String(asset.visual_kind || asset.type || asset.classification || asset.label || 'unknown').toLowerCase();
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
  const assetPage = asset.source_page !== undefined && asset.source_page !== null
    ? Number(asset.source_page)
    : asset.sourcePage !== undefined && asset.sourcePage !== null
      ? Number(asset.sourcePage)
      : Number(asset.page_index ?? asset.pageIndex) + 1;
  // HEPHAESTUS records zero-based PDF pages, while source_page is the
  // canonical one-based identity. Normalize once, then use an exact match so
  // a cited page can never silently select its neighbour.
  return pages.has(assetPage) ? 0.32 : 0;
}

function typeScore(asset, desiredTypes) {
  if (!desiredTypes.length) return 0.08;
  const type = normalize(assetType(asset));
  if (desiredTypes.includes(type)) return 0.34;
  if (desiredTypes.includes('component') && ['focused-page-crop', 'focused-page-region', 'card', 'token', 'board', 'tile', 'marker', 'dice'].includes(type)) return 0.30;
  return 0;
}

function dimensionsScore(asset) {
  const dimensions = asset.dimensions || {};
  const width = Number(asset.width || dimensions.width || 0);
  const height = Number(asset.height || dimensions.height || 0);
  const area = width * height;
  return Math.min(0.15, Math.log10(Math.max(1, area)) / 40);
}

function isComponentOverviewScene(scene = {}) {
  const text = normalize([
    scene.section,
    scene.title,
    scene.narration,
    scene.on_screen_text,
    scene.visual_intent,
  ].filter(Boolean).join(' '));
  return /\b(composants?|components?|materiel)\b/.test(text)
    && !/\b(action|actions|jouer|play|tour|turn|placement|placer)\b/.test(text);
}

function componentPresentationPenalty(asset, scene = {}) {
  const setupText = normalize([scene.section, scene.title, scene.narration, scene.visual_intent]
    .filter(Boolean).join(' '));
  const isSetupScene = /\b(mise en place|preparation|setup)\b/.test(setupText);
  if (!isComponentOverviewScene(scene) && !isSetupScene) return 0;
  const explicitPage = asset.source_page ?? asset.sourcePage;
  const page = explicitPage !== undefined && explicitPage !== null
    ? Number(explicitPage)
    : Number(asset.page_index ?? asset.pageIndex) + 1;
  const type = normalize(assetType(asset));
  const dimensions = asset.dimensions || {};
  const width = Number(asset.width || dimensions.width || 0);
  const height = Number(asset.height || dimensions.height || 0);
  const area = width * height;
  let penalty = 0;
  // Page-one art is normally the box cover. It remains eligible as a last
  // resort, but must not outrank actual teaching components in an inventory
  // overview. Metadata scenes bypass this policy through their own contract.
  if (page === 1 && ['board', 'component', 'focused-page-crop', 'focused-page-region'].includes(type)) penalty -= 0.35;
  // A very large raster classified as a token/tile/marker is usually a
  // source illustration rather than the small physical item being named.
  // Prefer the bounded extracted instance when one is available.
  if (['token', 'tile', 'marker', 'dice', 'currency'].includes(type) && area > 500000) penalty -= 0.22;
  return penalty;
}

function languageScore(asset, scene = {}) {
  if (scene.language !== 'fr-CA') return { score: 0, audit: 'not-applicable' };
  const audit = classifyVisualLanguage({
    visualKind: asset.visual_kind || asset.type,
    assetPath: asset.renderPath || asset.path || asset.file_name,
    metadata: asset,
    language: scene.language,
  });
  if (audit === 'english-explanatory') return { score: -0.18, audit };
  if (audit === 'english-source-uncertain') return { score: -0.08, audit };
  if (audit === 'language-neutral-component' || audit === 'french-localized') return { score: 0.04, audit };
  return { score: 0, audit };
}

const LOCAL_SEMANTIC_STOP_WORDS = new Set([
  'avec', 'dans', 'pour', 'plus', 'vous', 'votre', 'leurs', 'cette', 'comme', 'sont',
  'the', 'and', 'from', 'that', 'this', 'your', 'will', 'have', 'into', 'with',
  'afin', 'sans', 'tous', 'toutes', 'sur', 'une', 'des', 'les', 'aux', 'par', 'qui',
]);

const VISUAL_TERM_ALIASES = new Map([
  ['outil', 'tool'], ['outils', 'tool'], ['carte', 'card'], ['cartes', 'card'],
  ['jeton', 'token'], ['jetons', 'token'], ['faveur', 'favor'], ['faveurs', 'favor'],
  ['de', 'dice'], ['des', 'dice'], ['dés', 'dice'], ['objectif', 'objective'], ['objectifs', 'objective'],
]);

function meaningfulTokens(value) {
  return new Set(normalize(value).split(' ')
    .map((token) => VISUAL_TERM_ALIASES.get(token) || token.replace(/s$/, ''))
    .filter((token) => token.length >= 4 && !LOCAL_SEMANTIC_STOP_WORDS.has(token)));
}

function localLayoutEvidence(asset, scene = {}) {
  const sceneTokens = meaningfulTokens([
    scene.section,
    scene.narration,
    scene.on_screen_text,
    scene.visual_intent,
  ].filter(Boolean).join(' '));
  const layoutTokens = meaningfulTokens([
    asset.label,
    asset.layout_text,
    ...(Array.isArray(asset.layout_labels) ? asset.layout_labels : []),
  ].join(' '));
  if (!sceneTokens.size || !layoutTokens.size) return { score: 0, overlap: [] };
  const overlap = [...sceneTokens].filter((token) => layoutTokens.has(token));
  return { score: Number((overlap.length / Math.min(sceneTokens.size, 8)).toFixed(3)), overlap };
}

function isProviderSemanticFailure(semanticMatch) {
  const reason = String(semanticMatch?.reason || '').toLowerCase();
  return Boolean(semanticMatch)
    && (reason.includes('vision failure') || reason.includes('credit_balance_exhausted')
      || reason.includes('insufficient_quota') || reason.includes('429')
      || reason.includes('provider unavailable') || reason.includes('provider failure'));
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
      sourcePage: scene.visual_source_page || scene.source_page || null,
      provenance: scene.visual_provenance || scene.provenance || null,
      languageAudit: classifyVisualLanguage({
        visualKind: scene.visual_asset_kind || 'explicit-asset',
        assetPath: scene.visual_asset,
        metadata: scene.visual_metadata || {},
        language: scene.language || 'fr-CA',
      }),
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
  const isMetadataCard = scene.metadata_card === true;
  const providerSemanticFailure = isProviderSemanticFailure(semanticMatch);
  const locallyGroundedCandidates = providerSemanticFailure
    ? qualityCandidates
      .map((asset) => {
        const evidence = localLayoutEvidence(asset, scene);
        const cited = sourcePageScore(asset, scene.source_pages) > 0;
        const selectedByLocalRecovery = semanticMatch?.selected_asset_id === asset.id
          && ['focused-page-crop', 'focused-page-region'].includes(asset.visual_kind);
        const typed = typeScore(asset, desiredTypes) >= 0.30 || selectedByLocalRecovery;
        // When the vision provider is unavailable, a cited, quality-approved
        // component with a direct visual type match is still defensible. This
        // keeps provider outage from erasing real source evidence, while the
        // cited-page + type gates prevent an attractive unrelated image from
        // displacing a truthful fallback.
        const deterministicScore = cited && typed ? 0.24 : 0;
        return { asset, evidence: { ...evidence, score: Math.max(evidence.score, deterministicScore) } };
      })
      .filter(({ evidence }) => evidence.score >= 0.18)
      .sort((left, right) => right.evidence.score - left.evidence.score)
      .map(({ asset }) => asset)
    : [];
  const candidatePool = isMetadataCard
    ? qualityCandidates
    : semanticGateEnabled
    ? (!providerSemanticFailure && semanticMatch?.status === 'matched'
      ? qualityCandidates.filter((asset) => asset.id === semanticMatch.selected_asset_id)
      : locallyGroundedCandidates)
    : qualityCandidates;
  const candidates = candidatePool
    .map((asset) => {
      const curationScore = Number(asset.curation?.score || asset.confidence || 0.5) * 0.28;
      const duplicatePenalty = asset.curation?.isDuplicate ? 0.035 : 0;
      const language = languageScore(asset, scene);
      const localSemanticRecoveryBonus = providerSemanticFailure
        && !isComponentOverviewScene(scene)
        && semanticMatch?.selected_asset_id === asset.id
        && ['focused-page-crop', 'focused-page-region'].includes(asset.visual_kind)
        ? 0.18
        : 0;
      const localSemanticRecoveryTypeBonus = providerSemanticFailure
        && !isComponentOverviewScene(scene)
        && semanticMatch?.selected_asset_id === asset.id
        && ['focused-page-crop', 'focused-page-region'].includes(asset.visual_kind)
        && typeScore(asset, desiredTypes) === 0
        ? 0.30
        : 0;
      const score = curationScore + sourcePageScore(asset, scene.source_pages) + typeScore(asset, desiredTypes) + dimensionsScore(asset) + language.score - duplicatePenalty + componentPresentationPenalty(asset, scene) + localSemanticRecoveryBonus + localSemanticRecoveryTypeBonus;
      return { asset, score: Number(Math.min(1, score).toFixed(3)), languageAudit: language.audit };
    })
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (best && best.score >= 0.42) {
    const localEvidence = providerSemanticFailure ? localLayoutEvidence(best.asset, scene) : null;
    const assetProvenance = best.asset.provenance || {};
    const sourcePage = Number.isFinite(Number(best.asset.source_page ?? best.asset.sourcePage))
      ? Number(best.asset.source_page ?? best.asset.sourcePage)
      : Number.isFinite(Number(best.asset.page_index ?? best.asset.pageIndex))
        ? Number(best.asset.page_index ?? best.asset.pageIndex) + 1
        : Number(scene.source_pages?.[0]) || null;
    return {
      path: best.asset.renderPath,
      kind: ['focused-page-crop', 'focused-page-region'].includes(best.asset.visual_kind)
        ? best.asset.visual_kind
        : best.asset.type === 'focused-crop'
          ? 'focused-page-crop'
        : 'component',
      confidence: best.score,
      reason: providerSemanticFailure
        ? `layout-grounded-semantic-recovery:${localEvidence.overlap.join(',') || 'cited-focused-region'}`
        : `curated-component:${assetType(best.asset)}`,
      assetId: best.asset.id || null,
      sourcePage,
      visualTypes: desiredTypes,
      visualQuality: best.asset.visualQuality || null,
      languageAudit: best.languageAudit,
      semanticMatch: semanticMatch || null,
      provenance: {
        ...assetProvenance,
        sourcePdfSha256: assetProvenance.sourcePdfSha256 || best.asset.sourcePdfSha256 || scene.source_pdf_sha256 || null,
        sourcePage: assetProvenance.sourcePage || assetProvenance.source_page || sourcePage,
        bbox: assetProvenance.bbox || best.asset.bbox || best.asset.normalized_bbox || null,
        assetHash: assetProvenance.assetHash || best.asset.contentHash || null,
      },
    };
  }

  if (fallbackPath) {
    const alternatives = citedPageCandidates.slice(0, 12).map((asset) => {
      const evidence = localLayoutEvidence(asset, scene);
      return {
        assetId: asset.id || null,
        kind: asset.visual_kind || asset.type || 'unknown',
        sourcePage: asset.source_page ?? ((Number(asset.page_index) + 1) || null),
        qualityScore: asset.visualQuality?.quality_score ?? null,
        semanticEvidence: evidence.score,
        rejection: providerSemanticFailure ? 'below-local-layout-semantic-threshold' : 'semantic-gate-no-match',
      };
    });
    return {
      path: fallbackPath,
      kind: 'rulebook-page-fallback',
      confidence: 0.2,
      reason: 'no-suitable-curated-component',
      fallbackReason: 'no-qualified-source-visual-after-quality-and-semantic-gates',
      alternativesConsidered: alternatives,
      fallbackMitigation: 'labelled cited rulebook page with discreet bottom-left source reference',
      sourcePage: Number(scene.source_pages?.[0]) || null,
      provenance: scene.source_pdf_sha256 ? {
        sourcePdfSha256: scene.source_pdf_sha256,
        sourcePage: Number(scene.source_pages?.[0]) || null,
        extraction: 'authoritative-rulebook-page-fallback',
      } : null,
      assetId: null,
      visualTypes: desiredTypes,
      warning: `Scene '${scene.id || 'unknown'}' fell back to the cited rule page because no curated component passed selection${semanticGateEnabled ? ' against the semantic scene match' : citedPageCandidates.length > 0 ? ' on the cited rule page' : ''}` ,
      languageAudit: classifyVisualLanguage({ visualKind: 'fallback', assetPath: fallbackPath, language: scene.language || 'fr-CA' }),
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
