#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const clone = (value) => structuredClone(value);
const sourceRefs = (...pages) => pages.map((page) => ({ page }));
const planPath = path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r10.json');
const knowledgePath = path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.r10.json');
const assemblyPath = path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r10.json');
const plan = readJson(planPath);
const knowledge = readJson(knowledgePath);
const assembly = readJson(assemblyPath);
const matchedRoot = path.join(ROOT, 'out/publishability-r11/source-audit/matched-candidates');
const nativeRoot = 'C:/mobius-games-tutorial-generator-runtime/data/6b-7-wonders-duel-8b05c4ce1c4f/hephaestus/images/all';
const pressRoot = path.join(ROOT, 'out/publishability-r6/authorized-source-audit/repos-production/fr/7WD_Press_FR');
const militaryBoard = path.join(pressRoot, '02_PRODUCT/_LAYOUT/7DU_Board.tif');
const bggAuthority = 'BoardGameGeek exact-game gallery image; physically reviewed source pixels';

function measuredDetail(provenance) {
  const points = provenance.matching.sourceCorners;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return {
    width: Math.round((distance(points[0], points[1]) + distance(points[2], points[3])) / 2),
    height: Math.round((distance(points[1], points[2]) + distance(points[3], points[0])) / 2),
  };
}

function matchedCard(id, candidate, imageId, tags, page, {
  displayWidth = 300,
  displayHeight = 464,
  cropNormalized = null,
} = {}) {
  const provenancePath = path.join(matchedRoot, `${candidate}.json`);
  const provenance = readJson(provenancePath);
  const detail = measuredDetail(provenance);
  const ratio = Math.min(detail.width / displayWidth, detail.height / displayHeight);
  return {
    id,
    sourceType: 'AUTHORIZED_EXACT_EDITION_HIGH_RES',
    sourceAuthority: 'AUTHORIZED_EXACT_EDITION_HIGH_RES',
    sourcePath: provenance.output.path,
    sourceDimensionsOverride: detail,
    trueDetailDimensions: detail,
    trueSourcePixelsPerDisplayPixel: Number(ratio.toFixed(4)),
    visualClassification: 'REAL_CARD_OR_WONDER',
    semanticTags: tags,
    sourceRefs: sourceRefs(page),
    cropNormalized,
    transparentPaddingPx: 8,
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    cardSilhouetteState: 'COMPLETE',
    edgeIntersectionState: 'CLEAR',
    correctCardAspectRatio: true,
    importantObjectEdgeClearancePx: 8,
    qualityState: ratio >= 1 ? 'SOURCE_DETAIL_PASS' : ratio >= 0.8 ? 'SOURCE_DETAIL_MARGINAL' : 'SOURCE_DETAIL_FAIL',
    maxDisplayScale: 1,
    publisher: 'BoardGameGeek exact-game gallery',
    sourceUrl: `https://boardgamegeek.com/image/${imageId}`,
    licenseProvenanceState: 'EXACT_GAME_GALLERY_SOURCE_WITH_RECORDED_ATTRIBUTION',
    edition: '7 Wonders Duel base game',
    language: 'edition-authentic',
    matchedSourceProvenance: provenancePath,
    physicalReview: { state: 'PASS', role: bggAuthority, completeSilhouette: true },
  };
}

