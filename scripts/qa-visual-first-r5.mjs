#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertAssetFiles } = require('../src/services/visualPlan.cjs');
const ROOT = path.resolve(process.cwd());

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    out[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return out;
}
const absolute = (value) => path.isAbsolute(value) ? path.resolve(value) : path.resolve(ROOT, value);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const args = parseArgs();
if (!args.manifest || !args.r4 || !args.out) throw new Error('Usage: --manifest <R5 storyboard manifest> --r4 <R4 audit> [--physical <review.json>] --out <qa-report.json>');
const manifest = readJson(absolute(args.manifest));
const r4 = readJson(absolute(args.r4));
const physical = args.physical && fs.existsSync(absolute(args.physical)) ? readJson(absolute(args.physical)) : null;
const violations = [];
const add = (code, sceneId, evidence) => violations.push({ id: `DET-R5-${String(violations.length + 1).padStart(3, '0')}`, code, sceneId, evidence });

if (r4.status !== 'FAIL') add('R4_NEGATIVE_GATE_DID_NOT_FAIL', null, `R4 status=${r4.status}`);
if (manifest.qa?.status !== 'PASS') for (const item of manifest.qa?.violations || []) add('STORYBOARD_QA', item.sceneId, item.violation);
for (const missing of assertAssetFiles(manifest.assets || [])) add('MISSING_ACCEPTED_VISUAL', missing.assetId, missing.violation);

for (const frame of manifest.frames || []) {
  if (frame.width !== 1920 || frame.height !== 1080) add('FRAME_DIMENSIONS', frame.sceneId, `${frame.width}x${frame.height}`);
  if (!frame.containsActualGamePixels) add('ACTUAL_GAME_PIXELS_MISSING', frame.sceneId, frame.visualClassification);
  if (!(frame.actualGameAssetIds || []).length) add('ACTUAL_ASSET_BINDING_MISSING', frame.sceneId, 'No actualGameAssetIds');
  if (!(frame.sourceRefs || []).length) add('SOURCE_REFERENCE_MISSING', frame.sceneId, 'No sourceRefs');
  if (frame.cropPurity !== 'clean') add('CROP_CONTAMINATION', frame.sceneId, frame.cropPurity);
  if (frame.cropCompleteness !== 'complete') add('CROP_INCOMPLETE', frame.sceneId, frame.cropCompleteness);
  if (frame.layout?.fit !== 'CONTAIN' || frame.layout?.centered !== true) add('VISUAL_ALIGNMENT', frame.sceneId, JSON.stringify(frame.layout));
  for (const bounds of frame.layout?.visualBounds || []) if (Number(bounds.scale) > 1.15) add('RASTER_ENLARGEMENT', frame.sceneId, `${bounds.assetId} scale=${bounds.scale}`);
  if (frame.textLineCount <= 2 && frame.textBounds?.height > 350) add('EMPTY_TEXT_PANEL', frame.sceneId, `lines=${frame.textLineCount}; height=${frame.textBounds.height}`);
  if ((frame.layout?.visualBounds || []).length === 1 && !frame.layout?.lowerZonePurpose) {
    const bounds = frame.layout.visualBounds[0];
    const region = frame.layout.visualRegion;
    const dx = Math.abs((bounds.x + bounds.width / 2) - (region.x + region.width / 2)) / region.width;
    const dy = Math.abs((bounds.y + bounds.height / 2) - (region.y + region.height / 2)) / region.height;
    if (dx > 0.08 || dy > 0.08) add('SINGLE_VISUAL_NOT_CENTERED', frame.sceneId, `dx=${dx.toFixed(3)}; dy=${dy.toFixed(3)}`);
  }
  if (frame.layout?.lowerZonePurpose && frame.layout.lowerZonePurpose !== 'instructional-track-callouts') {
    add('UNRECOGNIZED_LOWER_ZONE_PURPOSE', frame.sceneId, frame.layout.lowerZonePurpose);
  }
}

const requiredZeroMetrics = [
  'instructionalScenesWithoutActualGameAsset', 'textOnlyPhysicalRuleSceneCount',
  'abstractProxyAsComponentCount', 'genericColoredCircleComponentCount',
  'semanticallyWrongVisualCount', 'decorativeVisualSubstitutionCount',
  'cropContaminationCount', 'incompleteCropCount', 'unjustifiedRepeatedVisualCount',
];
for (const key of requiredZeroMetrics) if (Number(manifest.visualCoverage?.metrics?.[key] || 0) !== 0) add('VISUAL_COVERAGE_GATE', null, `${key}=${manifest.visualCoverage.metrics[key]}`);
if (manifest.visualCoverage?.metrics?.scenesWithActualGameImagery !== manifest.visualCoverage?.metrics?.applicableInstructionalScenes) add('REAL_COMPONENT_COVERAGE', null, JSON.stringify(manifest.visualCoverage?.metrics));

if (!physical) add('PHYSICAL_REVIEW_MISSING', null, 'Every instructional frame requires physical review.');
else {
  const reviews = new Map((physical.frames || []).map((item) => [item.ruleAtomId, item]));
  for (const frame of manifest.frames || []) {
    const review = reviews.get(frame.ruleAtomId);
    if (!review) add('PHYSICAL_REVIEW_MISSING', frame.sceneId, 'No review record.');
    else if (review.status !== 'PASS') add('PHYSICAL_REVIEW_FAILED', frame.sceneId, review.observation || review.status);
  }
}

const report = {
  contract: 'mobius-visual-first-deterministic-qa-v1',
  namespace: 'DET',
  generatedAt: new Date().toISOString(),
  status: violations.length ? 'FAIL' : 'PASS',
  violationCount: violations.length,
  violations,
  r4NegativeRegressionGate: r4.status === 'FAIL' ? 'PASS' : 'FAIL',
  metrics: manifest.visualCoverage?.metrics || {},
  physicalReview: physical ? { status: physical.status, reviewedFrames: physical.frames?.length || 0 } : { status: 'MISSING', reviewedFrames: 0 },
};
writeJson(absolute(args.out), report);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
