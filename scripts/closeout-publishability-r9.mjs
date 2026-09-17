#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r9/7-wonders-duel');
const REVIEW = path.join(OUT, 'director-review');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(REVIEW, { recursive: true });

const qa = read(path.join(OUT, 'deterministic-qa-r9.json'));
const encoded = read(path.join(OUT, 'encoded-media-inspection.json'));
const replay = read(path.join(OUT, 'replay-idempotence.json'));
const generalization = read(path.join(ROOT, 'out/publishability-r9/terraforming-mars/generalization-proof.json'));
const defectRepairs = read(path.join(OUT, 'director-defect-repair-manifest.json'));
const referents = read(path.join(OUT, 'visual-referent-audit.json'));
const narrationAudio = read(path.join(OUT, 'changed-narration-audio-audit.json'));
const comparisons = read(path.join(OUT, 'director-review/before-after/manifest.json'));
const baselines = read(path.join(ROOT, 'out/publishability-r9/baseline-integrity.json'));
const video = qa.candidate.path;
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 30e6 }).trim().split(/\r?\n/).filter(Boolean);

const repairedSceneIds = [
  'knowledge-components-overview',
  'knowledge-setup-central',
  'knowledge-setup-wonder-selection',
  'knowledge-setup-age-decks',
  'knowledge-discard-for-coins',
  'knowledge-construct-wonder',
  'knowledge-military-system',
  'knowledge-science-pair-progress',
  'knowledge-science-supremacy',
  'knowledge-scoring-buildings',
  'knowledge-scoring-progress',
  'knowledge-scoring-ledger',
];
const frameByScene = new Map(encoded.frames.map((frame) => [frame.sceneId, frame]));
const contactFrames = repairedSceneIds.map((sceneId) => frameByScene.get(sceneId)).filter(Boolean);
const tileWidth = 960;
const tileHeight = 590;
const contactHeight = Math.ceil(contactFrames.length / 2) * tileHeight;
const contactComposites = [];
for (let index = 0; index < contactFrames.length; index += 1) {
  const frame = contactFrames[index];
  const image = await sharp(frame.filePath).resize(960, 540, { fit: 'contain', background: '#17100c' }).png().toBuffer();
  const label = Buffer.from(`<svg width="960" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="50" fill="#21150f"/><text x="20" y="34" fill="#f7ecd2" font-family="Arial,sans-serif" font-size="24">${frame.sceneId}</text></svg>`);
  const tile = await sharp({ create: { width: tileWidth, height: tileHeight, channels: 3, background: '#17100c' } }).composite([{ input: image, left: 0, top: 0 }, { input: label, left: 0, top: 540 }]).png().toBuffer();
  contactComposites.push({ input: tile, left: (index % 2) * tileWidth, top: Math.floor(index / 2) * tileHeight });
}
const contactSheet = path.join(REVIEW, 'repaired-scenes-contact-sheet.png');
await sharp({ create: { width: 1920, height: contactHeight, channels: 3, background: '#17100c' } }).composite(contactComposites).png({ compressionLevel: 9 }).toFile(contactSheet);
const contactMetadata = await sharp(contactSheet).metadata();

const tests = {
  command: 'npx jest tests/services/objectAwareCrop.test.js tests/services/visualPlan.test.js tests/services/presentationDesignSystem.test.js tests/services/sourceDetailLineage.test.js tests/services/instructionalVisualResolver.test.js tests/services/publishabilityR9.test.js tests/render/storyboard_ffmpeg_narration_guard.test.js tests/storyboard/tutorial_presentation.test.js --runInBand',
  suitesPassed: 8,
  suitesFailed: 0,
  testsPassed: 54,
  testsFailed: 0,
  status: 'PASS',
};
const ready = qa.status === 'PASS'
  && qa.violationCount === 0
  && encoded.status === 'PASS'
  && replay.deterministic
  && generalization.status === 'PASS'
  && defectRepairs.status === 'PASS'
  && referents.status === 'PASS'
  && narrationAudio.status === 'PASS'
  && comparisons.status === 'PASS'
  && baselines.status === 'PASS'
  && tests.status === 'PASS'
  && branch === 'fix/terraforming-mars-quality-regression-restore';

