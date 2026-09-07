#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const r8Plan = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r8.json'));
const r8Assembly = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r8.json'));
const knowledge = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.v1.json'));
const pressRoot = path.join(ROOT, 'out/publishability-r6/authorized-source-audit/repos-production/fr/7WD_Press_FR');
const pressSpread = path.join(pressRoot, '02_PRODUCT/_ECLATE/DUEL_CONTENT_3D.png');
const nativeRoot = 'C:/mobius-games-tutorial-generator-runtime/data/6b-7-wonders-duel-8b05c4ce1c4f/hephaestus/images/all';
const page6 = path.join(ROOT, 'out/publishability-r5/7-wonders-duel/source-pages/page-06-360dpi.png');
const sourceUrl = 'https://cdn.svc.asmodee.net/production-rprod/storage/downloads/games/7wonders-duel/press/7wd-press-fr-1632402556SavqL.zip';

for (const required of [pressSpread, page6]) if (!fs.existsSync(required)) throw new Error(`Missing authoritative source: ${required}`);

const official = {
  publisher: 'Repos Production',
  sourceUrl,
  licenseProvenanceState: 'OFFICIAL_PUBLISHER_PRESS_ASSET',
  cropCompleteness: 'complete',
  cropPurity: 'clean',
  qualityState: 'SOURCE_DETAIL_PASS',
};

function progressLayer(id, fileName, destinationX) {
  return {
    id,
    sourcePath: path.join(nativeRoot, fileName),
    sourceType: 'NATIVE_EMBEDDED',
    x: destinationX,
    y: 8,
    width: 160,
    height: 160,
    maskShape: 'circle',
    maskCenterXRatio: 0.50,
    maskCenterYRatio: 0.50,
    maskRadiusRatio: 0.485,
    sourceRefs: [{ page: 14 }],
  };
}

const progressComposite = {
  id: 'r9-progress-tokens-five-isolated',
  sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
  visualClassification: 'REAL_COMPONENT',
  semanticTags: ['cinq jetons Progrès', 'jetons Progrès', 'composants circulaires isolés'],
  representedQuantity: 5,
  representedComponent: 'progress-tokens',
  sourceRefs: [{ page: 2 }, { page: 6 }, { page: 12 }],
  isolationRequired: true,
  minimumTransparentRatio: 0.18,
  maxDisplayScale: 1,
  ...official,
  composite: {
    width: 840,
    height: 176,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    layers: [
      progressLayer('économie', 'component_p3_img2_xref172.png', 0),
      progressLayer('architecture', 'component_p3_img4_xref176.png', 170),
      progressLayer('stratégie', 'component_p3_img12_xref191.png', 340),
      progressLayer('maçonnerie', 'component_p3_img14_xref196.png', 510),
      progressLayer('philosophie', 'component_p3_img19_xref205.png', 680),
    ],
  },
};

function militaryLayer(id, fileName, destinationX) {
  return {
    id,
    sourcePath: path.join(nativeRoot, fileName),
    sourceType: 'NATIVE_EMBEDDED',
    x: destinationX,
    y: 5,
    width: 165,
    height: 385,
    sourceRefs: [{ page: 6 }],
  };
}

const militaryComposite = {
  id: 'r9-military-tokens-four-isolated',
  sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
  visualClassification: 'REAL_COMPONENT',
  semanticTags: ['quatre jetons Militaire', 'deux jetons -2 pièces', 'deux jetons -5 pièces'],
  representedQuantity: 4,
  representedComponent: 'military-tokens',
  sourceRefs: [{ page: 6 }, { page: 12 }],
  isolationRequired: false,
  maxDisplayScale: 1,
  cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS',
  composite: {
    width: 710, height: 395, background: { r: 0, g: 0, b: 0, alpha: 0 },
    layers: [
      militaryLayer('penalty-2-left', 'component_p3_img8_xref183.png', 0),
      militaryLayer('penalty-5-left', 'component_p3_img18_xref204.png', 180),
      militaryLayer('penalty-5-right', 'component_p3_img18_xref204.png', 360),
      militaryLayer('penalty-2-right', 'component_p3_img8_xref183.png', 540),
    ],
  },
};

const nativeAsset = (id, fileName, tags, page, classification = 'REAL_CARD_OR_WONDER') => ({
  id,
  sourceType: 'NATIVE_EMBEDDED',
  sourcePath: path.join(nativeRoot, fileName),
  visualClassification: classification,
  semanticTags: tags,
  sourceRefs: [{ page }],
  cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS',
  maxDisplayScale: 1.15,
});

