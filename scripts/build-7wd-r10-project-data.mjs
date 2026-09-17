#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const r9Plan = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r9.json'));
const r9Knowledge = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.r9.json'));
const r9Assembly = readJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r9.json'));
const nativeRoot = 'C:/mobius-games-tutorial-generator-runtime/data/6b-7-wonders-duel-8b05c4ce1c4f/hephaestus/images/all';
const page20 = path.join(ROOT, 'out/publishability-r5/7-wonders-duel/source-pages/page-20-600dpi.png');
const pressRoot = path.join(ROOT, 'out/publishability-r6/authorized-source-audit/repos-production/fr/7WD_Press_FR');
const militaryBoard = path.join(pressRoot, '02_PRODUCT/_LAYOUT/7DU_Board.tif');
const officialUrl = 'https://cdn.svc.asmodee.net/production-rprod/storage/downloads/games/7wonders-duel/press/7wd-press-fr-1632402556SavqL.zip';
for (const required of [page20, militaryBoard]) if (!fs.existsSync(required)) throw new Error(`Missing authoritative source: ${required}`);

const nativeAsset = (id, file, tags, page, extra = {}) => ({
  id, sourceType: 'NATIVE_EMBEDDED', sourcePath: path.join(nativeRoot, file),
  visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: tags, sourceRefs: [{ page }],
  cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS',
  maxDisplayScale: 1.1, importantObjectEdgeClearancePx: 8,
  edition: '7 Wonders Duel FR', language: 'fr',
  ...extra,
});
const official = {
  publisher: 'Repos Production', sourceUrl: officialUrl,
  licenseProvenanceState: 'OFFICIAL_PUBLISHER_PRESS_ASSET',
};
const sourceRefs = (...pages) => pages.map((page) => ({ page }));

