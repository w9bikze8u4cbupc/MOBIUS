#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  if (!process.argv[index].startsWith('--')) continue;
  args[process.argv[index].slice(2)] = process.argv[index + 1];
  index += 1;
}
if (!args.config || !args.scenes || !args.out) {
  throw new Error('Usage: --config <render-config.json> --scenes <comma-separated scene ids> --out <bounded-config.json>');
}

const root = process.cwd();
const inputPath = path.resolve(root, args.config);
const outputPath = path.resolve(root, args.out);
const config = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const requested = args.scenes.split(',').map((value) => value.trim()).filter(Boolean);
const byId = new Map(config.scenes.map((scene) => [scene.id, scene]));
const missing = requested.filter((id) => !byId.has(id));
if (missing.length) throw new Error(`Unknown scene ids: ${missing.join(', ')}`);
const scenes = requested.map((id) => byId.get(id));
let cursor = 0;
const chapters = scenes.map((scene) => {
  const chapter = { title: scene.chapterTitle || scene.title || scene.id, sceneId: scene.id, startSec: Number(cursor.toFixed(3)) };
  cursor += Number(scene.durationSec || 0);
  return chapter;
});
const bounded = {
  ...config,
  projectId: `${config.projectId}-bounded-proof`,
  scenes,
  chapters,
  boundedProof: { sourceConfig: inputPath, requestedSceneIds: requested },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(bounded, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: 'PASS', outputPath, sceneCount: scenes.length, durationSec: Number(cursor.toFixed(3)) }, null, 2)}\n`);
