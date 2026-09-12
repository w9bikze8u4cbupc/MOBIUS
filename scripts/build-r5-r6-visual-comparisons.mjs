#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, source) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), source[index + 1]]);
  return pairs;
}, []));
for (const key of ['r5', 'r6', 'out']) if (!args[key]) throw new Error(`Missing --${key}`);
const absolute = (value) => path.isAbsolute(value) ? path.resolve(value) : path.resolve(ROOT, value);
const readJson = (file) => JSON.parse(fs.readFileSync(absolute(file), 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const r5 = readJson(args.r5);
const r6 = readJson(args.r6);
const leftLabel = args['left-label'] || 'R5 — baseline';
const rightLabel = args['right-label'] || 'R6 — candidat';
const filePrefix = args.prefix || 'r5-vs-r6';
const outDir = absolute(args.out);
fs.mkdirSync(outDir, { recursive: true });
const r5ByAtom = new Map((r5.frames || []).map((frame) => [frame.ruleAtomId, frame]));
const pairs = (r6.frames || []).map((right) => ({ left: r5ByAtom.get(right.ruleAtomId), right })).filter((pair) => pair.left);
const sheets = [];

for (let offset = 0; offset < pairs.length; offset += 6) {
  const group = pairs.slice(offset, offset + 6);
  const canvas = sharp({ create: { width: 1920, height: group.length * 548 + 74, channels: 4, background: '#180f0b' } });
  const composites = [];
  const title = Buffer.from(`<svg width="1920" height="74" xmlns="http://www.w3.org/2000/svg"><rect width="1920" height="74" fill="#21150f"/><text x="480" y="48" text-anchor="middle" fill="#f7ecd2" font-family="Arial" font-size="34" font-weight="700">${leftLabel}</text><text x="1440" y="48" text-anchor="middle" fill="#f7ecd2" font-family="Arial" font-size="34" font-weight="700">${rightLabel}</text></svg>`);
  composites.push({ input: title, left: 0, top: 0 });
  for (let index = 0; index < group.length; index += 1) {
    const top = 74 + index * 548;
    const [leftBuffer, rightBuffer] = await Promise.all([
      sharp(group[index].left.filePath).resize(900, 506, { fit: 'contain', background: '#000' }).png().toBuffer(),
      sharp(group[index].right.filePath).resize(900, 506, { fit: 'contain', background: '#000' }).png().toBuffer(),
    ]);
    composites.push({ input: leftBuffer, left: 30, top: top + 36 });
    composites.push({ input: rightBuffer, left: 990, top: top + 36 });
    const label = Buffer.from(`<svg width="920" height="36" xmlns="http://www.w3.org/2000/svg"><text x="460" y="27" text-anchor="middle" fill="#d8c7a7" font-family="Arial" font-size="23">${String(group[index].right.ruleAtomId).replaceAll('&', '&amp;')}</text></svg>`);
    composites.push({ input: label, left: 500, top });
  }
  const filePath = path.join(outDir, `${filePrefix}-${String(sheets.length + 1).padStart(2, '0')}.png`);
  await canvas.composite(composites).png().toFile(filePath);
  const metadata = await sharp(filePath).metadata();
  sheets.push({ filePath, sha256: sha256(filePath), width: metadata.width, height: metadata.height, sceneIds: group.map((pair) => pair.right.sceneId) });
}

const manifest = {
  contract: 'mobius-visual-comparison-v1',
  generatedAt: new Date().toISOString(),
  comparisonCount: pairs.length,
  allChangedScenesIncluded: pairs.length === (r6.frames || []).length,
  status: pairs.length === (r6.frames || []).length && sheets.every((sheet) => sheet.width === 1920 && sheet.height > 0) ? 'PASS' : 'FAIL',
  sheets,
  labels: { left: leftLabel, right: rightLabel },
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
if (manifest.status !== 'PASS') process.exitCode = 1;
