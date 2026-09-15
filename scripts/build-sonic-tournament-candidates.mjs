#!/usr/bin/env node

/** Build recorded-audio sonic candidates through the existing storyboard renderer. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { buildBrandIntro } from '../src/storyboard/tutorial_presentation.cjs';
import { BRAND_AUDIO_CONTRACT } from '../src/services/editorialStandard.cjs';

const root = resolve(process.cwd());
const referenceDir = resolve('C:/Users/danie/OneDrive/Desktop/MOBIUS Tuto/Matériel de référence 2 sept 2026');
const outputRoot = resolve(process.env.MOBIUS_SONIC_TOURNAMENT_OUTPUT_ROOT || 'out/mission-01/sonic-tournament-r1');
const bannerPath = resolve('src/assets/branding/les-jeux-mobius-banner-canonical.png');
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
// Twelve Labs requires analyzed videos to be at least four seconds.  The
// sonic identity itself still fades out at the canonical 3.6 s; tournament
// probes can carry a short silent banner tail without changing the production
// brand contract.
const durationSec = Number(process.env.MOBIUS_SONIC_TOURNAMENT_DURATION_SEC || BRAND_AUDIO_CONTRACT.durationSec);
if (!Number.isFinite(durationSec) || durationSec < BRAND_AUDIO_CONTRACT.durationSec) throw new Error('Tournament duration must be at least the canonical brand duration.');
const cupPath = resolve(referenceDir, 'flutie8211-pouring-coffee-into-cup-491088.mp3');
const dicePath = resolve(referenceDir, 'freesound_community-dice-102631.mp3');

const candidates = [
  { id: 'A-social-cafe-dominant', label: 'SOCIAL CAFÉ DOMINANT', ambience: 'freesound_community-ambience-coffee-shop-1-49769.mp3', ambienceGain: 1.0, cupGain: 0.9, diceGain: 0.9, cupDelayMs: 520, diceDelayMs: 1420 },
  { id: 'B-busy-game-night', label: 'BUSY GAME NIGHT', ambience: 'freesound_community-busy-coffee-shop-live-acoustic-guitar-music-61678.mp3', ambienceGain: 0.82, cupGain: 1.05, diceGain: 1.05, cupDelayMs: 500, diceDelayMs: 1320 },
  { id: 'C-warm-table-cafe', label: 'WARM TABLE CAFÉ', ambience: 'freesound_community-ambience-coffee-shop-3-25813.mp3', ambienceGain: 1.0, cupGain: 0.95, diceGain: 0.95, cupDelayMs: 560, diceDelayMs: 1480 },
];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const ensure = (file) => { if (!existsSync(file)) throw new Error(`Missing local Director audio asset: ${file}`); };
const sourceRecord = (id, file, role, gain, timing, transform) => ({ id, role, filename: file.split(/[\\/]/).at(-1), path: file, sha256: sha256(file), gain, timing, transform, sourceFamily: 'Director-supplied local reference library', sourceUrl: null, selected: true });

function buildCandidate(spec) {
  const ambiencePath = resolve(referenceDir, spec.ambience);
  [bannerPath, ambiencePath, cupPath, dicePath].forEach(ensure);
  const dir = resolve(outputRoot, spec.id);
  mkdirSync(dir, { recursive: true });
  const audioPath = resolve(dir, 'sonic-signature.wav');
  const filter = [
    `[0:a]atrim=duration=${durationSec},volume=${spec.ambienceGain},highpass=f=80,lowpass=f=9000,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.10,afade=t=out:st=${Math.max(0, durationSec - 0.6)}:d=0.6[room]`,
    `[1:a]atrim=duration=1.0,volume=${spec.cupGain},adelay=${spec.cupDelayMs}:all=1,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.03,afade=t=out:st=0.72:d=0.25[cup]`,
    `[2:a]atrim=duration=1.65,volume=${spec.diceGain},adelay=${spec.diceDelayMs}:all=1,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.03,afade=t=out:st=1.30:d=0.30[dice]`,
    `[room][cup][dice]amix=inputs=3:duration=first:dropout_transition=0,aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,loudnorm=I=-16:TP=-2:LRA=7:linear=true,alimiter=limit=0.94,afade=t=in:st=0:d=0.10,afade=t=out:st=${Math.max(0, durationSec - 0.6)}:d=0.6[out]`,
  ].join(';');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', ambiencePath, '-i', cupPath, '-i', dicePath, '-filter_complex', filter, '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-t', String(durationSec), audioPath], { windowsHide: true });
  const sources = [
    sourceRecord('room-murmur', ambiencePath, 'café room / human murmur', spec.ambienceGain, '0.0–3.6 s', 'trim/loop, high-pass 80 Hz, low-pass 9000 Hz, fades'),
    sourceRecord('cafe-cup-saucer', cupPath, 'cup / coffee tactile cue', spec.cupGain, `${spec.cupDelayMs} ms`, 'trim 1.0 s, delayed, fades'),
    sourceRecord('dice-roll-landing', dicePath, 'dice / tabletop tactile cue', spec.diceGain, `${spec.diceDelayMs} ms`, 'trim 1.65 s, delayed, fades'),
  ];
  const manifest = { version: 'mobius-sonic-tournament-candidate-v1', candidateId: spec.id, label: spec.label, durationSec, bannerPath, audioPath, audioSha256: sha256(audioPath), sources, waterIncluded: false, syntheticAudio: false, intelligibleDialogue: false, mix: { hierarchy: 'café room foundation → cup punctuation → dice punctuation', gains: { ambience: spec.ambienceGain, cup: spec.cupGain, dice: spec.diceGain }, delaysMs: { cup: spec.cupDelayMs, dice: spec.diceDelayMs } } };
  writeFileSync(resolve(dir, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const scene = buildBrandIntro({ bannerPath, audio: { ambientFile: audioPath, ambientGain: 1.0, ambientFadeOutSec: 0.72 } });
  scene.durationSec = durationSec;
  const config = { projectId: `sonic-tournament-${spec.id}`, video: { resolution: { width: 1920, height: 1080 }, fps: 30 }, scenes: [scene], editorial: { brandAudio: BRAND_AUDIO_CONTRACT, sonicCandidate: manifest } };
  const configPath = resolve(dir, 'render-config.json');
  const videoPath = resolve(dir, 'candidate-preview.mp4');
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  execFileSync(process.execPath, [resolve(root, 'scripts/render-storyboard-ffmpeg.mjs'), '--config', configPath, '--out', videoPath], { cwd: root, stdio: 'inherit', windowsHide: true });
  const videoSha256 = sha256(videoPath);
  const expectedContext = {
    video: { path: videoPath, sha256: videoSha256, duration_sec: durationSec, resolution: '1920x1080' },
    identity: { display_title: 'Les Jeux Mobius — sonic identity candidate', spoken_title: 'NONE', pronunciation_guidance: 'Aucune parole Amélie dans la signature.' },
    candidate: { id: spec.id, label: spec.label, recorded_sources: sources.map(({ id, filename, sha256: sourceSha256, role }) => ({ id, filename, sha256: sourceSha256, role })) },
    scenes: [{ scene_id: 'brand-intro', start_sec: 0, end_sec: durationSec, exact_narration_text: 'NONE', purpose: 'Évaluer exclusivement la signature sonore de marque.', expected_visual_role: 'Bannière Les Jeux Mobius seule.' }],
    intentional_intro_silence: { start_sec: 0, end_sec: durationSec, reason: 'Aucune narration Amélie par contrat.' },
    director_context: { brand_rules: ['Ambiance café humaine comme fond identitaire.', 'Cue tasse et cue dés reconnaissables.', 'Aucune eau/fountain dans les candidats.'], suspected_defects: [] },
    deterministic_findings: [{ id: 'DET-TOURNAMENT-001', category: 'media_integrity', observation: 'La durée, la résolution et les sources sont conservées séparément; la perception reste à juger par le fournisseur/humain.' }],
  };
  const expectedContextPath = resolve(dir, 'expected-context.json');
  writeFileSync(expectedContextPath, `${JSON.stringify(expectedContext, null, 2)}\n`, 'utf8');
  return { ...manifest, configPath, videoPath, videoSha256, expectedContextPath };
}

mkdirSync(dirname(outputRoot), { recursive: true });
const results = candidates.map(buildCandidate);
writeFileSync(resolve(outputRoot, 'tournament-manifest.json'), `${JSON.stringify({ version: 'mobius-sonic-tournament-r1', generatedAt: new Date().toISOString(), referenceDir, bannerPath, candidates: results }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(results.map(({ id, audioPath, audioSha256, videoPath, videoSha256 }) => ({ id, audioPath, audioSha256, videoPath, videoSha256 })), null, 2));