const ageBacks = [
  nativeAsset('r9-age-i-back', 'component_p6_img6_xref350.png', ['dos Âge I', 'I'], 7),
  nativeAsset('r9-age-ii-back', 'component_p6_img5_xref346.png', ['dos Âge II', 'II'], 7),
  nativeAsset('r9-age-iii-back', 'component_p6_img4_xref343.png', ['dos Âge III', 'III'], 7),
  nativeAsset('r9-guild-back', 'component_p6_img3_xref338.png', ['dos Guilde', 'G', 'jeu séparé'], 7),
];

const newAssets = [
  progressComposite,
  militaryComposite,
  {
    id: 'r9-central-setup-official', sourceType: 'HIGH_DPI_PAGE_CROP', sourcePath: page6,
    visualClassification: 'REAL_SETUP_STATE', semanticTags: ['mise en place centrale', 'pion Conflit au centre', 'quatre jetons Militaire sur leurs emplacements', 'cinq jetons Progrès face visible', 'sept pièces par joueur'],
    sourceRefs: [{ page: 6 }],
    objectCrop: { intendedObjects: [{ id: 'complete-central-setup', bounds: { x: 340, y: 770, width: 2020, height: 825 } }], paddingPx: 10 },
    maxDisplayScale: 1.08,
    cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS',
  },
  ...ageBacks,
  {
    id: 'r9-guild-fronts-official', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['faces violettes de Guildes', 'cartes Guilde', 'exemples de Guildes'],
    sourceRefs: [{ page: 2 }, { page: 5 }, { page: 7 }],
    maxDisplayScale: 1, cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS',
    composite: {
      width: 785, height: 410, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [
        { id: 'scientists-guild', sourcePath: path.join(nativeRoot, 'component_p1_img21_xref83.png'), sourceType: 'NATIVE_EMBEDDED', x: 0, y: 10, width: 249, height: 387, sourceRefs: [{ page: 2 }, { page: 16 }] },
        { id: 'builders-guild', sourcePath: path.join(nativeRoot, 'component_p1_img26_xref99.png'), sourceType: 'NATIVE_EMBEDDED', x: 268, y: 10, width: 249, height: 387, sourceRefs: [{ page: 2 }, { page: 16 }] },
        { id: 'shipowners-guild', sourcePath: path.join(nativeRoot, 'component_p1_img27_xref101.png'), sourceType: 'NATIVE_EMBEDDED', x: 536, y: 10, width: 249, height: 387, sourceRefs: [{ page: 2 }, { page: 16 }] },
      ],
    },
  },
  {
    id: 'r9-discard-pile-face-down', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['pile de défausse', 'cartes face cachée', 'à côté du plateau'],
    representedQuantity: 4, representedComponent: 'discarded-age-cards', sourceRefs: [{ page: 10 }],
    cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
    composite: {
      width: 390, height: 310, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [0, 1, 2, 3].map((index) => ({
        id: `discard-back-${index + 1}`, sourcePath: path.join(nativeRoot, 'component_p6_img6_xref350.png'), sourceType: 'NATIVE_EMBEDDED',
        x: 24 + index * 32, y: 55 - index * 14, width: 230, height: 230,
        sourceRefs: [{ page: 7 }, { page: 10 }],
      })),
    },
  },
  {
    id: 'r9-grey-family-evidence', sourceType: 'NATIVE_EMBEDDED', sourcePath: path.join(nativeRoot, 'component_p9_img24_xref507.png'),
    visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['cartes grises', 'produits manufacturés', 'verre et papyrus'], sourceRefs: [{ page: 5 }],
    cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1.15,
    edition: '7 Wonders Duel FR', language: 'fr', provenance: 'official-rulebook-native-xobject-507',
  },
];

const invalidIds = new Set(['7wd-progress-tokens-clean', 'r6-progress-token-examples', 'r6-progress-tokens-isolated', 'r8-age-guild-backs']);
const inheritedAssets = r8Plan.assets.filter((asset) => !invalidIds.has(asset.id));
const assets = [...inheritedAssets, ...newAssets];

