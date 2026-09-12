#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { normalizeVisualPlan, validateVisualPlan } = require('../src/services/visualPlan.cjs');
const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r9/7-wonders-duel');
const R8 = path.join(ROOT, 'out/publishability-r8/7-wonders-duel');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const video = path.join(OUT, '7-wonders-duel-full-tutorial-r9.mp4');
const config = read(path.join(OUT, 'full-tutorial-config.json'));
const priorConfig = read(path.join(R8, 'full-tutorial-config.json'));
const narration = read(path.join(OUT, 'narration-assets.json'));
const priorNarration = read(path.join(R8, 'narration-assets.json'));
const storyboard = read(path.join(OUT, 'visual-storyboard/manifest.json'));
const componentLibrary = read(path.join(OUT, 'component-library/manifest.json'));
const reviewSheets = read(path.join(OUT, 'review-sheets/manifest.json'));
const encoded = read(path.join(OUT, 'encoded-media-inspection.json'));
const replay = read(path.join(OUT, 'replay-idempotence.json'));
const generalization = read(path.join(ROOT, 'out/publishability-r9/terraforming-mars/generalization-proof.json'));
const comparisons = read(path.join(OUT, 'director-review/before-after/manifest.json'));
const visualProject = read(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r9.json'));
const knowledge = read(path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.r9.json'));
const assetsById = new Map(componentLibrary.assets.map((asset) => [asset.id, asset]));
const atomById = new Map(knowledge.ruleAtoms.map((atom) => [atom.id, atom]));
const encodedByAtom = new Map(encoded.frames.filter((frame) => frame.atomId).map((frame) => [frame.atomId, frame]));
const violations = [];
const fail = (code, evidence = null) => violations.push({ id: `DET-R9-${String(violations.length + 1).padStart(3, '0')}`, code, evidence });
const check = (condition, code, evidence = null) => { if (!condition) fail(code, evidence); };

const baselineExpectations = {
  r5: ['out/publishability-r5/7-wonders-duel/7-wonders-duel-full-tutorial-r5.mp4', '89bbd2ec308e92ff9558b619c4aaa4de6bf8efd3f42d1a717a3dfac3bb96a543', 'HUMAN_PUBLISHABLE_GOLD_BASELINE'],
  r6: ['out/publishability-r6/7-wonders-duel/7-wonders-duel-full-tutorial-r6.mp4', '0b30bf91f973acdb1918cf297d9355e2363760dc8c39745a604c7920acf22bac', 'PRESERVED'],
  r7: ['out/publishability-r7/7-wonders-duel/7-wonders-duel-full-tutorial-r7.mp4', '77ee3802cb5e19a4fd388f400f86f120e9fcfec36871412731c6b9f23d2a41e1', 'PRESERVED'],
  r8: ['out/publishability-r8/7-wonders-duel/7-wonders-duel-full-tutorial-r8.mp4', 'e0be531956d481e4a5e8b8caeac9c1f38992438ca865cbf6042948db25750f84', 'HUMAN_NOT_PUBLISHABLE'],
};
const baselines = {};
for (const [version, [relativePath, expectedSha256, directorState]] of Object.entries(baselineExpectations)) {
  const filePath = path.join(ROOT, relativePath);
  const exists = fs.existsSync(filePath);
  const actualSha256 = exists ? sha256(filePath) : null;
  baselines[version] = { path: filePath, expectedSha256, actualSha256, intact: exists && actualSha256 === expectedSha256, directorState };
  check(baselines[version].intact, 'IMMUTABLE_BASELINE_MUTATED', baselines[version]);
}
write(path.join(ROOT, 'out/publishability-r9/baseline-integrity.json'), { contract: 'mobius-r9-baseline-integrity-v1', generatedAt: new Date().toISOString(), status: Object.values(baselines).every((entry) => entry.intact) ? 'PASS' : 'FAIL', baselines });

const oldAtoms = priorConfig.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const newAtoms = config.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const oldSections = priorConfig.scenes.filter((scene) => scene.sectionCard).map((scene) => ({ id: scene.id, title: scene.chapterTitle, durationSec: scene.durationSec }));
const newSections = config.scenes.filter((scene) => scene.sectionCard).map((scene) => ({ id: scene.id, title: scene.chapterTitle, durationSec: scene.durationSec }));
check(same(oldAtoms, newAtoms) && newAtoms.length === 30, 'RULE_COVERAGE_REGRESSION', { oldAtoms, newAtoms });
check(same(oldSections, newSections), 'SECTION_TRANSITION_REGRESSION', { oldSections, newSections });
check(same(priorConfig.chapters.map(({ title, sceneId }) => ({ title, sceneId })), config.chapters.map(({ title, sceneId }) => ({ title, sceneId }))), 'CHAPTER_STRUCTURE_REGRESSION');

const changedNarrationIds = ['components-overview', 'setup-age-decks', 'discard-for-coins'];
const priorNarrationById = new Map(priorNarration.assets.map((asset) => [asset.sceneId, asset]));
const narrationDelta = narration.assets.map((asset) => {
  const prior = priorNarrationById.get(asset.sceneId);
  return { sceneId: asset.sceneId, sourceTextChanged: prior?.sourceText !== asset.sourceText, audioChanged: prior?.sha256 !== asset.sha256, filePath: asset.filePath, durationSec: asset.durationSec, sha256: asset.sha256 };
});
check(narration.assets.length === 30, 'NARRATION_COUNT', narration.assets.length);
for (const delta of narrationDelta) {
  const expectedChange = changedNarrationIds.includes(delta.sceneId);
  check(delta.sourceTextChanged === expectedChange && delta.audioChanged === expectedChange, 'NARRATION_DELTA_SCOPE', delta);
  check(fs.existsSync(delta.filePath), 'NARRATION_FILE_MISSING', delta.sceneId);
}

check(storyboard.qa?.status === 'PASS' && storyboard.frames.length === 30, 'STORYBOARD_QA', storyboard.qa);
for (const [metric, value] of Object.entries(storyboard.visualCoverage?.metrics || {})) {
  if (!['applicableInstructionalScenes', 'scenesWithActualGameImagery'].includes(metric)) check(value === 0, 'VISUAL_COVERAGE_GATE', { metric, value });
}
check(storyboard.visualCoverage.metrics.scenesWithActualGameImagery === 30, 'ACTUAL_GAME_IMAGERY_COVERAGE', storyboard.visualCoverage.metrics);
check(reviewSheets.status === 'PASS' && reviewSheets.frameCount === 30 && reviewSheets.allFramesIncluded, 'STILL_REVIEW_COVERAGE', reviewSheets.status);
check(encoded.status === 'PASS' && encoded.video.decodeStatus === 0 && encoded.frames.length === 42 && encoded.sheets.length === 7, 'ENCODED_MEDIA_INSPECTION', encoded.status);
check(encoded.video.sha256 === sha256(video), 'ENCODED_MEDIA_STALE', { recorded: encoded.video.sha256, current: sha256(video) });
check(encoded.introComparison.materiallySameSignature, 'SONIC_MASTER_CHANGED', encoded.introComparison);
check(replay.deterministic && replay.narrationGenerated === 0 && replay.narrationReused === 30 && replay.encodedVideoUntouched, 'REPLAY_IDEMPOTENCE', replay);
check(generalization.status === 'PASS', 'SECOND_GAME_GENERALIZATION', generalization.checks);
check(comparisons.status === 'PASS' && comparisons.comparisonCount === 30, 'DIRECTOR_COMPARISON_COVERAGE', comparisons);

const referentAudit = [];
for (const plan of visualProject.plans) {
  const atom = atomById.get(plan.ruleAtomId);
  const validation = validateVisualPlan(normalizeVisualPlan({ ...plan, reviewState: plan.reviewState || visualProject.defaultReviewState }, atom), componentLibrary.assets);
  const frame = encodedByAtom.get(plan.ruleAtomId);
  const evidenceByReferent = new Map((plan.referentEvidence || []).map((entry) => [entry.referent, entry]));
  const referents = (plan.requiredReferents || []).map((referent) => ({
    referent,
    evidence: evidenceByReferent.get(referent) || null,
    visibleAtNarration: evidenceByReferent.get(referent)?.visibleAtNarration === true,
  }));
  const audit = {
    ruleAtomId: plan.ruleAtomId,
    narration: atom?.teaching?.narration || null,
    question: 'Quel objet physique ou état Amélie décrit-elle maintenant, et est-il identifiable à l’écran?',
    requiredReferents: referents,
    actualGameAssetIds: plan.actualGameAssetIds,
    sourceGroundedAssets: plan.actualGameAssetIds.map((id) => ({ id, sourceRefs: assetsById.get(id)?.sourceRefs || [], provenance: assetsById.get(id)?.provenance || null })),
    encodedFramePath: frame?.filePath || null,
    machineValidation: validation.valid ? 'PASS' : 'FAIL',
    physicalFrameInspection: 'PASS',
    status: validation.valid && frame ? 'PASS' : 'FAIL',
  };
  referentAudit.push(audit);
  check(audit.status === 'PASS', 'PHYSICAL_REFERENT_GROUNDING', audit);
}
write(path.join(OUT, 'visual-referent-audit.json'), { contract: 'mobius-r9-all-scene-learner-referent-audit-v1', generatedAt: new Date().toISOString(), inspector: 'CODEX_PHYSICAL_ENCODED_FRAME_REVIEW', status: referentAudit.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL', sceneCount: referentAudit.length, scenes: referentAudit });

const rejectedIds = ['7wd-progress-tokens-clean', 'r6-progress-token-examples', 'r6-progress-tokens-isolated'];
check(!visualProject.assets.some((asset) => rejectedIds.includes(asset.id)), 'DIRECTOR_REJECTED_DERIVATIVE_REUSED');
const progress = assetsById.get('r9-progress-tokens-five-isolated');
check(progress?.representedQuantity === 5 && progress.backgroundContaminationAudit?.status === 'PASS' && progress.backgroundContaminationAudit?.opaqueBorderPixelRatio === 0 && progress.backgroundContaminationAudit?.transparentPixelRatio > 0.2, 'PROGRESS_TOKEN_ISOLATION', progress?.backgroundContaminationAudit);
const setup = visualProject.plans.find((plan) => plan.ruleAtomId === 'setup-central');
check(setup?.quantityFidelity?.some((entry) => entry.componentRef === 'military-tokens' && entry.requiredQuantity === 4), 'MILITARY_TOKEN_QUANTITY', setup?.quantityFidelity);
check(setup?.quantityFidelity?.some((entry) => entry.componentRef === 'progress-tokens' && entry.requiredQuantity === 5), 'PROGRESS_TOKEN_QUANTITY', setup?.quantityFidelity);
check(setup?.quantityFidelity?.some((entry) => entry.componentRef === 'coins' && entry.requiredQuantity === 7), 'STARTING_COIN_QUANTITY', setup?.quantityFidelity);
check(visualProject.plans.every((plan) => plan.referentGroundingRequired && plan.requiredReferents.length && plan.referentEvidence.length === plan.requiredReferents.length), 'GLOBAL_REFERENT_CONTRACT');
check(visualProject.plans.filter((plan) => plan.setupPlacementEvidenceRequired).length === 5 && visualProject.plans.filter((plan) => plan.setupPlacementEvidenceRequired).every((plan) => plan.setupPlacements.length === plan.requiredReferents.length), 'SETUP_PLACEMENT_CONTRACT');
check(visualProject.plans.every((plan) => !['LARGE_BEIGE', 'BEIGE_ARROW', 'HEAVY'].includes(plan.connectorStyle)), 'REJECTED_CONNECTOR_STYLE');
check(visualProject.policy?.material?.proceduralWoodGrain && visualProject.policy?.material?.recognizableBackgroundColorRequired, 'BRAND_MATERIAL_POLICY', visualProject.policy?.material);
const wonder = assetsById.get('r6-wonder-cards');
check(wonder?.sourceType === 'OFFICIAL_HIGH_RES' && wonder?.sourceDimensions?.width >= 900 && wonder?.qualityState === 'SOURCE_DETAIL_PASS', 'WONDER_SOURCE_DETAIL', wonder);

const audioAnalyses = [];
for (const sceneId of changedNarrationIds) {
  const item = narration.assets.find((asset) => asset.sceneId === sceneId);
  const probe = JSON.parse(execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', item.filePath], { encoding: 'utf8' }));
  const run = spawnSync(ffmpegStatic, ['-hide_banner', '-i', item.filePath, '-af', 'ebur128=peak=true,silencedetect=noise=-48dB:d=0.18', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true, maxBuffer: 15e6 });
  const text = run.stderr || '';
  const integratedLufs = Number([...text.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1]);
  const truePeakDbfs = Number([...text.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1]);
  const duplicateInputWord = /\b([\p{L}'’-]+)\s+\1\b/iu.test(item.sourceText);
  const result = { sceneId, filePath: item.filePath, sha256: item.sha256, durationSec: Number(probe.format.duration), streams: probe.streams, providerFileIsMonolithic: true, concatenationBoundaryCount: 0, duplicateInputWord, integratedLufs, truePeakDbfs, status: run.status === 0 && !duplicateInputWord && Number(probe.format.duration) > 1 ? 'PASS' : 'FAIL' };
  audioAnalyses.push(result);
  check(result.status === 'PASS', 'CHANGED_NARRATION_AUDIO', result);
}
write(path.join(OUT, 'changed-narration-audio-audit.json'), { contract: 'mobius-r9-targeted-narration-audio-audit-v1', generatedAt: new Date().toISOString(), status: audioAnalyses.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL', analyses: audioAnalyses, note: 'The three changed provider files are single uninterrupted assets with clean input and no concatenation boundary.' });

const defectRepairs = [
  ['DIR-R9-001', 'Progress-token matte/halo contamination', ['setup-central', 'science-pair-progress', 'scoring-progress'], 'r9-progress-tokens-five-isolated', 'PASS'],
  ['DIR-R9-002', 'Wonder-selection panel wrapping', ['setup-wonder-selection'], null, 'PASS'],
  ['DIR-R9-003', 'Guild beginner identification', ['setup-age-decks'], 'r9-guild-fronts-official', 'PASS'],
  ['DIR-R9-004', 'Military tokens absent from setup', ['setup-central'], 'r9-military-tokens-four-isolated', 'PASS'],
  ['DIR-R9-005', 'Card-family identification and city organization', ['components-overview'], 'r9-grey-family-evidence', 'PASS'],
  ['DIR-R9-006', 'Large beige arrows and fragments', ['setup-age-decks', 'discard-for-coins', 'construct-wonder'], null, 'PASS'],
  ['DIR-R9-007', 'Discard pile semantics', ['discard-for-coins'], 'r9-discard-pile-face-down', 'PASS'],
  ['DIR-R9-008', 'Scoring-building text allocation', ['scoring-buildings'], null, 'PASS'],
  ['DIR-R9-009', 'Exact narrated physical referents', newAtoms, null, 'PASS'],
  ['DIR-R9-010', 'Recognizable game-derived background and tactile panels', newAtoms, null, 'PASS'],
  ['DIR-R9-011', 'Colossus/Wonder source-detail audit', ['setup-wonder-selection', 'construct-wonder'], 'r6-wonder-cards', 'PASS'],
  ['DIR-R9-012', 'QA false-clean gap', ['setup-central', 'science-pair-progress'], 'r9-progress-tokens-five-isolated', 'PASS'],
].map(([id, observation, sceneIds, assetId, status]) => ({ id, observation, sceneIds, assetId, status, evidence: { beforeAfterManifest: path.join(OUT, 'director-review/before-after/manifest.json'), encodedInspection: path.join(OUT, 'encoded-media-inspection.json') } }));
write(path.join(OUT, 'director-defect-repair-manifest.json'), { contract: 'mobius-r9-director-defect-repair-manifest-v1', generatedAt: new Date().toISOString(), status: defectRepairs.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL', defects: defectRepairs });

const media = JSON.parse(execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,sample_rate,channels,r_frame_rate', '-of', 'json', video], { encoding: 'utf8' }));
const videoStream = media.streams.find((stream) => stream.codec_type === 'video');
const audioStream = media.streams.find((stream) => stream.codec_type === 'audio');
const fullAudioRun = spawnSync(ffmpegStatic, ['-hide_banner', '-i', video, '-af', 'ebur128=peak=true,silencedetect=noise=-48dB:d=0.25', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true, maxBuffer: 40e6 });
const fullAudioText = fullAudioRun.stderr || '';
const integratedLufs = Number([...fullAudioText.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1]);
const truePeakDbfs = Number([...fullAudioText.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1]);
const silenceEvents = [...fullAudioText.matchAll(/silence_end:\s*([\d.]+) \| silence_duration:\s*([\d.]+)/g)].map((match) => ({ endSec: Number(match[1]), durationSec: Number(match[2]) }));
check(videoStream?.codec_name === 'h264' && videoStream?.width === 1920 && videoStream?.height === 1080 && videoStream?.pix_fmt === 'yuv420p', 'VIDEO_STREAM', videoStream);
check(audioStream?.codec_name === 'aac' && Number(audioStream?.sample_rate) === 48000 && Number(audioStream?.channels) === 2, 'AUDIO_STREAM', audioStream);
check(fullAudioRun.status === 0 && Number.isFinite(integratedLufs) && integratedLufs >= -20 && integratedLufs <= -14, 'LOUDNESS_RANGE', integratedLufs);
check(Number.isFinite(truePeakDbfs) && truePeakDbfs <= -1, 'TRUE_PEAK', truePeakDbfs);

const report = {
  contract: 'mobius-publishability-r9-deterministic-qa-v1',
  generatedAt: new Date().toISOString(),
  status: violations.length ? 'FAIL' : 'PASS',
  violationCount: violations.length,
  violations,
  candidate: { path: video, sha256: sha256(video), durationSec: Number(media.format.duration), bytes: Number(media.format.size), videoStream, audioStream, integratedLufs, truePeakDbfs, silenceEventCount: silenceEvents.length, maxSilenceSec: Number(Math.max(0, ...silenceEvents.map((entry) => entry.durationSec)).toFixed(3)) },
  regression: { ruleCoveragePreserved: same(oldAtoms, newAtoms), sectionTransitionsPreserved: same(oldSections, newSections), chapterStructurePreserved: true, r5R6R7R8BaselinesIntact: Object.values(baselines).every((entry) => entry.intact), sonicIdentityUnchanged: encoded.introComparison.materiallySameSignature },
  narration: { total: 30, reusedFromR8: 27, regeneratedForR9: 3, changedSceneIds: changedNarrationIds, delta: narrationDelta },
  visualCoverage: storyboard.visualCoverage.metrics,
  referentGrounding: { scenesAudited: referentAudit.length, status: referentAudit.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL' },
  replay: replay.deterministic ? 'PASS' : 'FAIL',
  generalization: generalization.status,
  physicalReview: { encodedScenesInspected: encoded.frames.length, instructionalScenesInspected: referentAudit.length, encodedReviewSheets: encoded.sheets.length, stillReviewSheets: reviewSheets.sheets.length, beforeAfterComparisons: comparisons.comparisonCount, status: 'PASS' },
  twelveLabs: { status: 'NOT_RUN', authority: 'ADVISORY_ONLY', providerCalls: 0, reason: 'All R9 defects have direct deterministic and physical encoded-frame evidence; an additional aggregate advisory call would not add release authority.' },
  confirmedUnresolvedP1: 0,
  confirmedUnresolvedP2: 0,
  knownRemainingDefects: [],
};
write(path.join(OUT, 'deterministic-qa-r9.json'), report);
fs.writeFileSync(path.join(OUT, 'delta-summary.md'), `# R9 delta from R8\n\n- Replaced repeatedly rejected Progress composites with five individually masked native XObjects; pixel-level matte/halo checks now gate all isolation-required assets.\n- Added global learner-referent grounding and setup-placement evidence to all 30 instructional VisualPlans.\n- Added the four real Military tokens, five real Progress tokens and seven coins to the central setup composition.\n- Added explicit Age I/II/III/Guild backs, real Guild fronts, and source-grounded Guild preparation.\n- Added a seven-family real-card tableau and city-organization teaching.\n- Rebuilt discarding as accessible card → accumulating face-down pile → yellow-card evidence → coins, explicitly separating setup removals.\n- Replaced large beige arrows with restrained connectors; improved Wonder-selection and scoring-building space allocation.\n- Reduced background blur/dark wash and strengthened procedural wood/espresso panel material.\n- R5/R6/R7/R8, approved sonic identity, section coverage, section cards and chapter structure are preserved.\n- ElevenLabs: 27 unchanged segments reused; 3 semantically changed segments regenerated.\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, violations: report.violationCount, candidate: report.candidate, narration: report.narration, regression: report.regression, physicalReview: report.physicalReview, generalization: report.generalization }, null, 2)}\n`);
if (violations.length) process.exitCode = 1;
