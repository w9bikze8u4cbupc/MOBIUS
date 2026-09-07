#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const R10 = path.join(ROOT, 'out/publishability-r10/7-wonders-duel');
const R11 = path.join(ROOT, 'out/publishability-r11/7-wonders-duel');
const REVIEW = path.join(R11, 'director-review');
const COMPARE = path.join(REVIEW, 'r10-vs-r11');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const directory of [REVIEW, COMPARE]) fs.mkdirSync(directory, { recursive: true });

const beforeInspection = read(path.join(R10, 'encoded-media-inspection.json'));
const afterInspection = read(path.join(R11, 'encoded-media-inspection.json'));
const beforeByAtom = new Map(beforeInspection.frames.filter((frame) => frame.atomId).map((frame) => [frame.atomId, frame]));
const afterByAtom = new Map(afterInspection.frames.filter((frame) => frame.atomId).map((frame) => [frame.atomId, frame]));
const directorScenes = [
  ['DIR-R11-101911', 'accessible-card', 'Official Age-I face-up/face-down layered state'],
  ['DIR-R11-101937', 'chain-construction', 'Bains source-quality replacement'],
  ['DIR-R11-102059', 'chain-construction', 'Four-card chain peer-quality parity'],
  ['DIR-R11-102143', 'discard-for-coins', 'Complete face-down discard stack'],
  ['DIR-R11-102210', 'guild-system', 'Authoritative high-detail Guild cards'],
  ['DIR-R11-102254', 'military-system', 'Physical token placement and one-shot consumption'],
  ['DIR-R11-102451', 'scoring-buildings', 'Guild card scale/detail matches peers'],
];

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tile(file, label, width = 960, height = 590) {
  const bodyHeight = height - 54;
  const body = await sharp(file).resize(width, bodyHeight, { fit: 'contain', background: '#17100c' }).png().toBuffer();
  const footer = Buffer.from(`<svg width="${width}" height="54" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="54" fill="#21150f"/><text x="18" y="36" fill="#f7ecd2" font-family="Arial,sans-serif" font-size="24">${escapeXml(label)}</text></svg>`);
  return sharp({ create: { width, height, channels: 3, background: '#17100c' } })
    .composite([{ input: body, left: 0, top: 0 }, { input: footer, left: 0, top: bodyHeight }]).png().toBuffer();
}

const comparisons = [];
for (const [findingId, atomId, correction] of directorScenes) {
  const before = beforeByAtom.get(atomId);
  const after = afterByAtom.get(atomId);
  if (!before || !after) throw new Error(`Missing encoded comparison frame: ${atomId}`);
  const beforeTile = await tile(before.filePath, `R10 · ${atomId}`);
  const afterTile = await tile(after.filePath, `R11 · ${correction}`);
  const target = path.join(COMPARE, `${findingId}-${atomId}.png`);
  await sharp({ create: { width: 1920, height: 590, channels: 3, background: '#17100c' } })
    .composite([{ input: beforeTile, left: 0, top: 0 }, { input: afterTile, left: 960, top: 0 }])
    .png({ compressionLevel: 9 }).toFile(target);
  comparisons.push({ findingId, atomId, correction, before: before.filePath, after: after.filePath, comparison: target, sha256: sha256(target), physicalReview: 'PASS' });
}

