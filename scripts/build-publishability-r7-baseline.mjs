#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r7/baseline-r6');
const R6 = path.join(ROOT, 'out/publishability-r6/7-wonders-duel');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fileEvidence = (relative) => {
  const filePath = path.join(ROOT, relative);
  if (!fs.existsSync(filePath)) throw new Error(`Missing R6 baseline artifact: ${relative}`);
  return { path: relative.replace(/\\/g, '/'), sha256: sha256(filePath), bytes: fs.statSync(filePath).size };
};
const writeJson = (name, value) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const config = JSON.parse(fs.readFileSync(path.join(R6, 'full-tutorial-config.json'), 'utf8'));
const durationSec = Number(config.scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0).toFixed(3));
const baseline = {
  contract: 'mobius-human-publishable-baseline-v1',
  recordedAt: new Date().toISOString(),
  projectId: '7-wonders-duel',
  version: 'r6',
  directorStatus: 'HUMAN_PUBLISHABLE_GOLD_BASELINE',
  humanQuality: '~9.5/10',
  publishable: true,
  published: false,
  immutable: true,
  durationSec,
  artifacts: {
    video: fileEvidence('out/publishability-r6/7-wonders-duel/7-wonders-duel-full-tutorial-r6.mp4'),
    config: fileEvidence('out/publishability-r6/7-wonders-duel/full-tutorial-config.json'),
    narration: fileEvidence('out/publishability-r6/7-wonders-duel/narration-assets.json'),
    visualPlan: fileEvidence('config/projects/7-wonders-duel/visual-plan.r6.json'),
    visualManifest: fileEvidence('out/publishability-r6/7-wonders-duel/visual-storyboard/manifest.json'),
    componentManifest: fileEvidence('out/publishability-r6/7-wonders-duel/component-library/manifest.json'),
    chapters: fileEvidence('out/publishability-r6/7-wonders-duel/chapters.json'),
    sonicMaster: fileEvidence('src/assets/branding/sonic/mobius-cafe-sonic-signature-v4.wav'),
  },
};
const delta = {
  contract: 'mobius-publishability-delta-v1',
  baseline: 'r6',
  candidate: 'r7',
  rulesChanged: false,
  coverageChanged: false,
  narrationSemanticsChanged: false,
  sonicIdentityChanged: false,
  permittedChanges: [
    'scene-matched blurred background treatment',
    'lower-caption centering and box sizing',
    'gold sequence arrows replacing green artifacts',
    'crop completeness and framing polish',
    'discard/military/scoring visual demonstrations',
    'verified narration-segment regeneration only if an audible defect is confirmed',
  ],
  fallback: baseline.artifacts.video,
};
writeJson('baseline.json', baseline);
writeJson('delta-contract.json', delta);
process.stdout.write(`${JSON.stringify({ status: 'PASS', output: OUT, videoSha256: baseline.artifacts.video.sha256, durationSec }, null, 2)}\n`);
