#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const r7Plan = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r7.json'));
const r7Assembly = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r7.json'));
const r5Plan = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r5.json'));
const official = readJson(path.join(ROOT, 'out/publishability-r6/authorized-source-audit/repos-production/manifest.json'));
const content = official.assets.find((asset) => asset.id === 'repos-fr-duel-content-3d');
if (!content?.filePath) throw new Error('Official 7WD product spread is unavailable.');
const sourceUrl = official.archives.find((archive) => archive.locale === 'fr')?.sourceUrl || content.sourceUrl || null;

const common = {
  sourceUrl,
  publisher: 'Repos Production',
  licenseProvenanceState: 'OFFICIAL_PUBLISHER_PRESS_ASSET',
  qualityState: 'SOURCE_DETAIL_PASS',
  cropCompleteness: 'complete',
  cropPurity: 'clean',
};

function coinLayers(quantity, columns) {
  const coinWidth = 115;
  const coinHeight = 82;
  const gapX = 22;
  const gapY = 20;
  return Array.from({ length: quantity }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      id: `silver-coin-${index + 1}`,
      sourcePath: content.filePath,
      sourceType: 'OFFICIAL_HIGH_RES',
      objectCrop: {
        intendedObjects: [{ id: `silver-coin-${index + 1}`, bounds: { x: 4154, y: 1427, width: 115, height: 75 } }],
        paddingPx: 5,
      },
      x: 18 + column * (coinWidth + gapX),
      y: 16 + row * (coinHeight + gapY),
      width: coinWidth,
      height: coinHeight,
      maskShape: 'ellipse',
      maskRadiusXRatio: 0.48,
      maskRadiusYRatio: 0.43,
      sourceUrl,
    };
  });
}

function coinComposite(id, quantity, columns) {
  const rows = Math.ceil(quantity / columns);
  return {
    id,
    sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_COMPONENT',
    semanticTags: ['pièces', 'trésorerie', `${quantity} pièces`],
    representedQuantity: quantity,
    representedComponent: 'coins',
    sourceRefs: [{ page: 2 }, { page: 6 }, { page: 13 }],
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    maxDisplayScale: 1,
    qualityState: 'SOURCE_DETAIL_PASS',
    composite: {
      width: 36 + columns * 115 + Math.max(0, columns - 1) * 22,
      height: 32 + rows * 82 + Math.max(0, rows - 1) * 20,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: coinLayers(quantity, columns),
    },
  };
}

const ageDeckEvidence = r5Plan.assets.find((asset) => asset.id === '7wd-age-decks');
if (!ageDeckEvidence) throw new Error('Recovered Age/Guild deck evidence is missing.');

const r8Assets = [
  {
    ...ageDeckEvidence,
    id: 'r8-age-guild-backs',
    semanticTags: ['dos Âge I', 'dos Âge II', 'dos Âge III', 'dos Guilde', 'retraits', 'ajout de guildes'],
    visibleLabels: ['Âge I', 'Âge II', 'Âge III', 'Guildes'],
    qualityState: 'REVIEWED_ENHANCED_DERIVATIVE',
    maxDisplayScale: 0.92,
    enhancement: {
      tool: 'PyMuPDF page rasterization',
      version: 'repository environment',
      parameters: { pageDpi: 600, semanticPixelsChanged: false },
      reviewState: 'PASS',
      reason: 'The official relationship diagram supplies the physical deck backs and Guild identity that are not available as isolated press assets.',
    },
  },
  {
    id: 'r8-chain-example-complete',
    sourceType: 'HIGH_DPI_PAGE_CROP',
    page: 9,
    cropNormalized: { left: 0.7945, top: 0.722, width: 0.165, height: 0.225 },
    visualClassification: 'SOURCE_FAITHFUL_DIAGRAM_WITH_REAL_ASSETS',
    semanticTags: ['cartes complètes', 'symboles blancs correspondants', 'construction gratuite'],
    sourceRefs: [{ page: 5 }, { page: 9 }],
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    qualityState: 'REVIEWED_ENHANCED_DERIVATIVE',
    maxDisplayScale: 0.9,
    enhancement: {
      tool: 'PyMuPDF page rasterization',
      version: 'repository environment',
      parameters: { pageDpi: 600, semanticPixelsChanged: false },
      reviewState: 'PASS',
      reason: 'Expanded semantic crop keeps every card top, cost, chain symbol and card name in the official example.',
    },
  },
  {
    id: 'r8-scorepad-official',
    sourceType: 'OFFICIAL_HIGH_RES',
    sourcePath: content.filePath,
    visualClassification: 'REAL_COMPONENT',
    semanticTags: ['carnet de score', 'scorepad', 'score sheet'],
    visibleLabels: ['Carnet de score'],
    sourceRefs: [{ page: 2 }, { page: 3 }, { page: 13 }],
    objectCrop: {
      intendedObjects: [{ id: 'official-scorepad', bounds: { x: 55, y: 1445, width: 500, height: 345 } }],
      forbiddenObjects: [{ id: 'age-deck-stack', bounds: { x: 610, y: 1420, width: 930, height: 390 } }],
      paddingPx: 10,
    },
    alphaMaskPolygon: [
      { x: 0.03, y: 0.01 },
      { x: 0.89, y: 0.01 },
      { x: 0.99, y: 0.46 },
      { x: 0.76, y: 0.82 },
      { x: 0.02, y: 0.78 },
    ],
    maxDisplayScale: 1,
    ...common,
  },
  coinComposite('r8-seven-coins', 7, 4),
  coinComposite('r8-nine-coins', 9, 5),
];

