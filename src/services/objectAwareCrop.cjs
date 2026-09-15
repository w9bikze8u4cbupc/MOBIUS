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

const DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT = 'mobius-derived-object-visual-evidence-v2';

function digestJson(value) {
  return require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizedChildBox(parentBox, cropBox, parentWidth, parentHeight) {
  const left = (parentBox[0] * parentWidth - cropBox.x) / cropBox.width;
  const top = (parentBox[1] * parentHeight - cropBox.y) / cropBox.height;
  const right = (parentBox[2] * parentWidth - cropBox.x) / cropBox.width;
  const bottom = (parentBox[3] * parentHeight - cropBox.y) / cropBox.height;
  const values = [left, top, right, bottom].map((value) => Number(value.toFixed(8)));
  if (!values.every((value) => Number.isFinite(value)) || values[0] <= 0 || values[1] <= 0 || values[2] >= 1 || values[3] >= 1
    || values[2] <= values[0] || values[3] <= values[1]) throw new Error('Measured component crop loses required boundary margin');
  return values;
}

function derivedEvidence({ parentEvidence, crop, parentWidth, parentHeight, parentAssetId, parentImageSha256, sourcePdfSha256 }) {
  if (!parentEvidence || parentEvidence.method !== 'provider-pixel-analysis'
    || !['COMPONENT', 'TRACK'].includes(parentEvidence.visualRole)
    || !Array.isArray(parentEvidence.bbox) || parentEvidence.bbox.length !== 4
    || !parentEvidence.bbox.every(Number.isFinite)) return null;
  const cropBox = crop.provenance?.bbox;
  if (!cropBox || !Number.isFinite(cropBox.x) || !Number.isFinite(cropBox.y)
    || !Number.isFinite(cropBox.width) || !Number.isFinite(cropBox.height)) return null;
  const bbox = normalizedChildBox(parentEvidence.bbox, cropBox, parentWidth, parentHeight);
  const transformPoint = (point) => ({
    ...point,
    x: Number(((Number(point.x) * parentWidth - cropBox.x) / cropBox.width).toFixed(8)),
    y: Number(((Number(point.y) * parentHeight - cropBox.y) / cropBox.height).toFixed(8)),
  });
  const trackPoints = parentEvidence.visualRole === 'TRACK'
    ? (parentEvidence.trackPoints || []).map(transformPoint) : undefined;
  if (trackPoints && trackPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
  return {
    ...parentEvidence,
    contract: DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT,
    method: 'deterministic-evidence-bound-crop',
    assetId: crop.id,
    imageSha256: crop.contentHash,
    bbox,
    ...(trackPoints ? { trackPoints } : {}),
    derivedFrom: {
      parentAssetId,
      parentImageSha256,
      sourcePdfSha256: sourcePdfSha256 || null,
      parentEvidenceHash: digestJson(parentEvidence),
      cropBox,
      transform: 'exact-parent-pixel-crop-v1',
    },
    parentEvidence,
  };
}

/** Source-faithful derivative of measured bounds. Geometry is NOT pixel validation. */
async function materializeMeasuredObjectCrop({ sourcePath, sourceId, sourceSha256, sourcePage, sourcePdfSha256, sourcePdfPath, objectId, bbox, outputDir, recoveryMode = 'page-region', sourceTrueDetailDimensions = null }) {
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
  const sourceTrueWidth = Number(sourceTrueDetailDimensions?.width || m.width);
  const sourceTrueHeight = Number(sourceTrueDetailDimensions?.height || m.height);
  const trueDetailDimensions = {
    width: Number((box.width * sourceTrueWidth / m.width).toFixed(3)),
    height: Number((box.height * sourceTrueHeight / m.height).toFixed(3)),
  };
  if (geometry.violations.length) throw new Error(`Measured localization clipped: ${geometry.violations.join(',')}`);
  if (sourcePdfPath && recoveryMode !== 'parent-pixels') {
    if (hash(fs.readFileSync(sourcePdfPath)) !== sourcePdfSha256) throw new Error('Source PDF identity mismatch');
    const region = [box.x / m.width, box.y / m.height, (box.x + box.width) / m.width, (box.y + box.height) / m.height];
    const id = `pdf-region-${hash(JSON.stringify([sourcePdfSha256, sourcePage, objectId, region, 300, recoveryMode])).slice(0, 24)}`;
    const file = path.join(path.resolve(outputDir), `${id}.png`);
    const result = require('node:child_process').spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
      [path.resolve(__dirname, '../../scripts/render-rulebook-pages-hdpi.py'), '--region-json'], {
        input: JSON.stringify({ pdf: sourcePdfPath, sourceSha256: sourcePdfSha256, page: sourcePage, bbox: region, dpi: 300, output: file, mode: recoveryMode }),
        encoding: 'utf8', windowsHide: true, timeout: 60000,
      });
    if (result.status !== 0) throw new Error('SOURCE_REGION_RASTER_FAILED');
    const raster = JSON.parse(result.stdout);
    return { id, file_path: file, source_page: sourcePage, page_index: sourcePage - 1,
      sourceAuthority: raster.method==='pymupdf-native-raster-cluster'?'NATIVE_EMBEDDED':'HIGH_DPI_PAGE_CROP', type: 'focused-crop', visual_kind: 'localized-object-crop',
      sourcePdfSha256, contentHash: raster.sha256, dimensions: { width: raster.width, height: raster.height },
      original_dimensions: { width: raster.effectiveSourceWidth, height: raster.effectiveSourceHeight },
      cropCompleteness: 'unknown', cropPurity: 'unknown', is_component: null,
      provenance: { sourcePdfSha256, sourcePage, parentAssetId: sourceId, parentPath: sourcePath,
        parentSha256: sourceSha256, measuredObjectId: objectId, localizationGeometry: geometry,
        extraction: raster.method, sourceRegion: raster, requiresPixelVerification: true } };
  }
  const id = `localized-${hash(JSON.stringify([sourceSha256, objectId, box])).slice(0, 24)}`;
  fs.mkdirSync(outputDir, { recursive: true });
  const file = path.join(path.resolve(outputDir), `${id}.png`);
  const pixels = await sharp(sourcePath).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).png().toBuffer();
  if (!fs.existsSync(file)) fs.writeFileSync(file, pixels);
  else if (hash(fs.readFileSync(file)) !== hash(pixels)) throw new Error('Localized crop replay mismatch');
  return { id, file_path: file, source_page: sourcePage, page_index: sourcePage - 1,
    sourceAuthority: 'HIGH_DPI_PAGE_CROP', type: 'focused-crop', visual_kind: 'localized-object-crop',
    sourcePdfSha256, contentHash: hash(pixels), dimensions: { width: box.width, height: box.height },
    original_dimensions: trueDetailDimensions, trueDetailDimensions,
    cropCompleteness: 'unknown', cropPurity: 'unknown', is_component: null,
    provenance: { sourcePdfSha256, sourcePage, parentAssetId: sourceId, parentPath: sourcePath,
      parentSha256: sourceSha256, bbox: box, measuredObjectId: objectId, localizationGeometry: geometry,
      derivativeSourceDimensions: { width: m.width, height: m.height }, sourceTrueDetailDimensions,
      extraction: 'measured-object-crop-no-resampling', requiresPixelVerification: true } };
}

