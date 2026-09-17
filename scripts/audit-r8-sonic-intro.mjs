#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const ROOT = path.resolve(process.cwd());
const MASTER = path.join(ROOT, 'src/assets/branding/sonic/mobius-cafe-sonic-signature-r8.wav');
const MANIFEST = path.join(ROOT, 'src/assets/branding/sonic/sonic-signature-manifest-r8.json');
const OUT = path.join(ROOT, 'out/publishability-r8/7-wonders-duel/audio');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(MASTER) || !fs.existsSync(MANIFEST)) throw new Error('R8 sonic master or manifest is missing.');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const media = JSON.parse(spawnSync(ffprobeStatic.path, [
  '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,sample_rate,channels', '-of', 'json', MASTER,
], { encoding: 'utf8', windowsHide: true }).stdout);
const pcmRun = spawnSync(ffmpegStatic, ['-v', 'error', '-i', MASTER, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], {
  encoding: null, windowsHide: true, maxBuffer: 20e6,
});
if (pcmRun.status !== 0) throw new Error(String(pcmRun.stderr));
const pcm = pcmRun.stdout;
const windowSamples = 4800;
const windows = [];
for (let start = 0; start < pcm.length / 4; start += windowSamples) {
  const end = Math.min(pcm.length / 4, start + windowSamples);
  let sumSquares = 0;
  for (let sample = start; sample < end; sample += 1) {
    const value = pcm.readFloatLE(sample * 4);
    sumSquares += value * value;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
  windows.push({
    startSec: Number((start / 48000).toFixed(3)),
    endSec: Number((end / 48000).toFixed(3)),
    rmsDbfs: Number((20 * Math.log10(Math.max(rms, 1e-9))).toFixed(2)),
  });
}
const selectedSources = (manifest.sources || []).filter((layer) => layer.selected !== false);
const searchable = (layer) => `${layer.id || ''} ${layer.role || ''} ${layer.kind || ''} ${layer.filename || layer.sourceFilename || ''}`;
const speechLayer = selectedSources.find((layer) => /amelie|speech|voice/i.test(searchable(layer)));
const waterLayer = selectedSources.find((layer) => /water|fountain|fontaine|eau/i.test(searchable(layer)));
const roomLayer = selectedSources.find((layer) => /café|cafe|room|murmur|human/i.test(searchable(layer)));
const cupLayer = selectedSources.find((layer) => /cup|coffee|tasse|saucer/i.test(searchable(layer)));
const diceLayer = selectedSources.find((layer) => /dice|dé|tabletop/i.test(searchable(layer)));
const durationSec = Number(media.format.duration);
const maxQuietWindowDbfs = Math.max(...windows.map((entry) => entry.rmsDbfs));
const minWindowDbfs = Math.min(...windows.map((entry) => entry.rmsDbfs));
const checks = {
  durationIsCompleteSignature: durationSec >= 3.55 && durationSec <= 3.65,
  continuousAudibleBed: windows.every((entry) => entry.rmsDbfs > -46),
  realCafeRoomRunsFullDuration: Boolean(roomLayer)
    && Array.isArray(roomLayer.selectedExcerptSec)
    && Number(roomLayer.selectedExcerptSec[1]) - Number(roomLayer.selectedExcerptSec[0]) >= 3.55
    && manifest.mix?.continuity?.roomBedStartSec === 0
    && Number(manifest.mix?.continuity?.roomBedEndSec) >= 3.55,
  cupCuePresent: Boolean(cupLayer),
  diceCuePresent: Boolean(diceLayer),
  waterAbsent: !waterLayer,
  amelieAbsent: !speechLayer,
  stereo48k: media.streams.some((stream) => stream.codec_type === 'audio' && Number(stream.sample_rate) === 48000 && Number(stream.channels) === 2),
};

for (const [name, filter] of Object.entries({
  waveform: 'showwavespic=s=1920x320:colors=0xE8BD62',
  spectrogram: 'showspectrumpic=s=1920x600:legend=1:color=fiery:scale=sqrt',
})) {
  const output = path.join(OUT, `sonic-intro-${name}.png`);
  const run = spawnSync(ffmpegStatic, ['-y', '-v', 'error', '-i', MASTER, '-lavfi', filter, '-frames:v', '1', output], { encoding: 'utf8', windowsHide: true });
  if (run.status !== 0) throw new Error(run.stderr);
}

const report = {
  contract: 'mobius-r8-sonic-intro-audit-v1',
  generatedAt: new Date().toISOString(),
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  master: { path: MASTER, sha256: sha256(MASTER), durationSec, media },
  checks,
  windowAnalysis: { windowSec: 0.1, minRmsDbfs: minWindowDbfs, maxRmsDbfs: maxQuietWindowDbfs, windows },
  construction: { roomLayer, cupLayer, diceLayer, waterLayer: waterLayer || null, speechLayer: speechLayer || null },
  physicalReviewAids: {
    waveform: path.join(OUT, 'sonic-intro-waveform.png'),
    spectrogram: path.join(OUT, 'sonic-intro-spectrogram.png'),
  },
};
fs.writeFileSync(path.join(OUT, 'sonic-intro-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, checks, minWindowDbfs, durationSec, output: OUT }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
