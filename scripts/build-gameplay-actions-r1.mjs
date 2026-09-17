#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildGameplayModel, buildGameplayPreviewAtoms, formatGameplayTransition, writeGameplayModel, GAMEPLAY_ACTIONS_CONTRACT_VERSION } from '../src/services/gameplayActions.js';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'gameplay-actions-r1');
const banner = path.join(root, 'src', 'assets', 'branding', 'les-jeux-mobius-banner-canonical.png');
const sonic = path.join(root, 'src', 'assets', 'branding', 'sonic', 'mobius-cafe-sonic-signature-v4.wav');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const sourceRef = (page, quote) => ({ page, sourceImage: path.join(root, 'data', 'rulebook-images', '7-wonders-duel', `page-${page}.png`), quote });

const tmBase = path.join(root, 'out', 'hephaestus-recovery-r1', 'terraforming-mars');
const wdBase = path.join(root, 'out', 'hephaestus-recovery-r1', '7-wonders-duel');
const tmExtraction = read(path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'production', 'zero-state-extraction.json'));
const tmScript = read(path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'production', 'zero-state-script-package.json'));
const tmEvidence = read(path.join(tmBase, 'recovered.json'));
const tmSections = tmScript.sections;
const tmActionSources = {
  card: tmSections.find((section) => section.title === 'Actions possibles')?.sources || [],
  project: tmSections.find((section) => section.title === 'Actions possibles')?.sources || [],
  tile: tmSections.find((section) => section.title === 'Placement de tuiles')?.sources || [],
};
const tmActions = [
  { name: 'Jouer une carte', category: 'card', action: 'Jouer la carte en payant son coût.', visualAssetIds: ['p5_img0_xref604'], sourceRefs: tmActionSources.card, before: 'Une carte et ses prérequis sont disponibles.', after: 'La carte est jouée après paiement de son coût.', nextState: 'Poursuivre la séquence du tour.', confidence: 0.86 },
  { name: 'Utiliser un projet', category: 'card', action: 'Résoudre le projet standard choisi.', componentRefs: ['comp-33'], visualAssetIds: ['p7_img0_xref627'], sourceRefs: tmActionSources.project, before: 'Le joueur choisit un projet standard.', after: 'Le projet choisi est résolu selon la source.', nextState: 'Poursuivre avec l’action ou la phase suivante.', confidence: 0.84 },
  { name: 'Placer une tuile', category: 'tile', action: 'Placer la tuile dans la zone autorisée.', componentRefs: ['comp-7'], visualAssetIds: ['p4_img4_xref563'], sourceRefs: tmActionSources.tile, before: 'Une tuile océan et une zone bleue sont disponibles.', after: 'La tuile est placée sur la zone réservée; le TR augmente selon la source.', nextState: 'Revenir à la séquence du tour.', confidence: 0.84 },
];
const tmModel = buildGameplayModel({
  projectId: 'tm-eng-bgg-fa0678822223',
  gameIdentity: { displayName: 'Terraforming Mars', sourceTitle: 'Terraforming Mars', locale: 'fr-CA' },
  sections: tmSections,
  components: tmExtraction.components.components,
  evidence: tmEvidence,
  actionHints: tmActions,
  loopHint: { loopUnit: 'generation', phases: ['ordre des joueurs', 'recherche', 'action', 'production'], sourceRefs: tmSections.find((section) => section.title === 'Tour de jeu')?.sources || [] },
});

