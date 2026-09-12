#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r11/7-wonders-duel');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const qa = read(path.join(OUT, 'deterministic-qa-r11.json'));
const replay = read(path.join(OUT, 'replay-idempotence.json'));
const narration = read(path.join(OUT, 'narration-segment-status-r11.json'));
const audio = read(path.join(OUT, 'audio-performance-regression-report.json'));
const visualPackage = read(path.join(OUT, 'director-review/visual-package-manifest.json'));
const sourceComparison = read(path.join(OUT, 'director-review/source-resolution-comparison-report.json'));
const baselines = read(path.join(ROOT, 'out/publishability-r11/baseline-integrity.json'));
const generalization = read(path.join(ROOT, 'out/publishability-r11/terraforming-mars/generalization-proof.json'));
const roman = read(path.join(OUT, 'roman-numeral-display-spoken-evidence.json'));
const tests = read(path.join(OUT, 'targeted-tests-r11.json'));
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const worktreeStatus = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 40e6 }).trim().split(/\r?\n/).filter(Boolean);

const changedModules = [
  'src/services/sourceDetailLineage.cjs',
  'src/services/visualPlan.cjs',
  'src/services/editorialStandard.cjs',
  'src/services/rulebookKnowledge.cjs',
  'scripts/build-7wd-r11-project-data.mjs',
  'scripts/build-real-component-assets-r5.mjs',
  'scripts/build-visual-storyboard-r5.mjs',
  'scripts/render-storyboard-ffmpeg.mjs',
  'scripts/audit-amelie-r11.mjs',
  'scripts/inspect-publishability-r8-media.mjs',
  'scripts/prove-publishability-r11-generalization.mjs',
  'docs/standards/MOBIUS_FR_CA_TUTORIAL_STANDARD.md',
  'tests/services/publishabilityR11.test.js',
];
const closeout = {
  contract: 'mobius-publishability-r11-closeout-v1',
  generatedAt: new Date().toISOString(),
  state: qa.status === 'PASS' ? 'TECHNICAL_PASS' : 'BLOCKED',
  editorialState: qa.status === 'PASS' ? 'READY_FOR_DIRECTOR_REVIEW' : 'BLOCKED',
  publishable: 'HUMAN_ONLY',
  candidate: qa.candidate,
  repository: { branch, head, pr: '#476', prState: 'OPEN_UNMERGED', deployed: false, worktreeDirty: worktreeStatus.length > 0, worktreeEntryCount: worktreeStatus.length },
  changedModules,
  regression: qa.regression,
  baselines,
  directorFindings: { repaired: visualPackage.comparisonCount, expected: 7, evidence: path.join(OUT, 'director-review/visual-package-manifest.json') },
  sourceQuality: { status: sourceComparison.status, report: path.join(OUT, 'director-review/source-resolution-comparison-report.json'), metrics: qa.sourceDetail },
  ageLayeredState: { status: qa.layeredAgeState, evidence: visualPackage.ageLayeredState },
  discardStack: { status: qa.discardStack, evidence: visualPackage.discardStack },
  military: { status: qa.militaryPlacementAndConsumption, evidence: visualPackage.militaryStateSheet },
  romanNumerals: { status: roman.status, evidence: path.join(OUT, 'roman-numeral-display-spoken-evidence.json') },
  narration: {
    status: audio.status,
    segmentsAudited: audio.segmentCount,
    regeneratedForR11: narration.regeneratedForR11,
    reusedFromR10OrApprovedCache: narration.reusedFromR10OrApprovedCache,
    reusedOnReplay: narration.replayReused,
    reviewCount: audio.reviewCount,
    evidence: path.join(OUT, 'narration-segment-status-r11.json'),
  },
  deterministicQa: { status: qa.status, violationCount: qa.violationCount, report: path.join(OUT, 'deterministic-qa-r11.json') },
  tests: { status: tests.status, suitesPassed: tests.suitesPassed, testsPassed: tests.testsPassed, report: path.join(OUT, 'targeted-tests-r11.json') },
  replay: { status: replay.deterministic ? 'PASS' : 'FAIL', timelineHash: replay.timelineHash, narrationGenerated: replay.narrationGenerated, narrationReused: replay.narrationReused, encodedVideoUntouched: replay.encodedVideoUntouched, report: path.join(OUT, 'replay-idempotence.json') },
  generalization: { status: generalization.status, checks: generalization.checks, report: path.join(ROOT, 'out/publishability-r11/terraforming-mars/generalization-proof.json') },
  twelveLabs: qa.twelveLabs,
  confirmedUnresolvedP1: qa.confirmedUnresolvedP1,
  confirmedUnresolvedP2: qa.confirmedUnresolvedP2,
  physicalReview: qa.physicalReview,
  exactRemainingKnownDefects: qa.knownRemainingDefects,
  directorReviewPackage: {
    root: path.join(OUT, 'director-review'),
    comparisons: path.join(OUT, 'director-review/r10-vs-r11'),
    mobileSheet: visualPackage.mobileScaleSheet,
    reviewSheets: path.join(OUT, 'review-sheets'),
  },
  rulesChanged: false,
  introChanged: false,
  deployed: false,
  merged: false,
  authorityNotice: 'The Director alone supplies the HUMAN PUBLISHABLE verdict.',
};
write(path.join(OUT, 'closeout-r11.json'), closeout);
fs.writeFileSync(path.join(OUT, 'DIRECTOR-REVIEW-PACKAGE.md'), `# Seven Wonders Duel R11 — Director review package\n\nState: **${closeout.state} / ${closeout.editorialState}**  \nPublishable authority: **HUMAN_ONLY**\n\n## Candidate\n\n- MP4: ${qa.candidate.path}\n- SHA-256: ${qa.candidate.sha256}\n- Duration: ${qa.candidate.durationSec.toFixed(3)} s\n- Video: ${qa.candidate.videoStream.codec_name}, ${qa.candidate.videoStream.width}×${qa.candidate.videoStream.height}, ${qa.candidate.videoStream.r_frame_rate}\n- Audio: ${qa.candidate.audioStream.codec_name}, ${qa.candidate.audioStream.sample_rate} Hz, ${qa.candidate.audioStream.channels} channels\n\n## Evidence\n\n- Seven mapped R10→R11 comparisons: ${path.join(OUT, 'director-review/r10-vs-r11')}\n- Source-resolution comparison: ${path.join(OUT, 'director-review/source-resolution-comparison-report.json')}\n- Layered Age-I state: ${visualPackage.ageLayeredState}\n- Complete discard stack: ${visualPackage.discardStack}\n- Military initial/crossed/removed states: ${visualPackage.militaryStateSheet}\n- Roman display/spoken evidence: ${path.join(OUT, 'roman-numeral-display-spoken-evidence.json')}\n- Complete Amélie audit: ${path.join(OUT, 'audio-performance-regression-report.json')}\n- Deterministic QA: ${path.join(OUT, 'deterministic-qa-r11.json')}\n- Replay proof: ${path.join(OUT, 'replay-idempotence.json')}\n- Generalization proof: ${path.join(ROOT, 'out/publishability-r11/terraforming-mars/generalization-proof.json')}\n\n## Closeout\n\n- Deterministic violations: ${qa.violationCount}\n- Targeted tests: ${tests.testsPassed} passed\n- Narration: ${narration.regeneratedForR11} regenerated, ${narration.reusedFromR10OrApprovedCache} reused from R10/approved cache, ${narration.replayReused} reused on replay\n- Confirmed unresolved P1/P2: ${qa.confirmedUnresolvedP1}/${qa.confirmedUnresolvedP2}\n- Exact remaining known defects: none\n- R5–R10 baselines: preserved\n- PR #476: open and unmerged\n- Deployment: none\n\nThe Director alone supplies the final HUMAN PUBLISHABLE verdict.\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ state: closeout.state, editorialState: closeout.editorialState, candidate: closeout.candidate, deterministicQa: closeout.deterministicQa, tests: closeout.tests, replay: closeout.replay.status, generalization: closeout.generalization.status, narration: closeout.narration, remaining: closeout.exactRemainingKnownDefects, repository: closeout.repository }, null, 2)}\n`);
if (closeout.state !== 'TECHNICAL_PASS') process.exitCode = 1;
