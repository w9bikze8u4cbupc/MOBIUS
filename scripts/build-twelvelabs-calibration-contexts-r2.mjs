#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffprobeStatic from 'ffprobe-static';

const root = resolve(process.cwd());
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const hash = (filePath) => createHash('sha256').update(readFileSync(resolve(root, filePath))).digest('hex');
const load = (filePath) => JSON.parse(readFileSync(resolve(root, filePath), 'utf8'));
const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value?.startsWith('--')) continue;
  args[value.slice(2)] = process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[++index] : true;
}
const videoRoot = resolve(args['video-root'] || 'out/mission-01');
const outputRoot = resolve(args['output-root'] || 'out/mission-01/twelve-labs-calibration/r2');

const games = {
  'terraforming-mars': 'terraforming-mars-opening-preview.mp4',
  '7-wonders-duel': '7-wonders-duel-opening-preview.mp4',
};
const transcripts = load('out/mission-01/review-transcripts.json').entries || [];
const purposes = {
  'brand-intro': 'Signature visuelle et sonore Les Jeux Mobius; aucune parole Amélie.',
  'metadata-card': 'Présenter l’identité du jeu, la couverture et les informations pratiques vérifiées.',
  'scene-section-01-1': 'Donner une première représentation thématique ou de présentation du jeu.',
  'scene-section-02-2': 'Présenter le but ou les premières conditions de victoire sans remplacer l’enseignement détaillé.',
  'brand-outro': 'Conclusion et appel à l’action Les Jeux Mobius.',
};

for (const [game, videoPath] of Object.entries(games)) {
  const config = load(`out/mission-01/${game}/render-config.json`);
  const absoluteVideoPath = join(videoRoot, videoPath);
  const media = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', absoluteVideoPath], { encoding: 'utf8' }));
  const videoDuration = Number(media.format?.duration || 0);
  const videoStream = (media.streams || []).find((stream) => stream.width);
  let cursor = 0;
  const scenes = (config.scenes || []).map((scene) => {
    const start = Number(cursor.toFixed(3));
    cursor += Number(scene.durationSec || 0);
    const entry = transcripts.find((item) => item.game === game && item.sceneId === scene.id);
    const exactNarration = entry?.exactTtsText || scene.narrationText || scene.narration || scene.spokenText || 'NONE';
    const visualRole = scene.id === 'brand-intro' || scene.id === 'brand-outro'
      ? 'bannière officielle et identité de marque'
      : scene.id === 'metadata-card'
        ? 'couverture exacte de l’édition et carte de métadonnées'
        : scene.background?.image ? 'visuel de source/règle correspondant à la section' : 'visuel de section';
    return {
      scene_id: scene.id,
      start_sec: start,
      end_sec: Number(cursor.toFixed(3)),
      purpose: purposes[scene.id] || 'Section pédagogique du tutoriel.',
      exact_narration_text: exactNarration,
      expected_visual_role: visualRole,
    };
  });
  const identity = config.identity || {};
  const outputDir = join(outputRoot, game);
  mkdirSync(outputDir, { recursive: true });
  const context = {
    video: { path: absoluteVideoPath, sha256: createHash('sha256').update(readFileSync(absoluteVideoPath)).digest('hex'), duration_sec: videoDuration, resolution: `${videoStream?.width || 0}x${videoStream?.height || 0}` },
    identity: {
      display_title: identity.displayName || game,
      spoken_title: identity.spokenName || identity.displayName || game,
      pronunciation_guidance: identity.pronunciationRepresentation || 'Prononcer naturellement dans une phrase fr-CA; ne pas adopter un accent anglophone théâtral.',
      edition: identity.edition || null,
    },
    scenes,
    intentional_intro_silence: { start_sec: 0, end_sec: Number(config.scenes?.find((scene) => scene.id === 'brand-intro')?.durationSec || 3.6), reason: 'La signature de marque est volontairement sans parole Amélie.' },
    director_context: {
      brand_rules: ['Bannière officielle seule pendant la signature.', 'Signature sonore discrète mais réellement audible.', 'Twelve Labs est consultatif; PUBLISHABLE appartient au Director.'],
      approved_strengths: ['Panneaux chauds et lisibles.', 'Couverture de jeu visible dans la présentation.', 'Timeline sémantique et transition de marque.'],
      suspected_defects: ['Vérifier indépendamment la continuité de voix et les transitions.', 'Vérifier la lisibilité mobile et le confinement des panneaux.', 'Vérifier que la signature sonore est perceptible sans dominer la narration.'],
    },
    deterministic_findings: [
      { id: 'DET-001', category: 'media_integrity', observation: `Vidéo ${videoStream?.width || 0}x${videoStream?.height || 0}, durée mesurée ${videoDuration.toFixed(3)} secondes.` },
      { id: 'DET-002', category: 'scene_timeline', observation: `La signature sans parole occupe ${scenes[0]?.start_sec ?? 0}–${scenes[0]?.end_sec ?? 0} secondes; les scènes suivantes sont décrites par leurs bornes de timeline.` },
      { id: 'DET-003', category: 'identity_provenance', observation: 'La carte d’identité utilise le titre canonique et la couverture sélectionnée par le pipeline de présentation; le reviewer doit juger la correspondance visible.' },
    ],
  };
  const contextPath = resolve(outputDir, 'expected-context.json');
  writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ game, path: contextPath, sha256: createHash('sha256').update(readFileSync(contextPath)).digest('hex') }));
}
