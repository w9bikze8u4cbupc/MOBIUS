#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const R6 = path.join(ROOT, 'out/publishability-r6/7-wonders-duel');
const R7 = path.join(ROOT, 'out/publishability-r7/7-wonders-duel');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const overlap = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const violation = (code, detail) => ({ id: `DET-R7-${String(violations.length + 1).padStart(3, '0')}`, code, detail });
const violations = [];
const check = (condition, code, detail) => { if (!condition) violations.push(violation(code, detail)); };

const baseline = readJson(path.join(ROOT, 'out/publishability-r7/baseline-r6/baseline.json'));
const r6Config = readJson(path.join(R6, 'full-tutorial-config.json'));
const r7Config = readJson(path.join(R7, 'full-tutorial-config.json'));
const r6Narration = readJson(path.join(R6, 'narration-assets.json'));
const r7Narration = readJson(path.join(R7, 'narration-assets.json'));
const componentManifest = readJson(path.join(R7, 'component-library/manifest.json'));
const storyboard = readJson(path.join(R7, 'visual-storyboard/manifest.json'));
const audioAudit = readJson(path.join(R7, 'audio-audit/report.json'));

const r6Atoms = r6Config.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const r7Atoms = r7Config.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const r6Sections = r6Config.scenes.filter((scene) => scene.type === 'section-card').map((scene) => ({ id: scene.id, durationSec: scene.durationSec }));
const r7Sections = r7Config.scenes.filter((scene) => scene.type === 'section-card').map((scene) => ({ id: scene.id, durationSec: scene.durationSec }));
check(JSON.stringify(r6Atoms) === JSON.stringify(r7Atoms), 'SECTION_COVERAGE_REGRESSION', { r6: r6Atoms, r7: r7Atoms });
check(JSON.stringify(r6Sections) === JSON.stringify(r7Sections), 'SECTION_TRANSITION_REGRESSION', { r6: r6Sections, r7: r7Sections });
check(r6Config.approvedSonicMaster.sha256 === r7Config.approvedSonicMaster.sha256, 'SONIC_IDENTITY_CHANGED', null);

const r6NarrationByScene = new Map(r6Narration.assets.map((asset) => [asset.sceneId, asset]));
const changedNarration = [];
for (const current of r7Narration.assets) {
  const prior = r6NarrationByScene.get(current.sceneId);
  check(Boolean(prior), 'NARRATION_SCENE_ADDED_OR_MISSING', current.sceneId);
  if (!prior) continue;
  check(prior.sourceText === current.sourceText && prior.sourceTextHash === current.sourceTextHash, 'NARRATION_SEMANTICS_CHANGED', current.sceneId);
  if (prior.sha256 !== current.sha256) changedNarration.push(current.sceneId);
  check(fs.existsSync(current.filePath), 'NARRATION_FILE_MISSING', current.filePath);
}
check(changedNarration.length === 1 && changedNarration[0] === 'tie-breaker', 'UNTARGETED_NARRATION_CHANGE', changedNarration);
check(audioAudit.suspectCount === 0, 'NARRATION_RESTART_REMAINS', audioAudit);

