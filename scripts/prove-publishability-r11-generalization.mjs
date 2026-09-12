#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { normalizeVisualPlan, validateVisualPlan } = require('../src/services/visualPlan.cjs');
const { traceAssetSourceDetail, evaluatePeerQualityParity } = require('../src/services/sourceDetailLineage.cjs');
const { normalizeSpokenSymbols } = require('../src/services/editorialStandard.cjs');

const ROOT = path.resolve(process.cwd());
const THIS_FILE = fileURLToPath(import.meta.url);
const OUT = path.join(ROOT, 'out/publishability-r11/terraforming-mars/generalization-proof.json');

const real = (id, overrides = {}) => ({
  id,
  filePath: THIS_FILE,
  containsActualGamePixels: true,
  visualClassification: 'REAL_CARD_OR_WONDER',
  cropPurity: 'clean',
  cropCompleteness: 'complete',
  reviewState: 'accepted',
  sourceRefs: [{ page: 1 }],
  sourceType: 'OFFICIAL_PRESS_ASSET',
  sourceAuthority: 'OFFICIAL_PRESS_ASSET',
  width: 1800,
  height: 2800,
  sourceDimensions: { width: 1800, height: 2800 },
  cardSilhouetteState: 'COMPLETE',
  edgeIntersectionState: 'CLEAR',
  correctCardAspectRatio: true,
  maxDisplayScale: 1,
  ...overrides,
});

const assets = [
  real('tm-face-up'),
  real('tm-face-down'),
  real('tm-threshold-marker', { visualClassification: 'REAL_COMPONENT', representedComponent: 'one-shot threshold marker' }),
  real('tm-board', { visualClassification: 'REAL_BOARD_OR_TRACK', representedComponent: 'board zone' }),
];

const layeredPlan = normalizeVisualPlan({
  ruleAtomId: 'tm-layered-card-market',
  compositionType: 'REAL_SETUP_LAYOUT',
  actualGameAssetIds: ['tm-face-up', 'tm-face-down'],
  completeCardAssetIds: ['tm-face-up', 'tm-face-down'],
  layeredCardState: { required: true },
  cardLayout: [
    { assetId: 'tm-face-up', instanceId: 'visible-choice', faceState: 'FACE_UP', accessible: true, covers: ['hidden-choice'] },
    { assetId: 'tm-face-down', instanceId: 'hidden-choice', faceState: 'FACE_DOWN', accessible: false, coveredBy: ['visible-choice'] },
  ],
  peerQualityGroups: [{ id: 'equivalent-card-peers', assetIds: ['tm-face-up', 'tm-face-down'], maximumDetailRatioSpread: 1.25, maximumDisplayScaleSpread: 1.05 }],
  reviewState: 'accepted',
}, { id: 'tm-layered-card-market', domain: 'setup', componentRefs: ['cards'] });
const layeredValidation = validateVisualPlan(layeredPlan, assets);

const consumedMarkerPlan = normalizeVisualPlan({
  ruleAtomId: 'tm-consumed-threshold',
  compositionType: 'REAL_BOARD_TRACK_FOCUS',
  actualGameAssetIds: ['tm-board', 'tm-threshold-marker'],
  oneShotMarkers: [{
    id: 'tm-threshold', assetId: 'tm-threshold-marker', beforeState: 'PRESENT',
    trigger: 'MARKER_THRESHOLD_ENTERED', afterState: 'REMOVED', removeAtTrigger: true,
    destination: 'OUT_OF_PLAY', reentryEffect: 'NONE',
  }],
  physicalPlacements: [{
    assetId: 'tm-threshold-marker', destinationId: 'verified-board-zone', positionVerified: true,
    orientation: 'BOARD_ALIGNED', expectedOrientation: 'BOARD_ALIGNED',
  }],
  reviewState: 'accepted',
}, { id: 'tm-consumed-threshold', domain: 'action', componentRefs: ['board', 'marker'] });
const consumedValidation = validateVisualPlan(consumedMarkerPlan, assets);

const weakCard = real('tm-weak-card', {
  sourceType: 'NATIVE_EMBEDDED', sourceAuthority: 'NATIVE_EMBEDDED', width: 219, height: 339,
  sourceDimensions: { width: 219, height: 339 }, trueDetailDimensions: { width: 219, height: 339 },
  authoritativeAlternatives: [{ id: 'tm-official-card', sourceType: 'OFFICIAL_PRESS_ASSET', width: 2640, height: 4081 }],
});
const weakTrace = traceAssetSourceDetail({ asset: weakCard, finalBounds: { x: 0, y: 0, width: 360, height: 557 } });
const peerFailure = evaluatePeerQualityParity([
  { assetId: 'weak', sourcePixelsPerDisplayPixel: 0.61, displayScale: 1.64 },
  { assetId: 'strong', sourcePixelsPerDisplayPixel: 1, displayScale: 1 },
]);
const incomplete = validateVisualPlan(normalizeVisualPlan({
  ruleAtomId: 'tm-complete-card', actualGameAssetIds: ['tm-incomplete'], completeCardAssetIds: ['tm-incomplete'], reviewState: 'accepted',
}, { id: 'tm-complete-card', domain: 'action', componentRefs: ['card'] }), [real('tm-incomplete', { cardSilhouetteState: 'INCOMPLETE', edgeIntersectionState: 'TOUCHING' })]);

const genericFiles = [
  'src/services/visualPlan.cjs',
  'src/services/sourceDetailLineage.cjs',
  'src/services/editorialStandard.cjs',
  'src/services/rulebookKnowledge.cjs',
  'scripts/build-visual-storyboard-r5.mjs',
  'scripts/render-storyboard-ffmpeg.mjs',
].map((file) => path.join(ROOT, file));
const forbidden = /(?:7-wonders-duel|seven\s+wonders\s+duel|\bxref\s*[:=]\s*\d+)/ig;
const hardcodes = genericFiles.flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(forbidden)]
  .map((match) => ({ file: path.relative(ROOT, file), token: match[0], index: match.index })));

const checks = {
  layeredFaceStateAndCoverRelationshipsGeneralize: layeredValidation.valid,
  oneShotConsumedMarkerGeneralizes: consumedValidation.valid,
  weakNativeCardRejectedWhenOfficialHdExists: weakTrace.qualityState === 'SOURCE_DETAIL_FAIL' && weakTrace.betterAuthoritativeCandidate?.id === 'tm-official-card',
  peerQualityMismatchRejected: peerFailure.violations.includes('peer-source-detail-parity'),
  incompleteCardSilhouetteRejected: incomplete.violations.includes('complete-card-silhouette:tm-incomplete'),
  contextualRomanDeckNumeralsSpeakNaturally: normalizeSpokenSymbols('Repérez les dos : I, II et III.') === 'Repérez les dos : un, deux et trois.',
  unrelatedLetterIRemainsUntouched: normalizeSpokenSymbols('La lettre I reste I.') === 'La lettre I reste I.',
  noSevenWondersFactsOrXrefsInSharedCode: hardcodes.length === 0,
};

const report = {
  contract: 'mobius-publishability-r11-bounded-generalization-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'tm-eng-bgg-fa0678822223',
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  checks,
  evidence: { layeredValidation, consumedValidation, weakTrace, peerFailure, incompleteCardViolations: incomplete.violations, hardcodes },
  note: 'Bounded second-game proof exercises only shared contracts; project-specific card identities, layouts and coordinates remain project data.',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, checks, output: OUT }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
