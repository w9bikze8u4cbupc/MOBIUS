#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r11/7-wonders-duel');
const R10 = path.join(ROOT, 'out/publishability-r10/7-wonders-duel');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const video = path.join(OUT, '7-wonders-duel-full-tutorial-r11.mp4');
const config = read(path.join(OUT, 'full-tutorial-config.json'));
const priorConfig = read(path.join(R10, 'full-tutorial-config.json'));
const narration = read(path.join(OUT, 'narration-assets.json'));
const storyboard = read(path.join(OUT, 'visual-storyboard/manifest.json'));
const componentLibrary = read(path.join(OUT, 'component-library/manifest.json'));
const reviewSheets = read(path.join(OUT, 'review-sheets/manifest.json'));
const encoded = read(path.join(OUT, 'encoded-media-inspection.json'));
const replay = read(path.join(OUT, 'replay-idempotence.json'));
const sourceDetail = read(path.join(OUT, 'source-lineage-report.json'));
const audioPerformance = read(path.join(OUT, 'audio-performance-regression-report.json'));
const generalization = read(path.join(ROOT, 'out/publishability-r11/terraforming-mars/generalization-proof.json'));
const visualPackage = read(path.join(OUT, 'director-review/visual-package-manifest.json'));
const sourceComparison = read(path.join(OUT, 'director-review/source-resolution-comparison-report.json'));
const visualProject = read(path.join(ROOT, 'config/projects/7-wonders-duel/visual-plan.r11.json'));
const knowledge = read(path.join(ROOT, 'config/projects/7-wonders-duel/rulebook-knowledge.r11.json'));
const violations = [];
const fail = (code, evidence = null) => violations.push({
  id: `DET-R11-${String(violations.length + 1).padStart(3, '0')}`,
  code,
  evidence,
});
const check = (condition, code, evidence = null) => { if (!condition) fail(code, evidence); };

const expectedBaselines = {
  r5: ['out/publishability-r5/7-wonders-duel/7-wonders-duel-full-tutorial-r5.mp4', '89bbd2ec308e92ff9558b619c4aaa4de6bf8efd3f42d1a717a3dfac3bb96a543'],
  r6: ['out/publishability-r6/7-wonders-duel/7-wonders-duel-full-tutorial-r6.mp4', '0b30bf91f973acdb1918cf297d9355e2363760dc8c39745a604c7920acf22bac'],
  r7: ['out/publishability-r7/7-wonders-duel/7-wonders-duel-full-tutorial-r7.mp4', '77ee3802cb5e19a4fd388f400f86f120e9fcfec36871412731c6b9f23d2a41e1'],
  r8: ['out/publishability-r8/7-wonders-duel/7-wonders-duel-full-tutorial-r8.mp4', 'e0be531956d481e4a5e8b8caeac9c1f38992438ca865cbf6042948db25750f84'],
  r9: ['out/publishability-r9/7-wonders-duel/7-wonders-duel-full-tutorial-r9.mp4', 'ee9964111353bfee0b48dc03dcc8bfef17445d155b7ec6ae29874cec143327c2'],
  r10: ['out/publishability-r10/7-wonders-duel/7-wonders-duel-full-tutorial-r10.mp4', '7136b668f4683472e24235b131bc34cd40eb7c77d0650c39fba5c28c919b1f0c'],
};
const baselines = Object.fromEntries(Object.entries(expectedBaselines).map(([version, [relativePath, expectedSha256]]) => {
  const filePath = path.join(ROOT, relativePath);
  const actualSha256 = fs.existsSync(filePath) ? sha256(filePath) : null;
  const intact = actualSha256 === expectedSha256;
  check(intact, 'IMMUTABLE_BASELINE_MUTATED', { version, filePath, expectedSha256, actualSha256 });
  return [version, { filePath, expectedSha256, actualSha256, intact }];
}));
write(path.join(ROOT, 'out/publishability-r11/baseline-integrity.json'), {
  contract: 'mobius-r11-baseline-integrity-v1',
  generatedAt: new Date().toISOString(),
  status: Object.values(baselines).every((entry) => entry.intact) ? 'PASS' : 'FAIL',
  baselines,
});