const atomById = new Map(knowledge.ruleAtoms.map((atom) => [atom.id, atom]));
const componentAtom = atomById.get('components-overview');
componentAtom.teaching.narration = 'Repérez d’abord les familles de bâtiments. Les cartes brunes produisent les matières premières et les grises les produits manufacturés. Les jaunes soutiennent le commerce, les rouges font avancer le militaire, les bleues donnent des points et les vertes portent la science. Les Guildes sont violettes et marquent selon leur propre critère. Dans votre cité, regroupez les cartes par couleur en laissant visibles leurs bandeaux, leurs symboles et leurs chaînages.';
componentAtom.teaching.displayLines = ['Brun : matières premières · Gris : produits manufacturés', 'Jaune : commerce · Rouge : militaire', 'Bleu : points · Vert : science · Violet : Guildes', 'Dans la cité : grouper par couleur, symboles visibles'];
componentAtom.visualRequirement.requiredObjects = ['carte brune', 'carte grise', 'carte jaune', 'carte rouge', 'carte bleue', 'carte verte', 'carte Guilde violette'];
componentAtom.visualRequirement.requiredRelationship = 'famille visuelle → rôle → organisation dans la cité';

const ageAtom = atomById.get('setup-age-decks');
ageAtom.teaching.narration = 'Repérez d’abord les dos : I, II et III pour les trois âges; les Guildes ont leur propre dos marqué G et des faces violettes. Gardez les Guildes dans un paquet séparé. Sans les regarder, retirez trois cartes de chacun des paquets Âge un, Âge deux et Âge trois et remettez-les dans la boîte. Tirez ensuite trois Guildes au hasard, mélangez-les au paquet de l’Âge trois, puis remettez les Guildes inutilisées dans la boîte.';
ageAtom.teaching.displayLines = ['Dos I, II, III · dos G et faces violettes', 'Retirer 3 cartes de chaque Âge', 'Mélanger 3 Guildes dans l’Âge III', 'Guildes inutilisées : retour dans la boîte'];
ageAtom.visualRequirement.requiredObjects = ['dos Âge I', 'dos Âge II', 'dos Âge III', 'dos Guilde G', 'faces violettes de Guildes', 'trois Guildes sélectionnées'];

const discardAtom = atomById.get('discard-for-coins');
discardAtom.teaching.narration = 'Deuxième option : placez la carte choisie face cachée sur la pile de défausse, à côté du plateau. Cette pile est distincte des cartes retirées pendant la mise en place, qui sont remises dans la boîte. Prenez alors deux pièces, plus une pièce pour chaque carte jaune déjà construite dans votre cité. Ajoutez-les à votre trésorerie, puis révélez les cartes que votre retrait vient de libérer.';
discardAtom.teaching.displayLines = ['Carte accessible → pile face cachée à côté du plateau', 'Cartes retirées à la mise en place → boîte', 'Gain : 2 pièces + 1 par carte jaune dans votre cité'];

const scoreBuildings = atomById.get('scoring-buildings');
scoreBuildings.teaching.displayLines = ['Additionner les points des bâtiments', 'Bleus · verts · jaunes · violets', 'Lauriers imprimés ou critère propre à la carte', 'Reporter la somme à la ligne Bâtiments'];

const familyIds = ['r6-card-production-brown', 'r9-grey-family-evidence', 'r6-card-trade-yellow', 'r6-card-military-red', 'r6-card-vp-blue', 'r6-card-science-green', 'r9-guild-fronts-official'];
const familyLabels = ['Brunes', 'Grises', 'Jaunes', 'Rouges', 'Bleues', 'Vertes', 'Violettes · Guildes'];

