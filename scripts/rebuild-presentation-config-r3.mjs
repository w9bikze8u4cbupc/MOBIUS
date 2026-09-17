#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import presentation from '../src/storyboard/tutorial_presentation.cjs';

const { buildBrandIntro, buildBrandOutro, buildTeachingScene, buildMetadataScene, buildChapters } = presentation;
const roomBed = resolve('src/assets/branding/sonic/cafe-ambience-freesound-25813.mp3');
const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith('--')) args[value.slice(2)] = process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[++index] : true;
}
const configPath = resolve(args.config || 'out/mission-01/7-wonders-duel/render-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const pagesFromReference = (text) => [...String(text || '').matchAll(/\d+/g)].map((match) => Number(match[0])).filter((page) => page > 0);
const originalScenes = config.scenes || [];
const metadataOriginal = originalScenes.find((scene) => scene.id === 'metadata-card');
const metadataFields = metadataOriginal?.metadataFields || {};
const bodyLines = String(metadataOriginal?.overlays?.find((overlay) => overlay.type === 'body')?.text || '').split(/\r?\n/).filter(Boolean);
const valueFor = (label) => bodyLines.find((line) => line.toLocaleLowerCase('fr-CA').startsWith(label.toLocaleLowerCase('fr-CA') + ' :'))?.split(':').slice(1).join(':').trim() || '';
const metadata = {
  playerCount: valueFor('Joueurs'),
  gameLength: valueFor('Durée'),
  designers: metadataFields.primary?.find((line) => line.startsWith('Auteurs :'))?.replace(/^Auteurs\s*:\s*/, '').split(/\s+et\s+/).filter(Boolean) || [],
  publisher: valueFor('Éditeur'),
  minimumAge: valueFor('Âge minimum'),
  weight: valueFor('Complexité'),
  yearPublished: valueFor('Année'),
  edition: valueFor('Édition'),
  mechanics: metadataFields.mechanics || [],
};
const identity = config.identity || { displayName: config.gameName, spokenName: config.gameName };
const rebuilt = originalScenes.map((scene, index) => {
  if (scene.id === 'brand-intro') {
    const intro = buildBrandIntro({ bannerPath: scene.background?.image, audio: { ...scene.audio, ambientGain: 1.0 } });
    return { ...intro, ...scene, audio: { ...scene.audio, ambientGain: 1.0, preMastered: true }, editorial: intro.editorial };
  }
  if (scene.id === 'brand-outro') {
    const outro = buildBrandOutro({ bannerPath: scene.background?.image, audio: { ...scene.audio, ambientFile: roomBed, ambientGain: 0.07, ambientFadeOutSec: 0.72 } });
    return { ...outro, durationSec: scene.durationSec, audio: { ...scene.audio, ...outro.audio, file: scene.audio?.file, ambientFile: roomBed, ambientGain: 0.07, ambientFadeOutSec: 0.72 }, editorial: outro.editorial };
  }
  const body = scene.overlays?.find((overlay) => overlay.type === 'body')?.text || '';
  const heading = scene.overlays?.find((overlay) => overlay.type === 'heading')?.text || '';
  const section = scene.chapterTitle || (scene.id === 'metadata-card' ? 'À propos du jeu' : heading || 'Tutoriel');
  const base = {
    id: scene.id,
    index: Math.max(0, index - 1),
    total: originalScenes.length,
    section,
    narration: scene.narrationText,
    onScreenText: body,
    sourcePages: pagesFromReference(scene.overlays?.find((overlay) => overlay.type === 'reference')?.text),
    background: scene.background,
    audio: { ...(scene.audio || {}), ambientFile: roomBed, ambientGain: 0.07, ambientFadeOutSec: 1.0 },
    callouts: scene.callouts || [],
    visualKind: scene.visualSelection?.kind || scene.background?.kind || '',
    durationSec: scene.durationSec,
    preserveLineBreaks: scene.layout?.presentationLayout?.contentType === 'list' || body.includes('\n'),
  };
  const next = scene.id === 'metadata-card'
    ? buildMetadataScene({ ...base, gameName: identity.displayName, identity, metadata })
    : buildTeachingScene(base);
  return { ...next, durationSec: scene.durationSec, background: scene.background, audio: base.audio, visualSelection: scene.visualSelection, identity: scene.identity, metadataFields: scene.metadataFields };
});
const output = { ...config, identity, scenes: rebuilt, chapters: buildChapters(rebuilt), editorial: { ...config.editorial, brandAudio: rebuilt.find((scene) => scene.id === 'brand-intro')?.editorial?.brandAudio || config.editorial?.brandAudio } };
writeFileSync(configPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ configPath, sceneCount: rebuilt.length, roomBed, presentationMentalModel: rebuilt.find((scene) => scene.id === 'scene-section-01-1')?.overlays?.find((overlay) => overlay.type === 'body')?.text || null, referenceExamples: rebuilt.filter((scene) => scene.overlays).map((scene) => scene.overlays.find((overlay) => overlay.type === 'reference')?.text).filter(Boolean) }, null, 2));
