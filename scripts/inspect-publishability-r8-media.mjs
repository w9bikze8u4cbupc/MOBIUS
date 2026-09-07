#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const requestedVersion = process.argv.includes('--version') ? process.argv[process.argv.indexOf('--version') + 1] : 'r8';
if (!/^r\d+$/.test(requestedVersion || '')) throw new Error('Usage: [--version r8|r9]');
const OUT = path.join(ROOT, `out/publishability-${requestedVersion}/7-wonders-duel`);
const VIDEO = path.join(OUT, `7-wonders-duel-full-tutorial-${requestedVersion}.mp4`);
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const FRAME_DIR = path.join(OUT, 'encoded-review-frames');
const SHEET_DIR = path.join(OUT, 'encoded-review-sheets');
const AUDIO_DIR = path.join(OUT, 'audio');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const MASTER = path.isAbsolute(config.approvedSonicMaster.path) ? config.approvedSonicMaster.path : path.join(ROOT, config.approvedSonicMaster.path);
for (const dir of [FRAME_DIR, SHEET_DIR, AUDIO_DIR]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(VIDEO)) throw new Error(`Missing ${requestedVersion.toUpperCase()} video: ${VIDEO}`);

const media = JSON.parse(execFileSync(ffprobeStatic.path, [
  '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channels', '-of', 'json', VIDEO,
], { encoding: 'utf8' }));
const decode = spawnSync(ffmpegStatic, ['-v', 'error', '-i', VIDEO, '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true, maxBuffer: 20e6 });

let cursor = 0;
const frames = [];
for (let index = 0; index < config.scenes.length; index += 1) {
  const scene = config.scenes[index];
  const durationSec = Number(scene.durationSec || 0);
  const timestampSec = Number((cursor + Math.max(0.12, durationSec / 2)).toFixed(3));
  const file = path.join(FRAME_DIR, `${String(index + 1).padStart(2, '0')}-${scene.id}.png`);
  execFileSync(ffmpegStatic, ['-v', 'error', '-y', '-ss', String(timestampSec), '-i', VIDEO, '-frames:v', '1', file]);
  const metadata = await sharp(file).metadata();
  frames.push({ index: index + 1, sceneId: scene.id, atomId: scene.atomId || null, type: scene.type, startSec: Number(cursor.toFixed(3)), durationSec, timestampSec, filePath: file, width: metadata.width, height: metadata.height, sha256: sha256(file) });
  cursor += durationSec;
}

const transitionCaptures = [];
function sceneStart(sceneId) {
  const found = frames.find((frame) => frame.sceneId === sceneId);
  if (!found) throw new Error(`Unknown scene for transition capture: ${sceneId}`);
  return found.startSec;
}
const military = config.scenes.find((scene) => scene.id === 'knowledge-military-system');
const scoring = config.scenes.find((scene) => scene.id === 'knowledge-scoring-ledger');
const transitionRequests = [
  ...((military?.motionCueTimeline?.cues || []).flatMap((cue, cueIndex) => [
    // Clear the section-card crossfade before capturing the first teaching state.
    { id: `military-${cueIndex + 1}-start`, sceneId: military.id, relativeSec: Math.max(0.6, cue.startSec + 0.6) },
    { id: `military-${cueIndex + 1}-mid`, sceneId: military.id, relativeSec: (cue.startSec + cue.endSec) / 2 },
    { id: `military-${cueIndex + 1}-end`, sceneId: military.id, relativeSec: Math.min(military.durationSec - 0.2, cue.holdEndSec - 0.1) },
    { id: `military-${cueIndex + 1}-post`, sceneId: military.id, relativeSec: Math.min(military.durationSec - 0.2, cue.holdEndSec + 0.35) },
  ])),
  // Sample far enough after the enable boundary to avoid a transitional frame.
  ...((scoring?.timedOverlayTimeline?.cues || []).map((cue, index) => ({ id: `score-reveal-${index + 1}`, sceneId: scoring.id, relativeSec: Math.min(scoring.durationSec - 0.1, cue.startSec + 0.5) }))),
];
for (const capture of transitionRequests) {
  const timestampSec = Number((sceneStart(capture.sceneId) + capture.relativeSec).toFixed(3));
  const file = path.join(FRAME_DIR, `transition-${capture.id}.png`);
  execFileSync(ffmpegStatic, ['-v', 'error', '-y', '-ss', String(timestampSec), '-i', VIDEO, '-frames:v', '1', file]);
  const metadata = await sharp(file).metadata();
  transitionCaptures.push({ ...capture, timestampSec, filePath: file, sha256: sha256(file), width: metadata.width, height: metadata.height });
}

const sheets = [];
const pageSize = 6;
for (let offset = 0; offset < frames.length; offset += pageSize) {
  const pageFrames = frames.slice(offset, offset + pageSize);
  const composites = [];
  for (let index = 0; index < pageFrames.length; index += 1) {
    const frame = pageFrames[index];
    const image = await sharp(frame.filePath).resize(960, 540, { fit: 'contain', background: '#17100c' }).png().toBuffer();
    const label = Buffer.from(`<svg width="960" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="50" fill="#21150f"/><text x="18" y="34" fill="#f7ecd2" font-family="Arial,sans-serif" font-size="24">${String(frame.index).padStart(2, '0')} — ${frame.sceneId}</text></svg>`);
    const tile = await sharp({ create: { width: 960, height: 590, channels: 3, background: '#17100c' } }).composite([{ input: image, left: 0, top: 0 }, { input: label, left: 0, top: 540 }]).png().toBuffer();
    composites.push({ input: tile, left: (index % 2) * 960, top: Math.floor(index / 2) * 590 });
  }
  const file = path.join(SHEET_DIR, `encoded-review-sheet-${String(sheets.length + 1).padStart(2, '0')}.png`);
  await sharp({ create: { width: 1920, height: 1770, channels: 3, background: '#17100c' } }).composite(composites).png({ compressionLevel: 9 }).toFile(file);
  const metadata = await sharp(file).metadata();
  sheets.push({ filePath: file, sha256: sha256(file), width: metadata.width, height: metadata.height, sceneIds: pageFrames.map((frame) => frame.sceneId) });
}

const introWav = path.join(AUDIO_DIR, `encoded-${requestedVersion}-intro-0-3.6.wav`);
execFileSync(ffmpegStatic, ['-v', 'error', '-y', '-i', VIDEO, '-t', '3.6', '-vn', '-ac', '2', '-ar', '48000', introWav]);
function pcmMono(file) {
  const run = spawnSync(ffmpegStatic, ['-v', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { encoding: null, windowsHide: true, maxBuffer: 20e6 });
  if (run.status !== 0) throw new Error(String(run.stderr));
  const values = new Float32Array(run.stdout.length / 4);
  for (let index = 0; index < values.length; index += 1) values[index] = run.stdout.readFloatLE(index * 4);
  return values;
}
function envelope(values, block = 960) {
  const output = [];
  for (let start = 0; start < values.length; start += block) {
    let sum = 0;
    const end = Math.min(values.length, start + block);
    for (let index = start; index < end; index += 1) sum += values[index] * values[index];
    output.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  return output;
}
function pearsonAtLag(a, b, lag) {
  const startA = Math.max(0, lag);
  const startB = Math.max(0, -lag);
  const count = Math.min(a.length - startA, b.length - startB);
  if (count < 8) return -1;
  let meanA = 0; let meanB = 0;
  for (let i = 0; i < count; i += 1) { meanA += a[startA + i]; meanB += b[startB + i]; }
  meanA /= count; meanB /= count;
  let numerator = 0; let denA = 0; let denB = 0;
  for (let i = 0; i < count; i += 1) {
    const da = a[startA + i] - meanA; const db = b[startB + i] - meanB;
    numerator += da * db; denA += da * da; denB += db * db;
  }
  return numerator / Math.max(1e-12, Math.sqrt(denA * denB));
}
const masterEnvelope = envelope(pcmMono(MASTER));
const encodedEnvelope = envelope(pcmMono(introWav));
let best = { lagBlocks: 0, correlation: -1 };
for (let lag = -8; lag <= 8; lag += 1) {
  const correlation = pearsonAtLag(masterEnvelope, encodedEnvelope, lag);
  if (correlation > best.correlation) best = { lagBlocks: lag, correlation };
}
const rmsDb = (values) => 20 * Math.log10(Math.max(1e-9, Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)));
const masterPcm = pcmMono(MASTER);
const encodedPcm = pcmMono(introWav);
const introComparison = {
  encodedPath: introWav,
  encodedSha256: sha256(introWav),
  sourceMasterPath: MASTER,
  sourceMasterSha256: sha256(MASTER),
  envelopeCorrelation: Number(best.correlation.toFixed(5)),
  bestAlignmentLagSec: Number((best.lagBlocks * 0.02).toFixed(3)),
  masterRmsDbfs: Number(rmsDb(masterPcm).toFixed(2)),
  encodedRmsDbfs: Number(rmsDb(encodedPcm).toFixed(2)),
  materiallySameSignature: best.correlation >= 0.94 && Math.abs(rmsDb(masterPcm) - rmsDb(encodedPcm)) <= 1.5,
};

const report = {
  contract: `mobius-publishability-${requestedVersion}-encoded-media-inspection-v1`,
  generatedAt: new Date().toISOString(),
  status: decode.status === 0
    && frames.every((frame) => frame.width === 1920 && frame.height === 1080)
    && sheets.every((sheet) => sheet.width === 1920 && sheet.height === 1770)
    && introComparison.materiallySameSignature ? 'PASS' : 'FAIL',
  video: { path: VIDEO, sha256: sha256(VIDEO), bytes: Number(media.format.size), durationSec: Number(media.format.duration), streams: media.streams, decodeStatus: decode.status, decodeErrors: decode.stderr || '' },
  timelineDurationSec: Number(cursor.toFixed(3)),
  frames,
  transitionCaptures,
  sheets,
  introComparison,
};
fs.writeFileSync(path.join(OUT, 'encoded-media-inspection.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, video: report.video, frames: frames.length, transitionCaptures: transitionCaptures.length, sheets: sheets.length, introComparison }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
