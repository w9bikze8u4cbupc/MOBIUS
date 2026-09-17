#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditRasterIsolation, compileObjectAwareCrop } = require('../src/services/objectAwareCrop.cjs');

const ROOT = path.resolve(process.cwd());

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    out[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return out;
}

function absolute(value) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(ROOT, value);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function cropPixels(normalized, metadata) {
  const left = Math.max(0, Math.round(normalized.left * metadata.width));
  const top = Math.max(0, Math.round(normalized.top * metadata.height));
  const width = Math.min(metadata.width - left, Math.round(normalized.width * metadata.width));
  const height = Math.min(metadata.height - top, Math.round(normalized.height * metadata.height));
  return { left, top, width, height };
}

async function main() {
  const args = parseArgs();
  if (!args.project) throw new Error('Usage: --project <visual-plan.json> [--out <directory>]');
  const projectPath = absolute(args.project);
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const outputDir = absolute(args.out || project.assetOutputRoot);
  fs.mkdirSync(outputDir, { recursive: true });
  const assets = [];

  for (const source of project.assets) {
    const pageDpi = Number(project.pageRenderDpi || 360);
    const pageSource = source.page
      ? path.join(absolute(project.pageRenderRoot), `page-${String(source.page).padStart(2, '0')}-${pageDpi}dpi.png`)
      : null;
    const outputPath = path.join(outputDir, `${source.id}.png`);
    let sourcePath = absolute(source.sourcePath || pageSource || project.sourcePdfPath);
    let sourceMetadata;
    let crop = null;
    let nativeMasterPaths = [];
    let sourceLineage = null;
    let objectAwareCrop = null;
    if (source.composite?.layers?.length) {
      const width = Number(source.composite.width || 1200);
      const height = Number(source.composite.height || 320);
      const layers = [];
      const lineageLayers = [];
      for (const layer of source.composite.layers) {
        const layerDpi = Number(layer.pageRenderDpi || pageDpi);
        const layerPath = absolute(layer.sourcePath || path.join(project.pageRenderRoot, `page-${String(layer.page).padStart(2, '0')}-${layerDpi}dpi.png`));
        if (!fs.existsSync(layerPath)) throw new Error(`${source.id}: missing composite source ${layerPath}`);
        nativeMasterPaths.push(layerPath);
        const metadata = await sharp(layerPath).metadata();
        let region = layer.cropNormalized ? cropPixels(layer.cropNormalized, metadata) : null;
        let layerObjectCrop = null;
        if (layer.objectCrop?.intendedObjects?.length) {
          layerObjectCrop = compileObjectAwareCrop({
            sourceWidth: metadata.width,
            sourceHeight: metadata.height,
            intendedObjects: layer.objectCrop.intendedObjects,
            forbiddenObjects: layer.objectCrop.forbiddenObjects || [],
            paddingPx: layer.objectCrop.paddingPx,
          });
          if (layerObjectCrop.violations.length) throw new Error(`${source.id}: invalid object-aware layer crop ${JSON.stringify(layerObjectCrop.violations)}`);
          region = { left: layerObjectCrop.paddedCropBox.x, top: layerObjectCrop.paddedCropBox.y, width: layerObjectCrop.paddedCropBox.width, height: layerObjectCrop.paddedCropBox.height };
        }
        let layerPipeline = sharp(layerPath);
        if (region) layerPipeline = layerPipeline.extract(region);
        if (Number.isFinite(Number(layer.rotateDeg)) && Number(layer.rotateDeg) !== 0) {
          layerPipeline = layerPipeline.rotate(Number(layer.rotateDeg), {
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          });
        }
        let buffer = await layerPipeline
          .resize(layer.width, layer.height, {
            fit: 'contain',
            withoutEnlargement: true,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer();
        if (layer.maskShape === 'circle') {
          const diameter = Math.min(layer.width, layer.height);
          const radius = Math.max(1, Math.floor(diameter * Number(layer.maskRadiusRatio || 0.4)));
          const cx = Math.floor(layer.width * Number(layer.maskCenterXRatio || 0.5));
          const cy = Math.floor(layer.height * Number(layer.maskCenterYRatio || 0.5));
          const mask = Buffer.from(`<svg width="${layer.width}" height="${layer.height}"><circle cx="${cx}" cy="${cy}" r="${radius}" fill="white"/></svg>`);
          buffer = await sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
        }
        if (layer.maskShape === 'ellipse') {
          const cx = Math.floor(layer.width * Number(layer.maskCenterXRatio || 0.5));
          const cy = Math.floor(layer.height * Number(layer.maskCenterYRatio || 0.5));
          const rx = Math.max(1, Math.floor(layer.width * Number(layer.maskRadiusXRatio || 0.48)));
          const ry = Math.max(1, Math.floor(layer.height * Number(layer.maskRadiusYRatio || 0.46)));
          const mask = Buffer.from(`<svg width="${layer.width}" height="${layer.height}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/></svg>`);
          buffer = await sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
        }
        if (layer.maskShape === 'rounded-rect') {
          const insetX = Math.max(0, Math.round(layer.width * Number(layer.maskInsetXRatio || 0.02)));
          const insetY = Math.max(0, Math.round(layer.height * Number(layer.maskInsetYRatio || 0.03)));
          const radius = Math.max(2, Math.round(Math.min(layer.width, layer.height) * Number(layer.maskRadiusRatio || 0.16)));
          const mask = Buffer.from(`<svg width="${layer.width}" height="${layer.height}"><rect x="${insetX}" y="${insetY}" width="${Math.max(1, layer.width - insetX * 2)}" height="${Math.max(1, layer.height - insetY * 2)}" rx="${radius}" fill="white"/></svg>`);
          buffer = await sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
        }
        layers.push({ input: buffer, left: layer.x, top: layer.y });
        lineageLayers.push({
          layerId: layer.id || `${source.id}-layer-${lineageLayers.length + 1}`,
          derivativeBounds: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
          sourceAsset: {
            id: layer.id || `${source.id}-source-${lineageLayers.length + 1}`,
            filePath: layerPath,
            nativeMasterPath: layerPath,
            sourceType: layer.sourceType || (layer.page ? 'HIGH_DPI_PAGE_CROP' : 'OFFICIAL_HIGH_RES'),
            sourceDimensions: { width: metadata.width, height: metadata.height },
            width: region?.width || metadata.width,
            height: region?.height || metadata.height,
            crop: region ? { left: region.left, top: region.top, width: region.width, height: region.height, normalized: layer.cropNormalized || null } : null,
            sourceRefs: (layer.sourceRefs || (layer.page ? [{ page: layer.page }] : [])).map((ref) => ({ ...ref, sourcePdfSha256: project.sourcePdfSha256 })),
            provenance: {
              projectId: project.projectId,
              sourcePath: layerPath,
              sourcePage: layer.page || layer.sourceRefs?.[0]?.page || null,
              extractionMethod: layer.page ? 'high-dpi-source-page-semantic-crop' : 'official-high-resolution-source',
              sourceUrl: layer.sourceUrl || null,
            },
            objectAwareCrop: layerObjectCrop,
            rotationDeg: Number(layer.rotateDeg || 0),
          },
        });
      }
      await sharp({ create: { width, height, channels: 4, background: source.composite.background || '#f4e3c7' } }).composite(layers).png({ compressionLevel: 9 }).toFile(outputPath);
      sourcePath = nativeMasterPaths[0];
      sourceMetadata = { width, height };
      sourceLineage = { kind: 'deterministic-composite', layers: lineageLayers };
    } else {
      if (!fs.existsSync(sourcePath)) throw new Error(`${source.id}: missing source ${sourcePath}`);
      sourceMetadata = await sharp(sourcePath).metadata();
      crop = source.cropNormalized ? cropPixels(source.cropNormalized, sourceMetadata) : null;
      if (source.objectCrop?.intendedObjects?.length) {
        objectAwareCrop = compileObjectAwareCrop({
          sourceWidth: sourceMetadata.width,
          sourceHeight: sourceMetadata.height,
          intendedObjects: source.objectCrop.intendedObjects,
          forbiddenObjects: source.objectCrop.forbiddenObjects || [],
          paddingPx: source.objectCrop.paddingPx,
        });
        if (objectAwareCrop.violations.length) throw new Error(`${source.id}: invalid object-aware crop ${JSON.stringify(objectAwareCrop.violations)}`);
        crop = { left: objectAwareCrop.paddedCropBox.x, top: objectAwareCrop.paddedCropBox.y, width: objectAwareCrop.paddedCropBox.width, height: objectAwareCrop.paddedCropBox.height };
      }
      let pipeline = sharp(sourcePath, { failOn: 'error' });
      if (crop) pipeline = pipeline.extract(crop);
      if (Number(source.transparentPaddingPx || 0) > 0) {
        const padding = Math.round(Number(source.transparentPaddingPx));
        pipeline = pipeline.extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 0, g: 0, b: 0, alpha: 0 } });
      }
      if (source.colorMask?.channel === 'red-dominant') {
        const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const minimumRed = Number(source.colorMask.minimumRed || 72);
        const redGreenRatio = Number(source.colorMask.redGreenRatio || 1.16);
        const redBlueRatio = Number(source.colorMask.redBlueRatio || 1.18);
        const minimumAlpha = Number(source.colorMask.minimumAlpha || 1);
        const maxHueDegreesFromRed = Number(source.colorMask.maxHueDegreesFromRed ?? 180);
        const minimumSaturation = Number(source.colorMask.minimumSaturation || 0);
        const keepRegion = source.colorMask.keepRegionNormalized || null;
        const left = keepRegion ? Math.floor(Number(keepRegion.left || 0) * info.width) : 0;
        const top = keepRegion ? Math.floor(Number(keepRegion.top || 0) * info.height) : 0;
        const right = keepRegion ? Math.ceil(Number(keepRegion.right ?? 1) * info.width) : info.width;
        const bottom = keepRegion ? Math.ceil(Number(keepRegion.bottom ?? 1) * info.height) : info.height;
        for (let offset = 0; offset < data.length; offset += info.channels) {
          const pixel = offset / info.channels;
          const x = pixel % info.width;
          const y = Math.floor(pixel / info.width);
          const red = data[offset];
          const green = data[offset + 1];
          const blue = data[offset + 2];
          const inRegion = x >= left && x < right && y >= top && y < bottom;
          const maxChannel = Math.max(red, green, blue);
          const minChannel = Math.min(red, green, blue);
          const delta = maxChannel - minChannel;
          const saturation = maxChannel === 0 ? 0 : delta / maxChannel;
          let hue = 0;
          if (delta > 0 && maxChannel === red) hue = 60 * (((green - blue) / delta) % 6);
          else if (delta > 0 && maxChannel === green) hue = 60 * (((blue - red) / delta) + 2);
          else if (delta > 0) hue = 60 * (((red - green) / delta) + 4);
          if (hue < 0) hue += 360;
          const redHueDistance = Math.min(hue, 360 - hue);
          const keep = inRegion && data[offset + 3] >= minimumAlpha
            && red >= minimumRed && red >= green * redGreenRatio && red >= blue * redBlueRatio
            && redHueDistance <= maxHueDegreesFromRed && saturation >= minimumSaturation;
          data[offset + 3] = keep ? data[offset + 3] : 0;
        }
        const componentLimit = Number(source.colorMask.retainLargestComponents || 0);
        if (componentLimit > 0) {
          const minimumPixels = Number(source.colorMask.minimumComponentPixels || 1);
          const visited = new Uint8Array(info.width * info.height);
          const components = [];
          const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
          for (let index = 0; index < visited.length; index += 1) {
            if (visited[index] || data[index * info.channels + 3] === 0) continue;
            const queue = [index];
            const pixels = [];
            visited[index] = 1;
            for (let cursor = 0; cursor < queue.length; cursor += 1) {
              const current = queue[cursor];
              pixels.push(current);
              const cx = current % info.width;
              const cy = Math.floor(current / info.width);
              for (const [dx, dy] of neighbors) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
                const next = ny * info.width + nx;
                if (!visited[next] && data[next * info.channels + 3] !== 0) {
                  visited[next] = 1;
                  queue.push(next);
                }
              }
            }
            if (pixels.length >= minimumPixels) components.push(pixels);
          }
          components.sort((a, b) => b.length - a.length);
          const retained = new Uint8Array(info.width * info.height);
          for (const pixels of components.slice(0, componentLimit)) for (const pixel of pixels) retained[pixel] = 1;
          for (let index = 0; index < retained.length; index += 1) if (!retained[index]) data[index * info.channels + 3] = 0;
        }
        await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(outputPath);
      } else if (source.removeNearWhiteBackground === true) {
        const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const transparentAt = Number(source.whiteBackgroundThreshold || 246);
        const featherStart = Number(source.whiteBackgroundFeatherStart || 224);
        const maximumSpread = Number(source.whiteBackgroundMaximumSpread || 18);
        for (let offset = 0; offset < data.length; offset += info.channels) {
          const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
          const minimum = Math.min(red, green, blue);
          const spread = Math.max(red, green, blue) - minimum;
          if (minimum >= transparentAt && spread <= maximumSpread) data[offset + 3] = 0;
          else if (minimum > featherStart && spread <= maximumSpread) {
            data[offset + 3] = Math.min(data[offset + 3], Math.round(255 * (transparentAt - minimum) / Math.max(1, transparentAt - featherStart)));
          }
        }
        await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(outputPath);
      } else if (Array.isArray(source.alphaMaskPolygon) && source.alphaMaskPolygon.length >= 3) {
        const regionWidth = crop?.width || sourceMetadata.width;
        const regionHeight = crop?.height || sourceMetadata.height;
        const points = source.alphaMaskPolygon.map((point) => {
          const x = Number(point.x) <= 1 ? Math.round(Number(point.x) * regionWidth) : Math.round(Number(point.x));
          const y = Number(point.y) <= 1 ? Math.round(Number(point.y) * regionHeight) : Math.round(Number(point.y));
          return `${x},${y}`;
        }).join(' ');
        const buffer = await pipeline.ensureAlpha().png().toBuffer();
        const mask = Buffer.from(`<svg width="${regionWidth}" height="${regionHeight}" xmlns="http://www.w3.org/2000/svg"><polygon points="${points}" fill="white"/></svg>`);
        await sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toFile(outputPath);
      } else {
        await pipeline.png({ compressionLevel: 9 }).toFile(outputPath);
      }
      nativeMasterPaths = [sourcePath];
      sourceLineage = {
        kind: source.sourceType === 'NATIVE_EMBEDDED' ? 'native-pdf-object' : source.page ? 'pdf-page-region' : 'official-high-resolution-source',
        master: { filePath: sourcePath, width: sourceMetadata.width, height: sourceMetadata.height, resizedDuringAcquisition: false },
      };
    }
    const outputMetadata = await sharp(outputPath).metadata();
    const backgroundContaminationAudit = await auditRasterIsolation(outputPath, {
      isolationRequired: source.isolationRequired === true,
      minimumTransparentRatio: Number(source.minimumTransparentRatio || 0.015),
      maximumOpaqueBorderRatio: Number(source.maximumOpaqueBorderRatio || 0.02),
    });
    if (source.isolationRequired === true && backgroundContaminationAudit.status !== 'PASS') {
      throw new Error(`${source.id}: background contamination ${JSON.stringify(backgroundContaminationAudit.violations)}`);
    }
    assets.push({
      id: source.id,
      filePath: outputPath,
      displayPath: outputPath,
      nativeMasterPath: nativeMasterPaths.length === 1 ? nativeMasterPaths[0] : nativeMasterPaths,
      containsActualGamePixels: true,
      sourceType: source.sourceType,
      visualClassification: source.visualClassification,
      semanticTags: source.semanticTags || [],
      semanticObjects: source.semanticTags || [],
      representedQuantity: Number.isFinite(Number(source.representedQuantity)) ? Number(source.representedQuantity) : null,
      representedComponent: source.representedComponent || null,
      visibleLabels: source.visibleLabels || [],
      sourceRefs: (source.sourceRefs || []).map((ref) => ({ ...ref, sourcePdfSha256: project.sourcePdfSha256 })),
      sourceDimensions: source.sourceDimensionsOverride || { width: sourceMetadata.width, height: sourceMetadata.height },
      trueDetailDimensions: source.trueDetailDimensions || null,
      underlyingNativeWidthPx: source.underlyingNativeWidthPx || source.trueDetailDimensions?.width || null,
      underlyingNativeHeightPx: source.underlyingNativeHeightPx || source.trueDetailDimensions?.height || null,
      sourceAuthority: source.sourceAuthority || source.sourceType,
      authoritativeAlternatives: source.authoritativeAlternatives || [],
      trueSourcePixelsPerDisplayPixel: source.trueSourcePixelsPerDisplayPixel == null
        ? null
        : Number(source.trueSourcePixelsPerDisplayPixel),
      width: outputMetadata.width,
      height: outputMetadata.height,
      nativeMasterPreserved: true,
      displayDerivative: crop ? 'lossless-semantic-crop' : 'lossless-format-normalization',
      crop: crop ? { ...crop, normalized: source.cropNormalized } : null,
      objectAwareCrop,
      cropCompleteness: source.cropCompleteness,
      cropPurity: source.cropPurity,
      cardSilhouetteState: source.cardSilhouetteState || null,
      edgeIntersectionState: source.edgeIntersectionState || null,
      correctCardAspectRatio: source.correctCardAspectRatio == null ? null : source.correctCardAspectRatio === true,
      peerDisplayScale: Number(source.peerDisplayScale || 1),
      isolationRequired: source.isolationRequired === true,
      backgroundContaminationAudit,
      invalidated: source.invalidated === true,
      directorRejectedForSameDefect: source.directorRejectedForSameDefect === true,
      dominantInstructionalLanguage: 'text-light-or-edition-authentic',
      sha256: sha256(outputPath),
      nativeMasterSha256: nativeMasterPaths.map((file) => sha256(file)),
      sourceLineage,
      detailReviewExemptions: source.detailReviewExemptions || [],
      provenance: {
        projectId: project.projectId,
        edition: project.edition || project.gameIdentity?.displayName || project.projectId,
        sourcePdfSha256: project.sourcePdfSha256,
        sourcePath: nativeMasterPaths.length === 1 ? nativeMasterPaths[0] : nativeMasterPaths,
        sourcePage: source.page || source.sourceRefs?.[0]?.page || null,
        extractionMethod: source.composite?.layers?.length
          ? 'deterministic-composite-from-source-grounded-real-assets'
          : source.colorMask
            ? 'deterministic-color-mask-from-official-source'
            : crop
              ? 'high-dpi-source-page-semantic-crop'
              : source.sourceType === 'NATIVE_EMBEDDED'
                ? 'native-pdf-xobject-preserved'
                : 'existing-reviewed-high-dpi-source-crop',
        sourceUrl: source.sourceUrl || null,
        publisher: source.publisher || null,
        licenseProvenanceState: source.licenseProvenanceState || null,
      },
      enhancement: source.enhancement || null,
      qualityState: source.qualityState || 'accepted',
      maxDisplayScale: Number(source.maxDisplayScale || 1.15),
      reviewState: 'accepted',
    });
  }

  const manifest = {
    contract: 'mobius-real-component-asset-library-v1',
    generatedAt: new Date().toISOString(),
    projectId: project.projectId,
    sourcePdfSha256: project.sourcePdfSha256,
    nativeMastersPreserved: true,
    assetCount: assets.length,
    actualGamePixelAssetCount: assets.filter((asset) => asset.containsActualGamePixels).length,
    assets,
  };
  const manifestPath = path.join(outputDir, 'manifest.json');
  writeJson(manifestPath, manifest);
  process.stdout.write(`${JSON.stringify({ status: 'PASS', manifestPath, assets: assets.length }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