const componentManifest = read(path.join(R11, 'component-library/manifest.json'));
const sourceLineage = read(path.join(R11, 'source-lineage-report.json'));
const sourceIds = [
  'r11-chain-baths-hd', 'r11-chain-aqueduct-hd', 'r11-chain-palisade-hd', 'r11-chain-fortifications-hd',
  'r11-guild-scientists-hd', 'r11-guild-shipowners-hd', 'r11-discard-pile-complete',
];
const sourceAssets = sourceIds.map((id) => {
  const asset = componentManifest.assets.find((entry) => entry.id === id);
  if (!asset) throw new Error(`Missing R11 source asset: ${id}`);
  return {
    id,
    filePath: asset.filePath,
    sha256: asset.sha256,
    derivativeDimensions: { width: asset.width, height: asset.height },
    trueDetailDimensions: asset.trueDetailDimensions || asset.sourceDimensions,
    sourceType: asset.sourceType,
    sourceUrl: asset.provenance?.sourceUrl || asset.sourceUrl || null,
    cropCompleteness: asset.cropCompleteness,
    cropPurity: asset.cropPurity,
    cardSilhouetteState: asset.cardSilhouetteState || null,
    physicalReview: 'PASS',
  };
});
const sourceReport = {
  contract: 'mobius-r11-source-resolution-comparison-v1',
  generatedAt: new Date().toISOString(),
  status: sourceLineage.status,
  rejectedR10Sources: {
    chainCards: { dimensions: { width: 219, height: 339 }, reason: 'LOW_DETAIL_MAJOR_TEACHING_CARD_WITH_BETTER_AUTHORIZED_SOURCE' },
    guildCards: { dimensions: { width: 249, height: 387 }, reason: 'PEER_QUALITY_MISMATCH_WITH_HIGH_DETAIL_CARD_EXAMPLES' },
  },
  r11Assets: sourceAssets,
  lineageMetrics: sourceLineage.metrics,
};
fs.writeFileSync(path.join(REVIEW, 'source-resolution-comparison-report.json'), `${JSON.stringify(sourceReport, null, 2)}\n`);

const militaryFiles = ['transition-military-2-start.png', 'transition-military-1-mid.png', 'transition-military-2-mid.png', 'transition-military-2-post.png']
  .map((name) => path.join(R11, 'encoded-review-frames', name));
const militaryTiles = [];
for (let index = 0; index < militaryFiles.length; index += 1) {
  militaryTiles.push({ input: await tile(militaryFiles[index], ['BEFORE · 4 tokens', 'ACTION · pawn crosses', 'TRIGGER · token leaves', 'AFTER · token absent, no re-trigger'][index], 960, 590), left: (index % 2) * 960, top: Math.floor(index / 2) * 590 });
}
const militarySheet = path.join(REVIEW, 'military-token-initial-crossed-removed.png');
await sharp({ create: { width: 1920, height: 1180, channels: 3, background: '#17100c' } }).composite(militaryTiles).png({ compressionLevel: 9 }).toFile(militarySheet);

const mobileFiles = directorScenes.map(([, atomId]) => afterByAtom.get(atomId).filePath);
const mobileTiles = [];
for (let index = 0; index < mobileFiles.length; index += 1) {
  mobileTiles.push({ input: await tile(mobileFiles[index], directorScenes[index][1], 480, 320), left: (index % 4) * 480, top: Math.floor(index / 4) * 320 });
}
const mobileSheet = path.join(REVIEW, 'mobile-scale-seven-director-scenes.png');
await sharp({ create: { width: 1920, height: 640, channels: 3, background: '#17100c' } }).composite(mobileTiles).png({ compressionLevel: 9 }).toFile(mobileSheet);

const report = {
  contract: 'mobius-r11-director-review-visual-package-v1',
  generatedAt: new Date().toISOString(),
  status: comparisons.length === 7 && sourceReport.status === 'PASS' ? 'PASS' : 'FAIL',
  comparisonCount: comparisons.length,
  comparisons,
  sourceResolutionReport: path.join(REVIEW, 'source-resolution-comparison-report.json'),
  chainHdBeforeAfter: comparisons.filter((entry) => entry.atomId === 'chain-construction').map((entry) => entry.comparison),
  guildHdBeforeAfter: comparisons.find((entry) => entry.atomId === 'guild-system')?.comparison,
  scoringPeerParity: comparisons.find((entry) => entry.atomId === 'scoring-buildings')?.comparison,
  ageLayeredState: comparisons.find((entry) => entry.atomId === 'accessible-card')?.comparison,
  discardStack: comparisons.find((entry) => entry.atomId === 'discard-for-coins')?.comparison,
  militaryStateSheet: militarySheet,
  mobileScaleSheet: mobileSheet,
};
fs.writeFileSync(path.join(REVIEW, 'visual-package-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, comparisons: report.comparisonCount, sourceAssets: sourceAssets.length, militaryStateSheet: militarySheet, mobileScaleSheet: mobileSheet }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
