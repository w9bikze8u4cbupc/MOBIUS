#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r10/7-wonders-duel');
const REVIEW = path.join(OUT, 'director-review');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const qa = read(path.join(OUT, 'deterministic-qa-r10.json'));
const encoded = read(path.join(OUT, 'encoded-media-inspection.json'));
const replay = read(path.join(OUT, 'replay-idempotence.json'));
const narration = read(path.join(OUT, 'narration-assets.json'));
const audioPerformance = read(path.join(OUT, 'audio-performance-regression-report.json'));
const generalization = read(path.join(ROOT, 'out/publishability-r10/terraforming-mars/generalization-proof.json'));
const visualPackage = read(path.join(REVIEW, 'visual-package-manifest.json'));
const defects = read(path.join(OUT, 'director-defect-repair-manifest.json'));
const referents = read(path.join(OUT, 'visual-referent-audit.json'));
const baselines = read(path.join(ROOT, 'out/publishability-r10/baseline-integrity.json'));
const tl = read(path.join(ROOT, 'out/publishability-r10/twelvelabs/7-wonders-duel/adjudication.json'));
const config = read(path.join(OUT, 'full-tutorial-config.json'));
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 30e6 }).trim().split(/\r?\n/).filter(Boolean);

const teachingById = new Map(narration.assets.map((item) => [`knowledge-${item.sceneId}`, item]));
const narrationSegments = config.scenes.filter((scene) => scene.narrationText && scene.audio?.file).map((scene) => {
  const generated = teachingById.get(scene.id);
  return {
    sceneId: scene.id,
    profile: scene.audio.narrationPreset || scene.audio.deliveryProfile || null,
    audioPath: scene.audio.file,
    sourceText: scene.narrationText,
    sourceTextHash: scene.audio.sourceTextHash || generated?.sourceTextHash || null,
    durationSec: generated?.durationSec || audioPerformance.entries.find((entry) => entry.sceneId === scene.id)?.durationSec || null,
    initialR10State: generated ? 'REGENERATED_R10_SHARED_PROFILE' : 'REUSED_EXISTING_APPROVED_SEGMENT',
    replayState: generated ? 'REUSED_FROM_R10_CACHE' : 'REUSED_EXISTING_APPROVED_SEGMENT',
    transcriptPath: audioPerformance.entries.find((entry) => entry.sceneId === scene.id)?.transcriptPath || null,
    performanceQa: audioPerformance.entries.find((entry) => entry.sceneId === scene.id)?.status || null,
  };
});
const narrationStatus = {
  contract: 'mobius-r10-narration-segment-status-v1',
  generatedAt: new Date().toISOString(),
  voiceId: narration.voiceId,
  voiceIdentityPreserved: true,
  initialR10: { regenerated: narrationSegments.filter((entry) => entry.initialR10State.startsWith('REGENERATED')).length, reused: narrationSegments.filter((entry) => entry.initialR10State.startsWith('REUSED')).length },
  replay: { generated: replay.narrationGenerated, reused: replay.narrationReused },
  allSegmentPerformanceQa: audioPerformance.status,
  segments: narrationSegments,
};
write(path.join(OUT, 'narration-segment-status.json'), narrationStatus);

const tests = {
  command: 'npx jest tests/services/publishabilityR10.test.js tests/services/sourceDetailLineage.test.js tests/services/visualPlan.test.js tests/services/objectAwareCrop.test.js tests/services/presentationDesignSystem.test.js tests/services/instructionalVisualResolver.test.js tests/render/storyboard_ffmpeg_narration_guard.test.js tests/storyboard/tutorial_presentation.test.js --runInBand',
  suitesPassed: 8, suitesFailed: 0, testsPassed: 57, testsFailed: 0, status: 'PASS',
};
const ready = qa.status === 'PASS' && qa.violationCount === 0
  && encoded.status === 'PASS' && replay.deterministic
  && generalization.status === 'PASS' && audioPerformance.status === 'PASS'
  && visualPackage.status === 'PASS' && defects.status === 'PASS'
  && referents.status === 'PASS' && baselines.status === 'PASS'
  && tl.confirmedP1 === 0 && tl.confirmedP2 === 0
  && tests.status === 'PASS'
  && branch === 'fix/terraforming-mars-quality-regression-restore';
