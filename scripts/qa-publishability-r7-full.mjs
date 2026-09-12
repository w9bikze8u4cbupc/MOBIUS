#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out', 'publishability-r7', '7-wonders-duel');
const VIDEO = path.join(OUT, '7-wonders-duel-full-tutorial-r7.mp4');
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const BASELINE = path.join(ROOT, 'out', 'publishability-r7', 'baseline-r6', 'baseline.json');
const DET = path.join(OUT, 'deterministic-qa-r7.json');
const AUDIO_AUDIT = path.join(OUT, 'audio-audit', 'report.json');
const FOCUS = path.join(OUT, 'focus-transition-proof', 'report.json');
const REVIEW_BOARD = path.join(OUT, 'rendered-review-board-all.png');
const REPLAY = path.join(OUT, 'replay-idempotence.json');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const resolveStored = (value) => path.isAbsolute(value) ? value : path.join(ROOT, value);
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

for (const file of [VIDEO, CONFIG, BASELINE, DET, AUDIO_AUDIT, FOCUS, REVIEW_BOARD, REPLAY]) {
  if (!fs.existsSync(file)) throw new Error(`Missing R7 full-QA input: ${file}`);
}

const config = read(CONFIG);
const baseline = read(BASELINE);
const det = read(DET);
const audioAudit = read(AUDIO_AUDIT);
const focus = read(FOCUS);
const replay = read(REPLAY);
const media = JSON.parse(execFileSync(ffprobeStatic.path, [
  '-v', 'error', '-show_entries',
  'format=duration,size:stream=codec_type,codec_name,width,height,sample_rate,channels',
  '-of', 'json', VIDEO,
], { encoding: 'utf8' }));
const videoStream = media.streams.find((stream) => stream.codec_type === 'video');
const audioStream = media.streams.find((stream) => stream.codec_type === 'audio');
const durationSec = Number(media.format.duration);
const timelineDurationSec = Number(config.scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0).toFixed(3));

const audioRun = spawnSync(ffmpegStatic, [
  '-hide_banner', '-i', VIDEO,
  '-af', 'ebur128=peak=true,silencedetect=noise=-48dB:d=0.25',
  '-f', 'null', 'NUL',
], { encoding: 'utf8', windowsHide: true, maxBuffer: 30e6 });
const audioText = audioRun.stderr || '';
const integratedLufs = Number([...audioText.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1]);
const truePeakDbfs = Number([...audioText.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1]);
const silenceEvents = [...audioText.matchAll(/silence_end:\s*([\d.]+) \| silence_duration:\s*([\d.]+)/g)]
  .map((match) => ({ endSec: Number(match[1]), durationSec: Number(match[2]) }));

const chapterAlignment = config.chapters.every((chapter) => {
  let cursor = 0;
  for (const scene of config.scenes) {
    if (scene.id === chapter.sceneId) return Math.abs(cursor - Number(chapter.startSec)) < 0.01;
    cursor += Number(scene.durationSec || 0);
  }
  return false;
});
const baselineIntegrity = Object.entries(baseline.artifacts)
  .filter(([, artifact]) => artifact?.path && artifact?.sha256)
  .every(([, artifact]) => {
    const file = resolveStored(artifact.path);
    return fs.existsSync(file) && sha256(file) === artifact.sha256;
  });
const sonicPath = resolveStored(config.approvedSonicMaster.path);
const sonicIdentityPreserved = fs.existsSync(sonicPath)
  && sha256(sonicPath) === baseline.artifacts.sonicMaster.sha256
  && config.approvedSonicMaster.sha256 === baseline.artifacts.sonicMaster.sha256;
const outro = config.scenes.at(-1);
const board = await sharp(REVIEW_BOARD).metadata();
const boardBytes = fs.statSync(REVIEW_BOARD).size;

