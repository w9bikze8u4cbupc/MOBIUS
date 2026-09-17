#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const r5Path = path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r5.json');
const officialManifestPath = path.join(ROOT, 'out/publishability-r6/authorized-source-audit/repos-production/manifest.json');
const r5 = readJson(r5Path);
const official = readJson(officialManifestPath);
const officialById = new Map(official.assets.map((asset) => [asset.id, asset]));
const sourceUrl = official.archives.find((archive) => archive.locale === 'fr').sourceUrl;
const officialAsset = (id, overrides = {}) => {
  const source = officialById.get(id);
  if (!source?.image) throw new Error(`Missing official image ${id}`);
  return {
    id: overrides.id || id,
    sourceType: 'OFFICIAL_HIGH_RES',
    sourcePath: source.filePath,
    visualClassification: overrides.visualClassification || 'REAL_CARD_OR_WONDER',
    semanticTags: overrides.semanticTags || [],
    visibleLabels: overrides.visibleLabels || [],
    sourceRefs: overrides.sourceRefs || [],
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    qualityState: 'SOURCE_DETAIL_PASS',
    sourceUrl,
    publisher: 'Repos Production',
    licenseProvenanceState: 'OFFICIAL_PUBLISHER_PRESS_ASSET',
    ...overrides,
  };
};

const content = officialById.get('repos-fr-duel-content-3d');
const contentBase = {
  sourceType: 'OFFICIAL_HIGH_RES', sourcePath: content.filePath, sourceUrl,
  publisher: 'Repos Production', licenseProvenanceState: 'OFFICIAL_PUBLISHER_PRESS_ASSET',
  sourceRefs: [{ page: 2 }], qualityState: 'SOURCE_DETAIL_PASS',
};

const retained = r5.assets.filter((asset) => [
  '7wd-age-layouts-real-cards',
  '7wd-accessible-cards',
  '7wd-chain-example',
  '7wd-progress-tokens-clean',
  '7wd-science-symbols',
].includes(asset.id)).map((asset) => ({
  ...asset,
  qualityState: 'REVIEWED_ENHANCED_DERIVATIVE',
  maxDisplayScale: 1,
  enhancement: {
    tool: 'PyMuPDF page rasterization', version: 'repository environment',
    parameters: { pageDpi: 600, additionalSharpening: false, semanticPixelsChanged: false },
    reviewState: 'PASS',
    reason: 'R5 Director-approved source-faithful relationship retained at a bounded display scale; original PDF remains canonical.',
  },
}));

