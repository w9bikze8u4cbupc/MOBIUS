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
const outputRoot = path.join(root, 'out', 'gameplay-actions-r1');
const voiceId = 'UJCi4DDncuo0VJDSIegj';
const preset = editorialStandard.getNarrationPreset('warm-engaging-fr-ca');
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };

const scripts = {
  'terraforming-mars': [
    ['game-loop', 'À chaque génération, les joueurs jouent dans l’ordre prévu. Chacun commence par la recherche, réalise une ou deux actions, puis termine par la production.'],
    ['action-jouer-une-carte-1', 'Pour jouer une carte, vérifiez ses prérequis, payez son coût, puis placez-la dans votre jeu.'],
    ['action-utiliser-un-projet-2', 'Vous pouvez aussi choisir un projet standard et le résoudre selon ses règles.'],
    ['action-placer-une-tuile-3', 'Certaines actions ajoutent des tuiles au plateau, dans les zones autorisées, pour faire avancer la terraformation.'],
    ['next-player-or-phase', 'Après la résolution, la séquence continue, puis le tour passe au joueur ou à la phase suivante.'],
  ],
  '7-wonders-duel': [
    ['game-loop', 'À chaque tour, le joueur actif choisit une carte accessible dans la structure, puis résout l’une des actions permises.'],
    ['action-choisir-une-carte-1', 'Commencez par choisir une carte accessible; elle quitte la structure pour l’action de votre choix.'],
    ['action-construire-un-batiment-2', 'Vous pouvez construire le bâtiment indiqué, si les ressources nécessaires sont disponibles.'],
    ['action-defausser-pour-obtenir-des-pieces-3', 'Vous pouvez aussi défausser la carte pour obtenir des pièces de la banque.'],
    ['next-player-or-phase', 'Les joueurs jouent à tour de rôle. Quand la structure est épuisée, préparez l’âge suivant.'],
  ],
};

for (const [game, entries] of Object.entries(scripts)) {
  const dir = path.join(outputRoot, game, 'audio');
  const manifestPath = path.join(outputRoot, game, 'gameplay-narration.json');
  const previous = fs.existsSync(manifestPath) ? read(manifestPath) : { contract: 'mobius-gameplay-narration-v1', assets: [] };
  const assets = [];
  for (const [sceneId, text] of entries) {
    const target = path.join(dir, `${sceneId}.mp3`);
    const textHash = hash({ text, voiceId, modelId: preset.modelId, profile: 'AMELIE_TEACHING', voiceSettings: preset.voiceSettings });
    const existing = previous.assets?.find((asset) => asset.sceneId === sceneId && asset.sourceTextHash === textHash && fs.existsSync(asset.filePath));
    if (!existing) {
      await generateNarration(text, voiceId, target, { modelId: preset.modelId, voiceSettings: preset.voiceSettings });
    } else if (existing.filePath !== target && !fs.existsSync(target)) {
      fs.copyFileSync(existing.filePath, target);
    }
    const probe = JSON.parse(execFileSync(process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', target], { encoding: 'utf8' }));
    assets.push({ sceneId, sourceText: text, sourceTextHash: textHash, filePath: target, durationSec: Number(probe.format?.duration || 0), reused: Boolean(existing) });
  }
  write(manifestPath, { contract: 'mobius-gameplay-narration-v1', provider: 'elevenlabs', voiceId, modelId: preset.modelId, profile: 'AMELIE_TEACHING', assets });
  console.log(JSON.stringify({ game, generated: assets.filter((asset) => !asset.reused).length, reused: assets.filter((asset) => asset.reused).length, manifestPath }, null, 2));
}