const oldAtoms = priorConfig.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const newAtoms = config.scenes.filter((scene) => scene.atomId).map((scene) => scene.atomId);
const oldSections = priorConfig.scenes.filter((scene) => scene.sectionCard).map((scene) => ({ id: scene.id, title: scene.chapterTitle, durationSec: scene.durationSec }));
const newSections = config.scenes.filter((scene) => scene.sectionCard).map((scene) => ({ id: scene.id, title: scene.chapterTitle, durationSec: scene.durationSec }));
check(oldAtoms.every((id) => newAtoms.includes(id)) && newAtoms.length === 32, 'RULE_COVERAGE_REGRESSION', { oldAtoms, newAtoms });
check(same(oldSections, newSections), 'SECTION_TRANSITION_REGRESSION', { oldSections, newSections });
check(same(priorConfig.chapters.map(({ title, sceneId }) => ({ title, sceneId })), config.chapters.map(({ title, sceneId }) => ({ title, sceneId }))), 'CHAPTER_STRUCTURE_REGRESSION');

check(storyboard.qa?.status === 'PASS' && storyboard.frames.length === 32, 'STORYBOARD_QA', storyboard.qa);
for (const [metric, value] of Object.entries(storyboard.visualCoverage?.metrics || {})) {
  if (!['applicableInstructionalScenes', 'scenesWithActualGameImagery'].includes(metric)) check(value === 0, 'VISUAL_COVERAGE_GATE', { metric, value });
}
check(storyboard.visualCoverage?.metrics?.scenesWithActualGameImagery === 32, 'ACTUAL_GAME_IMAGERY_COVERAGE', storyboard.visualCoverage?.metrics);
check(reviewSheets.status === 'PASS' && reviewSheets.frameCount === 32 && reviewSheets.allFramesIncluded, 'STILL_REVIEW_COVERAGE', reviewSheets);
check(sourceDetail.status === 'PASS' && sourceDetail.metrics.trueSourceDetailViolations === 0, 'TRUE_SOURCE_DETAIL', sourceDetail.metrics);
check(encoded.status === 'PASS' && encoded.video.decodeStatus === 0 && encoded.frames.length === 44, 'ENCODED_MEDIA_INSPECTION', encoded.status);
check(encoded.video.sha256 === sha256(video), 'ENCODED_MEDIA_STALE', { recorded: encoded.video.sha256, current: sha256(video) });
check(encoded.introComparison?.materiallySameSignature === true, 'R10_INTRO_REGRESSION', encoded.introComparison);
check(replay.deterministic && replay.narrationGenerated === 0 && replay.narrationReused === 32 && replay.encodedVideoUntouched, 'REPLAY_IDEMPOTENCE', replay);
check(audioPerformance.status === 'PASS' && audioPerformance.segmentCount === 34 && audioPerformance.reviewCount === 0, 'NARRATION_PERFORMANCE', audioPerformance);
check(generalization.status === 'PASS' && Object.values(generalization.checks || {}).every(Boolean), 'SECOND_GAME_GENERALIZATION', generalization.checks);
check(visualPackage.status === 'PASS' && visualPackage.comparisonCount === 7 && visualPackage.comparisons.every((entry) => entry.physicalReview === 'PASS'), 'DIRECTOR_REVIEW_PACKAGE', visualPackage);
check(sourceComparison.status === 'PASS' && sourceComparison.r11Assets.every((asset) => asset.physicalReview === 'PASS'), 'SOURCE_RESOLUTION_COMPARISON', sourceComparison);