const assets = [
  officialAsset('repos-fr-duel-content-3d', { id: 'r6-components-spread', visualClassification: 'REAL_SETUP_STATE', semanticTags: ['composants', 'plateau', 'cartes Âge', 'Merveilles', 'pièces', 'jetons Progrès'], sourceRefs: [{ page: 2 }] }),
  officialAsset('repos-fr-7du-board', { id: 'r6-military-board', visualClassification: 'REAL_BOARD_OR_TRACK', semanticTags: ['plateau militaire', 'piste de conflit', 'seuils', 'capitales'], sourceRefs: [{ page: 4 }, { page: 12 }] }),
  officialAsset('repos-fr-7du-age1-fr', { id: 'r6-age-i-cards', visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['cartes Âge I'], visibleLabels: ['Âge I'], sourceRefs: [{ page: 7 }, { page: 10 }] }),
  officialAsset('repos-fr-7du-age2-fr', { id: 'r6-age-ii-cards', visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['cartes Âge II'], visibleLabels: ['Âge II'], sourceRefs: [{ page: 10 }, { page: 20 }] }),
  officialAsset('repos-fr-7du-age3-fr', { id: 'r6-age-iii-cards', visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['cartes Âge III'], visibleLabels: ['Âge III'], sourceRefs: [{ page: 10 }, { page: 20 }] }),
  officialAsset('repos-fr-7du-wonders-fr', { id: 'r6-wonder-cards', semanticTags: ['cartes Merveille'], sourceRefs: [{ page: 7 }] }),
  officialAsset('repos-fr-7du-wonders-fr', { id: 'r6-wonder-cards-second-group', semanticTags: ['second groupe de cartes Merveille'], sourceRefs: [{ page: 7 }] }),
  officialAsset('repos-fr-7du-fr-cards-1', { id: 'r6-card-production-brown', semanticTags: ['carte brune', 'production de ressource', 'bois'], sourceRefs: [{ page: 5 }, { page: 8 }] }),
  officialAsset('repos-fr-7du-fr-cards-20', { id: 'r6-card-trade-yellow', semanticTags: ['carte jaune', 'commerce', 'ressource manquante', 'pièces'], sourceRefs: [{ page: 8 }, { page: 9 }] }),
  officialAsset('repos-fr-7du-fr-cards-37', { id: 'r6-card-science-green', semanticTags: ['carte verte', 'symbole scientifique', 'lauriers', 'points'], sourceRefs: [{ page: 5 }, { page: 12 }, { page: 13 }] }),
  officialAsset('repos-fr-7du-fr-cards-47', { id: 'r6-card-military-red', semanticTags: ['carte rouge', 'boucliers', 'symbole de chaînage'], sourceRefs: [{ page: 5 }, { page: 9 }, { page: 11 }] }),
  officialAsset('repos-fr-7du-fr-cards-63', { id: 'r6-card-vp-blue', semanticTags: ['carte bleue', 'lauriers', 'points de victoire', 'coût'], sourceRefs: [{ page: 5 }, { page: 13 }] }),
  officialAsset('repos-fr-7du-fr-cards-63', { id: 'r6-card-vp-blue-city', semanticTags: ['carte bleue construite dans la cité', 'lauriers', 'points de victoire'], sourceRefs: [{ page: 5 }, { page: 8 }, { page: 13 }] }),
  {
    id: 'r6-coins-isolated', ...contentBase,
    visualClassification: 'REAL_COMPONENT', semanticTags: ['pièces', 'trésorerie'],
    objectCrop: { intendedObjects: [{ id: 'coin-cluster', bounds: { x: 3310, y: 1280, width: 1620, height: 390 } }], forbiddenObjects: [{ id: 'wonder-card-edge', bounds: { x: 3900, y: 1730, width: 1050, height: 680 } }, { id: 'board-edge', bounds: { x: 0, y: 1710, width: 3900, height: 360 } }], paddingPx: 12 },
    cropCompleteness: 'complete', cropPurity: 'clean',
  },
  {
    id: 'r6-progress-tokens-isolated', ...contentBase,
    visualClassification: 'REAL_COMPONENT', semanticTags: ['jetons Progrès'],
    objectCrop: { intendedObjects: [{ id: 'progress-token-row', bounds: { x: 1840, y: 1480, width: 1430, height: 270 } }], forbiddenObjects: [{ id: 'military-board', bounds: { x: 1200, y: 1790, width: 2700, height: 280 } }], paddingPx: 24 },
    cropCompleteness: 'complete', cropPurity: 'clean',
  },
  {
    id: 'r6-coins-clean-composite',
    sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_COMPONENT', semanticTags: ['pièces', 'trésorerie'],
    sourceRefs: [{ page: 2 }], cropCompleteness: 'complete', cropPurity: 'clean',
    maxDisplayScale: 1,
    composite: {
      width: 480, height: 130, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [
        { id: 'silver-coin-one-a', sourcePath: content.filePath, sourceType: 'OFFICIAL_HIGH_RES', objectCrop: { intendedObjects: [{ id: 'silver-coin-one-a', bounds: { x: 4154, y: 1427, width: 115, height: 75 } }], paddingPx: 8 }, x: 12, y: 12, width: 135, height: 95, maskShape: 'ellipse', maskRadiusXRatio: 0.48, maskRadiusYRatio: 0.43, sourceUrl },
        { id: 'silver-coin-one-b', sourcePath: content.filePath, sourceType: 'OFFICIAL_HIGH_RES', objectCrop: { intendedObjects: [{ id: 'silver-coin-one-b', bounds: { x: 4154, y: 1427, width: 115, height: 75 } }], paddingPx: 8 }, x: 172, y: 12, width: 135, height: 95, maskShape: 'ellipse', maskRadiusXRatio: 0.48, maskRadiusYRatio: 0.43, sourceUrl },
        { id: 'silver-coin-one-c', sourcePath: content.filePath, sourceType: 'OFFICIAL_HIGH_RES', objectCrop: { intendedObjects: [{ id: 'silver-coin-one-c', bounds: { x: 4154, y: 1427, width: 115, height: 75 } }], paddingPx: 8 }, x: 332, y: 12, width: 135, height: 95, maskShape: 'ellipse', maskRadiusXRatio: 0.48, maskRadiusYRatio: 0.43, sourceUrl },
      ],
    },
  },
  {
    id: 'r6-progress-token-examples',
    sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_COMPONENT', semanticTags: ['jetons Progrès'],
    sourceRefs: [{ page: 2 }, { page: 6 }], cropCompleteness: 'complete', cropPurity: 'clean',
    maxDisplayScale: 1,
    composite: {
      width: 840, height: 180, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [
        { id: 'progress-agriculture', sourcePath: content.filePath, sourceType: 'OFFICIAL_HIGH_RES', objectCrop: { intendedObjects: [{ id: 'progress-agriculture', bounds: { x: 1890, y: 1545, width: 225, height: 130 } }], paddingPx: 8 }, x: 20, y: 10, width: 240, height: 145, maskShape: 'ellipse', maskRadiusXRatio: 0.49, maskRadiusYRatio: 0.43, sourceUrl },
        { id: 'progress-philosophy', sourcePath: content.filePath, sourceType: 'OFFICIAL_HIGH_RES', objectCrop: { intendedObjects: [{ id: 'progress-philosophy', bounds: { x: 2165, y: 1545, width: 225, height: 130 } }], paddingPx: 8 }, x: 300, y: 10, width: 240, height: 145, maskShape: 'ellipse', maskRadiusXRatio: 0.49, maskRadiusYRatio: 0.43, sourceUrl },
        { id: 'progress-law', sourcePath: content.filePath, sourceType: 'OFFICIAL_HIGH_RES', objectCrop: { intendedObjects: [{ id: 'progress-law', bounds: { x: 2855, y: 1545, width: 225, height: 130 } }], paddingPx: 8 }, x: 580, y: 10, width: 240, height: 145, maskShape: 'ellipse', maskRadiusXRatio: 0.49, maskRadiusYRatio: 0.43, sourceUrl },
      ],
    },
  },
  ...retained,
];

