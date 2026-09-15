#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { generateNarration } from '../src/services/elevenLabsService.js';

const ROOT = path.resolve(process.cwd());
dotenv.config({ path: path.join(ROOT, '.env'), override: false });
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const voiceId = process.env.ELEVENLABS_VOICE_ID_AMELIE || 'UJCi4DDncuo0VJDSIegj';
const modelId = 'eleven_multilingual_v2';
const profileVersion = 'amelie-performance-audition-r10-v1';
const pronunciationContractVersion = 'mobius-fr-ca-display-spoken-v2';
const outDir = path.resolve(ROOT, 'out/publishability-r10/7-wonders-duel/amelie-auditions');
fs.mkdirSync(outDir, { recursive: true });

// Unchanged source-grounded wording sampled across setup, action teaching,
// system teaching, scoring and the invitation to keep playing.
const auditionText = [
  'Placez le plateau entre vous. Mettez le pion Conflit sur l’espace neutre du milieu et les quatre jetons Militaire face visible sur leurs emplacements.',
  'À votre tour, choisissez une carte accessible, puis construisez-la, défaussez-la pour obtenir des pièces, ou utilisez-la pour bâtir une Merveille.',
  'Une paire de symboles scientifiques identiques vous permet de choisir immédiatement un jeton Progrès.',
  'Au décompte, avancez catégorie par catégorie et additionnez seulement les points réellement indiqués par votre partie.',
].join(' ');

const candidates = [
  { id: 'A-WARM_CONSISTENT', settings: { stability: 0.29, similarity_boost: 0.84, style: 0.38, use_speaker_boost: true, speed: 1.03 } },
  { id: 'B-SMILING_TABLE_HOST', settings: { stability: 0.23, similarity_boost: 0.84, style: 0.48, use_speaker_boost: true, speed: 1.03 } },
  { id: 'C-LIVELY_CAFE_TEACHER', settings: { stability: 0.27, similarity_boost: 0.86, style: 0.42, use_speaker_boost: true, speed: 1.04 } },
];

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileDigest = (file) => digest(fs.readFileSync(file));
const duration = (file) => Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim());
function metrics(file) {
  const run = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'info', '-i', file, '-af', 'ebur128=peak=true,silencedetect=noise=-42dB:d=0.18', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true });
  const text = run.stderr || '';
  const loudness = [...text.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1];
  const peak = [...text.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1];
  const pauses = [...text.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[2]));
  return { integratedLufs: Number(loudness), truePeakDbfs: Number(peak), pauseCount: pauses.length, pauseDurationSec: Number(pauses.reduce((a, b) => a + b, 0).toFixed(3)) };
}

const records = [];
for (const candidate of candidates) {
  const cacheKey = digest(JSON.stringify({ auditionText, voiceId, modelId, settings: candidate.settings, profileVersion, pronunciationContractVersion }));
  const audioPath = path.join(outDir, `${candidate.id.toLowerCase()}-${cacheKey.slice(0, 12)}.mp3`);
  const reused = fs.existsSync(audioPath);
  if (!reused) await generateNarration(auditionText, voiceId, audioPath, { modelId, voiceSettings: candidate.settings });
  records.push({ ...candidate, cacheKey, audioPath, sha256: fileDigest(audioPath), durationSec: duration(audioPath), metrics: metrics(audioPath), reused });
}

const manifest = {
  contract: 'mobius-amelie-performance-audition-r10-v1',
  generatedAt: new Date().toISOString(),
  semanticRuleChanges: false,
  auditionText,
  voiceId,
  modelId,
  pronunciationContractVersion,
  candidates: records,
  providerControlsVerified: ['stability', 'similarity_boost', 'style', 'use_speaker_boost', 'speed'],
  directorCalibration: { r9WarmthApprox: 6, targetWarmthApprox: 8, voiceIdentityMustRemain: true, falseStartsAllowed: false },
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', candidates: records.map(({ id, durationSec, metrics, reused, audioPath }) => ({ id, durationSec, metrics, reused, audioPath })) }, null, 2));
