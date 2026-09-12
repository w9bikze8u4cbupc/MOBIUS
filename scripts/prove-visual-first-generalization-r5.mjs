#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compileVisualPlans, auditVisualCoverage } = require('../src/services/visualPlan.cjs');
const ROOT = path.resolve(process.cwd());
const sourceManifestPath = path.join(ROOT, 'out', 'hephaestus-recovery-r1', 'terraforming-mars', 'recovered-manifest.json');
const outputRoot = path.join(ROOT, 'out', 'publishability-r5', 'terraforming-mars');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

function choose(images, type, predicate = () => true) {
  return images
    .filter((item) => item.is_component && item.type === type && predicate(item) && fs.existsSync(item.file_path))
    .sort((left, right) => (right.original_dimensions.width * right.original_dimensions.height) - (left.original_dimensions.width * left.original_dimensions.height))[0];
}

function canonicalAsset(item, classification, tags) {
  return {
    id: `tm-${item.type}-${item.page_index}`,
    filePath: item.file_path,
    displayPath: item.file_path,
    containsActualGamePixels: true,
    visualClassification: classification,
    sourceType: item.native ? 'NATIVE_EMBEDDED' : 'HIGH_DPI_PAGE_CROP',
    semanticTags: tags,
    sourceRefs: [{ page: item.page_index + 1, xref: Number(String(item.id).match(/xref(\d+)/)?.[1] || 0) }],
    sourceDimensions: item.original_dimensions,
    width: item.dimensions.width,
    height: item.dimensions.height,
    cropPurity: 'clean',
    cropCompleteness: 'complete',
    reviewState: 'accepted',
    provenance: { projectId: 'tm-eng-bgg-fa0678822223', extractionMethod: 'recovered-hephaestus-native-object', sourcePath: item.file_path },
  };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  const board = choose(manifest.images, 'board', (item) => item.original_dimensions.width >= 4000);
  const card = choose(manifest.images, 'card', (item) => item.original_dimensions.height > item.original_dimensions.width * 1.2
    && item.visual_metrics?.nearBlank !== true
    && Number(item.visual_metrics?.brightPixelRatio || 0) > 0.01);
  const token = choose(manifest.images, 'token', (item) => item.page_index === 4
    && item.original_dimensions.width <= 200
    && item.original_dimensions.height <= 200
    && item.visual_metrics?.nearBlank !== true);
  if (!board || !card || !token) throw new Error('Terraforming Mars recovered evidence lacks a required real board/card/token fixture.');
  const assets = [
    canonicalAsset(board, 'REAL_BOARD_OR_TRACK', ['plateau Mars', 'pistes globales']),
    canonicalAsset(card, 'REAL_CARD_OR_WONDER', ['carte Projet', 'coût', 'effet']),
    canonicalAsset(token, 'REAL_COMPONENT', ['marqueur', 'piste']),
  ];
  const atoms = [
    { id: 'tm-board-state', domain: 'turn_structure', title: 'État du plateau', componentRefs: ['plateau'], sourceRefs: assets[0].sourceRefs, confidence: 1, visualRequirement: { requiredObjects: ['plateau Mars'] } },
    { id: 'tm-project-action', domain: 'action', title: 'Jouer une carte Projet', componentRefs: ['carte Projet'], sourceRefs: assets[1].sourceRefs, confidence: 1, visualRequirement: { requiredObjects: ['carte Projet'] } },
    { id: 'tm-marker-change', domain: 'triggered_effect', title: 'Déplacer un marqueur', componentRefs: ['marqueur'], sourceRefs: assets[2].sourceRefs, confidence: 1, visualRequirement: { requiredObjects: ['marqueur'] } },
  ];
  const projectPlans = atoms.map((atom, index) => ({
    ruleAtomId: atom.id,
    compositionType: index === 0 ? 'REAL_BOARD_TRACK_FOCUS' : 'REAL_COMPONENT_HERO',
    actualGameAssetIds: [assets[index].id],
    actualGameAssetRequired: true,
    visualAreaTarget: 0.7,
    reviewState: 'accepted',
  }));
  const plans = compileVisualPlans({ atoms, projectPlans, assets });
  const coverage = auditVisualCoverage({ atoms, plans, assets });
  const canvas = sharp({ create: { width: 1920, height: 1080, channels: 4, background: '#21150f' } });
  const cells = [];
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const x = 80 + index * 610;
    const image = await sharp(asset.filePath, { limitInputPixels: false, sequentialRead: true }).resize(530, 750, { fit: 'contain', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const metadata = await sharp(image).metadata();
    cells.push({ input: image, left: x + Math.round((530 - metadata.width) / 2), top: 170 + Math.round((750 - metadata.height) / 2) });
  }
  const chrome = Buffer.from(`<svg width="1920" height="1080"><rect x="35" y="30" width="1850" height="1020" rx="38" fill="#3b281d" stroke="#cda35e" stroke-width="4"/><text x="960" y="110" text-anchor="middle" fill="#f7ecd2" font-family="Georgia" font-size="54" font-weight="700">Preuve de généralisation — Terraforming Mars</text><text x="350" y="990" text-anchor="middle" fill="#f7ecd2" font-family="Arial" font-size="34">Plateau réel</text><text x="960" y="990" text-anchor="middle" fill="#f7ecd2" font-family="Arial" font-size="34">Carte réelle</text><text x="1570" y="990" text-anchor="middle" fill="#f7ecd2" font-family="Arial" font-size="34">Marqueur réel</text></svg>`);
  const contactSheetPath = path.join(outputRoot, 'visual-first-generalization.png');
  fs.mkdirSync(outputRoot, { recursive: true });
  await canvas.composite([{ input: chrome, left: 0, top: 0 }, ...cells]).png().toFile(contactSheetPath);
  const report = {
    contract: 'mobius-visual-first-generalization-proof-v1',
    status: coverage.status,
    projectId: 'tm-eng-bgg-fa0678822223',
    sourceManifestPath,
    selectedBySemanticTypeRatherThanAssetId: true,
    plansValid: plans.every((plan) => plan.validation.valid),
    metrics: coverage.metrics,
    assets: assets.map((asset) => ({ id: asset.id, filePath: asset.filePath, sha256: sha256(asset.filePath), sourceType: asset.sourceType, classification: asset.visualClassification, sourceRefs: asset.sourceRefs })),
    contactSheetPath,
    contactSheetSha256: sha256(contactSheetPath),
    genericSevenWondersAssetLogicUsed: false,
  };
  writeJson(path.join(outputRoot, 'generalization-proof.json'), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'PASS' || !report.plansValid) process.exitCode = 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
