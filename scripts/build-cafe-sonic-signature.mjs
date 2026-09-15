#!/usr/bin/env node

/** Build the reusable recorded café/tabletop brand signature from local assets. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { BRAND_AUDIO_CONTRACT } from '../src/services/editorialStandard.cjs';

const sourceDir = resolve('src/assets/branding/sonic');
const outputPath = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'src/assets/branding/sonic/mobius-cafe-sonic-signature.wav');
const manifestPath = resolve(process.argv.includes('--meta') ? process.argv[process.argv.indexOf('--meta') + 1] : 'src/assets/branding/sonic/sonic-signature-manifest-v2.json');
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const duration = BRAND_AUDIO_CONTRACT.durationSec;
const variant = process.argv.includes('--variant') ? process.argv[process.argv.indexOf('--variant') + 1] : 'legacy';
const continuousCoffeePour = variant === 'r10';
const sources = [
  { id: 'room-murmur', filename: 'cafe-ambience-freesound-25813.mp3', gainDb: 0, selectedExcerptSec: [20, 23.6], timing: '0.0s–3.6s from source 20.0s–23.6s', transform: 'trim active social-café excerpt, lowpass 10000Hz, highpass 80Hz, continuous bed, 0.18s terminal fade only' },
  { id: 'water-fountain', filename: 'water-fountain-orangefreesounds-202108.mp3', gainDb: null, timing: 'audited, excluded from v5 mix', transform: 'not mixed: Director rejected waterfall-dominant identity' },
  { id: 'cafe-cup-saucer', filename: continuousCoffeePour ? 'kettle-pour-into-cup-cc0-60394.mp3' : 'cup-pour-local-reference-491088.mp3', gainDb: continuousCoffeePour ? -7.5 : -10.5, selectedExcerptSec: continuousCoffeePour ? [0.15, 3.0] : [0.2, 0.95], timing: continuousCoffeePour ? '~0.38s–3.23s' : '~0.72s–1.47s', transform: continuousCoffeePour ? 'continuous 2.85s real recorded pour/fill excerpt, delayed 380ms, integrated over the unchanged room bed' : 'trim 0.75s, delayed 720ms, integrated below continuous room bed' },
  { id: 'dice-roll-landing', filename: 'dice-roll-freesound-102631.mp3', gainDb: -8.5, timing: continuousCoffeePour ? '~2.12s–3.47s' : '~1.70s–3.05s', transform: continuousCoffeePour ? 'unchanged recorded cue, delayed slightly to preserve coffee-pour recognizability' : 'trim 1.35s, delayed 1700ms, integrated below continuous room bed' },
];
for (const source of sources) {
  source.path = resolve(sourceDir, source.filename);
  if (!existsSync(source.path)) throw new Error(`Missing recorded sonic source: ${source.path}`);
  source.sha256 = createHash('sha256').update(readFileSync(source.path)).digest('hex');
  source.selected = source.id !== 'water-fountain';
  source.sourceFamily = source.filename.includes('kettle-pour-into-cup')
    ? 'Director local reference pack; original Freesound 60394 by uwesoundboiz'
    : source.filename.includes('local-reference')
    ? 'Director local reference pack'
    : source.id === 'water-fountain' ? 'Orange Free Sounds'
      : 'Freesound community reference asset';
  source.sourceUrl = source.filename.includes('kettle-pour-into-cup')
    ? 'https://freesound.org/people/uwesoundboiz/sounds/60394/'
    : source.id === 'water-fountain'
    ? 'https://orangefreesounds.com/wp-content/uploads/2021/08/Outdoor-water-fountain-ambience.mp3'
    : null;
  source.licenseStatus = source.filename.includes('kettle-pour-into-cup')
    ? 'Creative Commons CC0 1.0; commercial use and modification permitted.'
    : source.id === 'water-fountain'
    ? 'Downloaded real recording; commercial publication clearance remains a human review item.'
    : 'Reference asset retained locally; external publication clearance remains a human review item.';
}

mkdirSync(dirname(outputPath), { recursive: true });
const legacyFilter = [
  '[0:a]atrim=start=20:end=23.6,asetpts=PTS-STARTPTS,volume=1.0,lowpass=f=10000,highpass=f=80,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.08,afade=t=out:st=3.42:d=0.18[room]',
  // Input 1 is the audited water source and is intentionally excluded. Keep
  // the source indices explicit so a rejected layer cannot leak into the mix.
  '[2:a]atrim=start=0.2:end=0.95,asetpts=PTS-STARTPTS,volume=0.30,adelay=720:all=1,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.04,afade=t=out:st=0.58:d=0.17[cup]',
  '[3:a]atrim=start=0.08:end=1.43,asetpts=PTS-STARTPTS,volume=0.38,adelay=1700:all=1,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.04,afade=t=out:st=1.12:d=0.23[dice]',
  '[room][cup][dice]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,loudnorm=I=-18:TP=-2:LRA=8:linear=true,alimiter=limit=0.94[out]',
].join(';');
const r10Filter = [
  '[0:a]atrim=start=20:end=23.6,asetpts=PTS-STARTPTS,volume=1.0,lowpass=f=10000,highpass=f=80,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.08,afade=t=out:st=3.42:d=0.18[room]',
  '[2:a]atrim=start=0.15:end=3.0,asetpts=PTS-STARTPTS,volume=0.42,adelay=380:all=1,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.06,afade=t=out:st=2.63:d=0.22[pour]',
  '[3:a]atrim=start=0.08:end=1.43,asetpts=PTS-STARTPTS,volume=0.38,adelay=2200:all=1,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.04,afade=t=out:st=1.12:d=0.23[dice]',
  '[room][pour][dice]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,loudnorm=I=-18:TP=-2:LRA=8:linear=true,alimiter=limit=0.94[out]',
].join(';');
const filter = continuousCoffeePour ? r10Filter : legacyFilter;
execFileSync(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-stream_loop', '-1', '-i', sources[0].path,
  '-i', sources[1].path,
  '-i', sources[2].path,
  '-i', sources[3].path,
  '-filter_complex', filter,
  '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-t', String(duration), outputPath,
], { windowsHide: true });

const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', outputPath], { encoding: 'utf8' }));
const stream = (probe.streams || []).find((item) => item.channels) || {};
const evidence = {
  version: continuousCoffeePour ? 'mobius-sonic-signature-r10' : 'mobius-sonic-signature-r8', contract: BRAND_AUDIO_CONTRACT, path: outputPath,
  sha256: createHash('sha256').update(readFileSync(outputPath)).digest('hex'),
  durationSec: Number(Number(probe.format?.duration || 0).toFixed(3)), sampleRate: Number(stream.sample_rate || 0), channels: Number(stream.channels || 0),
  audioRole: 'café-ludique sonic signature', spokenNarration: 'NONE', ttsGenerated: false, sources,
  mix: {
    order: continuousCoffeePour ? 'unchanged continuous social café room foundation → continuous coffee pour/fill at 0.38s → dice landing at 2.20s → unchanged terminal fade; water excluded' : 'continuous social café room foundation → integrated coffee/cup cue at 0.72s → integrated dice roll/landing at 1.70s → 0.18s terminal fade; water excluded',
    identityContour: ['café-room murmur remains present across the complete signature', 'water/fountain audited and excluded', continuousCoffeePour ? 'continuous 2.85-second CC0 real recording reads as a cup being filled; isolated plop forbidden' : 'coffee/cup cue remains identifiable without becoming an isolated plop', 'dice cue punctuates the room without replacing it'],
    continuity: { roomBedStartSec: 0, roomBedEndSec: 3.6, longestBedGapMsAllowed: 80, cueDominanceForbidden: true },
    coffeeCue: continuousCoffeePour ? { startSec: 0.38, endSec: 3.23, continuousDurationSec: 2.85, sourceExcerptSec: [0.15, 3.0], isolatedDropForbidden: true, sourceRecording: 'Freesound 60394', license: 'CC0-1.0' } : null,
    recordedAssetsOnly: true,
    syntheticAudio: false,
    intelligibleDialogue: false,
  },
};
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence, null, 2));
