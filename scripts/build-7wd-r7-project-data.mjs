#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const r6Plan = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r6.json'));
const r6Assembly = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r6.json'));
const official = readJson(path.join(ROOT, 'out/publishability-r6/authorized-source-audit/repos-production/manifest.json'));
const content = official.assets.find((asset) => asset.id === 'repos-fr-duel-content-3d');
if (!content?.filePath) throw new Error('Official 7WD product spread is unavailable.');
const sourceUrl = official.archives.find((archive) => archive.locale === 'fr')?.sourceUrl || null;

const common = {
  sourceUrl,
  publisher: 'Repos Production',
  licenseProvenanceState: 'OFFICIAL_PUBLISHER_PRESS_ASSET',
  qualityState: 'SOURCE_DETAIL_PASS',
  cropCompleteness: 'complete',
  cropPurity: 'clean',
};

const r7Assets = [
  {
    id: 'r7-conflict-pawn-cutout',
    sourceType: 'OFFICIAL_HIGH_RES',
    sourcePath: content.filePath,
    visualClassification: 'REAL_COMPONENT',
    semanticTags: ['pion Conflit rouge'],
    sourceRefs: [{ page: 4 }, { page: 11 }, { page: 12 }],
    objectCrop: {
      intendedObjects: [{ id: 'conflict-pawn', bounds: { x: 2580, y: 1420, width: 410, height: 520 } }],
      paddingPx: 10,
    },
    colorMask: { channel: 'red-dominant', minimumRed: 70, redGreenRatio: 1.13, redBlueRatio: 1.16 },
    maxDisplayScale: 1,
    ...common,
  },
  {
    id: 'r7-age-i-card-back',
    sourceType: 'OFFICIAL_HIGH_RES',
    sourcePath: content.filePath,
    visualClassification: 'REAL_CARD_OR_WONDER',
    semanticTags: ['carte Âge I', 'dos de carte', 'défausse face cachée'],
    visibleLabels: ['Âge I'],
    sourceRefs: [{ page: 2 }, { page: 10 }],
    objectCrop: {
      intendedObjects: [{ id: 'age-i-card-back-stack', bounds: { x: 620, y: 1425, width: 225, height: 220 } }],
      paddingPx: 6,
    },
    maxDisplayScale: 1,
    ...common,
  },
  {
    id: 'r7-chain-example-complete',
    sourceType: 'HIGH_DPI_PAGE_CROP',
    page: 9,
    cropNormalized: { left: 0.785, top: 0.735, width: 0.205, height: 0.245 },
    visualClassification: 'SOURCE_FAITHFUL_DIAGRAM_WITH_REAL_ASSETS',
    semanticTags: ['cartes complètes', 'symboles blancs correspondants', 'construction gratuite'],
    sourceRefs: [{ page: 5 }, { page: 9 }],
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    qualityState: 'REVIEWED_ENHANCED_DERIVATIVE',
    maxDisplayScale: 0.92,
    enhancement: {
      tool: 'PyMuPDF page rasterization',
      version: 'repository environment',
      parameters: { pageDpi: 600, semanticPixelsChanged: false },
      reviewState: 'PASS',
      reason: 'Complete source-faithful chain example retained at bounded scale; the small embedded card rasters are not misrepresented as new detail.',
    },
  },
];

const replacementAssets = new Map(r7Assets.map((asset) => [asset.id, asset]));
const assets = [...r6Plan.assets.filter((asset) => !replacementAssets.has(asset.id)), ...r7Assets];
const planOverrides = {
  'chain-construction': {
    actualGameAssetIds: ['r7-chain-example-complete'],
    compositionType: 'REAL_COMPONENT_HERO',
    labels: ['Cartes complètes · même symbole blanc · construction gratuite'],
    backgroundAssetId: 'r7-chain-example-complete',
  },
  'discard-for-coins': {
    actualGameAssetIds: ['r6-card-production-brown', 'r7-age-i-card-back', 'r6-coins-clean-composite'],
    compositionType: 'REAL_COMPONENT_FLOW',
    labels: ['Carte accessible', 'Défausse face cachée', '2 pièces + 1 par carte jaune'],
    summaryLine: 'Gain : 2 pièces + 1 pièce par carte jaune déjà construite',
    backgroundAssetId: 'r6-card-production-brown',
  },
  'military-system': {
    actualGameAssetIds: ['r6-military-board', 'r7-conflict-pawn-cutout'],
    compositionType: 'REAL_MILITARY_DEMONSTRATION',
    labels: ['Bouclier → déplacement', 'Première entrée : perte de 2 ou 5 pièces', 'Capitale : victoire immédiate'],
    backgroundAssetId: 'r6-military-board',
  },
  'scoring-ledger': {
    backgroundAssetId: 'r6-card-vp-blue',
  },
  'scoring-buildings': {
    backgroundAssetId: 'r6-card-vp-blue',
  },
};

const plans = r6Plan.plans.map((plan) => {
  const override = planOverrides[plan.ruleAtomId] || {};
  const next = { ...plan, ...override };
  if (!next.backgroundAssetId) next.backgroundAssetId = next.actualGameAssetIds?.[0] || null;
  return next;
});

const r7Plan = {
  ...r6Plan,
  version: 'r7',
  assetOutputRoot: 'out/publishability-r7/7-wonders-duel/component-library',
  assets,
  plans,
  cardSemanticRegions: {
    ...r6Plan.cardSemanticRegions,
    'r7-chain-example-complete': { fullCard: [0, 0, 1, 1], chainSymbol: [0.10, 0.18, 0.94, 0.82] },
  },
  policy: {
    ...r6Plan.policy,
    sceneMatchedBackground: true,
    sequenceArrowStyle: 'RESTRAINED_GOLD',
    lowerCaption: { horizontal: 'CENTER', enlargeBoxBeforeShrinkingText: true, referenceExclusionBottomPx: 110 },
  },
};

const r7Assembly = {
  ...r6Assembly,
  outputRoot: 'out/publishability-r7/7-wonders-duel',
  outputFileName: '7-wonders-duel-full-tutorial-r7.mp4',
  visualPlan: 'config/projects/7-wonders-duel/visual-plan.r7.json',
  componentLibraryManifest: 'out/publishability-r7/7-wonders-duel/component-library/manifest.json',
  visualStoryboardRoot: 'out/publishability-r7/7-wonders-duel/visual-storyboard',
  visualManifest: 'out/publishability-r7/7-wonders-duel/visual-storyboard/manifest.json',
  narrationSeedManifest: 'out/publishability-r6/7-wonders-duel/narration-assets.json',
  narrationRegenerateSceneIds: ['tie-breaker'],
  baseline: {
    version: 'r6',
    video: 'out/publishability-r6/7-wonders-duel/7-wonders-duel-full-tutorial-r6.mp4',
    directorStatus: 'HUMAN_PUBLISHABLE_GOLD_BASELINE',
    published: false,
  },
};

writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r7.json'), r7Plan);
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r7.json'), r7Assembly);
process.stdout.write(`${JSON.stringify({ status: 'PASS', assets: assets.length, plans: plans.length }, null, 2)}\n`);