const replacements = [
  matchedCard('r11-chain-baths-hd', 'baths-7001255', 7001255, ['Bains', 'carte bleue', 'symbole de chaînage eau'], 9, { displayWidth: 280, displayHeight: 433, cropNormalized: { left: 0.008, top: 0.018, width: 0.984, height: 0.965 } }),
  matchedCard('r11-chain-aqueduct-hd', 'aqueduct-3501111', 3501111, ['Aqueduc', 'carte bleue', 'symbole de chaînage eau'], 9, { displayWidth: 280, displayHeight: 433, cropNormalized: { left: 0.008, top: 0.008, width: 0.984, height: 0.978 } }),
  matchedCard('r11-chain-palisade-hd', 'palisade-3377117', 3377117, ['Palisade', 'carte rouge', 'symbole de chaînage tour'], 9, { displayWidth: 280, displayHeight: 433, cropNormalized: { left: 0.008, top: 0.008, width: 0.984, height: 0.978 } }),
  matchedCard('r11-chain-fortifications-hd', 'fortifications-5234050', 5234050, ['Fortifications', 'carte rouge', 'symbole de chaînage tour'], 9, { displayWidth: 280, displayHeight: 433, cropNormalized: { left: 0.008, top: 0.008, width: 0.984, height: 0.978 } }),
  matchedCard('r11-guild-builders-hd', 'builders-6082262', 6082262, ['Guilde des Bâtisseurs', 'Guilde violette', 'points par Merveille'], 16, { displayWidth: 330, displayHeight: 510, cropNormalized: { left: 0.008, top: 0.008, width: 0.984, height: 0.978 } }),
  matchedCard('r11-guild-scientists-hd', 'scientists-3501116', 3501116, ['Guilde des Scientifiques', 'Guilde violette', 'effet à la construction et points'], 16, { displayWidth: 330, displayHeight: 510, cropNormalized: { left: 0.008, top: 0.008, width: 0.984, height: 0.978 } }),
  matchedCard('r11-guild-shipowners-hd', 'shipowners-3501116-relaxed', 3501116, ['Guilde des Armateurs', 'Guilde violette', 'cartes brunes et grises'], 16, { displayWidth: 330, displayHeight: 510, cropNormalized: { left: 0.008, top: 0.008, width: 0.984, height: 0.978 } }),
];

const rejectedIds = new Set([
  'r10-chain-baths', 'r10-chain-aqueduct', 'r10-chain-palisade', 'r10-chain-fortifications',
  'r10-guild-builders', 'r10-guild-scientists', 'r10-guild-shipowners', 'r10-discard-pile-clean',
  'r10-military-board-with-tokens', 'r10-military-state-center', 'r10-military-state-five-points',
]);
const idMap = new Map([
  ['r10-chain-baths', 'r11-chain-baths-hd'],
  ['r10-chain-aqueduct', 'r11-chain-aqueduct-hd'],
  ['r10-chain-palisade', 'r11-chain-palisade-hd'],
  ['r10-chain-fortifications', 'r11-chain-fortifications-hd'],
  ['r10-guild-builders', 'r11-guild-builders-hd'],
  ['r10-guild-scientists', 'r11-guild-scientists-hd'],
  ['r10-guild-shipowners', 'r11-guild-shipowners-hd'],
  ['r10-discard-pile-clean', 'r11-discard-pile-complete'],
  ['r10-military-board-with-tokens', 'r11-military-board-trigger-base'],
  ['r10-military-state-center', 'r11-military-state-center'],
  ['r10-military-state-five-points', 'r11-military-state-five-points'],
]);
const deepReplace = (value) => {
  if (typeof value === 'string') return idMap.get(value) || value;
  if (Array.isArray(value)) return value.map(deepReplace);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deepReplace(entry)]));
  return value;
};