const newAssets = [
  nativeAsset('r10-guild-scientists', 'component_p1_img21_xref83.png', ['Guilde des Scientifiques', 'Guilde violette', 'effet à la construction et points'], 16),
  nativeAsset('r10-guild-builders', 'component_p1_img26_xref99.png', ['Guilde des Bâtisseurs', 'Guilde violette', 'points par Merveille'], 16),
  nativeAsset('r10-guild-shipowners', 'component_p1_img27_xref101.png', ['Guilde des Armateurs', 'Guilde violette', 'cartes brunes et grises'], 16),
  nativeAsset('r10-chain-fortifications', 'component_p8_img7_xref426.png', ['Fortifications', 'carte rouge', 'symbole de chaînage tour'], 9),
  nativeAsset('r10-chain-palisade', 'component_p8_img9_xref430.png', ['Palisade', 'carte rouge', 'symbole de chaînage tour'], 9),
  nativeAsset('r10-chain-aqueduct', 'component_p8_img10_xref432.png', ['Aqueduc', 'carte bleue', 'symbole de chaînage eau'], 9),
  nativeAsset('r10-chain-baths', 'component_p8_img11_xref434.png', ['Bains', 'carte bleue', 'symbole de chaînage eau'], 9),
  nativeAsset('r10-card-dispensary', 'component_p11_img0_xref589.png', ['Dispensaire', 'carte verte', 'science'], 12),
  nativeAsset('r10-card-workshop', 'component_p11_img3_xref593.png', ['Officine', 'carte verte', 'science'], 12),
  nativeAsset('r10-card-archery', 'component_p11_img2_xref591.png', ['Champ de tir', 'carte rouge', 'militaire'], 12),
  nativeAsset('r10-card-guard-tower', 'component_p11_img4_xref594.png', ['Tour de garde', 'carte rouge', 'militaire'], 12),
  nativeAsset('r10-red-conflict-pawn', 'component_p11_img16_xref612.png', ['pion Conflit rouge'], 12, { visualClassification: 'REAL_COMPONENT', maxDisplayScale: 1, isolationRequired: true, transparentPaddingPx: 8, colorMask: { channel: 'red-dominant', minimumRed: 70, redGreenRatio: 1.10, redBlueRatio: 1.12, minimumSaturation: 0.18, maxHueDegreesFromRed: 30, retainLargestComponents: 1, minimumComponentPixels: 80 } }),
  nativeAsset('r10-military-token-5', 'component_p11_img17_xref616.png', ['jeton Militaire perte de 5 pièces'], 12, { visualClassification: 'REAL_COMPONENT', maxDisplayScale: 1 }),
  nativeAsset('r10-military-token-2', 'component_p11_img18_xref619.png', ['jeton Militaire perte de 2 pièces'], 12, { visualClassification: 'REAL_COMPONENT', maxDisplayScale: 1 }),
  ...[
    ['r10-science-wheel', 'component_p11_img5_xref595.png', 'roue'],
    ['r10-science-feather', 'component_p11_img6_xref596.png', 'plume'],
    ['r10-science-compass', 'component_p11_img7_xref597.png', 'compas'],
    ['r10-science-mortar', 'component_p11_img8_xref598.png', 'mortier'],
    ['r10-science-sundial', 'component_p11_img9_xref599.png', 'cadran solaire'],
    ['r10-science-scales', 'component_p11_img10_xref600.png', 'balance'],
  ].map(([id, file, label]) => nativeAsset(id, file, [`symbole scientifique ${label}`], 12, {
    visualClassification: 'REAL_COMPONENT', removeNearWhiteBackground: true,
    isolationRequired: true, minimumTransparentRatio: 0.08, transparentPaddingPx: 12, whiteBackgroundThreshold: 226, whiteBackgroundFeatherStart: 188, whiteBackgroundMaximumSpread: 42, importantObjectEdgeClearancePx: 10,
  })),
  {
    id: 'r10-science-symbols-six-complete', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_COMPONENT', semanticTags: ['six symboles scientifiques différents', 'symboles complets et non rognés'],
    representedQuantity: 6, representedComponent: 'science-symbols', sourceRefs: sourceRefs(12),
    cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
    composite: {
      width: 1210, height: 220, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [
        ['wheel', 'component_p11_img5_xref595.png'], ['feather', 'component_p11_img6_xref596.png'],
        ['compass', 'component_p11_img7_xref597.png'], ['mortar', 'component_p11_img8_xref598.png'],
        ['sundial', 'component_p11_img9_xref599.png'], ['scales', 'component_p11_img10_xref600.png'],
      ].map(([id], index) => ({ id, sourcePath: path.join(ROOT, 'out/publishability-r10/7-wonders-duel/component-library', `r10-science-${id}.png`), sourceType: 'NATIVE_EMBEDDED_ISOLATED_DERIVATIVE', x: 15 + index * 200, y: 20, width: 180, height: 180, sourceRefs: sourceRefs(12) })),
    },
    importantObjectEdgeClearancePx: 15,
  },
  {
    id: 'r10-discard-pile-clean', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['pile de défausse face cachée', 'cartes Âge empilées à côté du plateau'],
    representedQuantity: 4, representedComponent: 'discarded-age-cards', sourceRefs: sourceRefs(7, 10),
    cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
    composite: {
      width: 430, height: 525, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [0, 1, 2, 3].map((index) => ({
        id: `discard-card-${index + 1}`, sourcePath: path.join(nativeRoot, 'component_p6_img6_xref350.png'), sourceType: 'NATIVE_EMBEDDED',
        x: 28 + index * 34, y: 50 - index * 12, width: 294, height: 453, sourceRefs: sourceRefs(7, 10),
      })),
    },
    importantObjectEdgeClearancePx: 16,
  },
  ...[
    ['r10-age-i-diagram', { left: 0.062, top: 0.202, width: 0.42, height: 0.315 }, ['structure complète Âge I', 'cartes face visible et face cachée']],
    ['r10-age-ii-diagram', { left: 0.478, top: 0.202, width: 0.49, height: 0.315 }, ['structure complète Âge II', 'cartes face visible et face cachée']],
    ['r10-age-iii-diagram', { left: 0.345, top: 0.515, width: 0.32, height: 0.405 }, ['structure complète Âge III', 'cartes face visible et face cachée']],
  ].map(([id, cropNormalized, semanticTags]) => ({
    id, sourceType: 'HIGH_DPI_PAGE_CROP', sourcePath: page20, visualClassification: 'SOURCE_FAITHFUL_DIAGRAM_WITH_REAL_ASSETS',
    semanticTags, visibleLabels: [id.replace('r10-age-', 'Âge ').replace('-diagram', '').toUpperCase()], sourceRefs: sourceRefs(20),
    cropNormalized, cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
    vectorContentPresent: true, rasterContentPresent: false, importantObjectEdgeClearancePx: 18,
  })),
  {
    id: 'r10-military-board-with-tokens', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_BOARD_OR_TRACK', semanticTags: ['piste militaire en jeu', 'quatre jetons Militaire', 'zones de points', 'capitales'],
    sourceRefs: sourceRefs(4, 12, 13), cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
    composite: {
      width: 1600, height: 470, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [
        { id: 'board', sourcePath: militaryBoard, sourceType: 'OFFICIAL_HIGH_RES', x: 0, y: 30, width: 1600, height: 400, sourceRefs: sourceRefs(4, 12, 13), ...official },
        { id: 'token-5-left', sourcePath: path.join(nativeRoot, 'component_p11_img17_xref616.png'), sourceType: 'NATIVE_EMBEDDED', x: 330, y: 282, width: 62, height: 142, sourceRefs: sourceRefs(12) },
        { id: 'token-2-left', sourcePath: path.join(nativeRoot, 'component_p11_img18_xref619.png'), sourceType: 'NATIVE_EMBEDDED', x: 625, y: 282, width: 62, height: 142, sourceRefs: sourceRefs(12) },
        { id: 'token-2-right', sourcePath: path.join(nativeRoot, 'component_p11_img18_xref619.png'), sourceType: 'NATIVE_EMBEDDED', x: 915, y: 282, width: 62, height: 142, sourceRefs: sourceRefs(12) },
        { id: 'token-5-right', sourcePath: path.join(nativeRoot, 'component_p11_img17_xref616.png'), sourceType: 'NATIVE_EMBEDDED', x: 1208, y: 282, width: 62, height: 142, sourceRefs: sourceRefs(12) },
      ],
    },
  },
  {
    id: 'r10-military-state-five-points', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
    visualClassification: 'REAL_BOARD_OR_TRACK', semanticTags: ['exemple militaire cinq points', 'pion Conflit rouge dans zone 5', 'jetons Militaire cohérents'],
    sourceRefs: sourceRefs(12, 13), cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
    composite: {
      width: 1600, height: 470, background: { r: 0, g: 0, b: 0, alpha: 0 },
      layers: [
        { id: 'board', sourcePath: militaryBoard, sourceType: 'OFFICIAL_HIGH_RES', x: 0, y: 30, width: 1600, height: 400, sourceRefs: sourceRefs(12, 13), ...official },
        { id: 'pawn-five-zone', sourcePath: path.join(ROOT, 'out/publishability-r10/7-wonders-duel/component-library/r10-red-conflict-pawn.png'), sourceType: 'NATIVE_EMBEDDED_ISOLATED_DERIVATIVE', x: 342, y: 235, width: 108, height: 38, sourceRefs: sourceRefs(12, 13) },
        { id: 'token-2-right', sourcePath: path.join(nativeRoot, 'component_p11_img18_xref619.png'), sourceType: 'NATIVE_EMBEDDED', x: 915, y: 282, width: 62, height: 142, sourceRefs: sourceRefs(12) },
        { id: 'token-5-right', sourcePath: path.join(nativeRoot, 'component_p11_img17_xref616.png'), sourceType: 'NATIVE_EMBEDDED', x: 1208, y: 282, width: 62, height: 142, sourceRefs: sourceRefs(12) },
      ],
    },
  },
];
const militaryBase = newAssets.find((asset) => asset.id === 'r10-military-board-with-tokens');
newAssets.push({
  ...structuredClone(militaryBase),
  id: 'r10-military-state-center',
  semanticTags: ['piste militaire en jeu', 'pion Conflit rouge au centre', 'quatre jetons Militaire en place'],
  composite: {
    ...structuredClone(militaryBase.composite),
    layers: [...structuredClone(militaryBase.composite.layers), {
      id: 'pawn-center', sourcePath: path.join(ROOT, 'out/publishability-r10/7-wonders-duel/component-library/r10-red-conflict-pawn.png'), sourceType: 'NATIVE_EMBEDDED_ISOLATED_DERIVATIVE',
      x: 746, y: 235, width: 108, height: 38, sourceRefs: sourceRefs(12),
    }],
  },
});