const violations = [];
const fail = (code, evidence) => violations.push({ id: `DET-R7-FULL-${String(violations.length + 1).padStart(3, '0')}`, code, evidence });
if (!baselineIntegrity) fail('R6_FALLBACK_MUTATED', null);
if (!sonicIdentityPreserved) fail('SONIC_IDENTITY_CHANGED', null);
if (det.status !== 'PASS' || det.violationCount !== 0) fail('UPSTREAM_DETERMINISTIC_QA', det);
if (audioAudit.suspectCount !== 0) fail('NARRATION_RESTART_REMAINS', audioAudit);
if (focus.status !== 'PASS' || focus.captureCount !== 20) fail('FOCUS_TRANSITION_PROOF', { status: focus.status, captureCount: focus.captureCount });
if (!replay.deterministic || replay.narrationGenerated !== 0 || replay.narrationReused !== 30) fail('REPLAY_IDEMPOTENCE', replay);
if (videoStream?.codec_name !== 'h264' || videoStream?.width !== 1920 || videoStream?.height !== 1080) fail('VIDEO_STREAM', videoStream);
if (audioStream?.codec_name !== 'aac' || Number(audioStream?.sample_rate) !== 48000 || Number(audioStream?.channels) !== 2) fail('AUDIO_STREAM', audioStream);
if (Math.abs(durationSec - timelineDurationSec) > 0.08) fail('TIMELINE_DURATION', { durationSec, timelineDurationSec });
if (!chapterAlignment) fail('CHAPTER_ALIGNMENT', config.chapters);
if (!outro?.outroCompletionGuard?.valid || Number(outro.durationSec) < Number(outro.outroCompletionGuard?.requiredDurationSec)) fail('OUTRO_COMPLETION_GUARD', outro?.outroCompletionGuard);
if (!Number.isFinite(integratedLufs) || integratedLufs < -20 || integratedLufs > -14) fail('LOUDNESS_RANGE', integratedLufs);
if (!Number.isFinite(truePeakDbfs) || truePeakDbfs > -1) fail('TRUE_PEAK', truePeakDbfs);
if (board.width !== 1920 || board.height !== 2160 || boardBytes <= 0) fail('REVIEW_BOARD_INTEGRITY', { ...board, bytes: boardBytes });

const report = {
  contract: 'mobius-publishability-r7-full-qa-v1',
  generatedAt: new Date().toISOString(),
  status: violations.length ? 'FAIL' : 'PASS',
  violationCount: violations.length,
  violations,
  media: {
    videoPath: VIDEO,
    videoSha256: sha256(VIDEO),
    bytes: Number(media.format.size),
    durationSec,
    timelineDurationSec,
    videoStream,
    audioStream,
    integratedLufs,
    truePeakDbfs,
    silenceEventCount: silenceEvents.length,
    maxSilenceSec: Number(Math.max(0, ...silenceEvents.map((entry) => entry.durationSec)).toFixed(3)),
  },
  safeguards: {
    r6FallbackRetained: baselineIntegrity,
    sectionCoveragePreserved: det.regression.sectionCoveragePreserved,
    narrationCompletenessPreserved: det.regression.narrationCompletenessPreserved,
    transitionsPreserved: det.regression.transitionsPreserved,
    imageQualityNotRegressed: det.regression.imageQualityNotRegressed,
    sonicIdentityPreserved,
    chapterAlignment,
    outroCompletionGuard: Boolean(outro?.outroCompletionGuard?.valid),
    replayIdempotence: replay.deterministic && replay.narrationGenerated === 0,
    narrationRestartAudit: audioAudit.suspectCount === 0,
    focusTransitionProof: focus.status === 'PASS',
    renderedReviewBoard: { status: board.width === 1920 && board.height === 2160 && boardBytes > 0 ? 'PASS' : 'FAIL', path: REVIEW_BOARD, sha256: sha256(REVIEW_BOARD), width: board.width, height: board.height, bytes: boardBytes },
  },
};
write(path.join(OUT, 'full-qa-r7.json'), report);
process.stdout.write(`${JSON.stringify({ status: report.status, violations: report.violationCount, media: report.media, safeguards: report.safeguards }, null, 2)}\n`);
if (violations.length) process.exitCode = 1;