const map = {
  'identity-theme': ['r6-components-spread'],
  'objective-victory-overview': ['r6-military-board', 'r6-card-science-green', 'r6-card-vp-blue'],
  'components-overview': ['r6-components-spread'],
  'setup-central': ['r6-military-board', 'r6-progress-token-examples', 'r6-coins-clean-composite'],
  'setup-wonder-selection': ['r6-wonder-cards', 'r6-wonder-cards-second-group'],
  'setup-age-decks': ['r6-age-i-cards', 'r6-age-ii-cards', 'r6-age-iii-cards'],
  'setup-age-layouts': ['7wd-age-layouts-real-cards'],
  'setup-later-age-layouts': ['7wd-age-layouts-real-cards'],
  'age-loop': ['r6-age-i-cards', 'r6-age-ii-cards', 'r6-age-iii-cards'],
  'accessible-card': ['7wd-accessible-cards'],
  'construct-building': ['r6-card-vp-blue', 'r6-card-vp-blue-city'],
  'resource-production': ['r6-card-production-brown'],
  'trade-missing-resources': ['r6-card-trade-yellow', 'r6-coins-clean-composite'],
  'chain-construction': ['7wd-chain-example'],
  'discard-for-coins': ['r6-age-i-cards', 'r6-coins-clean-composite'],
  'construct-wonder': ['r6-wonder-cards', 'r6-age-i-cards'],
  'end-of-age': ['r6-age-i-cards', 'r6-age-ii-cards', 'r6-age-iii-cards'],
  'military-system': ['r6-military-board'],
  'science-pair-progress': ['r6-card-science-green', 'r6-progress-token-examples'],
  'science-supremacy': ['7wd-science-symbols', 'r6-progress-token-examples'],
  'endgame-trigger': ['r6-military-board', 'r6-card-science-green', 'r6-card-vp-blue'],
  'scoring-ledger': ['r6-military-board', 'r6-card-vp-blue', 'r6-wonder-cards', 'r6-progress-token-examples', 'r6-coins-clean-composite'],
  'scoring-military': ['r6-military-board'],
  'scoring-buildings': ['r6-card-vp-blue', 'r6-card-science-green'],
  'scoring-wonders': ['r6-wonder-cards'],
  'scoring-progress': ['r6-progress-token-examples'],
  'scoring-treasury': ['r6-coins-clean-composite'],
  'winner-resolution': ['r6-military-board', 'r6-card-vp-blue', 'r6-wonder-cards', 'r6-progress-token-examples', 'r6-coins-clean-composite'],
  'tie-breaker': ['r6-card-vp-blue'],
  'scorebook-reference': ['r6-military-board', 'r6-card-vp-blue', 'r6-wonder-cards', 'r6-progress-token-examples', 'r6-coins-clean-composite'],
};