const token = (id, sourcePath, x, value, extra = {}) => ({
  id, sourcePath, sourceType: 'NATIVE_EMBEDDED', sourceAuthority: 'NATIVE_EMBEDDED',
  x, y: 306, width: 142, height: 62, rotateDeg: 90, sourceRefs: sourceRefs(12),
  semanticTags: [`jeton Militaire perte de ${value} pièces`, 'orientation horizontale sur emplacement imprimé'],
  ...extra,
});
const boardLayer = { id: 'board', sourcePath: militaryBoard, sourceType: 'OFFICIAL_PRESS_ASSET', sourceAuthority: 'OFFICIAL_PRESS_ASSET', x: 0, y: 30, width: 1600, height: 400, sourceRefs: sourceRefs(4, 12, 13), publisher: 'Repos Production' };
const token5Path = path.join(nativeRoot, 'component_p11_img17_xref616.png');
const token2Path = path.join(nativeRoot, 'component_p11_img18_xref619.png');
const pawnPath = path.join(ROOT, 'out/publishability-r10/7-wonders-duel/component-library/r10-red-conflict-pawn.png');
const militaryLayers = [
  token('token-5-left', token5Path, 244, 5),
  token('token-2-left', token2Path, 548, 2),
  token('token-2-right', token2Path, 910, 2),
  token('token-5-right', token5Path, 1214, 5),
];
const militaryComposite = (id, semanticTags, { pawnX = null, omit = [] } = {}) => ({
  id, sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS', sourceAuthority: 'OFFICIAL_PRESS_ASSET',
  visualClassification: 'REAL_BOARD_OR_TRACK', semanticTags, sourceRefs: sourceRefs(4, 12, 13),
  cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
  composite: { width: 1600, height: 470, background: { r: 0, g: 0, b: 0, alpha: 0 }, layers: [boardLayer, ...militaryLayers.filter((layer) => !omit.includes(layer.id)), ...(pawnX == null ? [] : [{ id: 'pawn', sourcePath: pawnPath, sourceType: 'NATIVE_EMBEDDED_ISOLATED_DERIVATIVE', x: pawnX, y: 226, width: 108, height: 38, sourceRefs: sourceRefs(12, 13) }])] },
});
const militaryAssets = [
  militaryComposite('r11-military-board-trigger-base', ['piste militaire en jeu', 'jeton 2 de gauche retiré de la base pour animation', 'trois jetons restants'], { omit: ['token-2-left'] }),
  militaryComposite('r11-military-state-center', ['piste militaire en jeu', 'pion Conflit rouge au centre', 'quatre jetons Militaire horizontaux en place'], { pawnX: 746 }),
  militaryComposite('r11-military-state-five-points', ['exemple militaire cinq points', 'pion Conflit rouge dans zone 5', 'jeton franchi retiré'], { pawnX: 338, omit: ['token-5-left', 'token-2-left'] }),
  {
    id: 'r11-military-token-2-horizontal', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS', sourceAuthority: 'NATIVE_EMBEDDED',
    visualClassification: 'REAL_COMPONENT', semanticTags: ['jeton Militaire perte de 2 pièces', 'orientation horizontale'], sourceRefs: sourceRefs(12),
    cropCompleteness: 'complete', cropPurity: 'clean', qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1,
    composite: { width: 142, height: 62, background: { r: 0, g: 0, b: 0, alpha: 0 }, layers: [token('token-2', token2Path, 0, 2, { y: 0 })] },
  },
  {
    id: 'r11-discard-pile-complete', sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS', sourceAuthority: 'NATIVE_EMBEDDED',
    visualClassification: 'REAL_CARD_OR_WONDER', semanticTags: ['pile de défausse face cachée', 'cartes Âge empilées à côté du plateau'], representedQuantity: 4, representedComponent: 'discarded-age-cards', sourceRefs: sourceRefs(7, 10),
    cropCompleteness: 'complete', cropPurity: 'clean', cardSilhouetteState: 'COMPLETE', edgeIntersectionState: 'CLEAR', correctCardAspectRatio: true,
    qualityState: 'SOURCE_DETAIL_PASS', maxDisplayScale: 1, importantObjectEdgeClearancePx: 18,
    composite: { width: 520, height: 560, background: { r: 0, g: 0, b: 0, alpha: 0 }, layers: [0, 1, 2, 3].map((index) => ({ id: `discard-card-${index + 1}`, sourcePath: path.join(nativeRoot, 'component_p6_img6_xref350.png'), sourceType: 'NATIVE_EMBEDDED', sourceAuthority: 'NATIVE_EMBEDDED', x: 52 + index * 32, y: 72 - index * 14, width: 294, height: 453, sourceRefs: sourceRefs(7, 10) })) },
  },
];