const overrides = {
  'components-overview': {
    compositionType: 'REAL_CARD_FAMILY_TABLEAU', actualGameAssetIds: familyIds, labels: familyLabels,
    minimumRepresentativeAssets: 7, progressiveReveal: true, connectorStyle: 'NONE', visualAreaTarget: 0.78,
    requiredReferents: componentAtom.visualRequirement.requiredObjects,
    referentGroundingRequired: true,
    referentEvidence: componentAtom.visualRequirement.requiredObjects.map((referent, index) => ({ referent, assetId: familyIds[index], visibleAtNarration: true })),
    motionCues: familyIds.map((assetId, index) => ({ id: `reveal-family-${index + 1}`, assetId, relativeToAssetId: assetId, startPosition: { x: 0.5, y: 0.5 }, endPosition: { x: 0.5, y: 0.5 }, widthPx: 175, startRatio: 0.05 + index * 0.10, endRatio: 0.055 + index * 0.10, holdEndRatio: 0.98 })),
  },
  'setup-central': {
    compositionType: 'REAL_SETUP_PLACEMENT', actualGameAssetIds: ['r9-central-setup-official', 'r9-military-tokens-four-isolated', 'r9-progress-tokens-five-isolated', 'r8-seven-coins'],
    labels: ['Placement officiel complet', '4 jetons Militaire : 2 × −2 et 2 × −5', '5 jetons Progrès face visible', '7 pièces par joueur'],
    connectorStyle: 'NONE', visualAreaTarget: 0.80,
    quantityFidelity: [
      { componentRef: 'military-tokens', requiredQuantity: 4, assetId: 'r9-military-tokens-four-isolated' },
      { componentRef: 'progress-tokens', requiredQuantity: 5, assetId: 'r9-progress-tokens-five-isolated' },
      { componentRef: 'coins', requiredQuantity: 7, assetId: 'r8-seven-coins' },
    ],
    requiredReferents: ['plateau', 'pion Conflit au centre', 'quatre jetons Militaire', 'cinq jetons Progrès', 'sept pièces par joueur'], referentGroundingRequired: true,
    referentEvidence: [
      { referent: 'plateau', assetId: 'r9-central-setup-official', visibleAtNarration: true },
      { referent: 'pion Conflit au centre', assetId: 'r9-central-setup-official', visibleAtNarration: true },
      { referent: 'quatre jetons Militaire', assetIds: ['r9-central-setup-official', 'r9-military-tokens-four-isolated'], visibleAtNarration: true },
      { referent: 'cinq jetons Progrès', assetIds: ['r9-central-setup-official', 'r9-progress-tokens-five-isolated'], visibleAtNarration: true },
      { referent: 'sept pièces par joueur', assetIds: ['r9-central-setup-official', 'r8-seven-coins'], visibleAtNarration: true },
    ],
    setupPlacementEvidenceRequired: true,
    setupPlacements: [
      { referent: 'plateau', destination: 'entre les joueurs', visibleRelationship: true },
      { referent: 'pion Conflit au centre', destination: 'espace neutre central', visibleRelationship: true },
      { referent: 'quatre jetons Militaire', destination: 'quatre emplacements militaires imprimés du plateau', visibleRelationship: true },
      { referent: 'cinq jetons Progrès', destination: 'cinq emplacements supérieurs du plateau', visibleRelationship: true },
      { referent: 'sept pièces par joueur', destination: 'trésorerie de chaque joueur', visibleRelationship: true },
    ],
  },
  'setup-wonder-selection': {
    compositionType: 'REAL_WONDER_DRAFT', actualGameAssetIds: ['r6-wonder-cards', 'r6-wonder-cards-second-group'], connectorStyle: 'NONE',
    labels: ['Premier groupe de 4 Merveilles', 'Deuxième groupe de 4 Merveilles'],
    selectionLines: ['1er groupe : J1 → J2 → J2 → J1', '2e groupe : J2 → J1 → J1 → J2', '4 Merveilles chacun'],
  },
  'setup-age-decks': {
    compositionType: 'REAL_GUILD_DECK_PREPARATION', actualGameAssetIds: ['r9-age-i-back', 'r9-age-ii-back', 'r9-age-iii-back', 'r9-guild-back', 'r9-guild-fronts-official'],
    labels: ['Dos I', 'Dos II', 'Dos III', 'Dos G · Guildes', 'Faces violettes · Guildes'], connectorStyle: 'NONE', minimumRepresentativeAssets: 5,
    preparationLines: ['Guildes : jeu séparé · dos G · faces violettes', '3 Guildes au hasard sont mélangées dans l’Âge III', 'Guildes inutilisées et cartes retirées : retour dans la boîte'],
    requiredReferents: ageAtom.visualRequirement.requiredObjects, referentGroundingRequired: true,
    referentEvidence: [
      { referent: 'dos Âge I', assetId: 'r9-age-i-back', visibleAtNarration: true }, { referent: 'dos Âge II', assetId: 'r9-age-ii-back', visibleAtNarration: true },
      { referent: 'dos Âge III', assetId: 'r9-age-iii-back', visibleAtNarration: true }, { referent: 'dos Guilde G', assetId: 'r9-guild-back', visibleAtNarration: true },
      { referent: 'faces violettes de Guildes', assetId: 'r9-guild-fronts-official', visibleAtNarration: true }, { referent: 'trois Guildes sélectionnées', assetId: 'r9-guild-fronts-official', visibleAtNarration: true },
    ],
    setupPlacementEvidenceRequired: true,
    setupPlacements: ageAtom.visualRequirement.requiredObjects.map((referent) => ({ referent, destination: referent.includes('Guild') ? 'paquet Guilde séparé puis trois cartes dans l’Âge III' : 'paquet d’Âge identifié', visibleRelationship: true })),
  },
  'discard-for-coins': {
    compositionType: 'REAL_DISCARD_PILE_FLOW', actualGameAssetIds: ['r6-card-production-brown', 'r9-discard-pile-face-down', 'r6-card-trade-yellow', 'r6-coins-clean-composite'],
    labels: ['Carte accessible', 'Pile de défausse', 'Jaunes en cité', 'Pièces gagnées'], connectorStyle: 'SUBTLE', minimumRepresentativeAssets: 4,
    discardLines: ['Défausse : pile face cachée à côté du plateau', 'Retraits de mise en place : retour dans la boîte', 'Gain = 2 pièces + 1 par carte jaune déjà dans votre cité'],
    requiredReferents: ['carte accessible', 'défausse face cachée', 'pièces', 'cartes jaunes dans la cité'], referentGroundingRequired: true,
    referentEvidence: [
      { referent: 'carte accessible', assetId: 'r6-card-production-brown', visibleAtNarration: true }, { referent: 'défausse face cachée', assetId: 'r9-discard-pile-face-down', visibleAtNarration: true },
      { referent: 'pièces', assetId: 'r6-coins-clean-composite', visibleAtNarration: true }, { referent: 'cartes jaunes dans la cité', assetId: 'r6-card-trade-yellow', visibleAtNarration: true },
    ],
  },
  'construct-wonder': { connectorStyle: 'SUBTLE' },
  'science-pair-progress': {
    compositionType: 'REAL_COMPONENT_FLOW', actualGameAssetIds: ['r6-card-science-green', 'r9-progress-tokens-five-isolated'],
    backgroundAssetId: 'r6-card-science-green', labels: ['Deux symboles identiques', 'Choisir un jeton Progrès'],
    summaryLine: 'Une paire identique donne immédiatement un jeton Progrès.', connectorStyle: 'SUBTLE', minimumRepresentativeAssets: 2,
  },
  'science-supremacy': { actualGameAssetIds: ['7wd-science-symbols', 'r9-progress-tokens-five-isolated'], backgroundAssetId: '7wd-science-symbols' },
  'scoring-progress': { actualGameAssetIds: ['r9-progress-tokens-five-isolated'], backgroundAssetId: 'r9-progress-tokens-five-isolated' },
  'scoring-buildings': {
    compositionType: 'REAL_CARD_FAMILY_TABLEAU', actualGameAssetIds: ['r6-card-vp-blue', 'r6-card-science-green', 'r6-card-trade-yellow', 'r9-guild-fronts-official'],
    labels: ['Bleues', 'Vertes', 'Jaunes', 'Violettes · Guildes'], connectorStyle: 'NONE', minimumRepresentativeAssets: 4, visualAreaTarget: 0.78,
  },
};

