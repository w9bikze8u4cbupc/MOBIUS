'use strict';

const QUALITY_STATES = Object.freeze({
  PASS: 'SOURCE_DETAIL_PASS',
  MARGINAL: 'SOURCE_DETAIL_MARGINAL',
  FAIL: 'SOURCE_DETAIL_FAIL',
  ENHANCED: 'REVIEWED_ENHANCED_DERIVATIVE',
});

// Authority is deliberately independent from raw pixel count. A very large
// derivative made from a small PDF raster does not outrank the publisher's
// original card master. Project manifests may provide a more specific
// `sourceAuthority` value, but generic services own the ordering.
const SOURCE_AUTHORITY_RANK = Object.freeze({
  OFFICIAL_PUBLISHER_HIGH_RES: 60,
  OFFICIAL_PRESS_ASSET: 60,
  AUTHORITATIVE_HIGH_RES_NATIVE: 55,
  AUTHORIZED_EXACT_EDITION_HIGH_RES: 55,
  OFFICIAL_BGG_ASSET: 45,
  NATIVE_EMBEDDED: 35,
  PDF_EMBEDDED_XOBJECT: 35,
  HIGH_DPI_PAGE_CROP: 25,
  REVIEWED_ENHANCED_DERIVATIVE: 15,
  LOW_RES_PAGE_CROP: 5,
  THUMBNAIL: 0,
  UNKNOWN: 0,
});

function sourceAuthorityRank(value) {
  return SOURCE_AUTHORITY_RANK[String(value || 'UNKNOWN').toUpperCase()] ?? 0;
}

function candidateDetailRatio(candidate = {}, finalBounds = {}) {
  const width = finite(candidate.nativeWidthPx || candidate.width || candidate.sourceDimensions?.width);
  const height = finite(candidate.nativeHeightPx || candidate.height || candidate.sourceDimensions?.height);
  const displayWidth = finite(finalBounds.width);
  const displayHeight = finite(finalBounds.height);
  if (!width || !height || !displayWidth || !displayHeight) return 0;
  return Math.min(width / displayWidth, height / displayHeight);
}

