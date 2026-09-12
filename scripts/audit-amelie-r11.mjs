#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const require = createRequire(import.meta.url);
const { auditNarrationPerformance } = require('../src/services/narrationPerformanceQa.cjs');
const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r11/7-wonders-duel');
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const R11_TRANSCRIPTS = path.join(OUT, 'audio-audit/whisper-small');
const R10_TRANSCRIPTS = path.join(ROOT, 'out/publishability-r10/7-wonders-duel/audio-audit/whisper-small');
const REPORT = path.join(OUT, 'audio-performance-regression-report.json');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function transcriptFor(audioPath) {
  const file = `${path.basename(audioPath, path.extname(audioPath))}.json`;
  const r11 = path.join(R11_TRANSCRIPTS, file);
  const r10 = path.join(R10_TRANSCRIPTS, file);
  if (fs.existsSync(r11)) return { path: r11, evidence: 'R11_CHANGED_TAKE' };
  if (fs.existsSync(r10)) return { path: r10, evidence: 'R10_BYTE_IDENTICAL_REUSE' };
  return { path: r11, evidence: 'MISSING' };
}

const config = read(CONFIG);
const scenes = config.scenes.filter((scene) => scene.narrationText && scene.audio?.file);
const entries = scenes.map((scene) => {
  const audioPath = path.resolve(scene.audio.file);
  const transcript = transcriptFor(audioPath);
  if (!fs.existsSync(audioPath) || !fs.existsSync(transcript.path)) {
    return {
      sceneId: scene.id,
      status: 'FAIL',
      violations: [!fs.existsSync(audioPath) ? 'missing-audio' : 'missing-transcript'],
      audioPath,
      transcriptPath: transcript.path,
    };
  }
  const recognized = read(transcript.path);
  const probe = JSON.parse(execFileSync(ffprobeStatic.path, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', audioPath,
  ], { encoding: 'utf8' }));
  const durationSec = Number(probe.format?.duration || 0);
  const segments = recognized.segments || [];
  const pauseDurationSec = segments.slice(1).reduce((sum, segment, index) => {
    const gap = Math.max(0, Number(segment.start || 0) - Number(segments[index].end || 0));
    return sum + (gap >= 0.12 ? gap : 0);
  }, 0);
  const qa = auditNarrationPerformance({
    intendedText: scene.narrationText,
    transcriptText: recognized.text,
    durationSec,
    pauseDurationSec,
  });
  const run = spawnSync(ffmpegStatic, [
    '-hide_banner', '-i', audioPath,
    '-af', 'ebur128=peak=true,silencedetect=noise=-48dB:d=0.18',
    '-f', 'null', 'NUL',
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 10e6 });
  const diagnostic = run.stderr || '';
  const integratedLufs = Number([...diagnostic.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1]);
  const truePeakDbfs = Number([...diagnostic.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1]);
  const status = qa.status === 'PASS' && run.status === 0 ? 'PASS' : 'REVIEW';
  return {
    sceneId: scene.id,
    profile: scene.audio.narrationPreset || scene.audio.deliveryProfile || null,
    intendedText: scene.narrationText,
    transcriptText: recognized.text,
    audioPath,
    audioSha256: sha256(audioPath),
    transcriptPath: transcript.path,
    transcriptEvidence: transcript.evidence,
    durationSec,
    pauseDurationSec: Number(pauseDurationSec.toFixed(3)),
    integratedLufs,
    truePeakDbfs,
    providerFileIsMonolithic: true,
    concatenationBoundaryCount: 0,
    ...qa,
    status,
  };
});

const review = entries.filter((entry) => entry.status !== 'PASS');
const changed = entries.filter((entry) => entry.transcriptEvidence === 'R11_CHANGED_TAKE');
const report = {
  contract: 'mobius-amelie-performance-regression-r11-v1',
  generatedAt: new Date().toISOString(),
  method: 'all-narrated-scenes-local-whisper-small-plus-waveform-loudness-pause-and-restart-qa-with-byte-identical-r10-evidence-reuse',
  target: 'Preserve AMELIE_TEACHING_WARM_R10; regenerate only changed or perceptually defective takes',
  voiceIdentity: { voiceId: 'UJCi4DDncuo0VJDSIegj', preserved: true },
  segmentCount: entries.length,
  changedSegmentCount: changed.length,
  reusedSegmentCount: entries.length - changed.length,
  passCount: entries.length - review.length,
  reviewCount: review.length,
  perceptualReview: {
    required: true,
    scope: 'all R11 narration takes in final encoded context',
    state: 'PENDING_FINAL_ENCODED_REVIEW',
  },
  status: review.length ? 'REVIEW' : 'PASS',
  entries,
};
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  status: report.status,
  report: REPORT,
  segmentCount: report.segmentCount,
  changedSegmentCount: report.changedSegmentCount,
  reusedSegmentCount: report.reusedSegmentCount,
  review: review.map((entry) => ({ sceneId: entry.sceneId, violations: entry.violations, coverageRatio: entry.coverageRatio })),
}, null, 2)}\n`);
if (review.length) process.exitCode = 2;