const replacementIds = new Set(['r7-chain-example-complete', ...r8Assets.map((asset) => asset.id)]);
const inheritedAssets = r7Plan.assets
  .filter((asset) => !replacementIds.has(asset.id))
  .map((asset) => asset.id !== 'r7-conflict-pawn-cutout' ? asset : {
    ...asset,
    objectCrop: {
      intendedObjects: [{ id: 'conflict-pawn', bounds: { x: 2460, y: 1470, width: 570, height: 500 } }],
      paddingPx: 8,
    },
    colorMask: {
      channel: 'red-dominant',
      minimumRed: 68,
      redGreenRatio: 1.58,
      redBlueRatio: 1.28,
      maxHueDegreesFromRed: 14,
      minimumSaturation: 0.42,
      minimumAlpha: 8,
      keepRegionNormalized: { left: 0.02, top: 0.04, right: 0.68, bottom: 0.96 },
      retainLargestComponents: 1,
      minimumComponentPixels: 40,
    },
    cropCompleteness: 'complete',
    cropPurity: 'clean',
  });
const assets = [...inheritedAssets, ...r8Assets];

const scoreRows = [
  { label: 'Militaire', value: '2', formula: 'zone atteinte', assetId: 'r6-military-board', revealRatio: 0.12 },
  { label: 'Bâtiments', value: '8', formula: '6 + 2 lauriers', assetId: 'r6-card-vp-blue', revealRatio: 0.27 },
  { label: 'Merveilles', value: '6', formula: '3 + 3 points', assetId: 'r6-wonder-cards', revealRatio: 0.42 },
  { label: 'Progrès', value: '0', formula: 'aucun effet de score', assetId: '7wd-progress-tokens-clean', revealRatio: 0.57 },
  { label: 'Trésorerie', value: '3', formula: '9 pièces ÷ 3', assetId: 'r8-nine-coins', revealRatio: 0.70 },
];
const scoreExample = {
  exampleOnly: true,
  legality: 'SOURCE_GROUNDED_CATEGORY_VALUES',
  sourceRefs: [{ page: 13 }],
  rows: scoreRows,
  total: { label: 'TOTAL', value: '19', formula: 'additionner les cinq lignes', assetId: 'r8-scorepad-official', revealRatio: 0.84 },
};