const knowledge = structuredClone(r9Knowledge);
const atomById = new Map(knowledge.ruleAtoms.map((atom) => [atom.id, atom]));
const overviewAtom = {
  id: 'components-physical-overview', domain: 'components', coverageDomains: ['components'], title: 'Le matériel en un coup d’œil', mandatoryOrOptional: 'mandatory',
  procedureSteps: ['Repérer le plateau et le pion Conflit.', 'Reconnaître cartes, Merveilles, pièces et jetons.'],
  stateChange: 'Les grandes familles de matériel deviennent reconnaissables.', stateAfter: 'Le matériel peut être retrouvé sur la table.',
  componentRefs: ['board', 'conflict-pawn', 'age-cards', 'wonder-cards', 'coins', 'military-tokens', 'progress-tokens'],
  sourceRefs: sourceRefs(3, 4, 5), confidence: 0.99, reviewState: 'accepted',
  visualRequirement: { purpose: 'Faire reconnaître les grandes familles physiques avant la mise en place.', requiredObjects: ['plateau militaire', 'pion Conflit rouge', 'cartes Âge', 'cartes Merveille', 'pièces', 'jetons Militaire', 'jetons Progrès'], preferredComposition: 'DENSE_REAL_COMPONENT_OVERVIEW', minimumEffectiveResolution: { width: 1500, height: 800 } },
  teaching: { majorSection: 'Les composants', heading: 'Le matériel en un coup d’œil', narration: 'Avant la mise en place, repérez les grandes familles de matériel. Le long plateau militaire accueille le pion Conflit rouge, les jetons Militaire et les jetons Progrès. Vous utiliserez aussi les cartes des trois âges, les cartes Merveille et les pièces. Vous allez maintenant reconnaître les familles de bâtiments qui formeront votre tableau personnel.', displayLines: ['Plateau et pion Conflit · jetons Militaire et Progrès', 'Cartes des Âges · Merveilles · pièces', 'Puis les bâtiments de votre tableau personnel'], sequence: 25 },
};
const guildAtom = {
  id: 'guild-system', domain: 'triggered_effect', coverageDomains: ['triggered_effects', 'scoring'], title: 'Comprendre les Guildes', mandatoryOrOptional: 'mandatory',
  prerequisites: ['Les trois Guildes choisies au hasard ont été mélangées à l’Âge III.'],
  choice: 'Construire une carte Guilde violette accessible.', procedureSteps: ['Payer son coût comme pour un bâtiment.', 'La placer dans son tableau personnel.', 'Résoudre son éventuel gain immédiat.', 'Appliquer son critère de points en fin de partie.'],
  stateChange: 'Une Guilde violette rejoint le tableau personnel et applique son propre critère.', result: 'Les Guildes ne fonctionnent pas toutes de la même façon.',
  componentRefs: ['guild-cards', 'personal-tableau'], terminologyRefs: ['tableau personnel', 'Guilde'], sourceRefs: sourceRefs(5, 7, 16), confidence: 0.99, reviewState: 'accepted',
  visualRequirement: { purpose: 'Distinguer plusieurs Guildes et montrer leurs régions d’effet.', requiredObjects: ['plusieurs cartes Guilde violettes', 'symbole ou effet propre à chaque Guilde'], requiredRelationship: 'Guilde construite → effet immédiat éventuel → critère de points propre', preferredComposition: 'DEDICATED_COMPLEX_COMPONENT_FAMILY' },
  teaching: { majorSection: 'Systèmes clés', heading: 'Les Guildes', narration: 'Les Guildes sont des bâtiments violets qui apparaissent seulement à l’âge trois. Quand vous en construisez une, placez-la dans votre tableau personnel comme un autre bâtiment, puis lisez son propre effet. Elles ne fonctionnent pas toutes pareil. La Guilde des Bâtisseurs vaut deux points par Merveille dans la cité qui en possède le plus. La Guilde des Scientifiques donne, à sa construction, une pièce par carte verte de la cité qui en a le plus, puis elle rapporte un point par carte verte selon le même type de comparaison au décompte. Certaines Guildes donnent donc des pièces tout de suite et calculent leurs points seulement à la fin.', displayLines: ['Bâtiment violet de l’Âge III', 'Chaque Guilde possède son propre effet', 'Gain immédiat possible · points au décompte'], sequence: 165 },
};
knowledge.ruleAtoms.push(overviewAtom, guildAtom);