const composition = {
  'setup-age-decks': 'REAL_COMPONENT_GRID', 'age-loop': 'REAL_COMPONENT_GRID',
  'end-of-age': 'REAL_COMPONENT_GRID', 'discard-for-coins': 'REAL_COMPONENT_SEQUENCE',
  'construct-wonder': 'REAL_COMPONENT_SEQUENCE', 'science-pair-progress': 'REAL_COMPONENT_SEQUENCE',
  'science-supremacy': 'REAL_SYMBOL_COMPARISON', 'scoring-buildings': 'REAL_COMPONENT_GRID',
};

const cardSemanticRegions = {
  'r6-card-production-brown': { fullCard: [0, 0, 1, 1], productionOrEffect: [0.28, 0.02, 0.72, 0.24], cardName: [0.12, 0.88, 0.88, 0.97] },
  'r6-card-trade-yellow': { fullCard: [0, 0, 1, 1], constructionCost: [0.02, 0.23, 0.28, 0.38], productionOrEffect: [0.25, 0.02, 0.75, 0.24], cardName: [0.12, 0.88, 0.88, 0.97] },
  'r6-card-science-green': { fullCard: [0, 0, 1, 1], scienceSymbol: [0.10, 0.02, 0.48, 0.24], victoryPoints: [0.50, 0.02, 0.86, 0.24], constructionCost: [0.02, 0.23, 0.60, 0.38], chainSymbol: [0.02, 0.36, 0.23, 0.52] },
  'r6-card-military-red': { fullCard: [0, 0, 1, 1], militarySymbol: [0.16, 0.02, 0.78, 0.24], constructionCost: [0.02, 0.23, 0.64, 0.38], chainSymbol: [0.02, 0.36, 0.23, 0.52] },
  'r6-card-vp-blue': { fullCard: [0, 0, 1, 1], victoryPoints: [0.26, 0.02, 0.74, 0.24], constructionCost: [0.02, 0.23, 0.72, 0.38], chainSymbol: [0.02, 0.36, 0.23, 0.52] },
  'r6-card-vp-blue-city': { fullCard: [0, 0, 1, 1], victoryPoints: [0.26, 0.02, 0.74, 0.24], constructionCost: [0.02, 0.23, 0.72, 0.38], chainSymbol: [0.02, 0.36, 0.23, 0.52] },
  '7wd-chain-example': { fullCard: [0, 0, 1, 1], chainSymbol: [0.18, 0.41, 0.82, 0.78] },
  '7wd-science-symbols': { fullCard: [0, 0, 1, 1], scienceSymbol: [0.02, 0.05, 0.98, 0.95] },
};

