#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const positional = argv.filter(arg => !arg.startsWith('-'));
const outputArg = positional[2];
const outputPath = resolve(outputArg || 'out/preview.mp4');

mkdirSync(dirname(outputPath), { recursive: true });

const durationSeconds = 6;
const ffmpegArgs = [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-f', 'lavfi',
  '-i', `color=c=darkslateblue:s=1280x720:d=${durationSeconds}`,
  '-f', 'lavfi',
  '-i', `sine=frequency=523.25:sample_rate=48000:duration=${durationSeconds}`,
  '-shortest',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-profile:v', 'main',
  '-level', '3.1',
  '-c:a', 'aac',
  '-b:a', '192k',
  outputPath
];

const result = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(outputPath)) {
  throw new Error(`Expected preview at ${outputPath}, but it was not created.`);
}

const canonical = resolve('out/preview.mp4');
if (canonical !== outputPath) {
  mkdirSync(dirname(canonical), { recursive: true });
  copyFileSync(outputPath, canonical);
}

writeFileSync(resolve('out/.last-preview'), new Date().toISOString() + '\n');
