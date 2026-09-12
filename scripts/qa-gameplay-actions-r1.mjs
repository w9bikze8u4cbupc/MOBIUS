#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';
import presentationDesignSystem from '../src/services/presentationDesignSystem.cjs';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'gameplay-actions-r1');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const { solvePresentationLayout } = presentationDesignSystem;
const games = ['terraforming-mars', '7-wonders-duel'];
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const findings = [];
const reports = [];
function fail(game, check, observation) { findings.push({ id: `DET-${findings.length + 1}`, game, category: 'gameplay-actions', check, observation }); }
for (const game of games) {
  const dir = path.join(outRoot, game);
  const model = read(path.join(dir, 'gameplay-actions.json'));
  const config = read(path.join(dir, 'preview-config.json'));
  const evidence = read(path.join(dir, 'evidence.json'));
  const accepted = new Map((evidence.acceptedVisuals || []).map((asset) => [asset.id, asset]));
  const acceptedActionIds = new Set();
  const actionNames = new Set();
  for (const action of model.actions || []) {
    if (!action.sourceRefs?.length) fail(game, 'action-source-ref', `${action.id} has no source reference`);
    if (!action.componentRefs?.length) fail(game, 'action-component-binding', `${action.id} has no canonical component reference`);
    if (!action.stateChange?.before || !action.stateChange?.action || !action.stateChange?.after) fail(game, 'action-state-change', `${action.id} lacks before/action/after evidence`);
    if (actionNames.has(action.name)) fail(game, 'duplicate-action', `${action.name} is duplicated`);
    actionNames.add(action.name);
    const bindings = (model.visualBindings || []).filter((binding) => binding.actionId === action.id && binding.reviewState === 'accepted');
    if (!bindings.length) fail(game, 'action-visual-binding', `${action.id} has no accepted focused visual binding`);
    for (const binding of bindings) {
      for (const visualId of binding.visualAssetIds || []) {
        const visual = accepted.get(visualId);
        if (!visual || !visual.renderPath || !fs.existsSync(visual.renderPath)) fail(game, 'accepted-visual-file', `${action.id} points to missing visual ${visualId}`);
        if (!visual?.provenance?.manifestPath) fail(game, 'visual-provenance', `${action.id} visual ${visualId} has no provenance`);
        if (!visual?.pageNumber) fail(game, 'visual-source-page', `${action.id} visual ${visualId} has no source page`);
      }
      acceptedActionIds.add(action.id);
    }
  }
  const bodies = config.scenes.flatMap((scene) => (scene.overlays || []).filter((overlay) => overlay.type === 'body').map((overlay) => String(overlay.text || '').trim())).filter(Boolean);
  for (let i = 1; i < bodies.length; i += 1) if (bodies[i] === bodies[i - 1]) fail(game, 'narration-atom-duplicate', `adjacent body atoms repeat at index ${i}`);
  const video = path.join(dir, 'gameplay-actions-preview.mp4');
  if (!fs.existsSync(video)) fail(game, 'preview-file', 'bounded gameplay preview is missing');
  const probe = fs.existsSync(video) ? readProbe(video) : { streams: [], format: {} };
  const stream = probe.streams.find((item) => item.codec_type === 'video');
  if (stream?.width !== 1920 || stream?.height !== 1080) fail(game, 'resolution', `preview is ${stream?.width}x${stream?.height}`);
  if (Number(probe.format?.duration || 0) < 20) fail(game, 'duration', 'preview does not contain the complete bounded loop proof');
  const gameplayScenes = config.scenes.filter((scene) => scene.id !== 'brand-signature' && scene.id !== 'end-card');
  if (gameplayScenes.length !== (model.actions.length + 2)) fail(game, 'semantic-scene-boundary', 'loop/action/progression scene count does not match the canonical model');
  for (const scene of config.scenes.filter((candidate) => candidate.layout?.mode === 'split-teaching')) {
    const heading = scene.overlays?.find((overlay) => overlay.type === 'heading')?.text || '';
    const body = scene.overlays?.find((overlay) => overlay.type === 'body')?.text || '';
    const reference = scene.overlays?.find((overlay) => overlay.type === 'reference')?.text || '';
    const solved = solvePresentationLayout({
      width: config.video?.resolution?.width || 1920,
      height: config.video?.resolution?.height || 1080,
      sceneType: scene.layout?.metadataCard ? 'metadata' : (scene.layout?.presentationLayout?.contentType || 'teaching'),
      heading,
      body,
      reference,
      itemCount: String(body).split(/\r?\n/).filter(Boolean).length,
      preferredImageProminence: Number(scene.layout?.visualWidthRatio) || 0.56,
      minimumFontPx: scene.layout?.presentationLayout?.minimumFontPx || 48,
      textSide: scene.layout?.textSide || 'left',
      imageSide: scene.layout?.imageSide || 'right',
    });
    if (solved.failedHardConstraints || solved.containment.panelLeft > solved.containment.panelRight || solved.containment.panelTop > solved.containment.panelBottom) {
      fail(game, 'layout-solver-hard-constraints', `${scene.id} has no valid content-contained candidate`);
    }
  }
  reports.push({ projectId: model.projectId, videoPath: video, videoSha256: sha(video), resolution: `${stream?.width}x${stream?.height}`, durationSec: Number(probe.format?.duration || 0), actions: model.actions.length, acceptedActionBindings: acceptedActionIds.size, sourceRefs: model.sourceRefs.length, sceneIds: config.scenes.map((scene) => scene.id) });
}
function readProbe(file) { return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' })); }
const output = { namespace: 'DET', contract: 'mobius-gameplay-actions-qa-r1', generatedAt: new Date().toISOString(), reports, findings, violationCount: findings.length, pass: findings.length === 0 };
fs.writeFileSync(path.join(outRoot, 'qa-report.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ pass: output.pass, violationCount: output.violationCount, reports }, null, 2));
if (!output.pass) process.exitCode = 1;