const familyAtom = atomById.get('components-overview');
familyAtom.teaching.narration = familyAtom.teaching.narration.replace('Dans votre cité,', 'Dans votre tableau personnel,');
familyAtom.teaching.displayLines[3] = 'Tableau personnel : grouper par couleur, symboles visibles';
familyAtom.terminologyRefs = [...new Set([...(familyAtom.terminologyRefs || []), 'tableau personnel'])];
familyAtom.visualRequirement.requiredRelationship = 'famille visuelle → rôle → organisation dans le tableau personnel';
const tie = atomById.get('tie-breaker');
tie.teaching.displayLines = ['Égalité : comparer les points des bâtiments bleus', 'Encore égalité : victoire partagée'];
const progress = atomById.get('scoring-progress');
progress.teaching.displayLines = ['Vérifier chaque jeton Progrès', 'Ajouter seulement les points accordés par son effet', 'Reporter la somme à la ligne Progrès'];

const invalidIds = new Set(['7wd-accessible-cards', 'r8-chain-example-complete', '7wd-science-symbols', 'r9-discard-pile-face-down']);
const inheritedAssets = r9Plan.assets.filter((asset) => !invalidIds.has(asset.id));
const centralSetup = inheritedAssets.find((asset) => asset.id === 'r9-central-setup-official');
if (centralSetup) centralSetup.detailReviewExemptions = [{
  underlyingRasterXrefs: [269, 276, 280],
  reason: 'Small placement arrows/numerals and the embedded setup pawn are source-authentic; Director approved this complete central setup diagram at its R9 display size, and R10 separately supplies HD component close-ups.',
  reviewState: 'PHYSICALLY_APPROVED_REFERENCE',
}];
const assets = [...inheritedAssets, ...newAssets];
const allAssetIds = new Set(assets.map((asset) => asset.id));
const evidence = (referents, assetIds) => referents.map((referent) => ({ referent, assetIds: assetIds.filter((id) => allAssetIds.has(id)), visibleAtNarration: true, groundingMethod: 'SOURCE_GROUNDED_R10_VISUAL_PLAN' }));

