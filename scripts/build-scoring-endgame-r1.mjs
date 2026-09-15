#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';
import { buildEndgameModel, buildEndgameTeachingPlan, writeEndgameModel } from '../src/services/scoringEndgame.js';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'scoring-endgame-r1');
const banner = path.join(root, 'src', 'assets', 'branding', 'les-jeux-mobius-banner-canonical.png');
const sonic = path.join(root, 'src', 'assets', 'branding', 'sonic', 'mobius-cafe-sonic-signature-v4.wav');
const tmEvidencePath = path.join(root, 'out', 'hephaestus-recovery-r1', 'terraforming-mars', 'recovered.json');
const wdEvidencePath = path.join(root, 'out', 'hephaestus-recovery-r1', '7-wonders-duel', 'recovered.json');
const tmExtractionPath = path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'production', 'zero-state-extraction.json');
const tmScriptPath = path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'production', 'zero-state-script-package.json');
const pageImage = (page) => path.join(root, 'data', 'rulebook-images', '7-wonders-duel', `page-${page}.png`);
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const audioDuration = (file) => Number(JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8' })).format?.duration || 0);
const source = (page, quote, extra = {}) => ({ page, quote, ...extra });
const accepted = (evidence, id) => {
  const visual = (evidence.acceptedVisuals || []).find((item) => item.id === id);
  if (!visual) throw new Error(`Accepted HEPHAESTUS visual is missing: ${id}`);
  return { id: visual.id, path: visual.renderPath || visual.sourceImage, sourcePage: visual.pageNumber, sourceImage: visual.sourceImage, provenance: visual.provenance || null };
};
const directVisual = (id, file, page) => ({ id, path: file, sourcePage: page, sourceImage: file, provenance: { extraction: 'verified-rulebook-page', sourcePage: page, sourceImage: file } });

const tmEvidence = read(tmEvidencePath);
const wdEvidence = read(wdEvidencePath);
const tmExtraction = read(tmExtractionPath);
const tmScript = read(tmScriptPath);
const tmEndSource = source(6, 'The game ends at the end of the generation during which all three global parameters have reached their goals; after production, the final scores are calculated.', { section: 6, startOffset: 29981, endOffset: 35979 });
const tmScoreSource = source(7, 'The winner is the player with the highest score. The final score includes the TR marker, awards, milestones, the game board, and cards; in case of a tie, the player with the most M€ wins.', { section: 7, startOffset: 35979, endOffset: 41977 });
const tmSources = tmScript.sections.filter((section) => /Fin de partie|Calcul des points/i.test(section.title || '')).flatMap((section) => section.sources || []);

const tmHints = {
  trigger: 'La partie se termine quand la température atteint +8 °C, l’oxygène 14 % et les 9 océans. On termine ensuite la génération après la production.',
  spokenText: 'La partie se termine quand les trois paramètres globaux ont atteint leur objectif : huit degrés Celsius, quatorze pour cent d’oxygène et neuf océans. On termine ensuite la génération après la production.',
  finishCurrentUnitRule: 'Terminer la génération après la phase de production, puis passer au décompte final.',
  finalPhase: 'On passe ensuite au décompte final des points de victoire.',
  scoringOverviewText: 'Pour votre score final, additionnez le TR, le plateau, les récompenses, les jalons et les cartes.',
  winnerText: 'Le joueur qui a le plus de points de victoire gagne. En cas d’égalité, c’est le joueur avec le plus d’argent qui l’emporte.',
  immediateVictoryConditions: [],
  scoringRequired: true,
  sourceRefs: [tmEndSource, tmScoreSource, ...tmSources],
};
const tmCategories = [
  { id: 'terraform-rating', label: 'TR', description: 'Ajoutez le score de base indiqué par le marqueur de terraformation.', spokenText: 'Commencez par ajouter votre score de base, indiqué par votre marqueur de terraformation.', componentRefs: ['comp-1', 'comp-6'], visualAssetIds: ['p0_img0_xref4162'], visuals: [accepted(tmEvidence, 'p0_img0_xref4162')], calculationType: 'track-value', sourceRefs: [tmScoreSource], confidence: 0.92, reviewState: 'accepted', reviewRequired: false },
  { id: 'board-tiles', label: 'Plateau et tuiles', description: 'Comptez les points des tuiles et des éléments placés sur le plateau.', spokenText: 'Ajoutez ensuite les points des tuiles et des éléments placés sur le plateau.', componentRefs: ['comp-7', 'comp-11', 'comp-12'], visualAssetIds: ['p4_img4_xref563'], visuals: [accepted(tmEvidence, 'p4_img4_xref563')], calculationType: 'board-position', sourceRefs: [tmScoreSource], confidence: 0.9, reviewState: 'accepted', reviewRequired: false },
  { id: 'awards', label: 'Récompenses', description: 'Ajoutez les points des récompenses financées et décomptées selon la règle.', spokenText: 'Ajoutez les points des récompenses, selon leur décompte prévu par la règle.', componentRefs: ['comp-82'], visualAssetIds: ['p10_img1_xref888'], visuals: [accepted(tmEvidence, 'p10_img1_xref888')], calculationType: 'award-majority', sourceRefs: [tmScoreSource], confidence: 0.86, reviewState: 'accepted', reviewRequired: false },
  { id: 'milestones', label: 'Jalons', description: 'Ajoutez les points des jalons revendiqués sur le plateau.', spokenText: 'Ajoutez aussi les points des jalons que vous avez revendiqués.', componentRefs: ['comp-83'], visualAssetIds: ['p10_img1_xref888'], visuals: [accepted(tmEvidence, 'p10_img1_xref888')], calculationType: 'milestone-value', sourceRefs: [tmScoreSource], confidence: 0.86, reviewState: 'accepted', reviewRequired: false },
  { id: 'cards', label: 'Cartes', description: 'Additionnez les points indiqués par les cartes qui comptent en fin de partie.', spokenText: 'Enfin, additionnez les points indiqués par vos cartes de fin de partie.', componentRefs: ['comp-33'], visualAssetIds: ['p13_img0_xref2432'], visuals: [accepted(tmEvidence, 'p13_img0_xref2432')], calculationType: 'card-values', sourceRefs: [tmScoreSource], confidence: 0.88, reviewState: 'accepted', reviewRequired: false },
];
const tmModel = buildEndgameModel({ projectId: 'tm-eng-bgg-fa0678822223', gameIdentity: { displayName: 'Terraforming Mars', sourceTitle: 'Terraforming Mars', locale: 'fr-CA' }, sections: tmScript.sections, evidence: tmEvidence, endgame: tmHints, scoringCategories: tmCategories, tieBreakers: [{ order: 1, rule: 'En cas d’égalité, le joueur avec le plus d’argent (M€) gagne.', sourceRefs: [tmScoreSource], confidence: 0.94, reviewState: 'accepted', reviewRequired: false }] });

const wdSource12 = source(12, 'Military Supremacy and Scientific Supremacy end the game immediately.', { sourceImage: pageImage(12) });
const wdSource13 = source(13, 'If neither player has achieved Military or Scientific Supremacy, the game ends at the end of Age III. The player with the most victory points wins; victory points come from the military track, Buildings, Wonders, Progress, and the Treasury.', { sourceImage: pageImage(13) });
const wdPageVisual = (page, id) => directVisual(id, pageImage(page), page);
const wdHints = {
  trigger: 'Une suprématie militaire ou scientifique met fin à la partie immédiatement. Sinon, la partie se termine à la fin de l’âge III.',
  spokenText: 'Une partie peut se terminer immédiatement si une civilisation atteint la suprématie militaire ou scientifique. Sinon, on joue jusqu’à la fin de l’âge trois.',
  finishCurrentUnitRule: 'Sans suprématie, jouer toutes les cartes jusqu’à la fin de l’âge III.',
  finalPhase: 'Sans suprématie, la victoire civile se décide avec les points de victoire à la fin de l’âge III.',
  scoringOverviewText: 'Pour le décompte civil, additionnez les points de la position militaire, des bâtiments, des merveilles, des progrès et de la trésorerie.',
  winnerText: 'La civilisation avec le plus de points de victoire l’emporte.',
  scoringRequired: true,
  sourceRefs: [wdSource12, wdSource13],
  immediateVictoryConditions: [
    { id: 'military-supremacy', label: 'Suprématie militaire', description: 'Atteindre la capitale adverse sur le plateau militaire met fin à la partie immédiatement.', spokenText: 'La suprématie militaire, qui atteint la capitale adverse, met fin à la partie immédiatement.', componentRefs: ['military-track'], visualAssetIds: ['7wd-page-12-military'], visuals: [wdPageVisual(12, '7wd-page-12-military')], sourceRefs: [wdSource12], confidence: 0.95, reviewState: 'accepted', reviewRequired: false },
    { id: 'scientific-supremacy', label: 'Suprématie scientifique', description: 'Réunir six symboles scientifiques différents met fin à la partie immédiatement.', spokenText: 'La suprématie scientifique, avec six symboles scientifiques différents, met aussi fin à la partie immédiatement.', componentRefs: ['progress-tokens'], visualAssetIds: ['7wd-page-12-science'], visuals: [wdPageVisual(12, '7wd-page-12-science')], sourceRefs: [wdSource12], confidence: 0.95, reviewState: 'accepted', reviewRequired: false },
  ],
};
const wdCategories = [
  { id: 'military-points', label: 'Position militaire', description: 'Comptez les points liés à la position du pion sur le plateau militaire.', spokenText: 'Comptez d’abord les points liés à la position du pion sur le plateau militaire.', componentRefs: ['military-track'], visualAssetIds: ['7wd-page-13-scoring'], visuals: [wdPageVisual(13, '7wd-page-13-scoring')], calculationType: 'track-value', sourceRefs: [wdSource13], confidence: 0.9, reviewState: 'accepted', reviewRequired: false },
  { id: 'buildings', label: 'Bâtiments', description: 'Additionnez les points de victoire indiqués par les bâtiments de votre cité.', spokenText: 'Ajoutez les points de victoire indiqués par les bâtiments de votre cité.', componentRefs: ['component-age-cards'], visualAssetIds: ['legacy-crop-1'], visuals: [accepted(wdEvidence, 'legacy-crop-1')], calculationType: 'card-values', sourceRefs: [wdSource13], confidence: 0.86, reviewState: 'accepted', reviewRequired: false },
  { id: 'wonders', label: 'Merveilles', description: 'Additionnez les points de victoire indiqués par vos merveilles.', spokenText: 'Ajoutez les points de victoire indiqués par vos merveilles.', componentRefs: ['component-wonder-cards'], visualAssetIds: ['legacy-crop-4'], visuals: [accepted(wdEvidence, 'legacy-crop-4')], calculationType: 'wonder-values', sourceRefs: [wdSource13], confidence: 0.88, reviewState: 'accepted', reviewRequired: false },
  { id: 'progress', label: 'Progrès', description: 'Additionnez les points ou effets de score des jetons Progrès vérifiés par la source.', spokenText: 'Ajoutez les points associés aux jetons Progrès, selon leur effet.', componentRefs: ['progress-tokens'], visualAssetIds: ['7wd-page-14-progress'], visuals: [wdPageVisual(14, '7wd-page-14-progress')], calculationType: 'progress-effects', sourceRefs: [wdSource13], confidence: 0.82, reviewState: 'accepted', reviewRequired: false },
  { id: 'treasury', label: 'Trésorerie', description: 'Chaque tranche de trois pièces dans la trésorerie vaut un point de victoire.', spokenText: 'Enfin, chaque tranche de trois pièces dans la trésorerie vaut un point de victoire.', componentRefs: ['component-coins'], visualAssetIds: ['legacy-crop-3'], visuals: [accepted(wdEvidence, 'legacy-crop-3')], calculationType: 'coin-conversion', sourceRefs: [wdSource13], confidence: 0.92, reviewState: 'accepted', reviewRequired: false },
];
const wdModel = buildEndgameModel({ projectId: '7-wonders-duel', gameIdentity: { displayName: '7 Wonders Duel', sourceTitle: '7 Wonders Duel', locale: 'fr-CA' }, sections: [{ title: 'Fin de partie', spokenText: wdHints.trigger, sources: [wdSource12, wdSource13] }], evidence: wdEvidence, endgame: wdHints, scoringCategories: wdCategories, tieBreakers: [] });

function visualCatalog(model, evidence) {
  const all = [...(model.visualBindings || []), ...(model.victoryVisualBindings || [])];
  const catalog = {};
  for (const binding of all) {
    const p = binding.provenance?.renderPath || binding.provenance?.sourceImage || null;
    const id = binding.visualAssetIds?.[0];
    if (id && p) catalog[id] = { path: p, sourcePage: binding.sourceRefs?.find((ref) => ref.page)?.page || null, provenance: binding.provenance };
  }
  for (const asset of evidence.acceptedVisuals || []) if (asset.id && (asset.renderPath || asset.sourceImage)) catalog[asset.id] = { path: asset.renderPath || asset.sourceImage, sourcePage: asset.pageNumber || asset.provenance?.sourcePage || null, provenance: asset.provenance || null };
  return catalog;
}

function buildConfig(game, model, evidence) {
  const plan = buildEndgameTeachingPlan(model);
  const catalog = visualCatalog(model, evidence);
  const fallback = game === 'terraforming-mars' ? accepted(tmEvidence, 'p0_img0_xref4162').path : pageImage(13);
  const findVisual = (scene) => {
    const id = scene.visualBindings?.[0]?.visualAssetIds?.[0] || scene.visualAssetIds?.[0];
    return catalog[id]?.path || (game === '7-wonders-duel' && (scene.semanticRole === 'endgame-trigger' || scene.semanticRole === 'immediate-victory') ? pageImage(12) : fallback);
  };
  const referenceFor = (scene) => {
    const page = scene.sourceRefs?.find((ref) => Number.isInteger(Number(ref.page)))?.page;
    return page ? `Livret p. ${page}` : '';
  };
  const scenes = [{ id: 'brand-signature', durationSec: 3.6, background: { image: banner }, layout: { mode: 'brand' }, overlays: [], audio: { ambientFile: sonic, ambientGain: 1, preMastered: true, ambientFadeOutSec: 0.35, speechRequired: false } }];
  for (const scene of plan.scenes) {
    const body = scene.items?.join('\n') || scene.body || '';
    const narrationText = scene.spokenText || body;
    const audioPath = path.join(outRoot, game, 'audio', `${scene.id}.mp3`);
    const hasAudio = fs.existsSync(audioPath);
    const overlays = [
      { type: 'badge', text: scene.title, position: 'top', fontColor: '#b7ef59' },
      { type: 'heading', text: scene.title, position: 'panel-heading', fontColor: '#f7ecd2' },
      { type: 'body', text: body, position: 'panel-body', fontColor: '#f7ecd2' },
    ];
    const reference = referenceFor(scene);
    if (reference) overlays.push({ type: 'reference', text: reference, position: 'reference-bottom-left', fontColor: '#c99b5b' });
    scenes.push({ id: scene.id, durationSec: hasAudio ? Math.max(0.5, audioDuration(audioPath) + 0.08) : 6, background: { image: findVisual(scene) }, layout: { mode: 'split-teaching', textSide: 'left', imageSide: 'right', panelVariant: 'WARM_DARK', presentationLayout: { contentType: scene.semanticRole === 'scoring-category' || scene.semanticRole === 'immediate-victory' ? 'list' : 'body', minimumFontPx: 48, preferredFontPx: scene.semanticRole === 'scoring-overview' ? 54 : 52 } }, narrationText: hasAudio ? narrationText : '', audio: hasAudio ? { file: audioPath, ambientFile: sonic, ambientGain: 0.12, ambientFadeOutSec: 0.9, speechRequired: true } : undefined, overlays, semanticRole: scene.semanticRole, sourceRefs: scene.sourceRefs, visualBindings: scene.visualBindings });
  }
  scenes.push({ id: 'end-card', durationSec: 3.6, background: { image: banner }, layout: { mode: 'brand' }, overlays: [], audio: { ambientFile: sonic, ambientGain: 1, preMastered: true, ambientFadeOutSec: 0.5, speechRequired: false } });
  return { projectId: `scoring-endgame-${game}`, video: { resolution: { width: 1920, height: 1080 }, fps: 30 }, provenance: { contract: model.contract, modelPath: path.join(outRoot, game, 'scoring-endgame.json'), evidencePath: game === 'terraforming-mars' ? tmEvidencePath : wdEvidencePath, generator: 'build-scoring-endgame-r1.mjs -> scoringEndgame.js -> render-storyboard-ffmpeg.mjs' }, endgameTeachingPlan: plan, scenes };
}

for (const [game, model, evidence] of [['terraforming-mars', tmModel, tmEvidence], ['7-wonders-duel', wdModel, wdEvidence]]) {
  const dir = path.join(outRoot, game);
  writeEndgameModel(path.join(dir, 'scoring-endgame.json'), model);
  write(path.join(dir, 'preview-config.json'), buildConfig(game, model, evidence));
  write(path.join(dir, 'visual-catalog.json'), { contract: model.contract, sourcePdfSha256: evidence.sourcePdfSha256 || null, assets: visualCatalog(model, evidence) });
  write(path.join(dir, 'source-provenance.json'), { projectId: model.projectId, sourceRefs: model.sourceRefs, victoryVisualBindings: model.victoryVisualBindings, scoringVisualBindings: model.visualBindings, evidencePath: game === 'terraforming-mars' ? tmEvidencePath : wdEvidencePath, evidenceSha256: sha256(game === 'terraforming-mars' ? tmEvidencePath : wdEvidencePath), sourceExtraction: game === 'terraforming-mars' ? tmExtractionPath : null });
}
write(path.join(outRoot, 'benchmark-summary.json'), { contract: 'mobius-scoring-endgame-v1', generatedBy: 'build-scoring-endgame-r1.mjs', games: { terraformingMars: { projectId: tmModel.projectId, scoringAtoms: tmModel.scoringCategories.length, immediateVictory: tmModel.endGameModel.immediateVictoryConditions.length, reviewRequired: tmModel.reviewRequired }, sevenWondersDuel: { projectId: wdModel.projectId, scoringAtoms: wdModel.scoringCategories.length, immediateVictory: wdModel.endGameModel.immediateVictoryConditions.length, reviewRequired: wdModel.reviewRequired } } });
console.log(JSON.stringify({ outRoot, terraformingMars: { scoringAtoms: tmModel.scoringCategories.length, reviewRequired: tmModel.reviewRequired }, sevenWondersDuel: { scoringAtoms: wdModel.scoringCategories.length, immediateVictory: wdModel.endGameModel.immediateVictoryConditions.length, reviewRequired: wdModel.reviewRequired } }, null, 2));
