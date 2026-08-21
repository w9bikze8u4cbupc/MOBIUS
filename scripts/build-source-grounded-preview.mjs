#!/usr/bin/env node

/**
 * Build an FFmpeg storyboard-renderer config and SRT sidecar from a reviewed,
 * source-grounded tutorial script. This deliberately does not generate rules,
 * images, or audio: those remain reviewable upstream artifacts. Its only job is
 * to preserve the reviewed scene-to-page and scene-to-narration contracts.
 *
 * Usage:
 *   node scripts/build-source-grounded-preview.mjs \
 *     --script work/tutorial.json --page-dir work/pages --audio-dir work/audio \
 *     --out-config work/render-config.json --out-srt work/captions_en.srt
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function requiredArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return process.argv[index + 1];
}

function optionalArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function escapeSrt(text) {
  return String(text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatSrtTime(seconds) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return [hours, minutes, wholeSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':') + `,${String(milliseconds).padStart(3, '0')}`;
}

function getDurationSeconds(audioPath) {
  const output = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    audioPath,
  ], { encoding: 'utf8' }).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to determine audio duration for ${audioPath}`);
  }
  return duration;
}

function assertScene(scene, index) {
  if (!scene || typeof scene !== 'object') throw new Error(`Scene ${index + 1} must be an object`);
  for (const key of ['id', 'section', 'narration', 'on_screen_text', 'source_pages']) {
    if (!scene[key] || (Array.isArray(scene[key]) && scene[key].length === 0)) {
      throw new Error(`Scene ${index + 1} is missing required field '${key}'`);
    }
  }
  if (!Array.isArray(scene.source_pages) || !Number.isInteger(scene.source_pages[0])) {
    throw new Error(`Scene ${index + 1} must contain at least one numeric source page`);
  }
}

function main() {
  const scriptPath = resolve(requiredArg('script'));
  const pageDir = resolve(requiredArg('page-dir'));
  const audioDir = resolve(requiredArg('audio-dir'));
  const outputConfigPath = resolve(requiredArg('out-config'));
  const outputSrtPath = resolve(requiredArg('out-srt'));
  const projectId = optionalArg('project-id', 'source-grounded-tutorial');
  const width = Number(optionalArg('width', '1920'));
  const height = Number(optionalArg('height', '1080'));
  const fps = Number(optionalArg('fps', '30'));

  const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error('The reviewed script must contain a non-empty scenes array');
  }

  let cursor = 0;
  const captionBlocks = [];
  const scenes = script.scenes.map((scene, index) => {
    assertScene(scene, index);
    const primaryPage = scene.source_pages[0];
    const pagePath = join(pageDir, `page-${primaryPage}.png`);
    const audioPath = join(audioDir, `${scene.id}.wav`);
    if (!existsSync(pagePath)) throw new Error(`Scene ${scene.id} references missing page image: ${pagePath}`);
    if (!existsSync(audioPath)) throw new Error(`Scene ${scene.id} references missing narration: ${audioPath}`);

    const durationSec = getDurationSeconds(audioPath);
    const start = cursor;
    cursor += durationSec;
    captionBlocks.push([
      String(index + 1),
      `${formatSrtTime(start)} --> ${formatSrtTime(cursor)}`,
      escapeSrt(scene.narration),
    ].join('\n'));

    const pageLabel = scene.source_pages.length > 1
      ? `Official rulebook • pp. ${scene.source_pages.join(', ')}`
      : `Official rulebook • p. ${primaryPage}`;

    return {
      id: scene.id,
      durationSec,
      background: { image: pagePath },
      audio: { file: audioPath, provider: 'reviewed-narration' },
      overlays: [
        { type: 'badge', text: `STEP ${String(index + 1).padStart(2, '0')}`, position: 'top', fontColor: '#f5d76e' },
        { type: 'heading', text: scene.section, position: 'upper', fontColor: '#ffffff' },
        { type: 'body', text: scene.on_screen_text, position: 'center', fontColor: '#ffffff' },
        { type: 'title', text: pageLabel, position: 'bottom', fontColor: '#d9e2ec' },
      ],
    };
  });

  const renderConfig = {
    projectId,
    gameName: script.game || projectId,
    video: { resolution: { width, height }, fps },
    scenes,
    sourceGrounded: true,
    reviewedScript: scriptPath,
  };

  mkdirSync(dirname(outputConfigPath), { recursive: true });
  mkdirSync(dirname(outputSrtPath), { recursive: true });
  writeFileSync(outputConfigPath, `${JSON.stringify(renderConfig, null, 2)}\n`, 'utf8');
  writeFileSync(outputSrtPath, `${captionBlocks.join('\n\n')}\n`, 'utf8');

  console.log(JSON.stringify({
    projectId,
    sceneCount: scenes.length,
    totalDurationSec: Number(cursor.toFixed(3)),
    configPath: outputConfigPath,
    captionsPath: outputSrtPath,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[build-source-grounded-preview] ${error.message}`);
  process.exit(1);
}