function findBetterAuthoritativeCandidate(asset = {}, finalBounds = {}) {
  const selectedAuthority = asset.sourceAuthority || asset.sourceType;
  const selectedRank = sourceAuthorityRank(selectedAuthority);
  const alternatives = Array.isArray(asset.authoritativeAlternatives) ? asset.authoritativeAlternatives : [];
  return alternatives
    .map((candidate) => ({
      ...candidate,
      authorityRank: sourceAuthorityRank(candidate.sourceAuthority || candidate.sourceType),
      sourcePixelsPerDisplayPixel: candidateDetailRatio(candidate, finalBounds),
    }))
    .filter((candidate) => candidate.authorityRank > selectedRank && candidate.sourcePixelsPerDisplayPixel >= 1)
    .sort((left, right) => right.authorityRank - left.authorityRank
      || right.sourcePixelsPerDisplayPixel - left.sourcePixelsPerDisplayPixel)[0] || null;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rectFromArray(values = []) {
  const [x0, y0, x1, y1] = values.map((value) => finite(value));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

function intersect(left, right) {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  return x2 > x && y2 > y ? { x, y, width: x2 - x, height: y2 - y } : null;
}

function classifyDetail({ ratio, upscaleFactor, reviewedEnhanced = false }) {
  if (reviewedEnhanced) return QUALITY_STATES.ENHANCED;
  if (!Number.isFinite(ratio) || ratio <= 0) return QUALITY_STATES.FAIL;
  if (ratio < 0.8 || upscaleFactor > 1.25) return QUALITY_STATES.FAIL;
  if (ratio < 1) return QUALITY_STATES.MARGINAL;
  return QUALITY_STATES.PASS;
}

function directNativeTrace(asset, finalBounds) {
  // An official-master crop owns only its crop pixels. Rulebook source refs
  // describe semantics and do not turn that press asset into a PDF page crop.
  // Rectified photographs and other provenance-preserving derivatives can be
  // larger than the object that supplied their real detail.  Prefer the
  // measured object-level detail dimensions when project evidence provides
  // them; the derivative canvas must never manufacture a PASS.
  const nativeWidth = finite(asset.trueDetailDimensions?.width
    || asset.underlyingNativeWidthPx
    || asset.crop?.width
    || asset.sourceDimensions?.width
    || asset.width);
  const nativeHeight = finite(asset.trueDetailDimensions?.height
    || asset.underlyingNativeHeightPx
    || asset.crop?.height
    || asset.sourceDimensions?.height
    || asset.height);
  const displayWidth = finite(finalBounds?.width);
  const displayHeight = finite(finalBounds?.height);
  const ratio = Math.min(nativeWidth / displayWidth, nativeHeight / displayHeight);
  const upscaleFactor = ratio > 0 ? 1 / ratio : Infinity;
  return [{
    sourceKind: asset.sourceType || 'NATIVE_EMBEDDED',
    sourcePath: asset.nativeMasterPath || asset.filePath,
    underlyingRasterXrefs: (asset.sourceRefs || []).map((ref) => ref.xref).filter(Boolean),
    underlyingNativeWidthPx: nativeWidth,
    underlyingNativeHeightPx: nativeHeight,
    trueDetailWidthPx: nativeWidth,
    trueDetailHeightPx: nativeHeight,
    finalDisplayWidthPx: displayWidth,
    finalDisplayHeightPx: displayHeight,
    trueSourcePixelsPerDisplayPixel: Number(ratio.toFixed(4)),
    effectiveUpscaleFactor: Number.isFinite(upscaleFactor) ? Number(upscaleFactor.toFixed(4)) : null,
    placementTransform: { ...finalBounds },
    cropTransform: asset.crop || null,
    vectorContentPresent: false,
    rasterContentPresent: true,
  }];
}

function pageCropTrace(asset, finalBounds, pdfLineage) {
  const pageNumber = finite(asset.provenance?.sourcePage || asset.sourceRefs?.[0]?.page);
  const page = (pdfLineage?.pages || []).find((candidate) => candidate.pageNumber === pageNumber);
  if (!page) return directNativeTrace(asset, finalBounds).map((entry) => ({ ...entry, unresolvedReason: 'PDF page lineage unavailable.' }));
  const pageBounds = rectFromArray(page.pageBoundsPoints);
  const sourceWidth = finite(asset.sourceDimensions?.width);
  const sourceHeight = finite(asset.sourceDimensions?.height);
  const crop = asset.crop || { left: 0, top: 0, width: sourceWidth, height: sourceHeight };
  const cropPoints = {
    x: pageBounds.x + (finite(crop.left) / sourceWidth) * pageBounds.width,
    y: pageBounds.y + (finite(crop.top) / sourceHeight) * pageBounds.height,
    width: (finite(crop.width) / sourceWidth) * pageBounds.width,
    height: (finite(crop.height) / sourceHeight) * pageBounds.height,
  };
  const outputWidth = finite(asset.width || crop.width);
  const outputHeight = finite(asset.height || crop.height);
  const traces = [];
  for (const occurrence of page.rasterOccurrences || []) {
    if (!occurrence.stableNativeObject) continue;
    const bbox = rectFromArray(occurrence.bboxPoints);
    const overlap = intersect(cropPoints, bbox);
    if (!overlap || bbox.width <= 0 || bbox.height <= 0) continue;
    const nativeWidth = finite(occurrence.nativeWidthPx);
    const nativeHeight = finite(occurrence.nativeHeightPx);
    const trueWidth = nativeWidth * (overlap.width / bbox.width);
    const trueHeight = nativeHeight * (overlap.height / bbox.height);
    const inCropX = (overlap.x - cropPoints.x) / cropPoints.width;
    const inCropY = (overlap.y - cropPoints.y) / cropPoints.height;
    const inCropW = overlap.width / cropPoints.width;
    const inCropH = overlap.height / cropPoints.height;
    const derivativeObjectWidth = outputWidth * inCropW;
    const derivativeObjectHeight = outputHeight * inCropH;
    const displayObjectWidth = finite(finalBounds.width) * (derivativeObjectWidth / outputWidth);
    const displayObjectHeight = finite(finalBounds.height) * (derivativeObjectHeight / outputHeight);
    const ratio = Math.min(trueWidth / displayObjectWidth, trueHeight / displayObjectHeight);
    const upscaleFactor = ratio > 0 ? 1 / ratio : Infinity;
    // Page-scale paper/background rasters are compositing substrate, not the
    // instructional object's detail source. Preserve them in provenance but
    // exclude them from component-detail pass/fail aggregation.
    const pageArea = pageBounds.width * pageBounds.height;
    const occurrenceArea = bbox.width * bbox.height;
    const qualityRelevant = occurrenceArea / Math.max(1, pageArea) < 0.72;
    traces.push({
      sourceKind: 'PDF_EMBEDDED_RASTER_THROUGH_PAGE_CROP',
      sourcePath: asset.nativeMasterPath || asset.provenance?.sourcePath,
      pageNumber,
      sourcePageDpi: sourceWidth / (pageBounds.width / 72),
      underlyingRasterXrefs: [occurrence.xref],
      underlyingNativeWidthPx: nativeWidth,
      underlyingNativeHeightPx: nativeHeight,
      placementTransform: occurrence.placementMatrix,
      cropTransform: { cropPixels: crop, cropPoints, overlapPoints: overlap },
      derivativeObjectBounds: {
        x: outputWidth * inCropX,
        y: outputHeight * inCropY,
        width: derivativeObjectWidth,
        height: derivativeObjectHeight,
      },
      finalDisplayWidthPx: Number(displayObjectWidth.toFixed(3)),
      finalDisplayHeightPx: Number(displayObjectHeight.toFixed(3)),
      trueDetailWidthPx: Number(trueWidth.toFixed(3)),
      trueDetailHeightPx: Number(trueHeight.toFixed(3)),
      trueSourcePixelsPerDisplayPixel: Number(ratio.toFixed(4)),
      effectiveUpscaleFactor: Number.isFinite(upscaleFactor) ? Number(upscaleFactor.toFixed(4)) : null,
      vectorContentPresent: false,
      rasterContentPresent: true,
      qualityRelevant,
      qualityRelevanceReason: qualityRelevant
        ? 'Embedded raster intersects the instructional crop.'
        : 'Page-scale decorative/background raster retained for provenance only.',
    });
  }
  if (!traces.length) {
    return [{
      sourceKind: 'PDF_VECTOR_OR_UNATTRIBUTED_PAGE_REGION',
      sourcePath: asset.nativeMasterPath || asset.provenance?.sourcePath,
      pageNumber,
      sourcePageDpi: sourceWidth / (pageBounds.width / 72),
      underlyingRasterXrefs: [],
      underlyingNativeWidthPx: null,
      underlyingNativeHeightPx: null,
      placementTransform: { ...finalBounds },
      cropTransform: { cropPixels: crop, cropPoints },
      finalDisplayWidthPx: finite(finalBounds.width),
      finalDisplayHeightPx: finite(finalBounds.height),
      trueDetailWidthPx: null,
      trueDetailHeightPx: null,
      trueSourcePixelsPerDisplayPixel: null,
      effectiveUpscaleFactor: null,
      vectorContentPresent: true,
      rasterContentPresent: false,
      qualityRelevant: true,
    }];
  }
  return traces;
}

function traceAssetSourceDetail({ asset, finalBounds, pdfLineage }) {
  if (!asset || !finalBounds) throw new Error('asset and finalBounds are required');
  let traces;
  if (Array.isArray(asset.sourceLineage?.layers) && asset.sourceLineage.layers.length) {
    traces = asset.sourceLineage.layers.flatMap((layer) => {
      const layerBounds = layer.derivativeBounds || { x: 0, y: 0, width: asset.width, height: asset.height };
      const projected = {
        x: finite(finalBounds.x) + (finite(layerBounds.x) / finite(asset.width)) * finite(finalBounds.width),
        y: finite(finalBounds.y) + (finite(layerBounds.y) / finite(asset.height)) * finite(finalBounds.height),
        width: (finite(layerBounds.width) / finite(asset.width)) * finite(finalBounds.width),
        height: (finite(layerBounds.height) / finite(asset.height)) * finite(finalBounds.height),
      };
      return traceAssetSourceDetail({ asset: { ...layer.sourceAsset, sourceLineage: null }, finalBounds: projected, pdfLineage }).traces;
    });
  } else if (asset.sourceType === 'NATIVE_EMBEDDED') {
    traces = directNativeTrace(asset, finalBounds);
  } else if (asset.crop && /(?:HIGH_DPI|PDF_PAGE|PAGE_CROP)/i.test(asset.sourceType || '')
    && finite(asset.provenance?.sourcePage || asset.sourceRefs?.[0]?.page)) {
    traces = pageCropTrace(asset, finalBounds, pdfLineage);
  } else {
    traces = directNativeTrace(asset, finalBounds);
  }
  const reviewedEnhanced = asset.qualityState === QUALITY_STATES.ENHANCED
    && asset.enhancement?.reviewState === 'PASS';
  const reviewedXrefs = new Set((asset.detailReviewExemptions || []).flatMap((entry) => entry.underlyingRasterXrefs || []));
  const evaluated = traces.map((trace) => {
    const reviewedExemption = (trace.underlyingRasterXrefs || []).some((xref) => reviewedXrefs.has(xref));
    const qualityRelevant = reviewedExemption ? false : trace.qualityRelevant;
    return {
      ...trace,
      qualityRelevant,
      qualityRelevanceReason: reviewedExemption
        ? 'Project evidence marks this small source object as physically reviewed at its intended display scale.'
        : trace.qualityRelevanceReason,
      enhancementApplied: Boolean(asset.enhancement),
      qualityState: qualityRelevant === false || (trace.vectorContentPresent && !trace.rasterContentPresent)
        ? QUALITY_STATES.PASS
        : classifyDetail({
          ratio: trace.trueSourcePixelsPerDisplayPixel,
          upscaleFactor: trace.effectiveUpscaleFactor ?? Infinity,
          reviewedEnhanced,
        }),
    };
  });
  const failing = evaluated.filter((trace) => trace.qualityRelevant !== false && trace.qualityState === QUALITY_STATES.FAIL);
  const marginal = evaluated.filter((trace) => trace.qualityRelevant !== false && trace.qualityState === QUALITY_STATES.MARGINAL);
  const betterAuthoritativeCandidate = findBetterAuthoritativeCandidate(asset, finalBounds);
  const selectedQualityState = failing.length ? QUALITY_STATES.FAIL : marginal.length ? QUALITY_STATES.MARGINAL : reviewedEnhanced ? QUALITY_STATES.ENHANCED : QUALITY_STATES.PASS;
  const qualityState = betterAuthoritativeCandidate && selectedQualityState !== QUALITY_STATES.ENHANCED
    ? QUALITY_STATES.FAIL
    : selectedQualityState;
  return {
    assetId: asset.id,
    derivativeWidthPx: finite(asset.width),
    derivativeHeightPx: finite(asset.height),
    finalDisplayWidthPx: finite(finalBounds.width),
    finalDisplayHeightPx: finite(finalBounds.height),
    traces: evaluated,
    sourceAuthority: asset.sourceAuthority || asset.sourceType || 'UNKNOWN',
    sourceAuthorityRank: sourceAuthorityRank(asset.sourceAuthority || asset.sourceType),
    betterAuthoritativeCandidate,
    qualityState,
    violationCount: failing.length + (betterAuthoritativeCandidate ? 1 : 0),
  };
}

function evaluatePeerQualityParity(entries = [], {
  maximumDetailRatioSpread = 1.35,
  maximumDisplayScaleSpread = 1.18,
} = {}) {
  const usable = entries.filter((entry) => entry && Number(entry.sourcePixelsPerDisplayPixel) > 0);
  if (usable.length < 2) return { valid: true, violations: [], entries: usable };
  // Detail above one true source pixel per displayed pixel is visually
  // saturated for this gate.  A 4x master must not make an otherwise clean
  // 1x peer fail merely because it contains excess, invisible headroom.
  const detail = usable.map((entry) => Math.min(1, Number(entry.sourcePixelsPerDisplayPixel)));
  const display = usable.map((entry) => Number(entry.displayScale || 1)).filter((value) => value > 0);
  const detailSpread = Math.max(...detail) / Math.max(0.0001, Math.min(...detail));
  const displaySpread = display.length > 1 ? Math.max(...display) / Math.max(0.0001, Math.min(...display)) : 1;
  const violations = [];
  if (detailSpread > maximumDetailRatioSpread) violations.push('peer-source-detail-parity');
  if (displaySpread > maximumDisplayScaleSpread) violations.push('peer-display-scale-parity');
  return {
    valid: violations.length === 0,
    violations,
    detailSpread: Number(detailSpread.toFixed(4)),
    displaySpread: Number(displaySpread.toFixed(4)),
    entries: usable,
  };
}

module.exports = {
  QUALITY_STATES,
  SOURCE_AUTHORITY_RANK,
  classifyDetail,
  sourceAuthorityRank,
  candidateDetailRatio,
  findBetterAuthoritativeCandidate,
  evaluatePeerQualityParity,
  intersect,
  traceAssetSourceDetail,
};