const wdEvidence = read(path.join(wdBase, 'recovered.json'));
const wdComponents = [
  { id: 'component-age-cards', name: 'Age I Cards', category: 'card', confidence: 0.9 },
  { id: 'component-coins', name: 'Coins', category: 'currency', confidence: 0.9 },
  { id: 'component-wonder-cards', name: 'Wonder Cards', category: 'card', confidence: 0.9 },
];
const wdSections = [
  { id: 'source-page-7', title: 'Déroulement d’un âge', spokenText: 'À chaque âge, les joueurs jouent à tour de rôle. À votre tour, choisissez une carte accessible dans la structure.', sources: [sourceRef(7, 'Game Turn: the player chooses an accessible card in the card structure.')] },
  { id: 'source-page-10', title: 'Actions principales', spokenText: 'La carte choisie peut construire un bâtiment, être défaussée pour obtenir des pièces ou servir à construire une merveille.', sources: [sourceRef(10, 'The card chosen may be used to construct a Building, discard for coins, or construct a Wonder.')] },
  { id: 'source-page-11', title: 'Passage à l’âge suivant', spokenText: 'Quand les cartes de la structure ont été jouées, l’âge se termine et la structure du prochain âge est préparée.', sources: [sourceRef(11, 'End of an Age: prepare the next Age structure.')] },
];
const wdActions = [
  { name: 'Choisir une carte', category: 'card', action: 'Choisir une carte accessible de la structure.', componentRefs: ['component-age-cards'], visualAssetIds: ['legacy-crop-1'], sourceRefs: [sourceRef(10, 'Choose an accessible card from the structure.')], before: 'La structure contient des cartes accessibles.', after: 'La carte choisie quitte la structure pour être résolue.', nextState: 'Le joueur suivant prend son tour.', confidence: 0.88 },
  { name: 'Construire un bâtiment', category: 'card', action: 'Construire le bâtiment indiqué par la carte.', componentRefs: ['component-age-cards'], visualAssetIds: ['legacy-crop-1'], sourceRefs: [sourceRef(8, 'Constructing in 7 Wonders Duel: construct a Building.')], before: 'La carte et ses ressources sont disponibles.', after: 'Le bâtiment est placé dans la cité.', nextState: 'Le joueur suivant prend son tour.', confidence: 0.85 },
  { name: 'Défausser pour obtenir des pièces', category: 'currency', action: 'Défausser la carte pour obtenir des pièces.', componentRefs: ['component-age-cards', 'component-coins'], visualAssetIds: ['legacy-crop-3'], sourceRefs: [sourceRef(10, 'Discard a card to obtain coins.')], before: 'Une carte accessible est choisie.', after: 'La carte est défaussée et la banque fournit des pièces.', nextState: 'Le joueur suivant prend son tour.', confidence: 0.86 },
];
const wdModel = buildGameplayModel({
  projectId: '7-wonders-duel',
  gameIdentity: { displayName: '7 Wonders Duel', sourceTitle: '7 Wonders Duel', locale: 'fr-CA' },
  sections: wdSections,
  components: wdComponents,
  evidence: wdEvidence,
  actionHints: wdActions,
  loopHint: { loopUnit: 'age', phases: ['sélection d’une carte', 'résolution de l’action'], activePlayerRule: 'Les joueurs jouent à tour de rôle.', repeatRule: 'Répéter la sélection et la résolution jusqu’à épuiser la structure de l’âge.', advanceRule: 'Quand la structure est épuisée, préparer l’âge suivant.', sourceRefs: [sourceRef(7, 'Game Turn and One deck per Age.')] },
});

