'use strict';

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBox(box = {}) {
  return {
    x: finite(box.x ?? box.left),
    y: finite(box.y ?? box.top),
    width: Math.max(0, finite(box.width)),
    height: Math.max(0, finite(box.height)),
  };
}

function unionBoxes(boxes = []) {
  if (!boxes.length) return null;
  const normalized = boxes.map(normalizeBox);
  const x = Math.min(...normalized.map((box) => box.x));
  const y = Math.min(...normalized.map((box) => box.y));
  const right = Math.max(...normalized.map((box) => box.x + box.width));
  const bottom = Math.max(...normalized.map((box) => box.y + box.height));
  return { x, y, width: right - x, height: bottom - y };
}

function intersects(leftInput, rightInput) {
  const left = normalizeBox(leftInput);
  const right = normalizeBox(rightInput);
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function contains(outerInput, innerInput, tolerance = 0) {
  const outer = normalizeBox(outerInput);
  const inner = normalizeBox(innerInput);
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

function compileObjectAwareCrop({
  sourceWidth,
  sourceHeight,
  intendedObjects = [],
  forbiddenObjects = [],
  paddingPx = 24,
}) {
  if (!intendedObjects.length) throw new Error('At least one intended object is required.');
  const semanticBoundingBox = unionBoxes(intendedObjects.map((item) => item.bounds || item));
  const padding = Math.max(0, finite(paddingPx));
  const paddedCropBox = {
    x: Math.max(0, Math.floor(semanticBoundingBox.x - padding)),
    y: Math.max(0, Math.floor(semanticBoundingBox.y - padding)),
    width: 0,
    height: 0,
  };
  const right = Math.min(finite(sourceWidth), Math.ceil(semanticBoundingBox.x + semanticBoundingBox.width + padding));
  const bottom = Math.min(finite(sourceHeight), Math.ceil(semanticBoundingBox.y + semanticBoundingBox.height + padding));
  paddedCropBox.width = right - paddedCropBox.x;
  paddedCropBox.height = bottom - paddedCropBox.y;
  const edgeIntersections = intendedObjects.filter((item) => {
    const bounds = normalizeBox(item.bounds || item);
    return bounds.x <= paddedCropBox.x
      || bounds.y <= paddedCropBox.y
      || bounds.x + bounds.width >= paddedCropBox.x + paddedCropBox.width
      || bounds.y + bounds.height >= paddedCropBox.y + paddedCropBox.height;
  }).map((item) => item.id || item.label || 'intended-object');
  const contaminating = forbiddenObjects.filter((item) => intersects(paddedCropBox, item.bounds || item));
  const missing = intendedObjects.filter((item) => !contains(paddedCropBox, item.bounds || item));
  const opticalCenter = {
    x: semanticBoundingBox.x + semanticBoundingBox.width / 2,
    y: semanticBoundingBox.y + semanticBoundingBox.height / 2,
  };
  return {
    semanticBoundingBox,
    paddedCropBox,
    intendedObjects: intendedObjects.map((item) => item.id || item.label || 'intended-object'),
    forbiddenObjects: forbiddenObjects.map((item) => item.id || item.label || 'forbidden-object'),
    edgeIntersectionState: edgeIntersections.length ? 'FAIL' : 'PASS',
    cropCompleteness: missing.length || edgeIntersections.length ? 'incomplete' : 'complete',
    cropPurity: contaminating.length ? 'contaminated' : 'clean',
    opticalCenter,
    violations: [
      ...missing.map((item) => `missing-intended-object:${item.id || item.label || 'unknown'}`),
      ...edgeIntersections.map((id) => `intended-object-touches-crop-edge:${id}`),
      ...contaminating.map((item) => `forbidden-object-in-crop:${item.id || item.label || 'unknown'}`),
    ],
  };
}

function auditOpticalCenter({ objectBounds, paneBounds, toleranceRatio = 0.06, declaredPurpose = null }) {
  const object = normalizeBox(objectBounds);
  const pane = normalizeBox(paneBounds);
  const objectCenter = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  const paneCenter = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
  const dx = Math.abs(objectCenter.x - paneCenter.x) / Math.max(1, pane.width);
  const dy = Math.abs(objectCenter.y - paneCenter.y) / Math.max(1, pane.height);
  const valid = Boolean(declaredPurpose) || (dx <= toleranceRatio && dy <= toleranceRatio);
  return {
    valid,
    objectCenter,
    paneCenter,
    normalizedDelta: { x: Number(dx.toFixed(4)), y: Number(dy.toFixed(4)) },
    declaredPurpose,
    violation: valid ? null : 'single-static-visual-not-optically-centered',
  };
}

async function auditRasterIsolation(filePath, {
  isolationRequired = false,
  isolatedObjectExpected = false,
  minimumTransparentRatio = 0.015,
  maximumOpaqueBorderRatio = 0.02,
  alphaThreshold = 16,
} = {}) {
  isolationRequired = Boolean(isolationRequired || isolatedObjectExpected);
  const sharp = require('sharp');
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let semiTransparent = 0;
  let opaqueBorder = 0;
  let borderPixels = 0;
  let visible = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      const onBorder = x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1;
      if (onBorder) {
        borderPixels += 1;
        if (alpha >= 250) opaqueBorder += 1;
      }
      if (alpha < alphaThreshold) transparent += 1;
      else {
        visible += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (alpha < 250) semiTransparent += 1;
      }
    }
  }
  const pixels = Math.max(1, info.width * info.height);
  const transparentRatio = transparent / pixels;
  const opaqueBorderRatio = opaqueBorder / Math.max(1, borderPixels);
  const visibleBounds = visible > 0
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
  const violations = [];
  if (isolationRequired && transparentRatio < minimumTransparentRatio) violations.push('opaque-rectangular-matte');
  if (isolationRequired && opaqueBorderRatio > maximumOpaqueBorderRatio) violations.push('isolated-object-touches-opaque-frame-edge');
  if (isolationRequired && !visibleBounds) violations.push('isolated-object-missing');
  return {
    contract: 'mobius-raster-background-isolation-v1',
    status: violations.length ? 'FAIL' : 'PASS',
    isolationRequired,
    width: info.width,
    height: info.height,
    transparentPixelRatio: Number(transparentRatio.toFixed(6)),
    semiTransparentPixelRatio: Number((semiTransparent / pixels).toFixed(6)),
    opaqueBorderPixelRatio: Number(opaqueBorderRatio.toFixed(6)),
    visibleBounds,
    violations,
  };
}

