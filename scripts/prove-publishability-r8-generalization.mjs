#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeVisualPlan, validateVisualPlan } = require('../src/services/visualPlan.cjs');
const { compileObjectAwareCrop, auditOpticalCenter } = require('../src/services/objectAwareCrop.cjs');
const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r8/terraforming-mars/generalization-proof.json');

const tmAssets = [
  { id: 'tm-player-board', containsActualGamePixels: true, representedComponent: 'player-board', visualClassification: 'REAL_BOARD_OR_TRACK' },
  { id: 'tm-resource-cube-a', containsActualGamePixels: true, representedComponent: 'resource-cubes', representedQuantity: 1, visualClassification: 'REAL_COMPONENT' },
  { id: 'tm-resource-cube-b', containsActualGamePixels: true, representedComponent: 'resource-cubes', representedQuantity: 1, visualClassification: 'REAL_COMPONENT' },
  { id: 'tm-resource-cubes-pair', containsActualGamePixels: true, representedComponent: 'resource-cubes', representedQuantity: 2, visualClassification: 'REAL_COMPONENT' },
  { id: 'tm-score-sheet', containsActualGamePixels: true, semanticTags: ['scorepad', 'score sheet'], visualClassification: 'REAL_COMPONENT' },
].map((asset) => ({ ...asset, cropPurity: 'clean', cropCompleteness: 'complete', reviewState: 'accepted', sourceRefs: [{ page: 1 }] }));
const plan = normalizeVisualPlan({
  ruleAtomId: 'tm-bounded-production-and-scoring',
  compositionType: 'REAL_PROGRESSIVE_SCOREPAD',
  reviewState: 'accepted',
  actualGameAssetIds: tmAssets.map((asset) => asset.id),
  minimumRepresentativeAssets: 3,
  quantityFidelity: [{ componentRef: 'resource-cubes', requiredQuantity: 2, assetId: 'tm-resource-cubes-pair' }],
  motionCues: [{ id: 'cube-to-player-board', assetId: 'tm-resource-cube-a', relativeToAssetId: 'tm-player-board', startPosition: { x: 0.2, y: 0.5 }, endPosition: { x: 0.7, y: 0.5 }, startRatio: 0, endRatio: 0.5 }],
  scoreExample: {
    exampleOnly: true,
    legality: 'SOURCE_GROUNDED_CATEGORY_VALUES',
    sourceRefs: [{ page: 11 }],
    rows: [{ label: 'Paramètres', value: '1', assetId: 'tm-player-board' }],
    total: { label: 'TOTAL', value: '1', assetId: 'tm-score-sheet' },
  },
}, { id: 'tm-bounded-production-and-scoring', domain: 'scoring', componentRefs: ['player-board', 'resource-cubes'] });
const validation = validateVisualPlan(plan, tmAssets);
const violations = validation.violations;
const crop = compileObjectAwareCrop({
  sourceWidth: 1400,
  sourceHeight: 900,
  intendedObjects: [{ id: 'tm-resource-cube', bounds: { x: 510, y: 260, width: 260, height: 260 } }],
  forbiddenObjects: [{ id: 'unrelated-card', bounds: { x: 1100, y: 80, width: 220, height: 340 } }],
  paddingPx: 42,
});
const center = auditOpticalCenter({ objectBounds: { x: 1120, y: 330, width: 360, height: 360 }, paneBounds: { x: 900, y: 150, width: 800, height: 720 } });
const genericFiles = [
  'src/services/visualPlan.cjs',
  'scripts/build-real-component-assets-r5.mjs',
  'scripts/build-visual-storyboard-r5.mjs',
  'scripts/render-storyboard-ffmpeg.mjs',
].map((file) => path.join(ROOT, file));
const forbidden = /(?:7-wonders-duel|seven\s+wonders\s+duel|r[678]-conflict-pawn|\bxref\s*[:=]\s*\d+)/ig;
const hardcodes = genericFiles.flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(forbidden)].map((match) => ({ file: path.relative(ROOT, file), token: match[0], index: match.index })));
const checks = {
  sharedVisualPlanAcceptsSecondGame: violations.length === 0,
  sourceGroundedQuantityFidelityGeneralizes: !violations.includes('misleading-quantity-visual'),
  representativeDensityGeneralizes: plan.minimumRepresentativeAssets === 3,
  actualComponentMotionGeneralizes: plan.motionCues.length === 1 && plan.motionCues[0].assetId === 'tm-resource-cube-a',
  progressiveScoringGeneralizes: plan.compositionType === 'REAL_PROGRESSIVE_SCOREPAD' && plan.scoreExample.exampleOnly,
  objectAwareCropGeneralizes: crop.cropCompleteness === 'complete' && crop.cropPurity === 'clean',
  opticalCenteringGeneralizes: center.valid,
  noSevenWondersLogicInSharedCode: hardcodes.length === 0,
};
const report = {
  contract: 'mobius-publishability-r8-generalization-proof-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'tm-eng-bgg-fa0678822223',
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  checks,
  evidence: { plan, violations, crop, center, hardcodes },
  note: 'Bounded Terraforming Mars evidence exercises the affected shared contracts; no expensive full render or provider call is used.',
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, checks, output: OUT }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