const overviewIds = ['r6-military-board', 'r10-red-conflict-pawn', 'r9-military-tokens-four-isolated', 'r9-progress-tokens-five-isolated', 'r8-seven-coins', 'r6-age-i-cards', 'r6-wonder-cards'];
const familyIds = ['r6-card-production-brown', 'r9-grey-family-evidence', 'r6-card-trade-yellow', 'r6-card-military-red', 'r6-card-vp-blue', 'r6-card-science-green', 'r10-guild-builders', 'r10-guild-scientists'];
const accessibleIds = ['r10-chain-baths', 'r10-chain-palisade', 'r10-card-dispensary', 'r10-card-guard-tower', 'r10-chain-aqueduct', 'r10-chain-fortifications'];
const overrides = {
  'components-physical-overview': { compositionType: 'REAL_COMPONENT_OVERVIEW', actualGameAssetIds: overviewIds, labels: ['Plateau militaire', 'Pion Conflit', 'Jetons Militaire', 'Jetons Progrès', 'Pièces', 'Cartes d’Âge', 'Merveilles'], minimumRepresentativeAssets: 7, mobileMinimumAssetWidthPx: 150, visualAreaTarget: 0.81, captionMaxWidth: 1740 },
  'components-overview': { compositionType: 'REAL_CARD_FAMILY_TABLEAU', actualGameAssetIds: familyIds, labels: ['Brunes', 'Grises', 'Jaunes', 'Rouges', 'Bleues', 'Vertes', 'Guilde · Bâtisseurs', 'Guilde · Scientifiques'], minimumRepresentativeAssets: 8, mobileMinimumAssetWidthPx: 160, visualAreaTarget: 0.80, progressiveReveal: true, motionCues: [], captionMaxWidth: 1740 },
  'objective-victory-overview': { actualGameAssetIds: ['r10-military-state-center', 'r10-science-symbols-six-complete', 'r6-card-vp-blue'], labels: ['Militaire', 'Science', 'Points'], gameState: { militaryTrackState: 'IN_GAME', conflictPawnVisible: true, militaryTokenState: 'VISIBLE_UNTRIGGERED' }, visualAreaTarget: 0.80 },
  'setup-age-layouts': { compositionType: 'REAL_AGE_REFERENCE_GRID', actualGameAssetIds: ['r10-age-i-diagram', 'r9-age-i-back', 'r6-card-production-brown'], ageGroups: [{ label: 'Âge I · dos et exemple réel', diagramAssetId: 'r10-age-i-diagram', exampleAssetIds: ['r9-age-i-back', 'r6-card-production-brown'] }], visualAreaTarget: 0.80, mobileMinimumAssetWidthPx: 140, captionMaxWidth: 1720 },
  'setup-later-age-layouts': { compositionType: 'REAL_AGE_REFERENCE_GRID', actualGameAssetIds: ['r10-age-ii-diagram', 'r9-age-ii-back', 'r6-card-science-green', 'r10-age-iii-diagram', 'r9-age-iii-back', 'r10-guild-builders'], ageGroups: [{ label: 'Âge II', diagramAssetId: 'r10-age-ii-diagram', exampleAssetIds: ['r9-age-ii-back', 'r6-card-science-green'] }, { label: 'Âge III · Guildes incluses', diagramAssetId: 'r10-age-iii-diagram', exampleAssetIds: ['r9-age-iii-back', 'r10-guild-builders'] }], visualAreaTarget: 0.80, mobileMinimumAssetWidthPx: 140, captionMaxWidth: 1720 },
  'accessible-card': { compositionType: 'REAL_ACCESSIBLE_CARD_DEMONSTRATION', actualGameAssetIds: accessibleIds, labels: ['Encore recouvertes', 'Accessibles maintenant'], cardLayout: [
    { assetId: 'r10-chain-baths', x: 0.18, y: 0.02, width: 0.19, height: 0.43, state: 'BLOCKED' },
    { assetId: 'r10-chain-palisade', x: 0.48, y: 0.02, width: 0.19, height: 0.43, state: 'BLOCKED' },
    { assetId: 'r10-card-dispensary', x: 0.08, y: 0.40, width: 0.19, height: 0.43, state: 'ACCESSIBLE' },
    { assetId: 'r10-card-guard-tower', x: 0.31, y: 0.40, width: 0.19, height: 0.43, state: 'ACCESSIBLE' },
    { assetId: 'r10-chain-aqueduct', x: 0.54, y: 0.40, width: 0.19, height: 0.43, state: 'ACCESSIBLE' },
    { assetId: 'r10-chain-fortifications', x: 0.77, y: 0.40, width: 0.19, height: 0.43, state: 'ACCESSIBLE' },
  ], visualAreaTarget: 0.80, mobileMinimumAssetWidthPx: 185, invalidatesDerivativeIds: ['7wd-accessible-cards'] },
  'chain-construction': { compositionType: 'REAL_CHAIN_COMPARISON', actualGameAssetIds: ['r10-chain-baths', 'r10-chain-aqueduct', 'r10-chain-palisade', 'r10-chain-fortifications'], pairLabels: ['Bains → Aqueduc · symbole eau', 'Palisade → Fortifications · symbole tour'], comparisonMinimumSourcePixelsPerDisplayPixel: 0.8, visualAreaTarget: 0.80, mobileMinimumAssetWidthPx: 220, captionMaxWidth: 1700 },
  'discard-for-coins': { compositionType: 'REAL_DISCARD_PILE_FLOW', actualGameAssetIds: ['r6-card-production-brown', 'r10-discard-pile-clean', 'r6-card-trade-yellow', 'r6-coins-clean-composite'], labels: ['Carte accessible', 'Pile face cachée', 'Jaunes du tableau', 'Pièces gagnées'], discardLines: ['Défausse en jeu : pile face cachée à côté du plateau', 'Cartes retirées à la mise en place : retour dans la boîte', 'Gain = 2 pièces + 1 par carte jaune déjà construite'], visualAreaTarget: 0.80, mobileMinimumAssetWidthPx: 190, captionMaxWidth: 1720 },
  'end-of-age': { compositionType: 'REAL_END_OF_AGE_TRANSITION', actualGameAssetIds: ['r10-chain-baths', 'r10-military-state-center', 'r10-age-ii-diagram'], stateStages: [{ label: 'AVANT · dernière carte', assetIds: ['r10-chain-baths'] }, { label: 'APRÈS · structure vide', assetIds: [] }, { label: 'VÉRIFIER le militaire · préparer l’Âge suivant', assetIds: ['r10-military-state-center', 'r10-age-ii-diagram'] }], gameState: { militaryTrackState: 'IN_GAME', conflictPawnVisible: true, militaryTokenState: 'VISIBLE_UNTRIGGERED_OR_SOURCE_STATE' }, visualAreaTarget: 0.80, captionMaxWidth: 1710 },
  'science-supremacy': { compositionType: 'REAL_SYMBOL_COMPARISON', actualGameAssetIds: ['r10-science-symbols-six-complete', 'r9-progress-tokens-five-isolated'], backgroundAssetId: 'r10-science-symbols-six-complete', quantityFidelity: [{ componentRef: 'science-symbols', requiredQuantity: 6, assetId: 'r10-science-symbols-six-complete' }], importantObjectEdgeClearancePx: 10, focusCues: [], visualAreaTarget: 0.80 },
  'military-system': { compositionType: 'REAL_MILITARY_DEMONSTRATION', actualGameAssetIds: ['r10-military-board-with-tokens', 'r10-red-conflict-pawn'], labels: ['Centre : 0 point', 'Zones : 2, 5 ou 10 points', 'Capitale : victoire immédiate'], motionCues: [{ id: 'conflict-pawn-movement', assetId: 'r10-red-conflict-pawn', relativeToAssetId: 'r10-military-board-with-tokens', startPosition: { x: 0.50, y: 0.55 }, endPosition: { x: 0.77, y: 0.55 }, widthPx: 108, startRatio: 0.08, endRatio: 0.62, holdEndRatio: 0.96 }], gameState: { militaryTrackState: 'IN_GAME', conflictPawnVisible: true, militaryTokenState: 'VISIBLE_UNTRIGGERED_THEN_REMOVED_ON_ENTRY' }, visualAreaTarget: 0.81 },
  'guild-system': { compositionType: 'REAL_GUILD_TEACHING', actualGameAssetIds: ['r10-guild-builders', 'r10-guild-scientists', 'r10-guild-shipowners'], labels: ['Bâtisseurs', 'Scientifiques', 'Armateurs'], guildExamples: [{ explanation: '2 points par Merveille dans la cité qui en possède le plus' }, { explanation: 'Pièces à la construction · points par carte verte au décompte' }, { explanation: 'Cartes brunes et grises · effet propre à la Guilde' }], minimumRepresentativeAssets: 3, mobileMinimumAssetWidthPx: 240, visualAreaTarget: 0.80, captionMaxWidth: 1710 },
  'endgame-trigger': { compositionType: 'REAL_SYMBOL_COMPARISON', actualGameAssetIds: ['r10-military-state-center', 'r10-science-symbols-six-complete', 'r6-card-vp-blue'], labels: ['Militaire', 'Science', 'Décompte'], gameState: { militaryTrackState: 'IN_GAME', conflictPawnVisible: true, militaryTokenState: 'VISIBLE_OR_EXPLICITLY_TRIGGERED' }, minimumRepresentativeAssets: 3, visualAreaTarget: 0.80 },
  'scoring-military': { compositionType: 'REAL_MILITARY_ZONE_OVERLAY', actualGameAssetIds: ['r10-military-state-five-points'], labels: ['Centre : 0', 'Zone proche : 2', 'Zone profonde : 5', 'Aux portes de la capitale : 10'], gameState: { militaryTrackState: 'IN_GAME', conflictPawnVisible: true, militaryTokenState: 'SOURCE_COHERENT_EXAMPLE' }, visualAreaTarget: 0.80 },
  'scoring-buildings': { compositionType: 'REAL_CARD_FAMILY_TABLEAU', actualGameAssetIds: ['r6-card-vp-blue', 'r6-card-science-green', 'r6-card-trade-yellow', 'r10-guild-builders'], labels: ['Bleues', 'Vertes', 'Jaunes', 'Guildes violettes'], multiIdeaBullets: true, bulletLines: ['Additionner les points indiqués par les lauriers', 'Appliquer le critère propre aux Guildes'], captionMaxWidth: 1740, captionPreferredFontPx: 37, panelUtilization: { usefulContentRatio: 0.62, availableAreaRatio: 0.72 }, visualAreaTarget: 0.80 },
  'scoring-progress': { actualGameAssetIds: ['r9-progress-tokens-five-isolated'], backgroundAssetId: 'r9-progress-tokens-five-isolated', multiIdeaBullets: true, bulletLines: progress.teaching.displayLines, captionMaxWidth: 1720, captionPreferredFontPx: 38, panelUtilization: { usefulContentRatio: 0.55, availableAreaRatio: 0.60 } },
  'tie-breaker': { compositionType: 'REAL_COMPONENT_HERO', actualGameAssetIds: ['r6-card-vp-blue'], multiIdeaBullets: true, bulletLines: tie.teaching.displayLines, captionMaxWidth: 1740, captionPreferredFontPx: 40, panelUtilization: { usefulContentRatio: 0.56, availableAreaRatio: 0.62 }, visualAreaTarget: 0.72 },
};

