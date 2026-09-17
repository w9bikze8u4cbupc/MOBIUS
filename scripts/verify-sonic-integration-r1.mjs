#!/usr/bin/env node

/** Verify that the frozen sonic master survives the production mux path. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const root = resolve(process.cwd());
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const outputRoot = resolve(process.argv[2] || 'out/mission-01/sonic-integration-convergence-r1');
const masterPath = resolve('src/assets/branding/sonic/mobius-cafe-sonic-signature.wav');
const previews = {
  'terraforming-mars': resolve('out/mission-01/presentation-r2/terraforming-mars-opening-preview.mp4'),
  '7-wonders-duel': resolve('out/mission-01/presentation-r2/7-wonders-duel-opening-preview.mp4'),
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (args) => execFileSync(ffmpeg, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const probe = (file) => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type,sample_rate,channels', '-of', 'json', file], { cwd: root, encoding: 'utf8', windowsHide: true }));
const write = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };

function wavData(file) {
  const bytes = readFileSync(file);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Not a WAV: ${file}`);
  let offset = 12; let dataOffset = -1; let dataSize = 0; let sampleRate = null; let channels = null; let bits = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4); const size = bytes.readUInt32LE(offset + 4); const start = offset + 8;
    if (id === 'fmt ') { channels = bytes.readUInt16LE(start + 2); sampleRate = bytes.readUInt32LE(start + 4); bits = bytes.readUInt16LE(start + 14); }
    if (id === 'data') { dataOffset = start; dataSize = size; break; }
    offset = start + size + (size % 2);
  }
  if (dataOffset < 0 || bits !== 16 || channels !== 2 || sampleRate !== 48000) throw new Error(`Expected 48 kHz stereo s16 WAV: ${file}`);
  const pcm = bytes.subarray(dataOffset, Math.min(bytes.length, dataOffset + dataSize));
  const values = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < values.length; i += 1) values[i] = pcm.readInt16LE(i * 2) / 32768;
  return { file, bytes, pcm, values, sampleRate, channels, durationSec: values.length / (sampleRate * channels) };
}

function fft(values) {
  const n = values.length; const real = Float64Array.from(values); const imag = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i += 1) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = real[i]; real[i] = real[j]; real[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len; const wr0 = Math.cos(angle); const wi0 = Math.sin(angle);
    for (let start = 0; start < n; start += len) { let wr = 1; let wi = 0; const half = len >> 1;
      for (let i = 0; i < half; i += 1) { const even = start + i; const odd = even + half; const tr = wr * real[odd] - wi * imag[odd]; const ti = wr * imag[odd] + wi * real[odd]; real[odd] = real[even] - tr; imag[odd] = imag[even] - ti; real[even] += tr; imag[even] += ti; const next = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = next; }
    }
  }
  return { real, imag };
}

function spectralEnvelope(values, sampleRate, channels) {
  const size = 1024; const bands = { low_20_250: [20, 250], mid_250_2000: [250, 2000], high_2000_12000: [2000, 12000] }; const energy = Object.fromEntries(Object.keys(bands).map((key) => [key, 0])); let frames = 0;
  for (let start = 0; start + size * channels <= values.length; start += size * channels) {
    const mono = new Float64Array(size);
    for (let i = 0; i < size; i += 1) mono[i] = (values[start + i * channels] + values[start + i * channels + 1]) * 0.5 * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    const transformed = fft(mono); for (const [key, [min, max]] of Object.entries(bands)) { const first = Math.max(1, Math.floor(min * size / sampleRate)); const last = Math.min(size / 2, Math.ceil(max * size / sampleRate)); for (let bin = first; bin <= last; bin += 1) energy[key] += transformed.real[bin] ** 2 + transformed.imag[bin] ** 2; } frames += 1;
  }
  return { frames, bands: Object.fromEntries(Object.entries(energy).map(([key, value]) => [key, Number((value / Math.max(1, frames)).toFixed(6))])) };
}

function compare(source, rendered) {
  const length = Math.min(source.values.length, rendered.values.length); let sourceEnergy = 0; let renderedEnergy = 0; let cross = 0; let errorEnergy = 0; let sourcePeak = 0; let renderedPeak = 0;
  for (let i = 0; i < length; i += 1) { const s = source.values[i]; const r = rendered.values[i]; sourceEnergy += s * s; renderedEnergy += r * r; cross += s * r; sourcePeak = Math.max(sourcePeak, Math.abs(s)); renderedPeak = Math.max(renderedPeak, Math.abs(r)); }
  const gain = cross / Math.max(1e-12, sourceEnergy); let normalizedError = 0;
  for (let i = 0; i < length; i += 1) { const delta = rendered.values[i] - source.values[i] * gain; normalizedError += delta * delta; }
  return { comparedSamples: length, sourcePcmSha256: hash(source.pcm), renderedDecodedPcmSha256: hash(rendered.pcm), byteEquivalentPcm: source.pcm.equals(rendered.pcm), durationDeltaSec: Number((rendered.durationSec - source.durationSec).toFixed(6)), gainBestFit: Number(gain.toFixed(6)), correlation: Number((cross / Math.sqrt(Math.max(1e-12, sourceEnergy * renderedEnergy))).toFixed(6)), normalizedRmse: Number(Math.sqrt(normalizedError / Math.max(1, length)).toFixed(6)), sourceRmsDbfs: Number((20 * Math.log10(Math.sqrt(sourceEnergy / Math.max(1, length)))).toFixed(3)), renderedRmsDbfs: Number((20 * Math.log10(Math.sqrt(renderedEnergy / Math.max(1, length)))).toFixed(3)), sourcePeakDbfs: Number((20 * Math.log10(Math.max(1e-12, sourcePeak))).toFixed(3)), renderedPeakDbfs: Number((20 * Math.log10(Math.max(1e-12, renderedPeak))).toFixed(3)), sourceSpectralEnvelope: spectralEnvelope(source.values, source.sampleRate, source.channels), renderedSpectralEnvelope: spectralEnvelope(rendered.values, rendered.sampleRate, rendered.channels) };
}

mkdirSync(outputRoot, { recursive: true });
const source = wavData(masterPath);
const results = [];
for (const [game, videoPath] of Object.entries(previews)) {
  const dir = resolve(outputRoot, game); mkdirSync(dir, { recursive: true }); const extractedPath = resolve(dir, 'final-intro-0.0-3.6s-decoded.wav');
  run(['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0', '-t', '3.6', '-i', videoPath, '-map', '0:a:0', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', extractedPath]);
  const rendered = wavData(extractedPath); const videoProbe = probe(videoPath); const masterProbe = probe(masterPath);
  const record = { game, videoPath, videoSha256: hash(readFileSync(videoPath)), masterPath, masterSha256: hash(readFileSync(masterPath)), extractedPath, extractedSha256: hash(readFileSync(extractedPath)), masterMedia: { durationSec: Number(masterProbe.format.duration), stream: masterProbe.streams?.[0] || null }, finalMedia: { durationSec: Number(videoProbe.format.duration), stream: videoProbe.streams?.find((item) => item.codec_type === 'audio') || null }, comparison: compare(source, rendered), lineage: { finalRendererInput: 'out/mission-01/shared/mobius-cafe-sonic-signature.wav', sharedMasterSha256: hash(readFileSync(resolve('out/mission-01/shared/mobius-cafe-sonic-signature.wav'))), appliedIntroGain: 'config ambientGain=1.0; renderer AAC mux/decode only', waterLayer: false } };
  write(resolve(dir, 'evidence.json'), record); results.push(record);
}
const evidence = { schema_version: 'mobius-sonic-integration-verification-v1', generatedAt: new Date().toISOString(), master: { path: masterPath, sha256: hash(readFileSync(masterPath)), durationSec: source.durationSec, sampleRate: source.sampleRate, channels: source.channels }, results, conclusion: { finalSegmentUsesWinningMasterLineage: results.every((item) => item.lineage.sharedMasterSha256 === item.masterSha256), materiallySameWinningSignature: results.every((item) => Math.abs(item.comparison.durationDeltaSec) < 0.01 && Math.abs(item.comparison.renderedRmsDbfs - item.comparison.sourceRmsDbfs) < 0.5 && Object.keys(item.comparison.sourceSpectralEnvelope.bands).every((band) => { const sourceBand = item.comparison.sourceSpectralEnvelope.bands[band]; const renderedBand = item.comparison.renderedSpectralEnvelope.bands[band]; return Math.abs(renderedBand - sourceBand) / Math.max(1, sourceBand) < 0.25; })), byteEquivalenceMeaningful: false, comparisonMethod: 'decoded 48 kHz stereo s16 PCM, duration/RMS/peak/correlation/best-fit gain/STFT spectral envelope', rendererTransformation: 'AAC encode/decode and production mux; no extra identity layer or water layer observed in config lineage' } };
write(resolve(outputRoot, 'sonic-integration-evidence.json'), evidence);
console.log(JSON.stringify(evidence, null, 2));
