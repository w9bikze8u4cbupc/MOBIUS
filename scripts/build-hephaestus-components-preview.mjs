#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildHephaestusEvidence } from '../src/services/hephaestusEvidence.js';

const root = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
  if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]]);
  return all;
}, []));
const game = args.game || 'terraforming-mars';
const recoveryDir = path.resolve(args['recovery-dir'] || path.join(root, 'out', 'hephaestus-recovery-r1', game));
const evidencePath = path.join(recoveryDir, 'recovered.json');
const outputConfig = path.resolve(args['out-config'] || path.join(recoveryDir, 'components-setup-preview-config.json'));
const banner = path.resolve(root, 'src', 'assets', 'branding', 'les-jeux-mobius-banner-canonical.png');
const sonic = path.resolve(root, 'src', 'assets', 'branding', 'sonic', 'mobius-cafe-sonic-signature-v4.wav');
if (!fs.existsSync(evidencePath)) throw new Error(`Missing HEPHAESTUS evidence: ${evidencePath}`);
if (!fs.existsSync(banner) || !fs.existsSync(sonic)) throw new Error('Canonical brand assets are missing.');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const setup = evidence.setupBindings.find((binding) => binding.visualAssetIds?.length) || null;
const accepted = evidence.acceptedVisuals.filter((asset) => asset.renderPath && fs.existsSync(asset.renderPath));
if (!accepted.length) throw new Error(`No accepted focused component visuals for ${game}`);
const setupVisual = setup ? accepted.find((visual) => setup.visualAssetIds.includes(visual.id)) || accepted[0] : accepted[0];
const visuals = [setupVisual, ...accepted.filter((visual) => visual.id !== setupVisual.id)].slice(0, 3);
// Presentation lists describe logical component identities, not every extracted
// raster occurrence. The evidence layer retains all source assets; this generic
// display dedupe prevents repeated labels from crowding a mobile frame.
const componentLines = [...new Map(visuals.map((visual) => [
  `${String(visual.componentName || visual.category).toLowerCase()}|${visual.pageNumber || '?'}`,
  `${visual.componentName || visual.category} — p. ${visual.pageNumber || '?'}`,
])).values()].join('\n');
const setupText = setup?.instruction || `Observer le composant extrait et préparer la zone de jeu selon la source.`;
const config = {
  projectId: `hephaestus-${game}-components-setup`,
  video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
  provenance: { evidencePath, evidenceContract: evidence.contract, projectId: evidence.projectId, sourcePdfSha256: evidence.sourcePdfSha256, generatorPath: 'build-hephaestus-components-preview.mjs -> render-storyboard-ffmpeg.mjs' },
  scenes: [
    { id: 'brand-signature', durationSec: 3.6, background: { image: banner }, layout: { mode: 'brand' }, overlays: [], audio: { ambientFile: sonic, ambientGain: 1, preMastered: true, ambientFadeOutSec: 0.35, speechRequired: false } },
    { id: 'components-focused-visuals', durationSec: 6, background: { image: visuals[0].renderPath }, layout: { mode: 'split-teaching', textSide: 'left', imageSide: 'right', panelVariant: 'WARM_DARK', presentationLayout: { contentType: 'list', minimumFontPx: 48 } }, overlays: [
      { type: 'badge', text: 'Composants', position: 'top', fontColor: '#b7ef59' },
      { type: 'heading', text: 'Visuels ciblés', position: 'panel-heading', fontColor: '#f7ecd2' },
      { type: 'body', text: componentLines, position: 'panel-body', fontColor: '#f7ecd2' },
      { type: 'reference', text: `Source HEPHAESTUS — p. ${visuals[0].pageNumber || '?'}`, position: 'reference-bottom-left', fontColor: '#c99b5b' },
    ] },
    { id: 'setup-binding', durationSec: 6, background: { image: setupVisual.renderPath }, layout: { mode: 'split-teaching', textSide: 'left', imageSide: 'right', panelVariant: 'WARM_DARK', presentationLayout: { contentType: 'list', minimumFontPx: 48 } }, overlays: [
      { type: 'badge', text: 'Mise en place', position: 'top', fontColor: '#b7ef59' },
      { type: 'heading', text: 'Instruction liée', position: 'panel-heading', fontColor: '#f7ecd2' },
      { type: 'body', text: setupText, position: 'panel-body', fontColor: '#f7ecd2' },
      { type: 'reference', text: `Source HEPHAESTUS — p. ${setupVisual.pageNumber || '?'}`, position: 'reference-bottom-left', fontColor: '#c99b5b' },
    ] },
    { id: 'end-card', durationSec: 3.6, background: { image: banner }, layout: { mode: 'brand' }, overlays: [], audio: { ambientFile: sonic, ambientGain: 1, preMastered: true, ambientFadeOutSec: 0.5, speechRequired: false } },
  ],
};
fs.mkdirSync(path.dirname(outputConfig), { recursive: true });
fs.writeFileSync(outputConfig, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ game, configPath: outputConfig, scenes: config.scenes.length, focusedVisuals: visuals.length, setupBinding: setup?.setupStepId || null }, null, 2));