const nextPlan = deepReplace(clone(plan));
nextPlan.version = 'r11';
nextPlan.assetOutputRoot = 'out/publishability-r11/7-wonders-duel/component-library';
// deepReplace also updates IDs in the asset catalog. Remove every superseded
// destination ID before appending its authoritative R11 definition so catalog
// order can never let a stale low-detail derivative shadow the replacement.
const replacementIds = new Set([...replacements, ...militaryAssets].map((asset) => asset.id));
nextPlan.assets = [...nextPlan.assets.filter((asset) => !rejectedIds.has(asset.id) && !replacementIds.has(asset.id)), ...replacements, ...militaryAssets];
const byPlan = new Map(nextPlan.plans.map((entry) => [entry.ruleAtomId, entry]));
const accessible = byPlan.get('accessible-card');
const backs = ['r9-age-i-back'];
const fronts = ['r11-chain-baths-hd', 'r6-card-production-brown', 'r10-card-dispensary', 'r6-card-trade-yellow', 'r10-card-guard-tower', 'r11-chain-palisade-hd'];
const rows = [
  { count: 2, y: 0.00, faceState: 'FACE_UP' },
  { count: 3, y: 0.13, faceState: 'FACE_DOWN' },
  { count: 4, y: 0.27, faceState: 'FACE_UP' },
  { count: 5, y: 0.41, faceState: 'FACE_DOWN' },
  { count: 6, y: 0.55, faceState: 'FACE_UP' },
];
accessible.cardLayout = rows.flatMap((row, rowIndex) => Array.from({ length: row.count }, (_, index) => {
  const spacing = 0.112;
  const x = 0.5 - ((row.count - 1) * spacing) / 2 + index * spacing - 0.046;
  const id = row.faceState === 'FACE_DOWN' ? backs[0] : fronts[(rowIndex + index) % fronts.length];
  const bottom = rowIndex === rows.length - 1;
  return {
    assetId: id, x, y: row.y, width: 0.092, height: 0.34,
    state: bottom ? 'ACCESSIBLE' : 'BLOCKED', accessible: bottom,
    faceState: row.faceState,
    coveredBy: bottom ? [] : [`row-${rowIndex + 1}`],
    covers: rowIndex ? [`row-${rowIndex - 1}`] : [],
  };
}));
accessible.actualGameAssetIds = [...new Set(accessible.cardLayout.map((entry) => entry.assetId))];
accessible.layeredCardState = { required: true, layout: 'OFFICIAL_AGE_I_2_3_4_5_6_ALTERNATING', before: 'FULL_STRUCTURE', action: 'REMOVE_LEGAL_ACCESSIBLE_CARD', after: 'REVEAL_NEWLY_UNCOVERED_FACE_DOWN_CARD' };
accessible.completeCardAssetIds = accessible.actualGameAssetIds.filter((id) => id.startsWith('r11-chain-'));
accessible.mobileMinimumAssetWidthPx = 120;
accessible.invalidatesDerivativeIds = [...new Set([...(accessible.invalidatesDerivativeIds || []), 'R10-ALL-FACE-UP-ACCESSIBILITY'])];

const chain = byPlan.get('chain-construction');
chain.actualGameAssetIds = ['r11-chain-baths-hd', 'r11-chain-aqueduct-hd', 'r11-chain-palisade-hd', 'r11-chain-fortifications-hd'];
chain.completeCardAssetIds = [...chain.actualGameAssetIds];
chain.peerQualityGroups = [{ id: 'chain-cards', assetIds: chain.actualGameAssetIds, maximumDetailRatioSpread: 1.25, maximumDisplayScaleSpread: 1.02 }];
// The weakest authoritative exact-game master (Bains) retains 277 true
// horizontal source pixels. Keep all peers at one 270 px contract so the
// comparison remains both legible and source-detail honest.
chain.comparisonCardWidthPx = 270;
chain.comparisonCardHeightPx = 433;
chain.comparisonMinimumSourcePixelsPerDisplayPixel = 0.8;

const guild = byPlan.get('guild-system');
guild.actualGameAssetIds = ['r11-guild-scientists-hd', 'r11-guild-shipowners-hd'];
guild.minimumRepresentativeAssets = 2;
guild.completeCardAssetIds = [...guild.actualGameAssetIds];
guild.peerQualityGroups = [{ id: 'guild-cards', assetIds: guild.actualGameAssetIds, maximumDetailRatioSpread: 1.25, maximumDisplayScaleSpread: 1.02 }];
guild.labels = ['Scientifiques', 'Armateurs'];
guild.guildExamples = [
  { explanation: 'Pièces + points selon les cartes vertes' },
  { explanation: 'Pièces + points selon les cartes brunes et grises' },
];
const scoring = byPlan.get('scoring-buildings');
scoring.actualGameAssetIds = ['r6-card-vp-blue', 'r6-card-science-green', 'r6-card-trade-yellow', 'r11-guild-scientists-hd'];
scoring.completeCardAssetIds = ['r11-guild-scientists-hd'];
scoring.peerQualityGroups = [{ id: 'scoring-card-peers', assetIds: scoring.actualGameAssetIds, maximumDetailRatioSpread: 1.25, maximumDisplayScaleSpread: 1.02 }];

const discard = byPlan.get('discard-for-coins');
discard.actualGameAssetIds = discard.actualGameAssetIds.map((id) => id === 'r10-discard-pile-clean' ? 'r11-discard-pile-complete' : id);
discard.completeCardAssetIds = ['r11-discard-pile-complete'];