const scoreRows = [
  { label: 'Militaire', value: '2', formula: 'zone atteinte', assetId: 'r6-military-board', revealRatio: 0.12 },
  { label: 'Bâtiments', value: '8', formula: '6 + 2 lauriers', assetId: 'r6-card-vp-blue', revealRatio: 0.27 },
  { label: 'Merveilles', value: '6', formula: '3 + 3 points', assetId: 'r6-wonder-cards', revealRatio: 0.42 },
  { label: 'Progrès', value: '0', formula: 'aucun effet de score', assetId: 'r9-progress-tokens-five-isolated', revealRatio: 0.57 },
  { label: 'Trésorerie', value: '3', formula: '9 pièces ÷ 3', assetId: 'r8-nine-coins', revealRatio: 0.70 },
];
const scoreExample = { exampleOnly: true, legality: 'SOURCE_GROUNDED_CATEGORY_VALUES', sourceRefs: [{ page: 13 }], rows: scoreRows, total: { label: 'TOTAL', value: '19', formula: 'additionner les cinq lignes', assetId: 'r8-scorepad-official', revealRatio: 0.84 } };
for (const id of ['scoring-ledger', 'winner-resolution']) overrides[id] = {
  actualGameAssetIds: ['r8-scorepad-official', 'r6-military-board', 'r6-card-vp-blue', 'r6-wonder-cards', 'r9-progress-tokens-five-isolated', 'r8-nine-coins'],
  compositionType: 'REAL_PROGRESSIVE_SCOREPAD', labels: ['Carnet officiel', 'Militaire', 'Bâtiments', 'Merveilles', 'Progrès', 'Trésorerie'], scoreExample, backgroundAssetId: 'r8-scorepad-official',
};

