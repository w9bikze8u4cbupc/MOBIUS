#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import ffmpegStatic from 'ffmpeg-static';
import { PRESENTATION_TOKENS, resolveFont } from '../src/services/presentationDesignSystem.cjs';

const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value?.startsWith('--')) continue;
  args[value.slice(2)] = process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[++index] : true;
}
const outDir = resolve(args['out-dir'] || 'out/mission-01/presentation-r2');
const videoRoot = resolve(args['video-root'] || 'out/mission-01/presentation-r2');
const inspectionDir = join(outDir, 'design-review-frames');
const boardPath = join(outDir, 'presentation-design-system-review.png');
const jsonPath = join(outDir, 'presentation-design-system.json');
mkdirSync(inspectionDir, { recursive: true });
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
const frameSpecs = [
  { id: 'metadata-terraforming-mars', label: 'Metadata panel · Terraforming Mars', video: 'terraforming-mars-opening-preview.mp4', time: 8 },
  { id: 'metadata-7-wonders-duel', label: 'Exact-edition cover + metadata · 7 Wonders Duel', video: '7-wonders-duel-opening-preview.mp4', time: 8 },
  { id: 'objective-list', label: 'Objective / victory list · 7 Wonders Duel', video: '7-wonders-duel-opening-preview.mp4', time: 39 },
  { id: 'semantic-section', label: 'Semantic section boundary · Terraforming Mars', video: 'terraforming-mars-opening-preview.mp4', time: 28 },
];
for (const spec of frameSpecs) {
  const target = join(inspectionDir, `${spec.id}.png`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(spec.time), '-i', join(videoRoot, spec.video), '-frames:v', '1', target], { windowsHide: true });
  spec.path = target;
}

const tileWidth = 960; const tileHeight = 540;
const labelSvg = (text) => Buffer.from(`<svg width="${tileWidth}" height="56"><rect width="100%" height="100%" fill="#211a16" fill-opacity="0.88"/><text x="28" y="37" font-family="Nunito,Arial,sans-serif" font-size="25" fill="#f7ecd2">${text.replace(/[&<>]/g, '')}</text></svg>`);
const composites = await Promise.all(frameSpecs.map(async (spec, index) => ({
  input: await sharp(spec.path).resize(tileWidth, tileHeight, { fit: 'cover' }).composite([{ input: labelSvg(spec.label), top: 0, left: 0 }]).png().toBuffer(),
  left: (index % 2) * tileWidth,
  top: Math.floor(index / 2) * tileHeight,
})));
await sharp({ create: { width: 1920, height: 1080, channels: 3, background: PRESENTATION_TOKENS.colors.brandInk } })
  .composite(composites).png().toFile(boardPath);
const boardMetadata = await sharp(boardPath).metadata();
const boardSize = statSync(boardPath).size;
if (boardMetadata.format !== 'png' || boardMetadata.width !== 1920 || boardMetadata.height !== 1080 || boardSize <= 0) {
  throw new Error(`Invalid design review board: format=${boardMetadata.format}, width=${boardMetadata.width}, height=${boardMetadata.height}, bytes=${boardSize}`);
}

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const manifestPath = resolve('src/assets/games/presentation-box-art-manifest.json');
const sonicPath = resolve('src/assets/branding/sonic/sonic-signature-manifest-v2.json');
const design = {
  version: 'mobius-presentation-design-review-v1',
  generatedFrom: 'actual FFmpeg-rendered opening preview frames',
  board: { path: boardPath, sha256: hash(boardPath), width: boardMetadata.width, height: boardMetadata.height, format: boardMetadata.format, bytes: boardSize, decoderValidated: true },
  tokens: PRESENTATION_TOKENS,
  fonts: { display: resolveFont('display'), body: resolveFont('body'), label: resolveFont('label') },
  panels: { WARM_DARK: PRESENTATION_TOKENS.panels.WARM_DARK, WARM_LIGHT: PRESENTATION_TOKENS.panels.WARM_LIGHT },
  boxArtManifest: manifestPath,
  sonicSignatureManifest: sonicPath,
  frames: frameSpecs.map(({ id, label, path }) => ({ id, label, path, sha256: hash(path) })),
};
writeFileSync(jsonPath, `${JSON.stringify(design, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ boardPath, jsonPath, frames: design.frames }, null, 2));