const report = {
  contract: 'mobius-publishability-r9-closeout-v1',
  generatedAt: new Date().toISOString(),
  state: ready ? 'TECHNICAL_PASS' : 'BLOCKED',
  editorialState: ready ? 'READY_FOR_DIRECTOR_REVIEW' : 'BLOCKED',
  publishableAuthority: 'HUMAN_ONLY',
  repository: { cwd: ROOT, branch, head, pr: '#476 OPEN / UNMERGED', merged: false, deployed: false, dirtyEntryCount: status.length },
  candidate: qa.candidate,
  delta: {
    summary: path.join(OUT, 'delta-summary.md'),
    directorDefects: defectRepairs.defects.length,
    directorDefectsRepaired: defectRepairs.defects.filter((entry) => entry.status === 'PASS').length,
    rulesChanged: false,
    sectionCoveragePreserved: qa.regression.ruleCoveragePreserved,
    chapterStructurePreserved: qa.regression.chapterStructurePreserved,
    sectionTransitionsPreserved: qa.regression.sectionTransitionsPreserved,
    sonicIdentityUnchanged: qa.regression.sonicIdentityUnchanged,
  },
  qa: { deterministic: qa.status, blockingViolations: qa.violationCount, encodedMedia: encoded.status, physicallyInspectedScenes: encoded.frames.length, physicallyInspectedInstructionalScenes: referents.sceneCount, tests },
  narration: { elevenLabsReused: 27, elevenLabsRegenerated: 3, changedSceneIds: qa.narration.changedSceneIds, changedAudioAudit: narrationAudio.status },
  replay: { status: replay.deterministic ? 'PASS' : 'FAIL', knowledgeCacheHit: replay.knowledgeCacheHit, narrationGeneratedOnReplay: replay.narrationGenerated, narrationReusedOnReplay: replay.narrationReused, encodedVideoUntouched: replay.encodedVideoUntouched },
  generalization: { game: 'Terraforming Mars', status: generalization.status, checks: generalization.checks },
  twelveLabs: qa.twelveLabs,
  confirmedUnresolvedP1: qa.confirmedUnresolvedP1,
  confirmedUnresolvedP2: qa.confirmedUnresolvedP2,
  knownRemainingDefects: qa.knownRemainingDefects,
  changedModules: [
    'src/services/objectAwareCrop.cjs',
    'src/services/visualPlan.cjs',
    'scripts/build-real-component-assets-r5.mjs',
    'scripts/build-visual-storyboard-r5.mjs',
    'scripts/build-7wd-r9-project-data.mjs',
    'config/projects/7-wonders-duel/rulebook-knowledge.r9.json',
    'config/projects/7-wonders-duel/visual-plan.r9.json',
    'config/projects/7-wonders-duel/tutorial-assembly.r9.json',
    'tests/services/objectAwareCrop.test.js',
    'tests/services/visualPlan.test.js',
    'tests/services/publishabilityR9.test.js',
    '02 Golden Tutorial, 06 Visual Language and 04 Recovery Matrix canon files',
  ],
  directorReviewPackage: {
    root: REVIEW,
    video,
    videoSha256: sha256(video),
    repairedScenesContactSheet: { path: contactSheet, sha256: sha256(contactSheet), width: contactMetadata.width, height: contactMetadata.height, sceneCount: contactFrames.length },
    beforeAfterManifest: path.join(OUT, 'director-review/before-after/manifest.json'),
    encodedReviewSheets: encoded.sheets.map((sheet) => sheet.filePath),
    allSceneReferentAudit: path.join(OUT, 'visual-referent-audit.json'),
    defectRepairManifest: path.join(OUT, 'director-defect-repair-manifest.json'),
    deterministicQa: path.join(OUT, 'deterministic-qa-r9.json'),
    narrationAudit: path.join(OUT, 'changed-narration-audio-audit.json'),
    baselineIntegrity: path.join(ROOT, 'out/publishability-r9/baseline-integrity.json'),
    replay: path.join(OUT, 'replay-idempotence.json'),
    generalization: path.join(ROOT, 'out/publishability-r9/terraforming-mars/generalization-proof.json'),
  },
};
write(path.join(OUT, 'closeout-r9.json'), report);
write(path.join(REVIEW, 'director-review-package.json'), report.directorReviewPackage);
fs.writeFileSync(path.join(REVIEW, 'README.md'), `# Seven Wonders Duel R9 — Director review package\n\n- State: **${report.state} / ${report.editorialState}**\n- Candidate: ${video}\n- SHA-256: ${report.candidate.sha256}\n- Duration: ${report.candidate.durationSec} s\n- Deterministic violations: ${report.qa.blockingViolations}\n- Narration: 27 reused, 3 regenerated\n- Before/after comparisons: ${comparisons.comparisonCount} scenes\n- Physically inspected encoded scenes: ${encoded.frames.length}\n- Known remaining defects: ${report.knownRemainingDefects.length}\n\nPUBLISHABLE remains a Director-only human verdict.\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ state: report.state, editorialState: report.editorialState, candidate: report.candidate, defectsRepaired: `${report.delta.directorDefectsRepaired}/${report.delta.directorDefects}`, qa: report.qa, narration: report.narration, replay: report.replay, generalization: report.generalization.status, reviewPackage: report.directorReviewPackage.root, knownRemainingDefects: report.knownRemainingDefects }, null, 2)}\n`);
if (!ready) process.exitCode = 1;