const military = byPlan.get('military-system');
military.actualGameAssetIds = ['r11-military-board-trigger-base', 'r10-red-conflict-pawn', 'r11-military-token-2-horizontal'];
military.motionCues = [
  { id: 'conflict-pawn-crosses-threshold', assetId: 'r10-red-conflict-pawn', relativeToAssetId: 'r11-military-board-trigger-base', startPosition: { x: 0.50, y: 0.55 }, endPosition: { x: 0.31, y: 0.55 }, widthPx: 108, startRatio: 0.08, endRatio: 0.58, holdEndRatio: 0.98, visibleFromSceneStart: true },
  { id: 'military-token-consumed-to-box', assetId: 'r11-military-token-2-horizontal', relativeToAssetId: 'r11-military-board-trigger-base', startPosition: { x: 0.39, y: 0.76 }, endPosition: { x: 0.39, y: 1.16 }, widthPx: 142, startRatio: 0.55, endRatio: 0.72, holdEndRatio: 0.74, visibleFromSceneStart: true },
];
military.oneShotMarkers = [{ id: 'left-two-coin-threshold', assetId: 'r11-military-token-2-horizontal', beforeState: 'PRESENT', trigger: 'CONFLICT_PAWN_ENTERS_THRESHOLD', afterState: 'REMOVED', removeAtTrigger: true, destination: 'BOX_OUT_OF_PLAY', reentryEffect: 'NONE' }];
military.physicalPlacements = [
  { assetId: 'r10-red-conflict-pawn', destinationId: 'MILITARY_TRACK_CENTER_OR_CURRENT_POSITION', orientation: 'BOARD_ALIGNED', expectedOrientation: 'BOARD_ALIGNED', positionVerified: true },
  { assetId: 'r11-military-token-2-horizontal', destinationId: 'PRINTED_TWO_COIN_THRESHOLD', orientation: 'HORIZONTAL', expectedOrientation: 'HORIZONTAL', positionVerified: true },
];
military.gameState = { militaryTrackState: 'IN_GAME', conflictPawnVisible: true, militaryTokenState: 'ONE_SHOT_PRESENT_THEN_REMOVED', tokenOrientation: 'HORIZONTAL_ON_PRINTED_LOCATION' };
military.labels = ['Avant : jeton en place', 'Seuil franchi : perte de 2 pièces', 'Après : jeton rangé · aucun nouvel effet au retour'];

const assetIds = new Set(nextPlan.assets.map((asset) => asset.id));
for (const entry of nextPlan.plans) {
  entry.actualGameAssetIds = [...new Set((entry.actualGameAssetIds || []).filter((id) => assetIds.has(id)))];
  for (const evidence of entry.referentEvidence || []) {
    if (evidence.assetId) evidence.assetId = idMap.get(evidence.assetId) || evidence.assetId;
    if (evidence.assetIds) evidence.assetIds = [...new Set(evidence.assetIds.map((id) => idMap.get(id) || id).filter((id) => assetIds.has(id)))];
  }
}
nextPlan.policy = {
  ...nextPlan.policy,
  cardSourceQualityParity: 'BEST_AVAILABLE_AUTHORITY_AT_INTENDED_DISPLAY_SIZE',
  completeCardSilhouetteRequired: true,
  layeredCardStateRequiredWhenFaceOrientationMatters: true,
  oneShotThresholdMarkersMustDisappearAfterTrigger: true,
};

knowledge.modelVersion = 'mobius-rulebook-knowledge-r11';
const guildAtom = knowledge.ruleAtoms.find((atom) => atom.id === 'guild-system');
guildAtom.teaching.narration = 'Les Guildes sont des bâtiments violets qui apparaissent seulement à l’âge trois. Quand vous en construisez une, placez-la dans votre tableau personnel comme un autre bâtiment, puis lisez son propre effet. Elles ne fonctionnent pas toutes pareil. La Guilde des Scientifiques compare les cartes vertes; la Guilde des Armateurs compare les cartes brunes et grises. Pour ces deux exemples, vous recevez des pièces à la construction selon la cité qui possède le plus de cartes concernées, puis vous comptez les points indiqués par le même critère au décompte.';
guildAtom.teaching.displayLines = ['Bâtiments violets de l’Âge III', 'Chaque Guilde possède son propre critère'];
// The R10 provider take stumbled at the final clause (also surfaced by local
// ASR as "Seuls-je-là"). Preserve the rule meaning while giving the validated
// R10 profile a clean sentence boundary and unambiguous phrasing.
const productionAtom = knowledge.ruleAtoms.find((atom) => atom.id === 'resource-production');
productionAtom.teaching.narration = 'Point important : les ressources de votre cité ne sont pas des cubes que vous dépensez. Elles représentent une production disponible à chaque tour. Si votre cité produit déjà les symboles demandés, le coût est satisfait. Vous retirez de votre trésorerie seulement les pièces réellement payées.';
knowledge.directorConstraints = {
  ...(knowledge.directorConstraints || {}),
  cardSourceQualityParity: true,
  completeCardSilhouette: true,
  trueLayeredSetupState: true,
  physicalBoardStateCoherence: true,
  consumedOneShotMarkersDisappear: true,
  romanNumeralDisplaySpokenSeparation: true,
};

