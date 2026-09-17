#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const R9 = path.join(ROOT, 'out/publishability-r9/7-wonders-duel');
const R10 = path.join(ROOT, 'out/publishability-r10/7-wonders-duel');
const REVIEW = path.join(R10, 'director-review');
const COMPARE = path.join(REVIEW, 'r9-vs-r10');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const dir of [REVIEW, COMPARE]) fs.mkdirSync(dir, { recursive: true });

const r9 = read(path.join(R9, 'encoded-media-inspection.json'));
const r10 = read(path.join(R10, 'encoded-media-inspection.json'));
const oldByAtom = new Map(r9.frames.filter((frame) => frame.atomId).map((frame) => [frame.atomId, frame]));
const newByAtom = new Map(r10.frames.filter((frame) => frame.atomId).map((frame) => [frame.atomId, frame]));
const affected = [
  'components-physical-overview', 'components-overview', 'setup-age-decks', 'setup-age-layouts',
  'setup-later-age-layouts', 'accessible-card', 'end-of-age', 'chain-construction',
  'discard-for-coins', 'guild-system', 'military-system', 'science-supremacy',
  'endgame-trigger', 'scoring-military', 'scoring-buildings', 'scoring-progress', 'tie-breaker',
];

async function labeledTile(file, label, width = 960, height = 590) {
  const bodyHeight = height - 50;
  const image = file && fs.existsSync(file)
    ? await sharp(file).resize(width, bodyHeight, { fit: 'contain', background: '#17100c' }).png().toBuffer()
    : await sharp({ create: { width, height: bodyHeight, channels: 3, background: '#17100c' } }).png().toBuffer();
  const safeLabel = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = Buffer.from(`<svg width="${width}" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="50" fill="#21150f"/><text x="18" y="34" fill="#f7ecd2" font-family="Arial,sans-serif" font-size="24">${safeLabel}</text></svg>`);
  return sharp({ create: { width, height, channels: 3, background: '#17100c' } })
    .composite([{ input: image, left: 0, top: 0 }, { input: svg, left: 0, top: bodyHeight }]).png().toBuffer();
}

const comparisons = [];
for (const atomId of affected) {
  const before = oldByAtom.get(atomId);
  const after = newByAtom.get(atomId);
  if (!after) throw new Error(`R10 encoded frame missing: ${atomId}`);
  const beforeTile = await labeledTile(before?.filePath, before ? `R9 — ${atomId}` : `R9 — ${atomId} (section absent)`);
  const afterTile = await labeledTile(after.filePath, `R10 — ${atomId}`);
  const target = path.join(COMPARE, `${atomId}.png`);
  await sharp({ create: { width: 1920, height: 590, channels: 3, background: '#17100c' } })
    .composite([{ input: beforeTile, left: 0, top: 0 }, { input: afterTile, left: 960, top: 0 }]).png({ compressionLevel: 9 }).toFile(target);
  const metadata = await sharp(target).metadata();
  comparisons.push({ atomId, before: before?.filePath || null, after: after.filePath, comparison: target, sha256: sha256(target), width: metadata.width, height: metadata.height });
}

const r10Frames = affected.map((atomId) => newByAtom.get(atomId));
const mobileWidth = 480;
const mobileHeight = 320;
const mobileTiles = [];
for (let index = 0; index < r10Frames.length; index += 1) {
  const frame = r10Frames[index];
  const tile = await labeledTile(frame.filePath, frame.atomId, mobileWidth, mobileHeight);
  mobileTiles.push({ input: tile, left: (index % 4) * mobileWidth, top: Math.floor(index / 4) * mobileHeight });
}
const mobileSheet = path.join(REVIEW, 'mobile-scale-affected-scenes.png');
await sharp({ create: { width: mobileWidth * 4, height: Math.ceil(r10Frames.length / 4) * mobileHeight, channels: 3, background: '#17100c' } })
  .composite(mobileTiles).png({ compressionLevel: 9 }).toFile(mobileSheet);

const sonic = read(path.join(ROOT, 'src/assets/branding/sonic/sonic-signature-manifest-r10.json'));
const sonicMaster = path.resolve(sonic.output || path.join(ROOT, 'src/assets/branding/sonic/mobius-cafe-sonic-signature-r10.wav'));
const waveform = path.join(REVIEW, 'sonic-signature-r10-waveform.png');
execFileSync(ffmpegStatic, ['-v', 'error', '-y', '-i', sonicMaster, '-filter_complex', 'showwavespic=s=1600x420:colors=0x2f8f4e|0xd0a952:split_channels=1', '-frames:v', '1', waveform]);
const waveMeta = await sharp(waveform).metadata();
const mobileMeta = await sharp(mobileSheet).metadata();
const report = {
  contract: 'mobius-r10-director-review-visual-package-v1',
  generatedAt: new Date().toISOString(),
  status: comparisons.length === affected.length && waveMeta.width === 1600 && mobileMeta.width === 1920 ? 'PASS' : 'FAIL',
  comparisonCount: comparisons.length,
  comparisons,
  mobileScaleSheet: { path: mobileSheet, sha256: sha256(mobileSheet), width: mobileMeta.width, height: mobileMeta.height, frames: r10Frames.length },
  guildFrames: comparisons.filter((entry) => ['components-overview', 'setup-age-decks', 'guild-system'].includes(entry.atomId)).map((entry) => entry.comparison),
  ageFrames: comparisons.filter((entry) => ['setup-age-layouts', 'setup-later-age-layouts', 'end-of-age'].includes(entry.atomId)).map((entry) => entry.comparison),
  sonic: { waveform, waveformSha256: sha256(waveform), manifest: path.join(ROOT, 'src/assets/branding/sonic/sonic-signature-manifest-r10.json'), master: sonicMaster, masterSha256: sha256(sonicMaster) },
};
fs.writeFileSync(path.join(REVIEW, 'visual-package-manifest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, comparisons: report.comparisonCount, mobileScaleSheet: report.mobileScaleSheet, sonic: report.sonic }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