for (const id of ['scoring-ledger', 'winner-resolution']) {
  const inherited = r9Plan.plans.find((plan) => plan.ruleAtomId === id);
  overrides[id] = {
    actualGameAssetIds: (inherited.actualGameAssetIds || []).map((assetId) => assetId === 'r6-military-board' ? 'r10-military-state-five-points' : assetId),
    scoreExample: {
      ...structuredClone(inherited.scoreExample),
      rows: (inherited.scoreExample?.rows || []).map((row) => row.assetId === 'r6-military-board' ? { ...row, assetId: 'r10-military-state-five-points' } : row),
    },
    gameState: { militaryTrackState: 'IN_GAME', conflictPawnVisible: true, militaryTokenState: 'SOURCE_COHERENT_EXAMPLE' },
  };
}

const planById = new Map(r9Plan.plans.map((plan) => [plan.ruleAtomId, { ...plan }]));
for (const atom of [overviewAtom, guildAtom]) planById.set(atom.id, { ruleAtomId: atom.id, instructionalPurpose: atom.visualRequirement.purpose, actualGameAssetRequired: true, reviewState: 'accepted', sourceRefs: atom.sourceRefs });
for (const [id, override] of Object.entries(overrides)) {
  const atom = knowledge.ruleAtoms.find((entry) => entry.id === id);
  const current = planById.get(id) || { ruleAtomId: id };
  const next = { ...current, ...override, reviewState: 'accepted', connectorStyle: override.connectorStyle || 'SUBTLE', sourceRefs: atom?.sourceRefs || current.sourceRefs || [] };
  const referents = atom?.visualRequirement?.requiredObjects || [];
  if (referents.length) {
    next.requiredReferents = referents;
    next.referentGroundingRequired = true;
    next.referentEvidence = evidence(referents, next.actualGameAssetIds || []);
  }
  planById.set(id, next);
}
for (const [id, plan] of planById) {
  plan.actualGameAssetIds = (plan.actualGameAssetIds || []).filter((assetId) => allAssetIds.has(assetId));
  if (invalidIds.has(plan.backgroundAssetId)) plan.backgroundAssetId = plan.actualGameAssetIds[0] || null;
  if (invalidIds.has(plan.actualGameAssetIds?.[0])) throw new Error(`${id}: rejected R9 derivative survived R10 migration`);
}