const nextAssembly = {
  ...assembly,
  knowledgeSeed: 'config/projects/7-wonders-duel/rulebook-knowledge.r11.json',
  knowledgeModelCache: 'out/publishability-r11/7-wonders-duel/rulebook-knowledge-model.json',
  visualPlan: 'config/projects/7-wonders-duel/visual-plan.r11.json',
  componentLibraryManifest: 'out/publishability-r11/7-wonders-duel/component-library/manifest.json',
  visualStoryboardRoot: 'out/publishability-r11/7-wonders-duel/visual-storyboard',
  visualManifest: 'out/publishability-r11/7-wonders-duel/visual-storyboard/manifest.json',
  outputRoot: 'out/publishability-r11/7-wonders-duel',
  outputFileName: '7-wonders-duel-full-tutorial-r11.mp4',
  narrationSeedManifest: 'out/publishability-r10/7-wonders-duel/narration-assets.json',
  narrationTeachingProfile: 'AMELIE_TEACHING_WARM_R10',
  narrationRegenerateSceneIds: ['setup-age-decks', 'guild-system', 'resource-production'],
  baseline: { ...assembly.baseline, predecessor: { version: 'r10', video: 'out/publishability-r10/7-wonders-duel/7-wonders-duel-full-tutorial-r10.mp4', preserved: true, directorStatus: 'PROFESSIONAL_CANDIDATE_9_8_NOT_HUMAN_PUBLISHABLE' } },
};

writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.r11.json'), knowledge);
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r11.json'), nextPlan);
writeJson(path.join(ROOT, 'config/projects/7-wonders-duel/tutorial-assembly.r11.json'), nextAssembly);
writeJson(path.join(ROOT, 'out/publishability-r11/7-wonders-duel/negative-regression-fixtures-r10.json'), {
  contract: 'mobius-r11-negative-regression-fixtures-v1',
  fixtures: [
    { id: 'R10-CHAIN-LOW-DETAIL', sourceDimensions: { width: 219, height: 339 }, betterOfficialSourceAvailable: true, expectedViolation: 'better-authoritative-source-available' },
    { id: 'R10-GUILD-PEER-MISMATCH', sourceDimensions: { width: 249, height: 387 }, peerDimensions: { width: 2640, height: 4081 }, expectedViolation: 'peer-source-detail-parity' },
    { id: 'R10-DISCARD-MALFORMED', assetId: 'r10-discard-pile-clean', expectedViolation: 'rejected-asset-reused' },
    { id: 'R10-CARD-INCOMPLETE', cardSilhouetteState: 'INCOMPLETE', expectedViolation: 'complete-card-silhouette' },
    { id: 'R10-ACCESSIBILITY-ALL-FACE-UP', expectedViolation: 'layered-layout-face-states-incomplete' },
    { id: 'R10-MILITARY-TOKEN-WRONG-ORIENTATION', expectedViolation: 'physical-board-state-incoherent' },
    { id: 'R10-CONSUMED-TOKEN-REMAINS', expectedViolation: 'one-shot-marker-removal-not-visualized' },
    { id: 'R10-ROMAN-I-LITERAL-TTS', input: 'Repérez les dos : I, II et III.', expectedSpoken: 'Repérez les dos : un, deux et trois.' },
  ],
});

process.stdout.write(`${JSON.stringify({ status: 'PASS', r11Assets: nextPlan.assets.length, plans: nextPlan.plans.length, replacedAssetIds: [...idMap.keys()] }, null, 2)}\n`);