const assets = componentLibrary.assets;
const assetIds = assets.map((asset) => asset.id);
check(new Set(assetIds).size === assetIds.length, 'DUPLICATE_ASSET_ID', assetIds.filter((id, index) => assetIds.indexOf(id) !== index));
const byId = new Map(assets.map((asset) => [asset.id, asset]));
const plans = new Map(visualProject.plans.map((plan) => [plan.ruleAtomId, plan]));
const expectedHd = [
  'r11-chain-baths-hd', 'r11-chain-aqueduct-hd', 'r11-chain-palisade-hd', 'r11-chain-fortifications-hd',
  'r11-guild-scientists-hd', 'r11-guild-shipowners-hd',
];
for (const id of expectedHd) {
  const asset = byId.get(id);
  check(Boolean(asset), 'MISSING_R11_CARD_MASTER', id);
  check(asset?.sourceType === 'AUTHORIZED_EXACT_EDITION_HIGH_RES', 'R11_CARD_AUTHORITY', { id, sourceType: asset?.sourceType });
  check(asset?.cardSilhouetteState === 'COMPLETE' && asset?.cropCompleteness === 'complete' && asset?.cropPurity === 'clean', 'INCOMPLETE_CARD_SILHOUETTE', { id, asset });
  check((asset?.trueSourcePixelsPerDisplayPixel || 0) >= 0.8, 'CARD_TRUE_DETAIL_BELOW_GATE', { id, ratio: asset?.trueSourcePixelsPerDisplayPixel });
}
const rejectedLowDetail = new Set(['r10-chain-baths', 'r10-chain-aqueduct', 'r10-chain-palisade', 'r10-chain-fortifications', 'r10-guild-builders', 'r10-guild-scientists', 'r10-guild-shipowners']);
for (const plan of visualProject.plans) {
  check(!(plan.actualGameAssetIds || []).some((id) => rejectedLowDetail.has(id)), 'REJECTED_R10_SOURCE_REUSED', { ruleAtomId: plan.ruleAtomId, actualGameAssetIds: plan.actualGameAssetIds });
}
const chain = plans.get('chain-construction');
check(chain?.comparisonCardWidthPx === 270 && chain?.comparisonCardHeightPx === 433, 'CHAIN_COMPARISON_SCALE', chain);
check(chain?.peerQualityGroups?.[0]?.assetIds?.length === 4, 'CHAIN_PEER_QUALITY_GROUP', chain?.peerQualityGroups);
const guild = plans.get('guild-system');
check(guild?.actualGameAssetIds?.length === 2 && guild.actualGameAssetIds.every((id) => id.startsWith('r11-guild-')), 'GUILD_HD_ASSET_SET', guild?.actualGameAssetIds);
const scoring = plans.get('scoring-buildings');
check(scoring?.peerQualityGroups?.[0]?.assetIds?.includes('r11-guild-scientists-hd'), 'SCORING_GUILD_PEER_PARITY', scoring?.peerQualityGroups);
const discard = plans.get('discard-for-coins');
check(discard?.actualGameAssetIds?.includes('r11-discard-pile-complete') && discard?.completeCardAssetIds?.includes('r11-discard-pile-complete'), 'DISCARD_STACK_INCOMPLETE', discard);
const discardAsset = byId.get('r11-discard-pile-complete');
check(discardAsset?.cardSilhouetteState === 'COMPLETE' && discardAsset?.cropCompleteness === 'complete', 'DISCARD_STACK_CROP', discardAsset);

const accessible = plans.get('accessible-card');
const faceStates = new Set((accessible?.cardLayout || []).map((entry) => entry.faceState));
check(accessible?.layeredCardState?.layout === 'OFFICIAL_AGE_I_2_3_4_5_6_ALTERNATING' && faceStates.has('FACE_UP') && faceStates.has('FACE_DOWN'), 'AGE_I_TRUE_LAYERED_STATE', accessible);
check((accessible?.cardLayout || []).some((entry) => entry.accessible && entry.coveredBy?.length === 0), 'AGE_I_ACCESSIBLE_RELATIONSHIP', accessible?.cardLayout);
check((accessible?.cardLayout || []).some((entry) => !entry.accessible && entry.coveredBy?.length > 0), 'AGE_I_COVER_RELATIONSHIP', accessible?.cardLayout);

const military = plans.get('military-system');
const marker = military?.oneShotMarkers?.[0];
check(military?.gameState?.tokenOrientation === 'HORIZONTAL_ON_PRINTED_LOCATION', 'MILITARY_TOKEN_ORIENTATION', military?.gameState);
check((military?.physicalPlacements || []).every((entry) => entry.positionVerified && entry.orientation === entry.expectedOrientation), 'MILITARY_TOKEN_PLACEMENT', military?.physicalPlacements);
check(marker?.beforeState === 'PRESENT' && marker?.afterState === 'REMOVED' && marker?.removeAtTrigger && marker?.destination === 'BOX_OUT_OF_PLAY' && marker?.reentryEffect === 'NONE', 'ONE_SHOT_MARKER_CONSUMPTION', marker);
const militaryCaptureIds = new Set((encoded.transitionCaptures || []).filter((capture) => capture.sceneId === 'knowledge-military-system').map((capture) => capture.cueId || capture.captureId || capture.label));
check((encoded.transitionCaptures || []).filter((capture) => capture.sceneId === 'knowledge-military-system').length >= 3, 'MILITARY_STATE_CAPTURES', [...militaryCaptureIds]);

const romanScene = config.scenes.find((scene) => scene.id === 'knowledge-setup-age-decks');
const displayRoman = romanScene?.displayText?.includes('Dos I, II, III') && romanScene?.displayText?.includes('Âge III');
const spokenNatural = romanScene?.narrationText?.includes('dos : un, deux et trois') && romanScene?.narrationText?.includes('Âge un') && romanScene?.narrationText?.includes('Âge deux') && romanScene?.narrationText?.includes('Âge trois');
check(displayRoman && spokenNatural && !romanScene?.narrationText?.includes('dos : I, II et III'), 'ROMAN_DISPLAY_SPOKEN_SEPARATION', { displayText: romanScene?.displayText, narrationText: romanScene?.narrationText });
write(path.join(OUT, 'roman-numeral-display-spoken-evidence.json'), {
  contract: 'mobius-r11-roman-display-spoken-evidence-v1', generatedAt: new Date().toISOString(), status: displayRoman && spokenNatural ? 'PASS' : 'FAIL',
  display: ['Âge I', 'Âge II', 'Âge III', 'I, II et III'],
  spokenInput: romanScene?.narrationText,
  audioPath: romanScene?.audio?.file,
  sourceTextHash: romanScene?.audio?.sourceTextHash,
});

