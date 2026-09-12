#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const configPath = path.resolve(process.argv[2] || 'out/publishability-r6/7-wonders-duel/full-tutorial-config.json');
const videoPath = path.resolve(process.argv[3] || 'out/publishability-r6/7-wonders-duel/7-wonders-duel-full-tutorial-r6.mp4');
const outDir = path.resolve(process.argv[4] || 'out/publishability-r6/7-wonders-duel/focus-transition-proof');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(outDir, { recursive: true });

let cursor = 0;
const captures = [];
for (const scene of config.scenes) {
  const cues = scene.focusCueTimeline?.cues || [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const moments = [
      { state: 'ACTIVE_AFTER_START', localSec: Math.min(Number(scene.durationSec) - 0.05, Number(cue.startSec) + 0.35) },
      { state: 'INACTIVE_AFTER_END', localSec: Math.min(Number(scene.durationSec) - 0.05, Number(cue.endSec) + 0.6) },
    ];
    for (const moment of moments) {
      const globalSec = Number((cursor + moment.localSec).toFixed(3));
      const name = `${scene.id}-${String(index + 1).padStart(2, '0')}-${moment.state.toLowerCase()}.png`;
      const filePath = path.join(outDir, name);
      // Seek close to the target, then decode the last two seconds accurately.
      // These proof frames sit immediately around sub-scene cue edges.
      const seekStart = Math.max(0, globalSec - 2);
      const decodeOffset = globalSec - seekStart;
      execFileSync(ffmpegStatic, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(seekStart), '-i', videoPath, '-ss', String(decodeOffset), '-frames:v', '1', filePath], { windowsHide: true });
      const metadata = await sharp(filePath).metadata();
      captures.push({ sceneId: scene.id, cueIndex: index, semanticRegion: cue.semanticRegion, narrationClause: cue.narrationClause, state: moment.state, localSec: moment.localSec, globalSec, filePath, sha256: sha256(filePath), width: metadata.width, height: metadata.height });
    }
  }
  cursor += Number(scene.durationSec || 0);
}

const sheets = [];
for (let offset = 0; offset < captures.length; offset += 6) {
  const group = captures.slice(offset, offset + 6);
  const composites = [];
  for (let index = 0; index < group.length; index += 1) {
    const item = group[index];
    const image = await sharp(item.filePath).resize(960, 540, { fit: 'contain', background: '#120b08' }).png().toBuffer();
    const safe = `${item.sceneId} | ${item.semanticRegion} | ${item.state}`.replaceAll('&', '&amp;');
    const label = Buffer.from(`<svg width="960" height="52"><rect width="960" height="52" fill="#21150f"/><text x="18" y="34" fill="#f7ecd2" font-family="Arial" font-size="20">${safe}</text></svg>`);
    const tile = await sharp({ create: { width: 960, height: 592, channels: 3, background: '#120b08' } }).composite([{ input: image, top: 0, left: 0 }, { input: label, top: 540, left: 0 }]).png().toBuffer();
    composites.push({ input: tile, left: (index % 2) * 960, top: Math.floor(index / 2) * 592 });
  }
  const filePath = path.join(outDir, `focus-transition-sheet-${String(sheets.length + 1).padStart(2, '0')}.png`);
  await sharp({ create: { width: 1920, height: 1776, channels: 3, background: '#120b08' } }).composite(composites).png().toFile(filePath);
  sheets.push({ filePath, sha256: sha256(filePath), captures: group.map((item) => ({ sceneId: item.sceneId, semanticRegion: item.semanticRegion, state: item.state })) });
}

const report = { contract: 'mobius-r6-focus-transition-render-proof-v1', generatedAt: new Date().toISOString(), status: captures.length > 0 && captures.every((item) => item.width === 1920 && item.height === 1080) ? 'PASS' : 'FAIL', videoPath, videoSha256: sha256(videoPath), captureCount: captures.length, captures, sheets };
fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, captureCount: captures.length, sheetCount: sheets.length, output: path.join(outDir, 'report.json') }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