const overrides = {
  'setup-central': {
    actualGameAssetIds: ['r6-military-board', '7wd-progress-tokens-clean', 'r8-seven-coins'],
    labels: ['Plateau, pion et jetons Militaire', '5 jetons Progrès visibles', '7 pièces par joueur'],
    quantityFidelity: [
      { componentRef: 'coins', requiredQuantity: 7, assetId: 'r8-seven-coins' },
      { componentRef: 'progress-tokens', requiredQuantity: 5, assetId: '7wd-progress-tokens-clean', representedQuantity: 5 },
    ],
  },
  'setup-age-decks': {
    actualGameAssetIds: ['r8-age-guild-backs', 'r6-age-i-cards', 'r6-age-ii-cards', 'r6-age-iii-cards'],
    compositionType: 'REAL_AGE_GUILD_IDENTITY',
    labels: ['Dos Âge I, II, III et Guildes', 'Cartes de l’Âge I', 'Cartes de l’Âge II', 'Cartes de l’Âge III'],
    minimumRepresentativeAssets: 4,
    backgroundAssetId: 'r8-age-guild-backs',
  },
  'age-loop': {
    compositionType: 'REAL_COMPONENT_FLOW',
    actualGameAssetIds: ['r6-age-i-cards', 'r6-age-ii-cards', 'r6-age-iii-cards'],
    labels: ['Âge I · jouer la structure', 'Âge II · nouveau départ', 'Âge III · dernière structure'],
    summaryLine: 'Une carte accessible par tour · puis l’autre joueur',
    minimumRepresentativeAssets: 3,
  },
  'end-of-age': {
    compositionType: 'REAL_COMPONENT_FLOW',
    actualGameAssetIds: ['7wd-age-layouts-real-cards', 'r6-military-board', 'r6-age-ii-cards'],
    labels: ['20 cartes jouées', 'Le plus faible choisit le départ', 'Préparer la structure suivante'],
    summaryLine: 'Fin de la structure → choix du premier joueur → âge suivant',
  },
  'resource-production': {
    compositionType: 'REAL_COMPONENT_GRID',
    actualGameAssetIds: ['r6-card-production-brown', 'r6-age-i-cards'],
    labels: ['Production d’une carte', 'Cartes Ressource dans la cité'],
    minimumRepresentativeAssets: 2,
  },
  'chain-construction': {
    actualGameAssetIds: ['r8-chain-example-complete'],
    compositionType: 'REAL_COMPONENT_HERO',
    labels: ['Cartes complètes · même symbole blanc · construction gratuite'],
    backgroundAssetId: 'r8-chain-example-complete',
    focusCues: [],
  },
  'discard-for-coins': {
    actualGameAssetIds: ['r6-card-production-brown', 'r7-age-i-card-back', 'r6-card-trade-yellow', 'r6-coins-clean-composite'],
    compositionType: 'REAL_COMPONENT_FLOW',
    labels: ['Carte accessible', 'Défausse face cachée', '1 carte jaune dans la cité', '2 + 1 = 3 pièces'],
    summaryLine: 'Gain = 2 pièces + 1 pièce par carte jaune déjà construite',
    minimumRepresentativeAssets: 4,
  },
  'construct-wonder': {
    compositionType: 'REAL_COMPONENT_FLOW',
    actualGameAssetIds: ['r6-card-production-brown', 'r7-age-i-card-back', 'r6-wonder-cards'],
    labels: ['Choisir une carte accessible', 'La glisser face cachée', 'Construire la Merveille'],
    summaryLine: 'Carte d’Âge face cachée sous la Merveille · payer · résoudre l’effet',
    minimumRepresentativeAssets: 3,
    backgroundAssetId: 'r6-wonder-cards',
  },
  'military-system': {
    actualGameAssetIds: ['r6-military-board', 'r7-conflict-pawn-cutout'],
    compositionType: 'REAL_MILITARY_DEMONSTRATION',
    labels: ['Bouclier : avancer d’une case', 'Première entrée : perte de 2 ou 5 pièces', 'Capitale : victoire immédiate'],
    backgroundAssetId: 'r6-military-board',
    motionCues: [{
      id: 'conflict-pawn-toward-opponent-capital',
      assetId: 'r7-conflict-pawn-cutout',
      relativeToAssetId: 'r6-military-board',
      startPosition: { x: 0.48, y: 0.50 },
      endPosition: { x: 0.79, y: 0.50 },
      widthPx: 132,
      startRatio: 0,
      endRatio: 0.60,
      holdEndRatio: 0.96,
      sourceRefs: [{ page: 12 }],
      confidence: 1,
    }],
  },
  'scoring-ledger': {
    actualGameAssetIds: ['r8-scorepad-official', 'r6-military-board', 'r6-card-vp-blue', 'r6-wonder-cards', '7wd-progress-tokens-clean', 'r8-nine-coins'],
    compositionType: 'REAL_PROGRESSIVE_SCOREPAD',
    labels: ['Carnet officiel', 'Militaire', 'Bâtiments', 'Merveilles', 'Progrès', 'Trésorerie'],
    scoreExample,
    backgroundAssetId: 'r8-scorepad-official',
  },
  'scoring-progress': {
    actualGameAssetIds: ['7wd-progress-tokens-clean'],
    backgroundAssetId: '7wd-progress-tokens-clean',
  },
  'scoring-treasury': {
    actualGameAssetIds: ['r8-nine-coins'],
    labels: ['9 pièces complètes = 3 points'],
    quantityFidelity: [{ componentRef: 'coins', requiredQuantity: 9, assetId: 'r8-nine-coins' }],
    backgroundAssetId: 'r8-nine-coins',
  },
  'winner-resolution': {
    actualGameAssetIds: ['r8-scorepad-official', 'r6-military-board', 'r6-card-vp-blue', 'r6-wonder-cards', '7wd-progress-tokens-clean', 'r8-nine-coins'],
    compositionType: 'REAL_PROGRESSIVE_SCOREPAD',
    labels: ['Carnet officiel', 'Militaire', 'Bâtiments', 'Merveilles', 'Progrès', 'Trésorerie'],
    scoreExample,
    backgroundAssetId: 'r8-scorepad-official',
  },
  'scorebook-reference': {
    actualGameAssetIds: ['r8-scorepad-official'],
    compositionType: 'REAL_COMPONENT_HERO',
    labels: ['Carnet de score officiel inclus'],
    backgroundAssetId: 'r8-scorepad-official',
  },
};

