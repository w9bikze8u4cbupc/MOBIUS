#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';
import { generateNarration } from '../src/services/elevenLabsService.js';
import editorialStandard from '../src/services/editorialStandard.cjs';

const root = process.cwd();
dotenv.config({ path: path.join(root, '.env'), override: false });
const outputRoot = path.join(root, 'out', 'scoring-endgame-r1');
const voiceId = process.env.ELEVENLABS_VOICE_ID_AMELIE || 'UJCi4DDncuo0VJDSIegj';
const preset = editorialStandard.getNarrationPreset('warm-engaging-fr-ca');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };

for (const game of ['terraforming-mars', '7-wonders-duel']) {
  const dir = path.join(outputRoot, game);
  const config = read(path.join(dir, 'preview-config.json'));
  const plan = config.endgameTeachingPlan;
  const manifestPath = path.join(dir, 'scoring-narration.json');
  const previous = fs.existsSync(manifestPath) ? read(manifestPath) : { assets: [] };
  const assets = [];
  for (const scene of plan.scenes) {
    const text = String(scene.spokenText || scene.body || scene.items?.join(' ') || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const target = path.join(dir, 'audio', `${scene.id}.mp3`);
    const sourceTextHash = hash({ text, voiceId, modelId: preset.modelId, profile: 'AMELIE_TEACHING', voiceSettings: preset.voiceSettings });
    const previousAsset = (previous.assets || []).find((asset) => asset.sceneId === scene.id && asset.sourceTextHash === sourceTextHash && fs.existsSync(asset.filePath));
    let reused = Boolean(previousAsset);
    if (previousAsset && previousAsset.filePath !== target && !fs.existsSync(target)) fs.copyFileSync(previousAsset.filePath, target);
    if (!reused) await generateNarration(text, voiceId, target, { modelId: preset.modelId, voiceSettings: preset.voiceSettings });
    const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', target], { encoding: 'utf8' }));
    assets.push({ sceneId: scene.id, semanticRole: scene.semanticRole, sourceText: text, sourceTextHash, filePath: target, durationSec: Number(probe.format?.duration || 0), provider: 'elevenlabs', voiceId, modelId: preset.modelId, profile: 'AMELIE_TEACHING', reused });
  }
  write(manifestPath, { contract: 'mobius-scoring-endgame-narration-v1', provider: 'elevenlabs', voiceId, modelId: preset.modelId, profile: 'AMELIE_TEACHING', assets, generatedAt: new Date().toISOString() });
  console.log(JSON.stringify({ game, generated: assets.filter((asset) => !asset.reused).length, reused: assets.filter((asset) => asset.reused).length, manifestPath }, null, 2));
}