/** Source-faithful derivative of measured bounds. Geometry is NOT pixel validation. */
async function materializeMeasuredObjectCrop({ sourcePath, sourceId, sourceSha256, sourcePage, sourcePdfSha256, objectId, bbox, outputDir }) {
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const sharp = require('sharp');
  const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
  if (hash(fs.readFileSync(sourcePath)) !== sourceSha256) throw new Error('Localization source SHA mismatch');
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)
    || !(0 <= bbox[0] && bbox[0] < bbox[2] && bbox[2] <= 1 && 0 <= bbox[1] && bbox[1] < bbox[3] && bbox[3] <= 1)) throw new Error('Invalid measured object bounds');
  const m = await sharp(sourcePath).metadata();
  const bounds = { x: bbox[0] * m.width, y: bbox[1] * m.height, width: (bbox[2] - bbox[0]) * m.width, height: (bbox[3] - bbox[1]) * m.height };
  const geometry = compileObjectAwareCrop({ sourceWidth: m.width, sourceHeight: m.height,
    intendedObjects: [{ id: objectId, bounds }], paddingPx: Math.max(8, Math.ceil(Math.max(bounds.width, bounds.height) * .04)) });
  const box = geometry.paddedCropBox;
  if (geometry.violations.length) throw new Error(`Measured localization clipped: ${geometry.violations.join(',')}`);
  const id = `localized-${hash(JSON.stringify([sourceSha256, objectId, box])).slice(0, 24)}`;
  fs.mkdirSync(outputDir, { recursive: true });
  const file = path.join(path.resolve(outputDir), `${id}.png`);
  const pixels = await sharp(sourcePath).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).png().toBuffer();
  if (!fs.existsSync(file)) fs.writeFileSync(file, pixels);
  else if (hash(fs.readFileSync(file)) !== hash(pixels)) throw new Error('Localized crop replay mismatch');
  return { id, file_path: file, source_page: sourcePage, page_index: sourcePage - 1,
    sourceAuthority: 'HIGH_DPI_PAGE_CROP', type: 'focused-crop', visual_kind: 'localized-object-crop',
    sourcePdfSha256, contentHash: hash(pixels), dimensions: { width: box.width, height: box.height },
    original_dimensions: { width: box.width, height: box.height },
    cropCompleteness: 'unknown', cropPurity: 'unknown', is_component: null,
    provenance: { sourcePdfSha256, sourcePage, parentAssetId: sourceId, parentPath: sourcePath,
      parentSha256: sourceSha256, bbox: box, measuredObjectId: objectId, localizationGeometry: geometry,
      extraction: 'measured-object-crop-no-resampling', requiresPixelVerification: true } };
}

module.exports = { auditOpticalCenter, auditRasterIsolation, compileObjectAwareCrop, materializeMeasuredObjectCrop, contains, intersects, normalizeBox, unionBoxes };
