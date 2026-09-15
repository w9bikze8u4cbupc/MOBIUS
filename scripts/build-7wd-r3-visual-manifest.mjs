#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const sourceDir = path.join(root, 'out', 'publishability-r3', '7-wonders-duel', 'rulebook-pages');
const r2 = path.join(root, 'out', 'publishability-r2', '7-wonders-duel', 'native-visual-manifest.json');
const outDir = path.join(root, 'out', 'publishability-r3', '7-wonders-duel', 'visuals');
const outManifest = path.join(root, 'out', 'publishability-r3', '7-wonders-duel', 'native-visual-manifest.json');
const pdfSha256 = '8b05c4ce1c4f211fd04d39627dd26593085faa16b6eb85aaac8f6cf89e6958f2';
const sourcePdf = 'C:\\mobius-games-tutorial-generator-runtime\\data\\6b-7-wonders-duel-8b05c4ce1c4f\\source\\rulebook.pdf';
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exists = (file) => Boolean(file && fs.existsSync(file));

async function crop(id, page, region, sourceLabel) {
  const source = path.join(sourceDir, `page-${String(page).padStart(2, '0')}.png`);
  const filePath = path.join(outDir, `${id}.png`);
  if (!exists(source)) throw new Error(`Missing rendered source page: ${source}`);
  await sharp(source).extract(region).png().toFile(filePath);
  const meta = await sharp(filePath).metadata();
  return { id, filePath, page, xref: null, category: 'high-dpi-semantic-crop', width: meta.width, height: meta.height, format: 'png', extractionMethod: 'pymupdf-high-dpi-page-raster', sourcePdfSha256: pdfSha256, sourceLabel, displayLabelFrCa: null, reviewState: 'accepted', visualUtility: 'EXACT_INSTRUCTIONAL', cropPurity: 'clean', hdQualityCandidate: true, nativeMaster: false, sourceRegion: { ...region, dpi: 300 }, sha256: sha(filePath) };
}

async function cropSource(id, source, page, region, sourceLabel) {
  const filePath = path.join(outDir, `${id}.png`);
  await sharp(source).extract(region).png().toFile(filePath);
  const meta = await sharp(filePath).metadata();
  return { id, filePath, page, xref: null, category: 'high-dpi-semantic-crop', width: meta.width, height: meta.height, format: 'png', extractionMethod: 'pymupdf-high-dpi-page-raster', sourcePdfSha256: pdfSha256, sourceLabel, displayLabelFrCa: null, reviewState: 'accepted', visualUtility: 'EXACT_INSTRUCTIONAL', cropPurity: 'clean', hdQualityCandidate: true, nativeMaster: false, sourceRegion: { ...region, dpi: 300 }, sha256: sha(filePath) };
}