const plans = knowledge.ruleAtoms.map((atom) => planById.get(atom.id)).filter(Boolean);
const r10Plan = {
  ...r9Plan, version: 'r10', contract: 'mobius-project-visual-plan-v1.2',
  assetOutputRoot: 'out/publishability-r10/7-wonders-duel/component-library', assets, plans,
  terminology: [...(r9Plan.terminology || []), { id: 'personal-tableau', displayFrCa: 'tableau personnel', definition: 'Zone organisée qu’un joueur construit devant lui avec ses cartes, tuiles ou composants.', applicability: 'USE_WHEN_SEMANTICALLY_APPROPRIATE' }],
  policy: {
    ...r9Plan.policy,
    mobileAssetDensity: { enlargeOrAddRepresentativeAssetsBeforeAcceptingUnusedSpace: true, minimumInspectableCardWidthPx: 180 },
    importantInstructionalObjectEdgeRule: 'MUST_NOT_TOUCH_OR_CROSS_CROP_BOUNDARY_UNLESS_DECLARED',
    inGameMilitaryStateRequiresPawn: true,
    multiIdeaPanelsPreferBullets: true,
    material: { family: 'WARM_ESPRESSO_GAME_DERIVED_R10', proceduralWoodGrain: true, recognizableBackgroundColorRequired: true, textureMustPreserveContrast: true },
  },
};

