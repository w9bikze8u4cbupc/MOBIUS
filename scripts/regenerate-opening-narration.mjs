#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { generateNarration, ELEVENLABS_MODEL_ID } from '../src/services/elevenLabsService.js';
import { DEFAULT_NARRATION_PRESET, getNarrationPreset, prepareNarrationText } from '../src/services/editorialStandard.cjs';
import { sanitizeNarrationGameIdentity } from '../src/services/gameIdentity.cjs';
import ffprobeStatic from 'ffprobe-static';
import ffmpegStatic from 'ffmpeg-static';

const FFPROBE = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const FFMPEG = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function required(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing required option --${name}`);
  return process.argv[index + 1];
}

function optional(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function probe(filePath) {
  const raw = execFileSync(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', filePath,
  ], { encoding: 'utf8' });
  const value = JSON.parse(raw);
  const stream = (value.streams || []).find((item) => item.channels);
  return {
    durationMs: Math.round(Number(value.format?.duration || 0) * 1000),
    sampleRate: Number(stream?.sample_rate || 0),
    channels: Number(stream?.channels || 0),
  };
}

function padBrandSignature(filePath, targetDurationSec) {
  const current = probe(filePath);
  const targetMs = Math.round(Number(targetDurationSec || 0) * 1000);
  if (!targetMs || current.durationMs >= targetMs - 20) return current;
  const temporary = `${filePath}.padded.mp3`;
  execFileSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', filePath,
    '-af', `apad=pad_dur=${Math.max(0, targetMs / 1000 - current.durationMs / 1000).toFixed(3)}`,
    '-t', (targetMs / 1000).toFixed(3), '-codec:a', 'libmp3lame', '-q:a', '2', temporary,
  ], { windowsHide: true });
  copyFileSync(temporary, filePath);
  unlinkSync(temporary);
  return probe(filePath);
}

function main() {
  const configPath = resolve(required('config'));
  const audioDir = resolve(required('audio-dir'));
  const sidecarPath = resolve(required('sidecar'));
  const voiceId = optional('voice-id', process.env.ELEVENLABS_VOICE_ID_AMELIE || null);
  const requestedScenes = new Set(required('scenes').split(',').map((value) => value.trim()).filter(Boolean));
  const selectedScenes = new Set([...requestedScenes].filter((sceneId) => sceneId !== 'brand-intro'));
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const sidecar = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf8')) : {};
  const preset = getNarrationPreset(config.narration?.narrationPreset || DEFAULT_NARRATION_PRESET);
  const language = config.language || 'fr-CA';
  const resolvedVoiceId = voiceId || sidecar.voiceId;
  if (!resolvedVoiceId) throw new Error('No Amélie voice id supplied by --voice-id, ELEVENLABS_VOICE_ID_AMELIE, or the sidecar.');
  if (!process.env.ELEVENLABS_API_KEY?.trim()) throw new Error('ELEVENLABS_API_KEY is not configured.');

  const assets = new Map((Array.isArray(sidecar.assets) ? sidecar.assets : [])
    .filter((asset) => asset?.sceneId)
    .map((asset) => [asset.sceneId, asset]));
  const results = [];
  if (requestedScenes.has('brand-intro')) {
    assets.delete('brand-intro');
    results.push({ sceneId: 'brand-intro', action: 'skipped-no-speech', ttsGenerated: false, audioRole: 'café-ludique sonic signature' });
  }
  mkdirSync(audioDir, { recursive: true });
  return Promise.all([...selectedScenes].map(async (sceneId) => {
    const scene = (config.scenes || []).find((candidate) => candidate.id === sceneId);
    if (!scene) throw new Error(`Scene '${sceneId}' is not present in ${configPath}.`);
    const text = prepareNarrationText(sanitizeNarrationGameIdentity(scene.narrationText || scene.narration || scene.spokenText, config.identity || {}));
    const target = join(audioDir, `${sceneId}.mp3`);
    const existing = assets.get(sceneId);
    const existingPath = existing?.filePath && existsSync(existing.filePath) ? existing.filePath : target;
    const opening = sceneId === 'metadata-card';
    const voiceSettings = opening
      ? (preset.openingVoiceSettings || preset.voiceSettings)
      : sceneId === 'brand-outro'
        ? (preset.outroVoiceSettings || preset.voiceSettings)
        : preset.voiceSettings;
    const voiceSettingsHash = hashValue(voiceSettings);
    const compatible = existing
      && existing.sourceText === text
      && existing.providerVoiceId === resolvedVoiceId
      && existing.language === language
      && existing.modelId === preset.modelId
      && existing.narrationPreset === preset.id
      && existing.narrationPresetHash === hashValue(preset)
      && existing.voiceSettingsHash === voiceSettingsHash
      && existsSync(existingPath);
    let action = 'reused';
    if (!compatible) {
      await generateNarration(text, resolvedVoiceId, target, {
        modelId: preset.modelId,
        voiceSettings,
      });
      action = 'generated';
    }
    const media = sceneId === 'brand-intro'
      ? padBrandSignature(target, config.editorial?.brandAudio?.durationSec || 3.6)
      : probe(target);
    const record = {
      id: `narration-${sceneId}`,
      sceneId,
      provider: 'elevenlabs',
      providerVoiceId: resolvedVoiceId,
      modelId: preset.modelId,
      language,
      sourceText: text,
      narrationPreset: preset.id,
      narrationPresetHash: hashValue(preset),
      sourceTextHash: hashValue({ text, voiceId: resolvedVoiceId, language, modelId: preset.modelId, narrationPreset: preset.id, voiceSettings }),
      voiceSettingsHash,
      filePath: target,
      rawFilePath: target,
      ...media,
      status: 'ready',
    };
    assets.set(sceneId, record);
    results.push({ sceneId, action, durationMs: media.durationMs, sourceTextHash: record.sourceTextHash });
  })).then(() => {
    const output = {
      ...sidecar,
      provider: 'elevenlabs',
      voiceName: config.narration?.voiceName || sidecar.voiceName || 'Amélie',
      voiceId: resolvedVoiceId,
      language,
      modelId: preset.modelId,
      narrationPreset: preset.id,
      narrationPresetHash: hashValue(preset),
      voiceSettings: preset.voiceSettings,
      openingVoiceSettings: preset.openingVoiceSettings || null,
      assets: [...assets.values()],
    };
    mkdirSync(dirname(sidecarPath), { recursive: true });
    writeFileSync(sidecarPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ configPath, audioDir, sidecarPath, results }, null, 2));
  });
}

main().catch((error) => {
  console.error(`[regenerate-opening-narration] ${error.message}`);
  process.exitCode = 1;
});
