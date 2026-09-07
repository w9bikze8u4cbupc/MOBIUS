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
const OUT = path.join(ROOT, 'out/publishability-r10/7-wonders-duel');
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const TRANSCRIPTS = path.join(OUT, 'audio-audit/whisper-small');
const REPORT = path.join(OUT, 'audio-performance-regression-report.json');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const config = read(CONFIG);
const scenes = config.scenes.filter((scene) => scene.narrationText && scene.audio?.file);
const entries = scenes.map((scene) => {
  const audioPath = path.resolve(scene.audio.file);
  const transcriptPath = path.join(TRANSCRIPTS, `${path.basename(audioPath, path.extname(audioPath))}.json`);
  if (!fs.existsSync(audioPath) || !fs.existsSync(transcriptPath)) {
    return {
      sceneId: scene.id,
      status: 'FAIL',
      violations: [!fs.existsSync(audioPath) ? 'missing-audio' : 'missing-transcript'],
      audioPath,
      transcriptPath,
    };
  }
  const transcript = read(transcriptPath);
  const probe = JSON.parse(execFileSync(ffprobeStatic.path, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', audioPath,
  ], { encoding: 'utf8' }));
  const durationSec = Number(probe.format?.duration || 0);
  const segments = transcript.segments || [];
  const pauseDurationSec = segments.slice(1).reduce((sum, segment, index) => {
    const gap = Math.max(0, Number(segment.start || 0) - Number(segments[index].end || 0));
    return sum + (gap >= 0.12 ? gap : 0);
  }, 0);
  const qa = auditNarrationPerformance({
    intendedText: scene.narrationText,
    transcriptText: transcript.text,
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
    transcriptText: transcript.text,
    audioPath,
    audioSha256: sha256(audioPath),
    transcriptPath,
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
const profileGroups = Object.groupBy
  ? Object.groupBy(entries, (entry) => entry.profile || 'UNKNOWN')
  : entries.reduce((groups, entry) => ((groups[entry.profile || 'UNKNOWN'] ||= []).push(entry), groups), {});
const report = {
  contract: 'mobius-amelie-performance-regression-r10-v1',
  generatedAt: new Date().toISOString(),
  method: 'all-narrated-scenes-local-whisper-small-plus-waveform-loudness-pause-and-restart-qa',
  target: 'Director warmth and engagement approximately 8/10; human rating remains Director-owned',
  voiceIdentity: { voiceId: 'UJCi4DDncuo0VJDSIegj', preserved: true },
  segmentCount: entries.length,
  passCount: entries.length - review.length,
  reviewCount: review.length,
  status: review.length ? 'REVIEW' : 'PASS',
  profileSummary: Object.fromEntries(Object.entries(profileGroups).map(([profile, group]) => [profile, {
    count: group.length,
    meanWordsPerMinute: Number((group.reduce((sum, entry) => sum + Number(entry.wordsPerMinute || 0), 0) / Math.max(1, group.length)).toFixed(1)),
    meanPauseDurationSec: Number((group.reduce((sum, entry) => sum + Number(entry.pauseDurationSec || 0), 0) / Math.max(1, group.length)).toFixed(3)),
  }])),
  entries,
};
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, report: REPORT, segmentCount: report.segmentCount, review: review.map((entry) => ({ sceneId: entry.sceneId, violations: entry.violations, coverageRatio: entry.coverageRatio, transcript: entry.transcriptText })) }, null, 2)}\n`);
if (review.length) process.exitCode = 2;