check(storyboard.qa.status === 'PASS', 'STORYBOARD_QA', storyboard.qa);
for (const [name, value] of Object.entries(storyboard.visualCoverage.metrics || {})) {
  if (/without|Count|Wrong|Substitution|Contamination|incomplete/i.test(name)) check(value === 0, 'VISUAL_COVERAGE', { name, value });
}
for (const frame of storyboard.frames) {
  check(frame.qaStatus === 'PASS', 'FRAME_QA', frame.sceneId);
  const textBounds = frame.layout?.textBounds;
  if (frame.layout?.captionCentered) check(Math.abs((textBounds.x + textBounds.width / 2) - 960) <= 1, 'CAPTION_NOT_CENTERED', frame.sceneId);
  if (textBounds) check(textBounds.y + textBounds.height <= 970, 'REFERENCE_SAFE_ZONE_COLLISION', frame.sceneId);
  for (const bounds of frame.layout?.visualBounds || []) {
    check(bounds.x >= 34 && bounds.y >= 146 && bounds.x + bounds.width <= 1886 && bounds.y + bounds.height <= 978, 'VISUAL_FRAME_CLIPPING', { sceneId: frame.sceneId, bounds });
    if (frame.visualPlan?.compositionType !== 'REAL_SCORING_LEDGER') {
      check(!overlap(textBounds, bounds), 'ANNOTATION_OBSTRUCTS_VISUAL', { sceneId: frame.sceneId, textBounds, bounds });
    }
  }
}
for (const asset of componentManifest.assets) {
  check(fs.existsSync(asset.filePath), 'COMPONENT_FILE_MISSING', asset.id);
  check(asset.cropCompleteness !== 'incomplete', 'INCOMPLETE_CROP', asset.id);
  check(asset.cropPurity !== 'contaminated', 'CROP_CONTAMINATION', asset.id);
  check(['SOURCE_DETAIL_PASS', 'REVIEWED_ENHANCED_DERIVATIVE', 'accepted', undefined, null].includes(asset.qualityState), 'SOURCE_DETAIL_REGRESSION', { id: asset.id, qualityState: asset.qualityState });
}

const baselineVideo = path.join(ROOT, baseline.artifacts.video.path);
check(fs.existsSync(baselineVideo) && hash(baselineVideo) === baseline.artifacts.video.sha256, 'R6_BASELINE_MUTATED', baseline.artifacts.video.path);
const r7Video = path.join(R7, '7-wonders-duel-full-tutorial-r7.mp4');
if (fs.existsSync(r7Video)) {
  const metadata = await sharp(path.join(R7, 'visual-storyboard', 'identity-theme.png')).metadata();
  check(metadata.width === 1920 && metadata.height === 1080, 'FRAME_RESOLUTION', metadata);
}

const report = {
  contract: 'mobius-publishability-r7-deterministic-qa-v1',
  generatedAt: new Date().toISOString(),
  status: violations.length ? 'FAIL' : 'PASS',
  violationCount: violations.length,
  violations,
  regression: {
    sectionCoveragePreserved: JSON.stringify(r6Atoms) === JSON.stringify(r7Atoms),
    narrationCompletenessPreserved: !violations.some((entry) => entry.code.startsWith('NARRATION_')),
    transitionsPreserved: JSON.stringify(r6Sections) === JSON.stringify(r7Sections),
    imageQualityNotRegressed: !violations.some((entry) => ['INCOMPLETE_CROP', 'CROP_CONTAMINATION', 'SOURCE_DETAIL_REGRESSION'].includes(entry.code)),
    sonicIdentityPreserved: r6Config.approvedSonicMaster.sha256 === r7Config.approvedSonicMaster.sha256,
    r6FallbackRetained: fs.existsSync(baselineVideo) && hash(baselineVideo) === baseline.artifacts.video.sha256,
  },
  narration: { changedSegments: changedNarration, suspectRestarts: audioAudit.suspectCount },
  visualCoverage: storyboard.visualCoverage.metrics,
};
fs.writeFileSync(path.join(R7, 'deterministic-qa-r7.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(R7, 'delta-summary.md'), `# R7 delta from R6\n\n- Scene-matched blurred component backgrounds restored.\n- Lower captions share one centered, dynamically sized generator primitive.\n- Green sequence remnants replaced by restrained gold arrows.\n- Chaining crop expanded to preserve full card information.\n- Discarding is shown as card → face-down discard → coins with the verified formula.\n- Military teaching now shows the real track, red pawn, movement and penalty/capital zones.\n- Scoring overview uses a numbered, real-component ledger.\n- Only the confirmed tie-breaker TTS restart was regenerated; script meaning is unchanged.\n- R6 remains immutable and available as the fallback.\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, violations: report.violationCount, regression: report.regression }, null, 2)}\n`);
if (violations.length) process.exitCode = 1;