/**
 * Reframes a provider-measured component from its exact parent pixels.  This
 * carries the original pixel verdict only when the child has deterministic
 * margin-preserving lineage; it never turns an arbitrary crop or a PDF
 * re-rasterization into a measured component.
 */
async function deriveEvidenceBoundObjectCrop({ parentAsset = {}, componentEvidence, linkedEvidence = [], outputDir }) {
  if (!componentEvidence || componentEvidence.visualRole !== 'COMPONENT'
    || componentEvidence.present !== true || componentEvidence.complete !== true || componentEvidence.isolated !== true
    || Number(componentEvidence.confidence) < 0.9) throw new Error('A complete measured component verdict is required for evidence-bound crop derivation');
  const sourcePath = parentAsset.filePath || parentAsset.file_path || parentAsset.renderPath || parentAsset.path;
  if (!sourcePath) throw new Error('Measured component crop parent path is required');
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const sharp = require('sharp');
  const parentImageSha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  if (parentImageSha256 !== componentEvidence.imageSha256) throw new Error('Measured component crop parent evidence SHA mismatch');
  const metadata = await sharp(sourcePath).metadata();
  const crop = await materializeMeasuredObjectCrop({
    sourcePath,
    sourceId: parentAsset.id || componentEvidence.assetId,
    sourceSha256: parentImageSha256,
    sourcePage: Number(parentAsset.source_page || parentAsset.sourcePage || parentAsset.pageNumber),
    sourcePdfSha256: parentAsset.sourcePdfSha256,
    objectId: componentEvidence.requiredObject,
    bbox: componentEvidence.bbox,
    outputDir,
    sourceTrueDetailDimensions: parentAsset.trueDetailDimensions || parentAsset.original_dimensions
      || (parentAsset.nativeWidthPx && parentAsset.nativeHeightPx
        ? { width: parentAsset.nativeWidthPx, height: parentAsset.nativeHeightPx } : null),
    // This exact subset is the only form whose parent proof can be carried.
    recoveryMode: 'parent-pixels',
  });
  const sourcePdfSha256 = parentAsset.sourcePdfSha256 || null;
  const inherited = [componentEvidence, ...linkedEvidence]
    .filter((row) => row?.assetId === componentEvidence.assetId
      && row.requiredObject === componentEvidence.requiredObject
      && row.imageSha256 === parentImageSha256)
    .map((row) => derivedEvidence({ parentEvidence: row, crop, parentWidth: metadata.width, parentHeight: metadata.height,
      parentAssetId: componentEvidence.assetId, parentImageSha256, sourcePdfSha256 }))
    .filter(Boolean);
  return {
    ...crop,
    sourceAuthority: parentAsset.sourceAuthority || crop.sourceAuthority,
    visual_kind: 'evidence-bound-component-crop',
    type: 'focused-crop',
    objectVisualEvidence: inherited,
    provenance: {
      ...crop.provenance,
      requiresPixelVerification: false,
      evidenceBoundCrop: {
        contract: DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT,
        parentAssetId: componentEvidence.assetId,
      parentImageSha256,
      sourcePdfSha256,
      cropBox: crop.provenance?.bbox || null,
      componentEvidenceHash: digestJson(componentEvidence),
      parentEvidenceHashes: inherited.map((row) => row.derivedFrom.parentEvidenceHash),
      transform: 'exact-parent-pixel-crop-v1',
      },
    },
  };
}

module.exports = { DERIVED_OBJECT_VISUAL_EVIDENCE_CONTRACT, auditOpticalCenter, auditRasterIsolation, compileObjectAwareCrop, materializeMeasuredObjectCrop, deriveEvidenceBoundObjectCrop, contains, intersects, normalizeBox, unionBoxes };