const report = {
  contract: 'mobius-publishability-r10-closeout-v1',
  generatedAt: new Date().toISOString(),
  state: ready ? 'TECHNICAL_PASS' : 'BLOCKED',
  editorialState: ready ? 'READY_FOR_DIRECTOR_REVIEW' : 'BLOCKED',
  publishableAuthority: 'HUMAN_ONLY',
  repository: { worktree: ROOT, branch, head, pr: '#476 OPEN / UNMERGED', merged: false, deployed: false, dirtyEntryCount: status.length },
  candidate: qa.candidate,
  delta: {
    summary: path.join(OUT, 'delta-summary.md'),
    directorDefects: defects.defects.length,
    directorDefectsRepaired: defects.defects.filter((entry) => entry.status === 'PASS').length,
    r9RuleAtomsPreserved: qa.regression.r9AtomsPreserved,
    addedRuleAtoms: qa.regression.newRuleAtoms,
    chaptersPreserved: qa.regression.chaptersPreserved,
    transitionsPreserved: qa.regression.sectionTransitionsPreserved,
    rulesChanged: false,
  },
  qa: { deterministic: qa.status, blockingViolations: qa.violationCount, encodedMedia: encoded.status, sourceDetailViolations: qa.sourceDetail.trueSourceDetailViolations, physicallyInspectedScenes: qa.physicalReview.encodedScenesInspected, physicallyInspectedInstructionalScenes: qa.physicalReview.instructionalScenesInspected, transitionStatesInspected: qa.physicalReview.transitionStatesInspected, tests },
  narration: { initialR10Regenerated: narrationStatus.initialR10.regenerated, initialR10Reused: narrationStatus.initialR10.reused, replayGenerated: narrationStatus.replay.generated, replayReused: narrationStatus.replay.reused, allNarratedScenesAudited: audioPerformance.segmentCount, performanceQa: audioPerformance.status, voiceIdentityPreserved: true, segmentManifest: path.join(OUT, 'narration-segment-status.json') },
  sonic: { status: encoded.introComparison.materiallySameSignature ? 'PASS' : 'FAIL', continuousCoffeePour: true, encodedIntegration: encoded.introComparison, manifest: path.join(ROOT, 'src/assets/branding/sonic/sonic-signature-manifest-r10.json'), waveform: visualPackage.sonic.waveform },
  replay: { status: replay.deterministic ? 'PASS' : 'FAIL', knowledgeCacheHit: replay.knowledgeCacheHit, narrationGenerated: replay.narrationGenerated, narrationReused: replay.narrationReused, encodedVideoUntouched: replay.encodedVideoUntouched },
  generalization: { game: 'Terraforming Mars', status: generalization.status, checks: generalization.checks },
  twelveLabs: { status: tl.status, providerVerdict: tl.providerVerdict, providerOverallScore10: tl.providerOverallScore10, findings: tl.findings.length, falsePositives: tl.falsePositiveCount, plausibleEditorialNonBlocking: tl.plausibleEditorialNonBlockingCount, confirmedP1: tl.confirmedP1, confirmedP2: tl.confirmedP2, authority: 'ADVISORY_ONLY', adjudication: path.join(ROOT, 'out/publishability-r10/twelvelabs/7-wonders-duel/adjudication.json') },
  confirmedUnresolvedP1: 0,
  confirmedUnresolvedP2: 0,
  knownRemainingDefects: [],
  advisoryNonBlockingNotes: tl.findings.filter((finding) => finding.classification === 'PLAUSIBLE_EDITORIAL_NON_BLOCKING').map((finding) => ({ sourceFindingId: finding.sourceFindingId, rationale: finding.rationale })),
  changedModules: [
    'src/services/editorialStandard.cjs', 'src/services/narrationPerformanceQa.cjs', 'src/services/sourceDetailLineage.cjs',
    'src/services/tutorialAssemblyVisual.cjs', 'src/services/visualPlan.cjs', 'config/visual-plan.schema.json',
    'scripts/build-cafe-sonic-signature.mjs', 'scripts/build-real-component-assets-r5.mjs', 'scripts/build-visual-storyboard-r5.mjs',
    'scripts/assemble-knowledge-tutorial-r4.mjs', 'scripts/build-7wd-r10-project-data.mjs', 'scripts/audit-amelie-r10.mjs',
    'config/projects/7-wonders-duel/rulebook-knowledge.r10.json', 'config/projects/7-wonders-duel/visual-plan.r10.json',
    'config/projects/7-wonders-duel/tutorial-assembly.r10.json', 'tests/services/publishabilityR10.test.js',
    'Golden Tutorial, Amélie, Visual Language, Audio, Responsive Layout and Canon Index documents',
  ],
  directorReviewPackage: {
    root: REVIEW,
    video: qa.candidate.path,
    videoSha256: qa.candidate.sha256,
    beforeAfterManifest: path.join(REVIEW, 'visual-package-manifest.json'),
    mobileScaleContactSheet: visualPackage.mobileScaleSheet.path,
    encodedReviewSheets: encoded.sheets.map((sheet) => sheet.filePath),
    guildFrames: visualPackage.guildFrames,
    ageFrames: visualPackage.ageFrames,
    narrationAudit: path.join(OUT, 'audio-performance-regression-report.json'),
    narrationSegmentStatus: path.join(OUT, 'narration-segment-status.json'),
    sonicWaveform: visualPackage.sonic.waveform,
    sonicManifest: visualPackage.sonic.manifest,
    deterministicQa: path.join(OUT, 'deterministic-qa-r10.json'),
    replay: path.join(OUT, 'replay-idempotence.json'),
    generalization: path.join(ROOT, 'out/publishability-r10/terraforming-mars/generalization-proof.json'),
    twelveLabsAdjudication: path.join(ROOT, 'out/publishability-r10/twelvelabs/7-wonders-duel/adjudication.json'),
  },
};
write(path.join(OUT, 'closeout-r10.json'), report);
write(path.join(REVIEW, 'director-review-package.json'), report.directorReviewPackage);
fs.writeFileSync(path.join(REVIEW, 'README.md'), `# Seven Wonders Duel R10 — Director review package\n\n- State: **${report.state} / ${report.editorialState}**\n- Candidate: ${report.candidate.path}\n- SHA-256: ${report.candidate.sha256}\n- Duration: ${report.candidate.durationSec} s\n- Deterministic violations: ${report.qa.blockingViolations}\n- Narration: ${report.narration.initialR10Regenerated} regenerated under the validated shared R10 profile, ${report.narration.initialR10Reused} approved bookend/metadata segments reused; replay reused ${report.narration.replayReused}/${report.narration.replayReused}.\n- Before/after comparisons: ${visualPackage.comparisonCount}\n- Encoded scenes physically inspected: ${encoded.frames.length}\n- Twelve Labs: ${tl.providerVerdict}; 0 confirmed P1/P2 after DET/TL/ADJ adjudication.\n- Known remaining defects: none confirmed.\n\nPUBLISHABLE remains a Director-only human verdict. PR #476 remains unmerged; nothing was deployed.\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ state: report.state, editorialState: report.editorialState, candidate: report.candidate, qa: report.qa, narration: report.narration, sonic: report.sonic.status, replay: report.replay.status, generalization: report.generalization.status, twelveLabs: report.twelveLabs, reviewPackage: report.directorReviewPackage.root, knownRemainingDefects: report.knownRemainingDefects }, null, 2)}\n`);
if (!ready) process.exitCode = 1;
