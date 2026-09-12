#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r8/7-wonders-duel');
const VIDEO = path.join(OUT, '7-wonders-duel-full-tutorial-r8.mp4');
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const DET = path.join(OUT, 'deterministic-qa-r8.json');
const ENCODED = path.join(OUT, 'encoded-media-inspection.json');
const REPLAY = path.join(OUT, 'replay-idempotence.json');
const BASELINE = path.join(ROOT, 'out/publishability-r8/baseline/repository-and-baseline-preflight.json');
const GENERALIZATION = path.join(ROOT, 'out/publishability-r8/terraforming-mars/generalization-proof.json');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const resolveStored = (value) => path.isAbsolute(value) ? value : path.join(ROOT, value);
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

for (const file of [VIDEO, CONFIG, DET, ENCODED, REPLAY, BASELINE, GENERALIZATION]) {
  if (!fs.existsSync(file)) throw new Error(`Missing R8 full-QA input: ${file}`);
}

const config = read(CONFIG);
const det = read(DET);
const encoded = read(ENCODED);
const replay = read(REPLAY);
const baseline = read(BASELINE);
const generalization = read(GENERALIZATION);
const media = JSON.parse(execFileSync(ffprobeStatic.path, [
  '-v', 'error', '-show_entries',
  'format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,sample_rate,channels,r_frame_rate',
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
], { encoding: 'utf8', windowsHide: true, maxBuffer: 40e6 });
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
const baselineIntegrity = Object.values(baseline.immutableBaselines || {}).every((artifact) => {
  const file = resolveStored(artifact.path);
  return fs.existsSync(file) && sha256(file) === artifact.sha256 && artifact.matchesExpected === true;
}) && Object.values(baseline.r7State || {}).every((artifact) => {
  const file = resolveStored(artifact.path);
  return fs.existsSync(file) && sha256(file) === artifact.sha256;
});
const sonicPath = resolveStored(config.approvedSonicMaster.path);
const sonicPreserved = fs.existsSync(sonicPath)
  && sha256(sonicPath) === config.approvedSonicMaster.sha256
  && encoded.introComparison?.materiallySameSignature === true;
const outro = config.scenes.at(-1);

const reviewSheets = [];
for (const sheet of encoded.sheets || []) {
  const metadata = await sharp(sheet.filePath).metadata();
  reviewSheets.push({ path: sheet.filePath, width: metadata.width, height: metadata.height, bytes: fs.statSync(sheet.filePath).size });
}

const violations = [];
const fail = (code, evidence) => violations.push({ id: `DET-R8-FULL-${String(violations.length + 1).padStart(3, '0')}`, code, evidence });
if (!baselineIntegrity) fail('IMMUTABLE_BASELINE_MUTATED', null);
if (det.status !== 'PASS' || det.violationCount !== 0) fail('UPSTREAM_DETERMINISTIC_QA', det);
if (encoded.status !== 'PASS' || encoded.video?.decodeStatus !== 0) fail('ENCODED_MEDIA_INSPECTION', encoded.status);
if (encoded.video?.sha256 !== sha256(VIDEO)) fail('ENCODED_MEDIA_STALE', { recorded: encoded.video?.sha256, actual: sha256(VIDEO) });
if (!replay.deterministic || replay.narrationGenerated !== 0 || replay.narrationReused !== 30) fail('REPLAY_IDEMPOTENCE', replay);
if (generalization.status !== 'PASS') fail('SECOND_GAME_GENERALIZATION', generalization);
if (!sonicPreserved) fail('SONIC_MASTER_INTEGRATION', encoded.introComparison);
if (videoStream?.codec_name !== 'h264' || videoStream?.width !== 1920 || videoStream?.height !== 1080 || videoStream?.pix_fmt !== 'yuv420p') fail('VIDEO_STREAM', videoStream);
if (audioStream?.codec_name !== 'aac' || Number(audioStream?.sample_rate) !== 48000 || Number(audioStream?.channels) !== 2) fail('AUDIO_STREAM', audioStream);
if (Math.abs(durationSec - timelineDurationSec) > 0.08) fail('TIMELINE_DURATION', { durationSec, timelineDurationSec });
if (!chapterAlignment) fail('CHAPTER_ALIGNMENT', config.chapters);
if (!outro?.outroCompletionGuard?.valid || Number(outro.durationSec) < Number(outro.outroCompletionGuard?.requiredDurationSec)) fail('OUTRO_COMPLETION_GUARD', outro?.outroCompletionGuard);
if (!Number.isFinite(integratedLufs) || integratedLufs < -20 || integratedLufs > -14) fail('LOUDNESS_RANGE', integratedLufs);
if (!Number.isFinite(truePeakDbfs) || truePeakDbfs > -1) fail('TRUE_PEAK', truePeakDbfs);
if (encoded.frames?.length !== config.scenes.length || encoded.frames?.some((frame) => frame.width !== 1920 || frame.height !== 1080)) fail('ENCODED_FRAME_COVERAGE', encoded.frames?.length);
if (encoded.transitionCaptures?.length !== 9) fail('TEACHING_TRANSITION_CAPTURE_COVERAGE', encoded.transitionCaptures?.length);
if (reviewSheets.length !== 7 || reviewSheets.some((sheet) => sheet.width !== 1920 || sheet.height !== 1770 || sheet.bytes <= 0)) fail('REVIEW_SHEET_INTEGRITY', reviewSheets);

const report = {
  contract: 'mobius-publishability-r8-full-qa-v1',
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
    immutableBaselinesRetained: baselineIntegrity,
    ruleCoveragePreserved: det.regression.ruleCoveragePreserved,
    narrationCompletenessPreserved: det.regression.narrationCompletenessPreserved,
    transitionsPreserved: det.regression.transitionsPreserved,
    chaptersPreserved: det.regression.chaptersPreserved,
    imageQualityNotRegressed: det.regression.imageQualityNotRegressed,
    sonicMasterSurvivesEncodedRender: sonicPreserved,
    chapterAlignment,
    outroCompletionGuard: Boolean(outro?.outroCompletionGuard?.valid),
    replayIdempotence: replay.deterministic && replay.narrationGenerated === 0,
    encodedFramesPhysicallyReviewed: encoded.frames?.length === config.scenes.length,
    transitionProofsReviewed: encoded.transitionCaptures?.length === 9,
    terraformMarsGeneralization: generalization.status,
  },
};
write(path.join(OUT, 'full-qa-r8.json'), report);
process.stdout.write(`${JSON.stringify({ status: report.status, violations: report.violationCount, media: report.media, safeguards: report.safeguards }, null, 2)}\n`);
if (violations.length) process.exitCode = 1;
