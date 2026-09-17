#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ffprobeStatic from 'ffprobe-static';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'gameplay-actions-r1', 'twelve-labs');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };

function probe(file) {
  const result = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name,codec_type', '-of', 'json', file], { encoding: 'utf8' }));
  const video = result.streams.find((stream) => stream.codec_type === 'video');
  return { durationSec: Number(result.format?.duration || 0), resolution: `${video?.width}x${video?.height}` };
}

function build(game, displayTitle, spokenTitle) {
  const dir = path.join(root, 'out', 'gameplay-actions-r1', game);
  const config = read(path.join(dir, 'preview-config.json'));
  const model = read(path.join(dir, 'gameplay-actions.json'));
  const videoPath = path.join(dir, 'gameplay-actions-preview.mp4');
  const media = probe(videoPath);
  let start = 0;
  const scenes = config.scenes.map((scene) => {
    const sceneStart = Number(start.toFixed(3));
    start += Number(scene.durationSec || 0);
    const sceneEnd = Number(start.toFixed(3));
    const action = model.actions.find((candidate) => scene.id.includes(candidate.id));
    return {
      scene_id: scene.id,
      start_sec: sceneStart,
      end_sec: sceneEnd,
      exact_narration_text: scene.narrationText || 'NONE',
      intended_purpose: scene.id === 'brand-signature'
        ? 'Signature visuelle et sonore de marque; aucune parole.'
        : scene.id === 'game-loop'
          ? `Présenter la structure du ${model.gameLoop.loopUnit} et l’ordre des phases.`
          : scene.id === 'next-player-or-phase'
            ? 'Montrer comment la partie passe au joueur, à la phase ou à l’unité suivante.'
            : scene.id === 'end-card'
              ? 'Fermeture visuelle de la preview.'
              : `Enseigner l’action ${action?.name || scene.id} avec une transition avant/action/après.`,
      expected_visual_role: scene.id === 'brand-signature'
        ? 'Bannière canonique et signature sonore café-ludique.'
        : action
          ? `Visuel source-grounded associé à ${action.name}; composant(s): ${action.componentRefs.join(', ') || 'non précisé'}.`
          : 'Composition split avec texte pédagogique et visuel source-grounded.',
      source_refs: action?.sourceRefs || model.gameLoop.sourceRefs || [],
      action_id: action?.id || null,
    };
  });
  const context = {
    schema_version: 'mobius-gameplay-expected-context-v1',
    identity: { display_title: displayTitle, spoken_title: spokenTitle, locale: 'fr-CA', pronunciation_guidance: 'Prononcer naturellement dans une phrase française québécoise; ne pas jouer un accent anglophone.' },
    video: { path: videoPath, sha256: sha256(videoPath), duration_sec: media.durationSec, resolution: media.resolution },
    scenes,
    intentional_intro_silence: { start_sec: 0, end_sec: 3.6, reason: 'La signature de marque est volontairement sans narration Amélie.' },
    expected_brand_rules: ['Aucune parole pendant la signature.', 'La bannière et le visuel d’action doivent rester lisibles.', 'Les visuels doivent correspondre à l’action enseignée.'],
    gameplay_model: { contract: model.contract, loop_unit: model.gameLoop.loopUnit, phases: model.gameLoop.phases, actions: model.actions.map((action) => ({ id: action.id, name: action.name, source_refs: action.sourceRefs, component_refs: action.componentRefs, state_change: action.stateChange })) },
    local_deterministic_findings: { namespace: 'DET', note: 'Les contrôles locaux restent séparés de l’évaluation Twelve Labs; les détails sont dans qa-report.json.' },
  };
  write(path.join(outRoot, game, 'expected-context.json'), context);
  return context;
}

const contexts = {
  'terraforming-mars': build('terraforming-mars', 'Terraforming Mars', 'Terraforming Mars'),
  '7-wonders-duel': build('7-wonders-duel', '7 Wonders Duel', 'Seven Wonders Duel'),
};
console.log(JSON.stringify({ output: outRoot, videos: Object.fromEntries(Object.entries(contexts).map(([game, context]) => [game, context.video])) }, null, 2));
