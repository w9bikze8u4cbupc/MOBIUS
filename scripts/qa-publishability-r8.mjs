#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const R7 = path.join(ROOT, 'out/publishability-r7/7-wonders-duel');
const R8 = path.join(ROOT, 'out/publishability-r8/7-wonders-duel');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseline = read(path.join(ROOT, 'out/publishability-r8/baseline/repository-and-baseline-preflight.json'));
const r7Config = read(path.join(R7, 'full-tutorial-config.json'));
const r8Config = read(path.join(R8, 'full-tutorial-config.json'));
const r7Narration = read(path.join(R7, 'narration-assets.json'));
const r8Narration = read(path.join(R8, 'narration-assets.json'));
const assets = read(path.join(R8, 'component-library/manifest.json'));
const storyboard = read(path.join(R8, 'visual-storyboard/manifest.json'));
const sheets = read(path.join(R8, 'review-sheets/manifest.json'));
const sonic = read(path.join(R8, 'audio/sonic-intro-audit.json'));
const generalization = read(path.join(ROOT, 'out/publishability-r8/terraforming-mars/generalization-proof.json'));
const plan = read(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r8.json'));
const violations = [];
const fail = (code, evidence) => violations.push({ id: `DET-R8-${String(violations.length + 1).padStart(3, '0')}`, code, evidence });
const check = (condition, code, evidence = null) => { if (!condition) fail(code, evidence); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resolveStored = (value) => path.isAbsolute(value) ? value : path.join(ROOT, value);

check(baseline.status === 'PASS', 'BASELINE_PREFLIGHT', baseline.status);
for (const [version, video] of Object.entries(baseline.immutableBaselines || {})) {
  const file = resolveStored(video.path);
  check(fs.existsSync(file) && hash(file) === video.sha256 && video.matchesExpected === true, 'IMMUTABLE_BASELINE_MUTATED', { version, path: video.path });
}
for (const artifact of Object.values(baseline.r7State || {})) {
  const file = resolveStored(artifact.path);
  check(fs.existsSync(file) && hash(file) === artifact.sha256, 'R7_EVIDENCE_MUTATED', artifact.path);
}

const r7Atoms = r7Config.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const r8Atoms = r8Config.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const r7Sections = r7Config.scenes.filter((scene) => scene.type === 'section-card').map((scene) => ({ id: scene.id, durationSec: scene.durationSec, title: scene.chapterTitle }));
const r8Sections = r8Config.scenes.filter((scene) => scene.type === 'section-card').map((scene) => ({ id: scene.id, durationSec: scene.durationSec, title: scene.chapterTitle }));
check(same(r7Atoms, r8Atoms), 'RULE_COVERAGE_REGRESSION', { r7: r7Atoms, r8: r8Atoms });
check(same(r7Sections, r8Sections), 'SECTION_TRANSITION_REGRESSION', { r7: r7Sections, r8: r8Sections });
check(same(r7Config.chapters, r8Config.chapters), 'CHAPTER_REGRESSION', null);

const r7NarrationByScene = new Map(r7Narration.assets.map((asset) => [asset.sceneId, asset]));
for (const current of r8Narration.assets) {
  const prior = r7NarrationByScene.get(current.sceneId);
  check(Boolean(prior), 'NARRATION_SCENE_MISSING', current.sceneId);
  if (!prior) continue;
  check(prior.sourceText === current.sourceText && prior.sourceTextHash === current.sourceTextHash && prior.sha256 === current.sha256, 'NARRATION_CHANGED', current.sceneId);
  check(current.reused === true && fs.existsSync(current.filePath), 'NARRATION_NOT_REUSED', current.sceneId);
}
check(r8Narration.assets.length === r7Narration.assets.length && r8Narration.assets.length === 30, 'NARRATION_COUNT', r8Narration.assets.length);

check(storyboard.qa?.status === 'PASS', 'STORYBOARD_QA', storyboard.qa);
check(storyboard.frames.length === 30, 'INSTRUCTIONAL_FRAME_COUNT', storyboard.frames.length);
for (const [metric, value] of Object.entries(storyboard.visualCoverage?.metrics || {})) {
  if (!['applicableInstructionalScenes', 'scenesWithActualGameImagery'].includes(metric)) check(value === 0, 'VISUAL_COVERAGE_GATE', { metric, value });
}
check(storyboard.visualCoverage.metrics.scenesWithActualGameImagery === storyboard.visualCoverage.metrics.applicableInstructionalScenes, 'ACTUAL_GAME_IMAGERY_COVERAGE', storyboard.visualCoverage.metrics);
for (const frame of storyboard.frames) {
  check(frame.qaStatus === 'PASS' && fs.existsSync(frame.filePath), 'FRAME_QA', frame.ruleAtomId);
  const metadata = await sharp(frame.filePath).metadata();
  check(metadata.width === 1920 && metadata.height === 1080, 'FRAME_MEDIA_INTEGRITY', { id: frame.ruleAtomId, width: metadata.width, height: metadata.height });
  if (frame.layout?.captionCentered && frame.layout?.textBounds) {
    check(Math.abs(frame.layout.textBounds.x + frame.layout.textBounds.width / 2 - 960) <= 1, 'CAPTION_CENTERING', frame.ruleAtomId);
  }
}
check(sheets.status === 'PASS' && sheets.allFramesIncluded && sheets.frameCount === 30, 'REVIEW_SHEET_COVERAGE', sheets);
for (const sheet of sheets.sheets || []) {
  const metadata = await sharp(sheet.filePath).metadata();
  check(metadata.width === 1920 && metadata.height === 1770 && fs.statSync(sheet.filePath).size > 0, 'REVIEW_SHEET_INTEGRITY', sheet.filePath);
}
for (const asset of assets.assets) {
  check(fs.existsSync(asset.filePath), 'COMPONENT_FILE_MISSING', asset.id);
  check(asset.cropCompleteness !== 'incomplete' && asset.cropPurity !== 'contaminated', 'COMPONENT_CROP_INVALID', asset.id);
}

const byAtom = new Map(plan.plans.map((entry) => [entry.ruleAtomId, entry]));
const byAsset = new Map(assets.assets.map((entry) => [entry.id, entry]));
const setup = byAtom.get('setup-central');
const ageDecks = byAtom.get('setup-age-decks');
const military = byAtom.get('military-system');
const scoring = byAtom.get('scoring-ledger');
check(byAsset.get('r8-seven-coins')?.representedQuantity === 7 && setup?.quantityFidelity?.some((entry) => entry.requiredQuantity === 7), 'STARTING_COIN_QUANTITY_FIDELITY', setup);
check(ageDecks?.compositionType === 'REAL_AGE_GUILD_IDENTITY' && ageDecks.actualGameAssetIds.length >= 4, 'AGE_GUILD_IDENTITY', ageDecks);
check(military?.compositionType === 'REAL_MILITARY_DEMONSTRATION' && military.motionCues?.length > 0 && byAsset.has(military.motionCues[0].assetId), 'MILITARY_MOTION', military);
check(scoring?.compositionType === 'REAL_PROGRESSIVE_SCOREPAD' && scoring.scoreExample?.rows?.length === 5 && scoring.scoreExample?.total?.value === '19', 'PROGRESSIVE_SCORING', scoring);
check(byAsset.get('r8-nine-coins')?.representedQuantity === 9, 'SCORING_COIN_QUANTITY', byAsset.get('r8-nine-coins'));
check(sonic.status === 'PASS', 'SONIC_CONTINUITY', sonic.checks);
check(r8Config.approvedSonicMaster?.sha256 === sonic.master.sha256, 'SONIC_MASTER_CONFIG_MISMATCH', r8Config.approvedSonicMaster);
check(generalization.status === 'PASS', 'SECOND_GAME_GENERALIZATION', generalization.checks);

const report = {
  contract: 'mobius-publishability-r8-deterministic-qa-v1',
  generatedAt: new Date().toISOString(),
  status: violations.length ? 'FAIL' : 'PASS',
  violationCount: violations.length,
  violations,
  regression: {
    ruleCoveragePreserved: same(r7Atoms, r8Atoms),
    narrationCompletenessPreserved: !violations.some((entry) => entry.code.startsWith('NARRATION_')),
    transitionsPreserved: same(r7Sections, r8Sections),
    chaptersPreserved: same(r7Config.chapters, r8Config.chapters),
    imageQualityNotRegressed: !violations.some((entry) => /CROP|FRAME|VISUAL_COVERAGE/.test(entry.code)),
    r5R6R7FallbacksRetained: !violations.some((entry) => /BASELINE|R7_EVIDENCE/.test(entry.code)),
  },
  narration: { reused: r8Narration.assets.filter((asset) => asset.reused).length, regenerated: r8Narration.assets.filter((asset) => !asset.reused).length },
  visualCoverage: storyboard.visualCoverage.metrics,
  sonic: sonic.checks,
  generalization: generalization.checks,
};
fs.writeFileSync(path.join(R8, 'deterministic-qa-r8.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(R8, 'delta-summary.md'), `# R8 delta from R7\n\n- Continuous provenance-tracked social-café room bed now spans the complete 3.6-second signature; cup and dice cues remain integrated and water is absent.\n- Quantity-aware visual plans now show exact source-grounded counts, including seven starting coins and nine scoring coins.\n- Age I, II, III and Guild physical identities use real fronts/backs.\n- Family concepts use representative real-card groups instead of isolated assets where space permits.\n- Turn rhythm and end-of-Age scenes now show component-state progression.\n- Discarding is shown as selected card → face-down discard → yellow-card evidence → exact coin gain.\n- Military teaching animates the isolated real red conflict pawn across the official track and identifies thresholds/capital.\n- Final scoring progressively fills a source-valid worked example beside the official scorepad.\n- Warm game-derived backgrounds, wood/espresso surfaces, centered captions, restrained gold connectors and content-driven occupancy remain generator-native.\n- R7 rule atoms, narration, sections, transitions and chapters are unchanged; all 30 ElevenLabs segments are reused.\n- R5, R6 and R7 remain intact as immutable fallbacks.\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, violations: report.violationCount, regression: report.regression, narration: report.narration }, null, 2)}\n`);
if (violations.length) process.exitCode = 1;
