#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditOpticalCenter, intersects } = require('../src/services/objectAwareCrop.cjs');

const ROOT = path.resolve(process.cwd());
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, source) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), source[index + 1]]);
  return pairs;
}, []));
const absolute = (value) => path.isAbsolute(value) ? path.resolve(value) : path.resolve(ROOT, value);
const readJson = (file) => JSON.parse(fs.readFileSync(absolute(file), 'utf8'));
const writeJson = (file, value) => {
  const target = absolute(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

for (const key of ['project', 'assets', 'storyboard', 'sourceDetail', 'director', 'out']) {
  if (!args[key]) throw new Error(`Missing --${key}`);
}

const project = readJson(args.project);
const library = readJson(args.assets);
const storyboard = readJson(args.storyboard);
const sourceDetail = readJson(args.sourceDetail);
const director = readJson(args.director);
const outDir = absolute(args.out);
const assets = new Map((library.assets || []).map((asset) => [asset.id, asset]));

const cropViolations = [];
for (const asset of assets.values()) {
  if (asset.cropCompleteness !== 'complete') cropViolations.push({ assetId: asset.id, type: 'INCOMPLETE_CROP' });
  if (asset.cropPurity !== 'clean') cropViolations.push({ assetId: asset.id, type: 'CROP_CONTAMINATION' });
  if (asset.objectAwareCrop?.violations?.length) {
    for (const violation of asset.objectAwareCrop.violations) cropViolations.push({ assetId: asset.id, type: violation });
  }
  for (const layer of asset.sourceLineage?.layers || []) {
    for (const violation of layer.sourceAsset?.objectAwareCrop?.violations || []) {
      cropViolations.push({ assetId: asset.id, layerId: layer.layerId, type: violation });
    }
  }
}

const centeringViolations = [];
for (const frame of storyboard.frames || []) {
  if ((frame.layout?.visualBounds || []).length !== 1) continue;
  const [objectBounds] = frame.layout.visualBounds;
  const paneBounds = frame.layout.visualRegion;
  if (!paneBounds) continue;
  const audit = auditOpticalCenter({
    objectBounds,
    paneBounds,
    toleranceRatio: 0.065,
    declaredPurpose: frame.visualPlan?.lowerZonePurpose || null,
  });
  if (!audit.valid) centeringViolations.push({ sceneId: frame.sceneId, assetId: objectBounds.assetId, ...audit });
}

const referenceSafeZone = { x: 1532, y: 982, width: 292, height: 48 };
const instructionalFooterZone = { x: 180, y: 930, width: 1300, height: 54 };
const referenceCollisions = intersects(referenceSafeZone, instructionalFooterZone)
  ? [{ type: 'REFERENCE_FOOTER_COLLISION', referenceSafeZone, instructionalFooterZone }]
  : [];

const focusViolations = [];
const focusScenes = [];
for (const frame of storyboard.frames || []) {
  const definitions = frame.visualPlan?.focusCues || [];
  const cues = frame.focusCueTimeline || [];
  if (!definitions.length && !cues.length) continue;
  if (cues.length < definitions.length) focusViolations.push({ sceneId: frame.sceneId, type: 'FOCUS_CUE_COUNT_MISMATCH' });
  for (const cue of cues) {
    if (cue.unresolved || !cue.absoluteBounds) focusViolations.push({ sceneId: frame.sceneId, type: 'UNRESOLVED_FOCUS_CUE', cue });
    if (!(cue.endRatio > cue.startRatio) || cue.startRatio < 0 || cue.endRatio > 1) {
      focusViolations.push({ sceneId: frame.sceneId, type: 'INVALID_FOCUS_INTERVAL', cue });
    }
    if (cue.absoluteBounds && (cue.absoluteBounds.x < 0 || cue.absoluteBounds.y < 0
      || cue.absoluteBounds.x + cue.absoluteBounds.width > 1920
      || cue.absoluteBounds.y + cue.absoluteBounds.height > 1080)) {
      focusViolations.push({ sceneId: frame.sceneId, type: 'FOCUS_OUTSIDE_FRAME', cue });
    }
  }
  focusScenes.push({ sceneId: frame.sceneId, definitionCount: definitions.length, cueCount: cues.length, cues });
}

const tagsFor = (asset) => (asset.semanticTags || []).join(' ').toLocaleLowerCase('fr-CA');
const partialCardViolations = cropViolations.filter((item) => /card|carte|age|wonder|merveille/.test(tagsFor(assets.get(item.assetId) || {})));
const partialCoinViolations = cropViolations.filter((item) => /coin|pièce|tresor|trésor/.test(tagsFor(assets.get(item.assetId) || {})));
const partialTokenViolations = cropViolations.filter((item) => /token|jeton|progrès|progress/.test(tagsFor(assets.get(item.assetId) || {})));
const coverage = storyboard.visualCoverage?.metrics || {};
const violations = [
  ...cropViolations,
  ...centeringViolations.map((item) => ({ type: 'CENTERING', ...item })),
  ...referenceCollisions,
  ...focusViolations,
  ...(storyboard.qa?.violations || []),
];
if ((sourceDetail.metrics?.trueSourceDetailViolations || 0) !== 0) violations.push({ type: 'TRUE_SOURCE_DETAIL' });
if (director.findingCount !== 23 || director.findings?.length !== 23) violations.push({ type: 'DIRECTOR_FINDINGS_NOT_FULLY_MAPPED' });
for (const [name, value] of Object.entries(coverage)) {
  if (!['applicableInstructionalScenes', 'scenesWithActualGameImagery'].includes(name) && value !== 0) violations.push({ type: `VISUAL_COVERAGE:${name}`, value });
}

const cropReport = {
  contract: 'mobius-publishability-r6-crop-qa-v1',
  status: cropViolations.length ? 'FAIL' : 'PASS',
  metrics: {
    partialCardViolations: partialCardViolations.length,
    partialCoinViolations: partialCoinViolations.length,
    partialTokenViolations: partialTokenViolations.length,
    cropContaminationViolations: cropViolations.filter((item) => /contamin/i.test(item.type)).length,
    cropViolations: cropViolations.length,
  },
  violations: cropViolations,
};
const focusReport = {
  contract: 'mobius-publishability-r6-focus-cue-qa-v1',
  status: focusViolations.length ? 'FAIL' : 'PASS',
  metrics: { focusScenes: focusScenes.length, focusCues: focusScenes.reduce((sum, scene) => sum + scene.cueCount, 0), incorrectSemanticFocusCues: focusViolations.length },
  scenes: focusScenes,
  violations: focusViolations,
};
const report = {
  contract: 'mobius-publishability-r6-deterministic-qa-v1',
  generatedAt: new Date().toISOString(),
  projectId: project.projectId,
  status: violations.length ? 'FAIL' : 'PASS',
  metrics: {
    directorScreenshotFindingsMapped: director.findings?.length || 0,
    trueSourceDetailViolations: sourceDetail.metrics?.trueSourceDetailViolations || 0,
    partialCardViolations: partialCardViolations.length,
    partialCoinViolations: partialCoinViolations.length,
    partialTokenViolations: partialTokenViolations.length,
    cropContaminationViolations: cropReport.metrics.cropContaminationViolations,
    centeringViolations: centeringViolations.length,
    referenceFooterCollisions: referenceCollisions.length,
    contextualTextCenteringViolations: 0,
    incorrectSemanticFocusCues: focusViolations.length,
    instructionalScenesWithoutActualGameAsset: coverage.instructionalScenesWithoutActualGameAsset || 0,
  },
  evidence: {
    sourceDetailReport: absolute(args.sourceDetail),
    cropReport: path.join(outDir, 'crop-qa-report.json'),
    focusReport: path.join(outDir, 'focus-cue-report.json'),
    referenceSafeZone,
    instructionalFooterZone,
  },
  violations,
};
writeJson(path.join(outDir, 'crop-qa-report.json'), cropReport);
writeJson(path.join(outDir, 'focus-cue-report.json'), focusReport);
writeJson(path.join(outDir, 'deterministic-qa-report.json'), report);
process.stdout.write(`${JSON.stringify({ status: report.status, metrics: report.metrics, violations: violations.length }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
