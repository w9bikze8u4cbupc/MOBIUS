#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { normalizeVisualPlan, validateVisualPlan } = require('../src/services/visualPlan.cjs');
const { traceAssetSourceDetail } = require('../src/services/sourceDetailLineage.cjs');
const { auditNarrationPerformance } = require('../src/services/narrationPerformanceQa.cjs');
const { resolveStoryboardBackground } = require('../src/services/tutorialAssemblyVisual.cjs');
const ROOT = path.resolve(process.cwd());
const THIS_FILE = fileURLToPath(import.meta.url);
const OUT = path.join(ROOT, 'out/publishability-r10/terraforming-mars/generalization-proof.json');

const real = (id, overrides = {}) => ({
  id, filePath: THIS_FILE, containsActualGamePixels: true, visualClassification: 'REAL_COMPONENT',
  cropPurity: 'clean', cropCompleteness: 'complete', reviewState: 'accepted', sourceRefs: [{ page: 1 }],
  width: 1200, height: 800, sourceDimensions: { width: 1200, height: 800 }, sourceType: 'OFFICIAL_HIGH_RES',
  ...overrides,
});
const assets = [
  real('tm-board', { representedComponent: 'plateau central', visualClassification: 'REAL_BOARD_OR_TRACK' }),
  real('tm-cards', { representedComponent: 'cartes Projet', representedQuantity: 4 }),
  real('tm-resources', { representedComponent: 'cubes de ressources', representedQuantity: 6 }),
];
const plan = normalizeVisualPlan({
  ruleAtomId: 'tm-generation-example',
  compositionType: 'REAL_COMPONENT_GRID',
  actualGameAssetIds: assets.map((asset) => asset.id),
  requiredReferents: ['plateau central', 'cartes Projet', 'cubes de ressources'],
  referentGroundingRequired: true,
  referentEvidence: assets.map((asset) => ({ referent: asset.representedComponent, assetId: asset.id, visibleAtNarration: true })),
  mobileMinimumAssetWidthPx: 190,
  panelUtilization: { usefulContentRatio: 0.63, availableAreaRatio: 0.7 },
  multiIdeaBullets: true,
  gameState: { kind: 'IN_GAME', stateInternallyCoherent: true },
  reviewState: 'accepted',
}, { id: 'tm-generation-example', domain: 'action', componentRefs: ['plateau central', 'cartes Projet', 'cubes de ressources'] });
const valid = validateVisualPlan(plan, assets);
const underused = validateVisualPlan({ ...plan, panelUtilization: { usefulContentRatio: 0.1, availableAreaRatio: 0.75 } }, assets);
const lowDetail = traceAssetSourceDetail({ asset: real('tm-weak-card', { width: 300, height: 450, sourceDimensions: { width: 300, height: 450 } }), finalBounds: { x: 0, y: 0, width: 600, height: 900 }, pdfLineage: null });
const completeFrame = resolveStoryboardBackground({ filePath: 'reviewed-complete.png', animationBaseFramePath: 'empty-base.png', timedOverlayTimeline: [], motionCueTimeline: [] });
const animatedFrame = resolveStoryboardBackground({ filePath: 'reviewed-complete.png', animationBaseFramePath: 'motion-base.png', motionCueTimeline: [{ startSec: 1, endSec: 2 }] });
const cleanNarration = auditNarrationPerformance({ intendedText: 'Choisissez une carte Projet puis payez son coût.', transcriptText: 'Choisissez une carte Projet, puis payez son coût.', durationSec: 4 });
const badNarration = auditNarrationPerformance({ intendedText: 'Choisissez une carte Projet puis payez son coût.', transcriptText: 'Choisissez une carte carte Projet puis payez son coût.', durationSec: 4 });
const genericFiles = [
  'src/services/visualPlan.cjs', 'src/services/sourceDetailLineage.cjs', 'src/services/narrationPerformanceQa.cjs',
  'src/services/tutorialAssemblyVisual.cjs', 'scripts/build-visual-storyboard-r5.mjs', 'scripts/assemble-knowledge-tutorial-r4.mjs',
].map((file) => path.join(ROOT, file));
const forbidden = /(?:7-wonders-duel|seven\s+wonders\s+duel|\bxref\s*[:=]\s*\d+)/ig;
const hardcodes = genericFiles.flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(forbidden)].map((match) => ({ file: path.relative(ROOT, file), token: match[0], index: match.index })));
const checks = {
  responsiveAssetAndReferentPlanPasses: valid.valid,
  severePanelUnderuseRejected: underused.violations.includes('severe-panel-under-utilization'),
  lowNativeDetailCannotHideInsideHdFrame: lowDetail.qualityState === 'SOURCE_DETAIL_FAIL' && lowDetail.violationCount > 0,
  staticCompleteFrameCannotBeReplacedByEmptyAnimationBase: completeFrame === 'reviewed-complete.png',
  realAnimationStillUsesItsBase: animatedFrame === 'motion-base.png',
  narrationContractAcceptsCleanTake: cleanNarration.status === 'PASS',
  narrationContractRejectsRepeatedWord: badNarration.violations.includes('repeated-word-or-false-start'),
  noSevenWondersLogicInSharedCode: hardcodes.length === 0,
};
const report = {
  contract: 'mobius-publishability-r10-bounded-generalization-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'tm-eng-bgg-fa0678822223',
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  checks,
  evidence: { plan, validation: valid, underused: underused.violations, lowDetail, completeFrame, animatedFrame, cleanNarration, badNarration, hardcodes },
  note: 'Bounded Terraforming Mars proof exercises shared mobile density, panel utilization, source-detail lineage, narration-performance and assembly-background contracts without a full render or provider call.',
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, checks, output: OUT }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