knowledge.modelVersion = 'mobius-rulebook-knowledge-r10';
knowledge.terminology = [...(knowledge.terminology || []).filter((term) => term.id !== 'personal-tableau'), { id: 'personal-tableau', display: 'tableau personnel', locale: 'fr-CA', definition: 'Zone organisée qu’un joueur construit devant lui avec ses cartes, tuiles ou composants.', source: 'MOBIUS_LEARNER_TERMINOLOGY', applicability: 'preferred generic learner term when semantically appropriate' }];
knowledge.directorConstraints = { ...(knowledge.directorConstraints || {}), personalTableauTerminology: true, complexFamiliesMayReceiveDedicatedScenes: true, physicalGameStatesInternallyCoherent: true };

const assembly = {
  ...r9Assembly,
  knowledgeSeed: 'config/projects/7-wonders-duel/rulebook-knowledge.r10.json',
  knowledgeModelCache: 'out/publishability-r10/7-wonders-duel/rulebook-knowledge-model.json',
  visualPlan: 'config/projects/7-wonders-duel/visual-plan.r10.json',
  componentLibraryManifest: 'out/publishability-r10/7-wonders-duel/component-library/manifest.json',
  visualStoryboardRoot: 'out/publishability-r10/7-wonders-duel/visual-storyboard',
  visualManifest: 'out/publishability-r10/7-wonders-duel/visual-storyboard/manifest.json',
  outputRoot: 'out/publishability-r10/7-wonders-duel', outputFileName: '7-wonders-duel-full-tutorial-r10.mp4',
  sonicMaster: 'src/assets/branding/sonic/mobius-cafe-sonic-signature-r10.wav',
  narrationTeachingProfile: 'AMELIE_TEACHING_WARM_R10',
  narrationSeedManifest: 'out/publishability-r9/7-wonders-duel/narration-assets.json',
  narrationRegenerateSceneIds: knowledge.ruleAtoms.map((atom) => `knowledge-${atom.id}`),
  baseline: { immutableGold: r9Assembly.baseline.immutableGold, predecessor: { version: 'r9', video: 'out/publishability-r9/7-wonders-duel/7-wonders-duel-full-tutorial-r9.mp4', preserved: true, directorStatus: 'MAJOR_PRODUCT_SUCCESS_NOT_YET_LOCKED_PUBLISHABLE' } },
};

writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.r10.json'), knowledge);
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r10.json'), r10Plan);
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r10.json'), assembly);
writeJson(path.join(ROOT, 'out/publishability-r10/7-wonders-duel/negative-regression-fixtures-r9.json'), {
  contract: 'mobius-r10-negative-regression-fixtures-v1',
  fixtures: [
    { id: 'R9-ACCESSIBLE-REJECTED', assetId: '7wd-accessible-cards', expectedViolation: 'rejected-asset-reused' },
    { id: 'R9-CHAIN-LOW-DETAIL', assetId: 'r8-chain-example-complete', expectedViolation: 'comparison-source-detail-below-minimum' },
    { id: 'R9-SCIENCE-CLIPPED', assetId: '7wd-science-symbols', expectedViolation: 'important-object-touches-crop-boundary' },
    { id: 'R9-DISCARD-BAD-CROP', assetId: 'r9-discard-pile-face-down', expectedViolation: 'rejected-asset-reused' },
    { id: 'EMPTY-IN-GAME-MILITARY', expectedViolation: 'in-game-military-track-missing-conflict-pawn' },
    { id: 'TINY-GUILD-IN-EMPTY-REGION', expectedViolation: 'instructional-asset-below-mobile-minimum' },
    { id: 'UNDERUSED-TEXT-PANEL', expectedViolation: 'severe-panel-under-utilization' },
  ],
});
process.stdout.write(`${JSON.stringify({ status: 'PASS', atoms: knowledge.ruleAtoms.length, assets: assets.length, plans: plans.length, rejectedR9Derivatives: [...invalidIds] }, null, 2)}\n`);
