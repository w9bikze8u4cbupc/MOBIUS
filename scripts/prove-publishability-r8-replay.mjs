#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const requestedVersion = process.argv.includes('--version') ? process.argv[process.argv.indexOf('--version') + 1] : 'r8';
if (!/^r\d+$/.test(requestedVersion || '')) throw new Error('Usage: [--version r8|r9|r10]');
const OUT = path.join(ROOT, `out/publishability-${requestedVersion}/7-wonders-duel`);
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const NARRATION = path.join(OUT, 'narration-assets.json');
const VIDEO = path.join(OUT, `7-wonders-duel-full-tutorial-${requestedVersion}.mp4`);
const PROJECT = path.join(ROOT, `config/projects/7-wonders-duel/tutorial-assembly.${requestedVersion}.json`);
const REPORT = path.join(OUT, 'replay-idempotence.json');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const semanticNarrationHash = (file) => {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete value.generatedAt;
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
};

for (const file of [CONFIG, NARRATION, VIDEO, PROJECT]) {
  if (!fs.existsSync(file)) throw new Error(`Missing replay input: ${file}`);
}
const before = { config: sha256(CONFIG), narration: sha256(NARRATION), narrationSemantic: semanticNarrationHash(NARRATION), video: sha256(VIDEO) };
const expectedAtomCount = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).scenes.filter((scene) => scene.atomId).length;
const stdout = execFileSync(process.execPath, [
  path.join(ROOT, 'scripts/assemble-knowledge-tutorial-r4.mjs'), '--project', PROJECT,
], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const run = JSON.parse(stdout.slice(stdout.lastIndexOf('\n{') + 1));
const after = { config: sha256(CONFIG), narration: sha256(NARRATION), narrationSemantic: semanticNarrationHash(NARRATION), video: sha256(VIDEO) };
const assemblyReplay = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const deterministic = before.config === after.config
  && before.narrationSemantic === after.narrationSemantic
  && before.video === after.video
  && run.narration.generated === 0
  && run.narration.reused === expectedAtomCount
  && assemblyReplay.deterministic === true;
const report = {
  contract: `mobius-publishability-${requestedVersion}-replay-v1`,
  generatedAt: new Date().toISOString(),
  deterministic,
  configStable: before.config === after.config,
  narrationManifestStable: before.narrationSemantic === after.narrationSemantic,
  narrationManifestByteStable: before.narration === after.narration,
  narrationManifestVolatileField: 'generatedAt',
  encodedVideoUntouched: before.video === after.video,
  knowledgeCacheHit: assemblyReplay.knowledgeCacheHit,
  timelineHash: assemblyReplay.timelineHash,
  narrationGenerated: run.narration.generated,
  narrationReused: run.narration.reused,
  expectedAtomCount,
  scenes: run.scenes,
  atomScenes: run.atomScenes,
  durationSec: run.durationSec,
  before,
  after,
};
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!deterministic) process.exitCode = 1;
