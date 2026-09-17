#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const root = resolve(process.cwd());
const outputDir = resolve('out/mission-01');
const changed = {
  'terraforming-mars': new Set(['metadata-card', 'brand-outro']),
  '7-wonders-duel': new Set(['metadata-card', 'scene-section-01-1', 'brand-outro']),
};
const iterationStatus = {
  'terraforming-mars': { 'metadata-card': 'regenerated', 'brand-outro': 'reused' },
  '7-wonders-duel': { 'metadata-card': 'regenerated', 'scene-section-01-1': 'regenerated', 'brand-outro': 'reused' },
};
const configs = {
  'terraforming-mars': resolve('out/mission-01/terraforming-mars/render-config.json'),
  '7-wonders-duel': resolve('out/mission-01/7-wonders-duel/render-config.json'),
};
const sidecars = {
  'terraforming-mars': resolve('out/mission-01/terraforming-mars/narration-assets.json'),
  '7-wonders-duel': resolve('out/mission-01/7-wonders-duel/narration-assets.json'),
};
const transcriptDirs = {
  'terraforming-mars': resolve('out/mission-01/terraforming-mars/speech-verification-small'),
  '7-wonders-duel': resolve('out/mission-01/7-wonders-duel/speech-verification-small'),
};

function read(path, fallback = {}) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}
function bodyText(scene) {
  return scene?.overlays?.find((overlay) => overlay.type === 'body')?.text || 'NONE';
}

const entries = [];
for (const [game, configPath] of Object.entries(configs)) {
  const config = read(configPath);
  const sidecar = read(sidecars[game]);
  const assets = new Map((sidecar.assets || []).map((asset) => [asset.sceneId, asset]));
  for (const scene of config.scenes || []) {
    if (!changed[game].has(scene.id)) continue;
    if (scene.id === 'brand-intro') continue;
    const asset = assets.get(scene.id);
    const transcriptPath = join(transcriptDirs[game], `${scene.id}.json`);
    const transcript = read(transcriptPath, {});
    const fallbackAudioPath = join(dirname(configPath), 'audio', `${scene.id}.mp3`);
    const audioPath = asset?.filePath && existsSync(asset.filePath) ? resolve(asset.filePath) : (existsSync(fallbackAudioPath) ? resolve(fallbackAudioPath) : null);
    entries.push({
      game,
      sceneId: scene.id,
      exactTtsText: asset?.sourceText || scene.narrationText || '',
      ttsText: asset?.sourceText || scene.narrationText || '',
      displayText: bodyText(scene),
      spokenRepresentation: config.identity?.pronunciationRepresentation || config.identity?.spokenName || config.gameName,
      pronunciationRepresentation: config.identity?.pronunciationRepresentation || config.identity?.spokenName || config.gameName,
      audioPath,
      whisperTranscript: transcript.text || 'UNAVAILABLE',
      whisperTranscriptPath: existsSync(transcriptPath) ? transcriptPath : null,
      durationSec: Number(((asset?.durationMs || 0) / 1000 || scene.durationSec || 0).toFixed(3)),
      status: iterationStatus[game]?.[scene.id] || 'reused',
      ttsGenerated: true,
    });
  }
  const intro = (config.scenes || []).find((scene) => scene.id === 'brand-intro');
  entries.push({
    game,
    sceneId: 'brand-intro',
    exactTtsText: 'NONE',
    ttsText: 'NONE',
    displayText: 'NONE',
    spokenRepresentation: 'NONE',
    pronunciationRepresentation: 'NONE',
    audioPath: intro?.audio?.ambientFile ? resolve(intro.audio.ambientFile) : null,
    whisperTranscript: 'NONE',
    whisperTranscriptPath: null,
    durationSec: Number(intro?.durationSec || 0),
    status: 'reused-café-signature',
    spokenNarration: 'NONE',
    ttsGenerated: false,
    audioRole: 'café-ludique sonic signature',
  });
}

entries.sort((a, b) => `${a.game}:${a.sceneId}`.localeCompare(`${b.game}:${b.sceneId}`));
const jsonPath = resolve('out/mission-01/review-transcripts.json');
const txtPath = resolve('out/mission-01/review-transcripts.txt');
const output = { version: 2, mission: 'PR476_REPAIR_PASS_PRESENTATION_AUDIO_PUBLISHABLE_R1', generatedAt: new Date().toISOString(), entries };
writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
const lines = ['MOBIUS 2.0 — PR476 REPAIR PASS REVIEW TRANSCRIPTS', ''];
for (const entry of entries) {
  lines.push(`game: ${entry.game}`);
  lines.push(`sceneId: ${entry.sceneId}`);
  lines.push(`exactTtsText: ${entry.exactTtsText}`);
  lines.push(`displayText: ${entry.displayText}`);
  lines.push(`spoken/pronunciation: ${entry.spokenRepresentation}`);
  lines.push(`absoluteAudioPath: ${entry.audioPath || 'NONE'}`);
  lines.push(`whisperTranscript: ${entry.whisperTranscript}`);
  lines.push(`durationSec: ${entry.durationSec}`);
  lines.push(`status: ${entry.status}`);
  lines.push(`ttsGenerated: ${entry.ttsGenerated}`);
  if (entry.audioRole) lines.push(`audioRole: ${entry.audioRole}`);
  lines.push('');
}
writeFileSync(txtPath, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ jsonPath, txtPath, entryCount: entries.length }, null, 2));