function buildConfig(game, model, evidence) {
  const atoms = buildGameplayPreviewAtoms(model);
  const narrationManifestPath = path.join(outRoot, game, 'gameplay-narration.json');
  const narrationManifest = fs.existsSync(narrationManifestPath) ? read(narrationManifestPath) : { assets: [] };
  const narrationByScene = new Map((narrationManifest.assets || []).map((asset) => [asset.sceneId, asset]));
  const teachingScene = ({ id, background, overlays }) => {
    const narration = narrationByScene.get(id);
    if (!narration) return { id, durationSec: 6, background, layout: { mode: 'split-teaching', textSide: 'left', imageSide: 'right', panelVariant: 'WARM_DARK', presentationLayout: { contentType: 'list', minimumFontPx: 48 } }, overlays };
    return {
      id,
      // Keep the scene at least as long as the cached TTS, while leaving only
      // a small tail so the renderer's readiness guard remains meaningful.
      durationSec: Math.max(0.5, Number(narration.durationSec || 0) + 0.05),
      background,
      layout: { mode: 'split-teaching', textSide: 'left', imageSide: 'right', panelVariant: 'WARM_DARK', presentationLayout: { contentType: 'list', minimumFontPx: 48 } },
      narrationText: narration.sourceText,
      audio: { file: narration.filePath, ambientFile: sonic, ambientGain: 0.12, ambientFadeOutSec: 0.9, speechRequired: true },
      overlays,
    };
  };
  const visualFor = (atom) => {
    const id = atom.visualAssetIds[0];
    return evidence.acceptedVisuals.find((asset) => asset.id === id)?.renderPath || evidence.acceptedVisuals[0]?.renderPath;
  };
  const scenes = [
    { id: 'brand-signature', durationSec: 3.6, background: { image: banner }, layout: { mode: 'brand' }, overlays: [], audio: { ambientFile: sonic, ambientGain: 1, preMastered: true, ambientFadeOutSec: 0.35, speechRequired: false } },
    teachingScene({ id: 'game-loop', background: { image: visualFor(atoms[0]) }, overlays: [
      { type: 'badge', text: 'Comment se déroule le jeu?', position: 'top', fontColor: '#b7ef59' },
      { type: 'heading', text: 'Le tour de jeu', position: 'panel-heading', fontColor: '#f7ecd2' },
      // Use renderer-safe ASCII separators: the bundled presentation fonts do
      // not contain the Unicode arrow glyph and would render tofu boxes.
      { type: 'body', text: `${model.gameLoop.phases.join('  >  ')}\n\nJoueur actif > action > résolution > état suivant`, position: 'panel-body', fontColor: '#f7ecd2' },
      { type: 'reference', text: `Source — p. ${model.gameLoop.sourceRefs[0]?.page || model.gameLoop.sourceRefs[0]?.section || '?'}`, position: 'reference-bottom-left', fontColor: '#c99b5b' },
    ] }),
  ];
  atoms.forEach((atom, index) => {
    const source = atom.sourceRefs[0];
    scenes.push(teachingScene({ id: atom.id, background: { image: visualFor(atom) }, overlays: [
      { type: 'badge', text: `Action ${index + 1}`, position: 'top', fontColor: '#b7ef59' },
      { type: 'heading', text: atom.title, position: 'panel-heading', fontColor: '#f7ecd2' },
      { type: 'body', text: formatGameplayTransition(atom.transition), position: 'panel-body', fontColor: '#f7ecd2' },
      { type: 'reference', text: `Source — p. ${source?.page || source?.section || '?'}`, position: 'reference-bottom-left', fontColor: '#c99b5b' },
    ] }));
  });
  scenes.push(teachingScene({ id: 'next-player-or-phase', background: { image: visualFor(atoms[0]) }, overlays: [
    { type: 'badge', text: 'Progression', position: 'top', fontColor: '#b7ef59' },
    { type: 'heading', text: 'Puis, on avance', position: 'panel-heading', fontColor: '#f7ecd2' },
    { type: 'body', text: model.gameLoop.advanceRule, position: 'panel-body', fontColor: '#f7ecd2' },
  ] }));
  scenes.push({ id: 'end-card', durationSec: 3.6, background: { image: banner }, layout: { mode: 'brand' }, overlays: [], audio: { ambientFile: sonic, ambientGain: 1, preMastered: true, ambientFadeOutSec: 0.5, speechRequired: false } });
  return { projectId: `gameplay-actions-${game}`, video: { resolution: { width: 1920, height: 1080 }, fps: 30 }, provenance: { contract: model.contract, modelPath: path.join(outRoot, game, 'gameplay-actions.json'), evidencePath: path.join(outRoot, game, 'evidence.json'), generator: 'build-gameplay-actions-r1.mjs -> render-storyboard-ffmpeg.mjs' }, scenes };
}

for (const [game, model, evidence] of [['terraforming-mars', tmModel, tmEvidence], ['7-wonders-duel', wdModel, wdEvidence]]) {
  const dir = path.join(outRoot, game);
  writeGameplayModel(path.join(dir, 'gameplay-actions.json'), model);
  write(path.join(dir, 'evidence.json'), { contract: evidence.contract, projectId: evidence.projectId, sourcePdfSha256: evidence.sourcePdfSha256, acceptedVisuals: evidence.acceptedVisuals });
  write(path.join(dir, 'preview-config.json'), buildConfig(game, model, evidence));
  write(path.join(dir, 'source-provenance.json'), { projectId: model.projectId, sourceRefs: model.sourceRefs, componentVisualBindings: model.visualBindings, evidenceContract: evidence.contract, evidenceSha256: sha(path.join(dir, 'evidence.json')) });
}
write(path.join(outRoot, 'benchmark-summary.json'), { contract: GAMEPLAY_ACTIONS_CONTRACT_VERSION, generatedBy: 'build-gameplay-actions-r1.mjs', games: { terraformingMars: { model: path.join(outRoot, 'terraforming-mars', 'gameplay-actions.json'), actions: tmModel.actions.length, bindings: new Set(tmModel.visualBindings.filter((binding) => binding.reviewState === 'accepted').map((binding) => binding.actionId)).size }, sevenWondersDuel: { model: path.join(outRoot, '7-wonders-duel', 'gameplay-actions.json'), actions: wdModel.actions.length, bindings: new Set(wdModel.visualBindings.filter((binding) => binding.reviewState === 'accepted').map((binding) => binding.actionId)).size } } });
console.log(JSON.stringify({ outRoot, games: { terraformingMars: { actions: tmModel.actions.length, reviewRequired: tmModel.reviewRequired }, sevenWondersDuel: { actions: wdModel.actions.length, reviewRequired: wdModel.reviewRequired } } }, null, 2));
