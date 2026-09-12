'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const VISUAL_PLAN_MATERIALIZER_CONTRACT = 'mobius-visual-plan-materializer-v1';

function sourceFile(asset = {}) {
  return asset.displayPath || asset.renderPath || asset.filePath || asset.path || asset.sourceImage || null;
}

function gridCells(count, width, height, inset = 44) {
  const columns = count <= 3 ? count : Math.min(4, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const gap = 28;
  const cellWidth = Math.floor((width - inset * 2 - gap * (columns - 1)) / columns);
  const cellHeight = Math.floor((height - inset * 2 - gap * (rows - 1)) / rows);
  return Array.from({ length: count }, (_, index) => ({
    x: inset + (index % columns) * (cellWidth + gap),
    y: inset + Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  }));
}

function setupCells(count, width, height) {
  if (count < 2) return gridCells(count, width, height);
  const inset = 44;
  const gap = 28;
  const primaryWidth = Math.floor((width - inset * 2 - gap) * 0.64);
  const supportWidth = width - inset * 2 - gap - primaryWidth;
  const supportHeight = Math.floor((height - inset * 2 - gap * Math.max(0, count - 2)) / (count - 1));
  return [
    { x: inset, y: inset, width: primaryWidth, height: height - inset * 2 },
    ...Array.from({ length: count - 1 }, (_, index) => ({
      x: inset + primaryWidth + gap,
      y: inset + index * (supportHeight + gap),
      width: supportWidth,
      height: supportHeight,
    })),
  ];
}

function cellsFor(plan, count, width, height) {
  return /^REAL_SETUP_(?:PLACEMENT|LAYOUT)$/.test(plan.compositionType || '')
    ? setupCells(count, width, height)
    : gridCells(count, width, height);
}

async function containedImage(file, cell) {
  return sharp(path.resolve(file), { limitInputPixels: false })
    .rotate()
    .resize(cell.width, cell.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

async function materializeVisualPlanFrames({ state, outputDir, width = 1400, height = 860 } = {}) {
  if (!state?.scenes || !Array.isArray(state.assets)) throw new Error('VisualPlan materialization requires canonical production state.');
  if (!outputDir) throw new Error('VisualPlan materialization requires outputDir.');
  const absoluteOutput = path.resolve(outputDir);
  await fs.promises.mkdir(absoluteOutput, { recursive: true });
  const byId = new Map(state.assets.map((asset) => [asset.id, asset]));
  const records = [];
  const scenes = [];
  for (const scene of state.scenes) {
    const plan = scene.canonicalVisualPlan || {};
    const assets = (plan.actualGameAssetIds || []).map((id) => byId.get(id)).filter((asset) => {
      const file = sourceFile(asset);
      return file && fs.existsSync(path.resolve(file));
    });
    if (assets.length <= 1) {
      scenes.push(scene);
      continue;
    }
    const outputPath = path.join(absoluteOutput, `${String(scene.id).replace(/[^a-z0-9_-]+/gi, '-')}.png`);
    const primary = sourceFile(assets[0]);
    const background = await sharp(path.resolve(primary), { limitInputPixels: false })
      .rotate().resize(width, height, { fit: 'cover' }).blur(28).modulate({ brightness: 0.34, saturation: 0.7 }).png().toBuffer();
    const cells = cellsFor(plan, assets.length, width, height);
    const layers = [{ input: background, left: 0, top: 0 }];
    for (let index = 0; index < assets.length; index += 1) {
      const image = await containedImage(sourceFile(assets[index]), cells[index]);
      const metadata = await sharp(image).metadata();
      layers.push({
        input: image,
        left: cells[index].x + Math.max(0, Math.floor((cells[index].width - Number(metadata.width || 0)) / 2)),
        top: cells[index].y + Math.max(0, Math.floor((cells[index].height - Number(metadata.height || 0)) / 2)),
      });
    }
    const tint = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#160f0b" fill-opacity=".32"/><rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="26" fill="none" stroke="#c9a760" stroke-opacity=".55" stroke-width="3"/></svg>`);
    layers.splice(1, 0, { input: tint, left: 0, top: 0 });
    await sharp({ create: { width, height, channels: 4, background: { r: 31, g: 21, b: 16, alpha: 1 } } })
      .composite(layers).png().toFile(outputPath);
    const provenance = {
      contract: VISUAL_PLAN_MATERIALIZER_CONTRACT,
      compositionType: plan.compositionType,
      sourceAssetIds: assets.map((asset) => asset.id),
      sourceFiles: assets.map((asset) => sourceFile(asset)),
      sourceRefs: assets.flatMap((asset) => asset.sourceRefs || []),
      noInventedGamePixels: true,
    };
    records.push({ sceneId: scene.id, outputPath, width, height, provenance });
    scenes.push({
      ...scene,
      renderVisual: {
        path: outputPath,
        assetId: `visual-plan-frame:${scene.atomId}`,
        kind: 'automatic-visual-plan-composite',
        confidence: plan.confidence,
        reason: 'Canonical multi-asset VisualPlan materialized by the normal production path.',
        sourcePage: scene.source_pages?.[0] || scene.sourceRefs?.[0]?.page || null,
        provenance,
      },
    });
  }
  return { contract: VISUAL_PLAN_MATERIALIZER_CONTRACT, outputDir: absoluteOutput, records, scenes };
}

module.exports = { VISUAL_PLAN_MATERIALIZER_CONTRACT, cellsFor, materializeVisualPlanFrames };