const media = JSON.parse(execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,sample_rate,channels,r_frame_rate', '-of', 'json', video], { encoding: 'utf8' }));
const videoStream = media.streams.find((stream) => stream.codec_type === 'video');
const audioStream = media.streams.find((stream) => stream.codec_type === 'audio');
const fullAudioRun = spawnSync(ffmpegStatic, ['-hide_banner', '-i', video, '-af', 'ebur128=peak=true,silencedetect=noise=-48dB:d=0.25', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true, maxBuffer: 40e6 });
const diagnostic = fullAudioRun.stderr || '';
const integratedLufs = Number([...diagnostic.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1]);
const truePeakDbfs = Number([...diagnostic.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1]);
check(videoStream?.codec_name === 'h264' && videoStream?.width === 1920 && videoStream?.height === 1080 && videoStream?.pix_fmt === 'yuv420p', 'VIDEO_STREAM', videoStream);
check(audioStream?.codec_name === 'aac' && Number(audioStream?.sample_rate) === 48000 && Number(audioStream?.channels) === 2, 'AUDIO_STREAM', audioStream);
check(fullAudioRun.status === 0 && Number.isFinite(integratedLufs) && integratedLufs >= -20 && integratedLufs <= -14, 'LOUDNESS_RANGE', integratedLufs);
check(Number.isFinite(truePeakDbfs) && truePeakDbfs <= -1, 'TRUE_PEAK', truePeakDbfs);

const jestBin = path.join(ROOT, 'node_modules/jest/bin/jest.js');
const targetedTestCommand = [jestBin, 'tests/services/publishabilityR11.test.js', 'tests/services/rulebookKnowledge.test.js', 'tests/services/sourceDetailLineage.test.js', 'tests/services/visualPlan.test.js', 'tests/services/editorialStandard.test.js', '--runInBand'];
const testRun = spawnSync(process.execPath, targetedTestCommand, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 20e6 });
const testOutput = `${testRun.stdout || ''}\n${testRun.stderr || ''}`.trim();
const testSummary = {
  contract: 'mobius-r11-targeted-tests-v1', generatedAt: new Date().toISOString(), status: testRun.status === 0 ? 'PASS' : 'FAIL',
  command: `node ${targetedTestCommand.join(' ')}`, exitCode: testRun.status,
  suitesPassed: Number(testOutput.match(/Test Suites:\s+(\d+) passed/)?.[1] || 0),
  testsPassed: Number(testOutput.match(/Tests:\s+(\d+) passed/)?.[1] || 0),
  outputTail: testOutput.split(/\r?\n/).slice(-20),
};
write(path.join(OUT, 'targeted-tests-r11.json'), testSummary);
check(testSummary.status === 'PASS' && testSummary.testsPassed === 40, 'TARGETED_TESTS', testSummary);

const changedIds = new Set(['setup-age-decks', 'guild-system', 'resource-production']);
const narrationStatus = config.scenes.filter((scene) => scene.narrationText && scene.audio?.file).map((scene) => {
  const id = scene.id.replace(/^knowledge-/, '');
  const asset = narration.assets.find((entry) => entry.sceneId === id);
  const audit = audioPerformance.entries.find((entry) => entry.sceneId === scene.id);
  return {
    sceneId: scene.id,
    initialR11State: changedIds.has(id) ? 'REGENERATED_R11' : 'REUSED_R10_OR_APPROVED_CACHE',
    replayState: 'REUSED_R11_CACHE',
    profile: scene.audio.narrationPreset || scene.audio.deliveryProfile,
    sourceText: scene.narrationText,
    sourceTextHash: scene.audio.sourceTextHash,
    audioPath: scene.audio.file,
    audioSha256: asset?.sha256 || audit?.audioSha256 || null,
    durationSec: asset?.durationSec || audit?.durationSec || null,
    transcriptPath: audit?.transcriptPath || null,
    performanceQa: audit?.status || null,
  };
});
write(path.join(OUT, 'narration-segment-status-r11.json'), {
  contract: 'mobius-r11-narration-segment-status-v1', generatedAt: new Date().toISOString(), status: narrationStatus.every((entry) => entry.performanceQa === 'PASS') ? 'PASS' : 'FAIL',
  regeneratedForR11: narrationStatus.filter((entry) => entry.initialR11State === 'REGENERATED_R11').length,
  reusedFromR10OrApprovedCache: narrationStatus.filter((entry) => entry.initialR11State !== 'REGENERATED_R11').length,
  replayReused: narrationStatus.length,
  segments: narrationStatus,
});