const focusCueTimelines = {
  'construct-building': [
    { narrationClause: 'coût de construction', assetId: 'r6-card-vp-blue', semanticRegion: 'constructionCost', startRatio: 0.08, endRatio: 0.42 },
    { narrationClause: 'placez-la face visible dans votre cité', assetId: 'r6-card-vp-blue-city', semanticRegion: 'fullCard', startRatio: 0.52, endRatio: 0.86 },
  ],
  'resource-production': [{ narrationClause: 'production de ressources', assetId: 'r6-card-production-brown', semanticRegion: 'productionOrEffect', startRatio: 0.18, endRatio: 0.82 }],
  'trade-missing-resources': [
    { narrationClause: 'ressource manquante', assetId: 'r6-card-trade-yellow', semanticRegion: 'constructionCost', startRatio: 0.08, endRatio: 0.40 },
    { narrationClause: 'achat avec des pièces', assetId: 'r6-card-trade-yellow', semanticRegion: 'productionOrEffect', startRatio: 0.48, endRatio: 0.88 },
  ],
  'chain-construction': [{ narrationClause: 'symboles de chaînage identiques', semanticRegion: 'chainSymbol', startRatio: 0.22, endRatio: 0.82 }],
  // Stop before the narration moves from fixed printed laurels to variable
  // guild scoring. A correct region shown at the wrong clause is misleading.
  'scoring-buildings': [{ narrationClause: 'lauriers et points imprimés', semanticRegion: 'victoryPoints', startRatio: 0.12, endRatio: 0.52 }],
  'science-pair-progress': [{ narrationClause: 'symbole scientifique identique', semanticRegion: 'scienceSymbol', startRatio: 0.10, endRatio: 0.58 }],
  'science-supremacy': [{ narrationClause: 'six symboles scientifiques distincts', semanticRegion: 'scienceSymbol', startRatio: 0.10, endRatio: 0.76 }],
};

const plans = r5.plans.map((plan) => ({
  ...plan,
  compositionType: composition[plan.ruleAtomId] || plan.compositionType,
  lowerZonePurpose: ['military-system', 'scoring-military'].includes(plan.ruleAtomId)
    ? 'Source-grounded movement and scoring threshold labels occupy the lower visual zone.'
    : null,
  actualGameAssetIds: map[plan.ruleAtomId] || plan.actualGameAssetIds,
  focusCues: focusCueTimelines[plan.ruleAtomId] || [],
  reuseJustification: plan.reuseJustification || ({
    'end-of-age': 'The three official Age families recur here because advancing between those same decks is the exact rule being taught.',
    'tie-breaker': 'The same official blue card used for civilian scoring is the exact card family counted by the tie-breaker.',
    'winner-resolution': 'The same verified scoring objects intentionally recur when their category totals are combined.',
  }[plan.ruleAtomId] || null),
}));

const r6 = {
  ...r5,
  contract: 'mobius-project-visual-plan-v1.1',
  version: 'r6',
  assetOutputRoot: 'out/publishability-r6/7-wonders-duel/component-library',
  assets,
  plans,
  cardSemanticRegions,
  policy: {
    trueSourceDetail: { preferredRatio: 1, warnBelow: 1, failBelow: 0.8, maxUpscale: 1.25 },
    crop: { requireCompleteness: true, requirePurity: true, requireOpticalCenter: true },
    staticVisualAlignment: { horizontal: 'CENTER', vertical: 'CENTER', fit: 'CONTAIN' },
    referenceSafeZone: { x: 1450, y: 986, width: 350, height: 42 },
  },
};

const target = path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r6.json');
writeJson(target, r6);
process.stdout.write(`${JSON.stringify({ status: 'PASS', target, assets: assets.length, plans: plans.length }, null, 2)}\n`);