async function collage(id, pieces) {
  const filePath = path.join(outDir, `${id}.png`);
  const canvas = sharp({ create: { width: 1800, height: 900, channels: 4, background: { r: 247, g: 236, b: 210, alpha: 1 } } });
  const composites = [];
  for (const piece of pieces) composites.push({ input: await sharp(piece.file).resize(piece.width, piece.height, { fit: 'inside' }).png().toBuffer(), left: piece.left, top: piece.top });
  await canvas.composite(composites).png().toFile(filePath);
  const meta = await sharp(filePath).metadata();
  return { id, filePath, page: 13, xref: null, category: 'source-grounded-scoring-collage', width: meta.width, height: meta.height, format: 'png', extractionMethod: 'deterministic-source-asset-collage', sourcePdfSha256: pdfSha256, sourceLabel: 'Military track, Building, Wonder, Progress and Treasury evidence', displayLabelFrCa: 'Éléments du décompte', reviewState: 'accepted', visualUtility: 'EXACT_INSTRUCTIONAL', cropPurity: 'clean', hdQualityCandidate: true, nativeMaster: false, sourceRegion: null, sha256: sha(filePath) };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const base = JSON.parse(fs.readFileSync(r2, 'utf8'));
  const assets = base.assets.map((asset) => ({ ...asset, visualUtility: asset.visualUtility || ((/p2_img0|p12_img0/.test(asset.id)) ? 'DECORATIVE_RULEBOOK_ART' : 'CONTEXTUAL_INSTRUCTIONAL') }));
  const additions = [];
  additions.push(await crop('r3-setup-central-hdpi', 6, { left: 120, top: 650, width: 2000, height: 1300 }, 'Official central setup: board, conflict pawn, military tokens, progress tokens and starting coins'));
  additions.push(await crop('r3-wonder-selection-hdpi', 7, { left: 1220, top: 620, width: 1000, height: 1450 }, 'Official Wonder selection card groups and selection arrows'));
  additions.push(await crop('r3-age-layouts-hdpi', 20, { left: 100, top: 500, width: 2050, height: 1510 }, 'Official Age I, Age II and Age III card-board layouts with face-up/face-down legend'));
  additions.push(await crop('r3-age-i-layout-hdpi', 20, { left: 100, top: 500, width: 980, height: 1150 }, 'Official Age I card structure and orientation'));
  additions.push(await crop('r3-age-i-accessible-card-hdpi', 20, { left: 100, top: 550, width: 820, height: 700 }, 'Focused official Age I accessible-card structure'));
  additions.push(await crop('r3-military-track-wide-hdpi', 12, { left: 110, top: 1180, width: 2025, height: 940 }, 'Official military track, Conflict pawn, Military tokens and shield evidence'));
  const page2 = path.join(root, 'out', 'publishability-r2', '7-wonders-duel', 'page2-300dpi.png');
  additions.push(await cropSource('r3-progress-tokens-pure-hdpi', page2, 2, { left: 1680, top: 420, width: 500, height: 330 }, 'Pure Progress token cluster from the official component page'));
  additions.push(await cropSource('r3-coins-pure-hdpi', page2, 2, { left: 900, top: 1570, width: 500, height: 500 }, 'Pure coin treasury cluster from the official component page'));
  const building = assets.find((asset) => asset.id === 'p3_img9_xref185');
  const wonder = assets.find((asset) => asset.id === 'p4_img2_xref238');
  const military = additions.find((asset) => asset.id === 'r3-military-track-wide-hdpi');
  const progress = additions.find((asset) => asset.id === 'r3-progress-tokens-pure-hdpi') || assets.find((asset) => asset.id === 'p1_img18_xref77');
  const coins = additions.find((asset) => asset.id === 'r3-coins-pure-hdpi') || assets.find((asset) => asset.id === 'p1_img6_xref51');
  additions.push(await collage('r3-setup-progress-and-coins', [
    { file: progress.filePath, left: 160, top: 180, width: 620, height: 420 },
    { file: coins.filePath, left: 980, top: 120, width: 650, height: 620 },
  ]));
  additions.push(await collage('r3-scoring-categories-collage', [
    { file: military.filePath, left: 70, top: 70, width: 820, height: 330 },
    { file: building.filePath, left: 970, top: 70, width: 250, height: 360 },
    { file: wonder.filePath, left: 1280, top: 70, width: 250, height: 360 },
    { file: progress.filePath, left: 970, top: 500, width: 300, height: 300 },
    { file: coins.filePath, left: 1370, top: 500, width: 360, height: 280 },
  ]));
  additions.push(await collage('r3-discard-to-coins', [
    { file: additions.find((asset) => asset.id === 'r3-age-i-accessible-card-hdpi').filePath, left: 100, top: 110, width: 700, height: 560 },
    { file: coins.filePath, left: 980, top: 250, width: 620, height: 420 },
  ]));
  const merged = [...additions, ...assets.filter((asset) => !additions.some((addition) => addition.id === asset.id))];
  const manifest = { schema_version: 'mobius-native-visual-manifest-r3', generatedAt: new Date().toISOString(), sourcePdf, sourcePdfSha256: pdfSha256, extractionMethod: 'pymupdf-native-master-plus-source-grounded-high-dpi-crops', nativeMastersPreserved: true, visualUtilityContract: ['EXACT_INSTRUCTIONAL', 'CONTEXTUAL_INSTRUCTIONAL', 'DECORATIVE_RULEBOOK_ART', 'IRRELEVANT'], assets: merged };
  fs.writeFileSync(outManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ manifest: outManifest, additions: additions.map((asset) => ({ id: asset.id, path: asset.filePath, width: asset.width, height: asset.height, sha256: asset.sha256 })) }, null, 2));
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
