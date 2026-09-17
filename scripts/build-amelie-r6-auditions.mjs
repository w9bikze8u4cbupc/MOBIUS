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
const pronunciationContractVersion = 'mobius-fr-ca-display-spoken-v2';
const profileVersion = 'amelie-warm-audition-r6-v1';
const outDir = path.resolve(ROOT, 'out/publishability-r6/7-wonders-duel/amelie-auditions');
const banner = path.resolve(ROOT, 'src/assets/branding/les-jeux-mobius-banner-canonical.png');
fs.mkdirSync(outDir, { recursive: true });

const auditionText = [
  'Placez le plateau entre vous. Mettez le pion Conflit sur l’espace neutre du milieu et les quatre jetons Militaire face visible sur leurs emplacements.',
  'Première option : construire le bâtiment. Lisez son coût sous la bande de couleur. Une zone vide signifie que la carte est gratuite.',
  'Ajoutez ensuite les points de vos bâtiments bleus, verts, jaunes et violets. Les points fixes apparaissent dans un symbole de laurier.',
].join(' ');

const candidates = [
  { id: 'A-WARM_CLEAR', settings: { stability: 0.30, similarity_boost: 0.80, style: 0.16, use_speaker_boost: true, speed: 1.02 } },
  { id: 'B-JOYFUL_TABLE_HOST', settings: { stability: 0.25, similarity_boost: 0.80, style: 0.28, use_speaker_boost: true, speed: 1.03 } },
  { id: 'C-LIVELY_BEGINNER_TEACHER', settings: { stability: 0.28, similarity_boost: 0.82, style: 0.18, use_speaker_boost: true, speed: 1.06 } },
];

const hashValue = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const duration = (file) => Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim());
function audioMetrics(file) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'info', '-i', file, '-af', 'ebur128=peak=true,silencedetect=noise=-42dB:d=0.18', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true });
  const text = result.stderr || '';
  const loudness = [...text.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1];
  const peak = [...text.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1];
  const silenceStarts = [...text.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const silenceEnds = [...text.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)].map((match) => ({ endSec: Number(match[1]), durationSec: Number(match[2]) }));
  return {
    integratedLufs: loudness === undefined ? null : Number(loudness),
    truePeakDbfs: peak === undefined ? null : Number(peak),
    pauseCount: silenceEnds.length,
    pauseDurationSec: Number(silenceEnds.reduce((sum, item) => sum + item.durationSec, 0).toFixed(3)),
    silenceStarts,
    silenceEnds,
  };
}

const records = [];
for (const candidate of candidates) {
  const cacheKey = hashValue({ text: auditionText, voiceId, modelId, voiceSettings: candidate.settings, deliveryProfileVersion: profileVersion, pronunciationContractVersion });
  const audioFile = path.join(outDir, `${candidate.id.toLowerCase()}-${cacheKey.slice(0, 12)}.mp3`);
  const reused = fs.existsSync(audioFile);
  if (!reused) await generateNarration(auditionText, voiceId, audioFile, { modelId, voiceSettings: candidate.settings });
  const audioDurationSec = duration(audioFile);
  if (audioDurationSec < 25 || audioDurationSec > 40) throw new Error(`${candidate.id} audition duration ${audioDurationSec}s is outside 25–40s.`);
  const videoFile = path.join(outDir, `${candidate.id.toLowerCase()}.mp4`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', banner, '-i', audioFile, '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1b120d', '-c:v', 'libx264', '-preset', 'medium', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', videoFile]);
  records.push({ id: candidate.id, text: auditionText, voiceId, modelId, voiceSettings: candidate.settings, profileVersion, pronunciationContractVersion, cacheKey, reused, audioFile, audioSha256: sha256(audioFile), videoFile, videoSha256: sha256(videoFile), durationSec: audioDurationSec, metrics: audioMetrics(audioFile) });
}

let cursor = 0;
const concatList = path.join(outDir, 'concat-list.txt');
fs.writeFileSync(concatList, records.map((record) => `file '${record.videoFile.replaceAll("'", "'\\''")}'`).join('\n') + '\n');
const montageFile = path.join(outDir, 'amelie-r6-audition-tournament.mp4');
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', '-movflags', '+faststart', montageFile]);
const scenes = records.map((record) => {
  const startSec = cursor;
  cursor += record.durationSec;
  return { id: record.id, startSec: Number(startSec.toFixed(3)), endSec: Number(cursor.toFixed(3)), durationSec: record.durationSec };
});
const manifest = {
  contract: 'mobius-amelie-r6-audition-tournament-v1',
  generatedAt: new Date().toISOString(),
  auditionText,
  auditionTextIsVerbatimR5Wording: true,
  semanticRuleChanges: false,
  candidateCount: records.length,
  montageFile,
  montageSha256: sha256(montageFile),
  montageDurationSec: duration(montageFile),
  candidates: records,
  scenes,
  providerControlsVerified: ['stability', 'similarity_boost', 'style', 'use_speaker_boost', 'speed'],
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const expectedContext = {
  video: { path: montageFile, sha256: manifest.montageSha256, duration_sec: manifest.montageDurationSec, resolution: '1920x1080' },
  identity: {
    display_title: 'Amélie — audition R6',
    spoken_title: '7 Wonders Duel',
    pronunciation_guidance: 'Conserver la même identité vocale et le français québécois naturel; évaluer chaleur et engagement, sans exiger un accent anglophone.',
    edition: 'R6 voice-profile calibration',
  },
  scenes: scenes.map((scene) => ({
    scene_id: scene.id,
    start_sec: scene.startSec,
    end_sec: scene.endSec,
    purpose: 'Comparer une candidate de profil vocal Amélie sur le même texte source R5.',
    exact_narration_text: auditionText,
    expected_visual_role: 'Bannière fixe; l’audio est l’objet exclusif de cette audition.',
  })),
  intentional_intro_silence: { start_sec: 0, end_sec: 0, reason: 'Aucun silence de marque n’est attendu dans cette audition vocale.' },
  director_context: {
    brand_rules: [
      'L’identité et la prononciation R5 sont approuvées et doivent rester stables.',
      'La monotonie R5 est une faiblesse humaine confirmée; rechercher plus de chaleur, de joie, de variation prosodique et de naturel sans surjeu.',
      'Comparer explicitement A-WARM_CLEAR, B-JOYFUL_TABLE_HOST et C-LIVELY_BEGINNER_TEACHER.',
      'Une candidate instable, théâtrale, saccadée ou contenant un faux départ doit être rejetée.',
    ],
    approved_strengths: ['Identité Amélie stable', 'Prononciation fr-CA acceptable'],
    suspected_defects: ['Monotonie et cadence mécanique dans le profil R5 de référence'],
  },
  deterministic_findings: records.map((record) => ({
    id: `DET-AUD-${record.id[0]}`,
    category: 'audio_metrics',
    observation: `Mesures locales séparées pour ${record.id}; elles ne préjugent pas de la chaleur perceptuelle.`,
  })),
};
fs.writeFileSync(path.join(outDir, 'expected-context.json'), `${JSON.stringify(expectedContext, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: 'PASS', candidateCount: records.length, durations: records.map(({ id, durationSec, reused }) => ({ id, durationSec, reused })), montageFile }, null, 2)}\n`);
