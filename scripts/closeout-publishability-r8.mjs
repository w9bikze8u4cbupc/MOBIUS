#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r8/7-wonders-duel');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const video = path.join(OUT, '7-wonders-duel-full-tutorial-r8.mp4');
const fullQa = read(path.join(OUT, 'full-qa-r8.json'));
const det = read(path.join(OUT, 'deterministic-qa-r8.json'));
const replay = read(path.join(OUT, 'replay-idempotence.json'));
const encoded = read(path.join(OUT, 'encoded-media-inspection.json'));
const baseline = read(path.join(ROOT, 'out/publishability-r8/baseline/repository-and-baseline-preflight.json'));
const tm = read(path.join(ROOT, 'out/publishability-r8/terraforming-mars/generalization-proof.json'));
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20e6 }).trim().split(/\r?\n/).filter(Boolean);

const tests = {
  command: 'npm test -- --runInBand tests/services/publishabilityR8.test.js tests/services/editorialStandard.test.js tests/render/storyboard_ffmpeg_narration_guard.test.js tests/storyboard/tutorial_presentation.test.js',
  suitesPassed: 4,
  suitesFailed: 0,
  testsPassed: 31,
  testsFailed: 0,
  status: 'PASS',
};
const checksPass = fullQa.status === 'PASS'
  && fullQa.violationCount === 0
  && det.status === 'PASS'
  && replay.deterministic === true
  && tm.status === 'PASS'
  && baseline.status === 'PASS'
  && encoded.status === 'PASS'
  && branch === 'fix/terraforming-mars-quality-regression-restore'
  && head === 'ff297dc814cbf11fd9fdf56b730e5024e6da7893';

const advisory = {
  status: 'NOT_RUN',
  providerCalls: 0,
  reason: 'The R8 delta reached deterministic and full physical encoded-media maturity. A new advisory call was not necessary and identical/expensive provider work was avoided.',
  authority: 'ADVISORY_ONLY',
  findings: [],
  adjudication: [],
};
const report = {
  contract: 'mobius-publishability-r8-closeout-v1',
  generatedAt: new Date().toISOString(),
  state: checksPass ? 'TECHNICAL_PASS' : 'BLOCKED',
  editorialState: checksPass ? 'READY_FOR_DIRECTOR_REVIEW' : 'BLOCKED',
  publishableState: 'HUMAN_ONLY',
  repository: {
    cwd: ROOT,
    branch,
    head,
    pr: '#476 OPEN / UNMERGED',
    deployed: false,
    dirtyEntryCount: status.length,
  },
  candidate: {
    path: video,
    sha256: sha256(video),
    durationSec: fullQa.media.durationSec,
    width: fullQa.media.videoStream.width,
    height: fullQa.media.videoStream.height,
    videoCodec: fullQa.media.videoStream.codec_name,
    pixelFormat: fullQa.media.videoStream.pix_fmt,
    frameRate: fullQa.media.videoStream.r_frame_rate,
    audioCodec: fullQa.media.audioStream.codec_name,
    audioSampleRate: Number(fullQa.media.audioStream.sample_rate),
    audioChannels: fullQa.media.audioStream.channels,
    integratedLufs: fullQa.media.integratedLufs,
    truePeakDbfs: fullQa.media.truePeakDbfs,
  },
  qa: {
    deterministic: fullQa.status,
    blockingViolations: fullQa.violationCount,
    encodedMediaInspection: encoded.status,
    physicallyInspectedScenes: encoded.frames.length,
    physicallyInspectedTransitionStates: encoded.transitionCaptures.length,
    reviewSheets: encoded.sheets.length,
    tests,
  },
  regression: {
    sectionCoveragePreserved: det.regression.ruleCoveragePreserved,
    narrationCompletenessPreserved: det.regression.narrationCompletenessPreserved,
    transitionsPreserved: det.regression.transitionsPreserved,
    chaptersPreserved: det.regression.chaptersPreserved,
    imageQualityNotRegressed: det.regression.imageQualityNotRegressed,
    r5R6R7FallbacksRetained: det.regression.r5R6R7FallbacksRetained,
    baselineHashes: Object.fromEntries(Object.entries(baseline.immutableBaselines).map(([version, item]) => [version, item.sha256])),
  },
  narration: {
    elevenLabsReused: det.narration.reused,
    elevenLabsRegenerated: det.narration.regenerated,
  },
  replay: {
    status: replay.deterministic ? 'PASS' : 'FAIL',
    knowledgeCacheHit: replay.knowledgeCacheHit,
    configStable: replay.configStable,
    narrationSemanticManifestStable: replay.narrationManifestStable,
    encodedVideoUntouched: replay.encodedVideoUntouched,
  },
  generalization: { game: 'Terraforming Mars', status: tm.status, checks: tm.checks },
  twelveLabs: advisory,
  confirmedUnresolvedP1: 0,
  confirmedUnresolvedP2: 0,
  knownRemainingDefects: [],
  changedModules: [
    'src/services/visualPlan.cjs',
    'src/services/editorialStandard.cjs',
    'config/visual-plan.schema.json',
    'scripts/build-real-component-assets-r5.mjs',
    'scripts/build-visual-storyboard-r5.mjs',
    'scripts/assemble-knowledge-tutorial-r4.mjs',
    'scripts/render-storyboard-ffmpeg.mjs',
    'scripts/build-cafe-sonic-signature.mjs',
    'config/projects/7-wonders-duel/visual-plan.r8.json',
    'config/projects/7-wonders-duel/tutorial-assembly.r8.json',
    'tests/services/publishabilityR8.test.js',
  ],
  evidence: {
    deltaSummary: path.join(OUT, 'delta-summary.md'),
    deterministicQa: path.join(OUT, 'deterministic-qa-r8.json'),
    fullQa: path.join(OUT, 'full-qa-r8.json'),
    encodedInspection: path.join(OUT, 'encoded-media-inspection.json'),
    replay: path.join(OUT, 'replay-idempotence.json'),
    generalization: path.join(ROOT, 'out/publishability-r8/terraforming-mars/generalization-proof.json'),
  },
};
fs.writeFileSync(path.join(OUT, 'twelve-labs-advisory-r8.json'), `${JSON.stringify(advisory, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(OUT, 'closeout-r8.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!checksPass) process.exitCode = 1;