const plans = r7Plan.plans.map((plan) => {
  const next = { ...plan, ...(overrides[plan.ruleAtomId] || {}) };
  if (!next.backgroundAssetId) next.backgroundAssetId = next.actualGameAssetIds?.[0] || null;
  return next;
});

const r8Plan = {
  ...r7Plan,
  version: 'r8',
  assetOutputRoot: 'out/publishability-r8/7-wonders-duel/component-library',
  assets,
  plans,
  cardSemanticRegions: {
    ...r7Plan.cardSemanticRegions,
    'r8-chain-example-complete': { fullCard: [0, 0, 1, 1], chainSymbol: [0.08, 0.12, 0.95, 0.86] },
  },
  policy: {
    ...r7Plan.policy,
    quantityFidelityRequired: true,
    representativeFamilyAssetsPreferred: true,
    animation: { actualComponentSpritesRequired: true, semanticStateChangeRequired: true },
    scoringExample: { authoritativeScorepadPreferred: true, progressiveRevealRequired: true, explicitExampleLabelRequired: true },
    material: { family: 'WARM_ESPRESSO_GAME_DERIVED', proceduralLineTextureForbidden: true },
  },
};

const r8Assembly = {
  ...r7Assembly,
  sonicMaster: 'src/assets/branding/sonic/mobius-cafe-sonic-signature-r8.wav',
  outputRoot: 'out/publishability-r8/7-wonders-duel',
  outputFileName: '7-wonders-duel-full-tutorial-r8.mp4',
  visualPlan: 'config/projects/7-wonders-duel/visual-plan.r8.json',
  componentLibraryManifest: 'out/publishability-r8/7-wonders-duel/component-library/manifest.json',
  visualStoryboardRoot: 'out/publishability-r8/7-wonders-duel/visual-storyboard',
  visualManifest: 'out/publishability-r8/7-wonders-duel/visual-storyboard/manifest.json',
  narrationSeedManifest: 'out/publishability-r7/7-wonders-duel/narration-assets.json',
  narrationRegenerateSceneIds: [],
  baseline: {
    immutableGold: {
      version: 'r5',
      video: 'out/publishability-r5/7-wonders-duel/7-wonders-duel-full-tutorial-r5.mp4',
      directorStatus: 'HUMAN_PUBLISHABLE_GOLD_BASELINE',
      published: false,
    },
    predecessor: {
      version: 'r7',
      video: 'out/publishability-r7/7-wonders-duel/7-wonders-duel-full-tutorial-r7.mp4',
      preserved: true,
    },
  },
};

writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r8.json'), r8Plan);
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r8.json'), r8Assembly);
process.stdout.write(`${JSON.stringify({ status: 'PASS', assets: assets.length, plans: plans.length, rulesChanged: false, narrationRegenerationRequested: 0 }, null, 2)}\n`);