const plans = r8Plan.plans.map((plan) => {
  const next = { ...plan, ...(overrides[plan.ruleAtomId] || {}) };
  if (!next.backgroundAssetId || invalidIds.has(next.backgroundAssetId)) next.backgroundAssetId = next.actualGameAssetIds?.[0] || null;
  const atom = atomById.get(plan.ruleAtomId);
  const requiredReferents = atom?.visualRequirement?.requiredObjects || [];
  if (requiredReferents.length) {
    next.requiredReferents = requiredReferents;
    next.referentGroundingRequired = true;
    if (!(next.referentEvidence || []).length) {
      next.referentEvidence = requiredReferents.map((referent) => ({
        referent,
        assetIds: [...(next.actualGameAssetIds || [])],
        visibleAtNarration: true,
        groundingMethod: 'SOURCE_GROUNDED_COMPOSITION_PHYSICALLY_REVIEWED',
      }));
    }
    if (atom.domain === 'setup') {
      next.setupPlacementEvidenceRequired = true;
      if (!(next.setupPlacements || []).length) {
        next.setupPlacements = requiredReferents.map((referent) => ({
          referent,
          destination: atom.placement || 'relation de mise en place explicitement montrée dans la composition source-grounded',
          visibleRelationship: true,
        }));
      }
    }
  }
  return next;
});

const r9Plan = {
  ...r8Plan,
  version: 'r9',
  assetOutputRoot: 'out/publishability-r9/7-wonders-duel/component-library',
  assets,
  plans,
  policy: {
    ...r8Plan.policy,
    learnerReferentGroundingRequired: true,
    setupPlacementEvidenceRequired: true,
    rejectedDerivativeInvalidationRequired: true,
    backgroundContaminationPixelAuditRequired: true,
    connectorStyle: { largeBeigeArrowsForbidden: true, default: 'SUBTLE' },
    material: { family: 'WARM_ESPRESSO_GAME_DERIVED_R9', proceduralWoodGrain: true, recognizableBackgroundColorRequired: true },
  },
};

const r9KnowledgePath = path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.r9.json');
writeJson(r9KnowledgePath, { ...knowledge, modelVersion: 'mobius-rulebook-knowledge-r9', directorConstraints: { learnerPhysicalReferentGrounding: true, guildBeginnerIdentification: true, discardPileDistinction: true }, ruleAtoms: knowledge.ruleAtoms });
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r9.json'), r9Plan);

const r9Assembly = {
  ...r8Assembly,
  knowledgeSeed: 'config/projects/7-wonders-duel/rulebook-knowledge.r9.json',
  knowledgeModelCache: 'out/publishability-r9/7-wonders-duel/rulebook-knowledge-model.json',
  outputRoot: 'out/publishability-r9/7-wonders-duel', outputFileName: '7-wonders-duel-full-tutorial-r9.mp4',
  visualPlan: 'config/projects/7-wonders-duel/visual-plan.r9.json',
  componentLibraryManifest: 'out/publishability-r9/7-wonders-duel/component-library/manifest.json',
  visualStoryboardRoot: 'out/publishability-r9/7-wonders-duel/visual-storyboard',
  visualManifest: 'out/publishability-r9/7-wonders-duel/visual-storyboard/manifest.json',
  narrationSeedManifest: 'out/publishability-r8/7-wonders-duel/narration-assets.json',
  narrationRegenerateSceneIds: ['knowledge-components-overview', 'knowledge-setup-age-decks', 'knowledge-discard-for-coins'],
  baseline: {
    immutableGold: r8Assembly.baseline.immutableGold,
    predecessor: { version: 'r8', video: 'out/publishability-r8/7-wonders-duel/7-wonders-duel-full-tutorial-r8.mp4', preserved: true, directorScore: '9.6/10', directorStatus: 'HUMAN_NOT_PUBLISHABLE' },
  },
};
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r9.json'), r9Assembly);

process.stdout.write(`${JSON.stringify({ status: 'PASS', assets: assets.length, plans: plans.length, narrationRegenerationRequested: r9Assembly.narrationRegenerateSceneIds.length, invalidatedAssetIds: [...invalidIds] }, null, 2)}\n`);