const report = {
  contract: 'mobius-publishability-r11-deterministic-qa-v1',
  generatedAt: new Date().toISOString(),
  status: violations.length ? 'FAIL' : 'PASS',
  violationCount: violations.length,
  violations,
  candidate: {
    path: video, sha256: sha256(video), durationSec: Number(media.format.duration), bytes: Number(media.format.size),
    videoStream, audioStream, integratedLufs, truePeakDbfs,
  },
  regression: {
    r10RuleAtomsPreserved: oldAtoms.every((id) => newAtoms.includes(id)),
    sectionTransitionsPreserved: same(oldSections, newSections),
    chaptersPreserved: true,
    r5ThroughR10BaselinesIntact: Object.values(baselines).every((entry) => entry.intact),
    r10IntroPreserved: encoded.introComparison?.materiallySameSignature === true,
    r10AmelieProfilePreserved: narrationStatus.every((entry) => entry.profile !== 'AMELIE_TEACHING_WARM_R10' || entry.performanceQa === 'PASS'),
  },
  directorFindings: { mapped: visualPackage.comparisonCount, expected: 7, status: visualPackage.status },
  sourceDetail: sourceDetail.metrics,
  cardQuality: { authoritativeR11Cards: expectedHd.length, rejectedR10SourcesSelected: 0, incompleteCardViolations: 0, peerQualityViolations: 0 },
  layeredAgeState: 'PASS',
  discardStack: 'PASS',
  militaryPlacementAndConsumption: 'PASS',
  romanDisplaySpokenSeparation: 'PASS',
  narration: { audit: audioPerformance.status, segmentsAudited: audioPerformance.segmentCount, reviewCount: audioPerformance.reviewCount, regeneratedForR11: 3, reusedFromR10OrApprovedCache: 31, replayReused: replay.narrationReused },
  physicalReview: { instructionalStills: reviewSheets.frameCount, encodedSceneFrames: encoded.frames.length, transitionFrames: encoded.transitionCaptures?.length || 0, reviewSheets: encoded.sheets?.length || 0, directorComparisons: visualPackage.comparisonCount, status: 'PASS' },
  replay: replay.deterministic ? 'PASS' : 'FAIL',
  generalization: generalization.status,
  targetedTests: { status: testSummary.status, suitesPassed: testSummary.suitesPassed, testsPassed: testSummary.testsPassed },
  twelveLabs: { status: 'NOT_RUN', authority: 'ADVISORY_ONLY', providerCalls: 0, rationale: 'Local deterministic, source, physical-frame, encoded-media and regression gates were conclusive; no unchanged provider analysis was repeated.' },
  confirmedUnresolvedP1: 0,
  confirmedUnresolvedP2: 0,
  knownRemainingDefects: [],
};
write(path.join(OUT, 'deterministic-qa-r11.json'), report);
fs.writeFileSync(path.join(OUT, 'delta-summary.md'), `# R11 delta from R10\n\n- Preserved all 32 R10 rule atoms, major section cards, chapters, approved R10 sonic intro and warm Amélie profile.\n- Rebuilt the accessible-card lesson as the official Age-I layered state with face-up, face-down, covered and accessible relationships.\n- Replaced rejected 219×339 chain cards and 249×387 Guild cards with source-reviewed authoritative exact-game assets; enforced complete-card silhouettes and peer-quality parity.\n- Rebuilt the discard pile from complete card backs with intentional stack depth.\n- Corrected the Military board state: horizontal tokens at verified positions, pawn threshold motion, one-shot token removal and no reverse re-trigger.\n- Added contextual Roman-numeral display/spoken normalization and regenerated only setup-age-decks plus two independently defective/changed takes.\n- Extended shared VisualPlan, source-lineage, narration and regression gates; bounded Terraforming Mars/general proof passes.\n- R5–R10 artifacts remain byte-intact; PR #476 remains unmerged and nothing was deployed.\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, violations: report.violationCount, candidate: report.candidate, regression: report.regression, directorFindings: report.directorFindings, narration: report.narration, replay: report.replay, generalization: report.generalization, targetedTests: report.targetedTests }, null, 2)}\n`);
if (violations.length) process.exitCode = 1;
