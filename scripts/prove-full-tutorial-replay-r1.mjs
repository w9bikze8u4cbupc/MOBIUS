#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assemble, games } from './assemble-full-tutorial-r1.mjs';

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, 'out', 'full-tutorial-r1');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const snapshot = (game) => {
  const dir = path.join(outputRoot, game);
  const config = path.join(dir, 'full-tutorial-config.json');
  const narration = read(path.join(dir, 'narration-assets.json'));
  return {
    configSha256: hash(config),
    narrationGenerated: narration.generated || 0,
    narrationReused: narration.reused || 0,
    narrationAssetHashes: (narration.assets || []).map((asset) => ({ sceneId: asset.sceneId, sourceTextHash: asset.sourceTextHash, fileSha256: fs.existsSync(asset.filePath) ? hash(asset.filePath) : null })),
  };
};

const before = Object.fromEntries(Object.keys(games).map((game) => [game, snapshot(game)]));
const results = [];
for (const game of Object.keys(games)) results.push(await assemble(game));
const after = Object.fromEntries(Object.keys(games).map((game) => [game, snapshot(game)]));
const gamesResult = Object.fromEntries(Object.keys(games).map((game) => [game, {
  configStable: before[game].configSha256 === after[game].configSha256,
  narrationGeneratedOnReplay: after[game].narrationGenerated,
  narrationReusedOnReplay: after[game].narrationReused,
  narrationAssetsStable: JSON.stringify(before[game].narrationAssetHashes) === JSON.stringify(after[game].narrationAssetHashes),
}]));
const passed = Object.values(gamesResult).every((item) => item.configStable && item.narrationGeneratedOnReplay === 0 && item.narrationAssetsStable);
const evidence = { schema_version: 'mobius-full-tutorial-replay-r1', status: passed ? 'PASS' : 'FAIL', before, after, games: gamesResult, assemblyResults: results.map((result) => ({ game: result.game, tts: result.tts })) };
fs.writeFileSync(path.join(outputRoot, 'replay-idempotence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (!passed) process.exitCode = 1;
