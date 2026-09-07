#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out', 'publishability-r6', '7-wonders-duel');
const PROJECT = path.join(ROOT, 'config', 'projects', '7-wonders-duel', 'tutorial-assembly.r6.json');
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const NARRATION = path.join(OUT, 'narration-assets.json');
const VIDEO = path.join(OUT, '7-wonders-duel-full-tutorial-r6.mp4');
const REPORT = path.join(OUT, 'replay-idempotence-r6.json');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const shaFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timeline = (config) => config.scenes.map((scene) => ({
  id: scene.id,
  atomId: scene.atomId || null,
  durationSec: scene.durationSec,
  visual: scene.visualBinding?.assetId || scene.background?.image || null,
  narrationHash: scene.audio?.sourceTextHash || null,
  focusCueTimeline: scene.focusCueTimeline || null,
}));
const assetMap = (manifest) => Object.fromEntries(manifest.assets.map((asset) => [asset.sceneId, {
  sourceTextHash: asset.sourceTextHash,
  sha256: shaFile(asset.filePath),
  profile: asset.profile,
  voiceId: manifest.voiceId,
  modelId: manifest.modelId,
}]));

for (const file of [PROJECT, CONFIG, NARRATION, VIDEO]) if (!fs.existsSync(file)) throw new Error(`Missing replay input: ${file}`);
const beforeConfig = read(CONFIG);
const beforeNarration = read(NARRATION);
const before = {
  timelineHash: hash(timeline(beforeConfig)),
  narrationAssetsHash: hash(assetMap(beforeNarration)),
  videoSha256: shaFile(VIDEO),
};
const output = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'assemble-knowledge-tutorial-r4.mjs'), '--project', PROJECT], {
  cwd: ROOT,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 20e6,
});
const afterConfig = read(CONFIG);
const afterNarration = read(NARRATION);
const after = {
  timelineHash: hash(timeline(afterConfig)),
  narrationAssetsHash: hash(assetMap(afterNarration)),
  videoSha256: shaFile(VIDEO),
  narrationGenerated: afterNarration.generated,
  narrationReused: afterNarration.reused,
};
const checks = {
  timelineReproduced: before.timelineHash === after.timelineHash,
  narrationAssetsReusedByteIdentically: before.narrationAssetsHash === after.narrationAssetsHash,
  noNarrationGenerated: after.narrationGenerated === 0,
  allNarrationReused: after.narrationReused === afterNarration.assets.length && afterNarration.assets.length === 30,
  renderedVideoUntouched: before.videoSha256 === after.videoSha256,
};
const report = {
  contract: 'mobius-publishability-r6-replay-proof-v1',
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  projectPath: PROJECT,
  checks,
  before,
  after,
  assemblerResult: JSON.parse(output.slice(output.indexOf('{'))),
  note: 'Generated-at metadata is excluded; identity is proven from semantic timeline, audio bytes, and final video bytes.',
};
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
