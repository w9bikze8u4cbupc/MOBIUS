const { QUALITY_STATES, classifyDetail, traceAssetSourceDetail } = require('../../src/services/sourceDetailLineage.cjs');

describe('source-detail lineage', () => {
  test('a 1920x1080 derivative cannot hide a low-resolution native source', () => {
    const report = traceAssetSourceDetail({
      asset: {
        id: 'card', sourceType: 'NATIVE_EMBEDDED', width: 130, height: 201,
        sourceDimensions: { width: 130, height: 201 }, sourceRefs: [{ xref: 385 }],
      },
      finalBounds: { x: 0, y: 0, width: 390, height: 603 },
    });
    expect(report.qualityState).toBe(QUALITY_STATES.FAIL);
    expect(report.traces[0].trueSourcePixelsPerDisplayPixel).toBeCloseTo(1 / 3, 3);
  });

  test('a 600-dpi crop retains the embedded raster native-detail limit', () => {
    const report = traceAssetSourceDetail({
      asset: {
        id: 'page-card', sourceType: 'HIGH_DPI_PAGE_CROP', width: 650, height: 1000,
        sourceDimensions: { width: 4489, height: 4489 },
        crop: { left: 900, top: 900, width: 650, height: 1000 },
        provenance: { sourcePage: 8, sourcePath: 'page-08-600dpi.png' },
      },
      finalBounds: { x: 100, y: 100, width: 650, height: 1000 },
      pdfLineage: {
        pages: [{
          pageNumber: 8,
          pageBoundsPoints: [0, 0, 538.68, 538.68],
          rasterOccurrences: [{
            xref: 385, stableNativeObject: true, nativeWidthPx: 130, nativeHeightPx: 201,
            bboxPoints: [108, 108, 186, 229], placementMatrix: [78, 0, 0, 121, 108, 108],
          }],
        }],
      },
    });
    expect(report.traces[0].underlyingRasterXrefs).toEqual([385]);
    expect(report.qualityState).toBe(QUALITY_STATES.FAIL);
  });

  test('reviewed enhancement is explicit instead of silently passing as native detail', () => {
    expect(classifyDetail({ ratio: 0.5, upscaleFactor: 2, reviewedEnhanced: true })).toBe(QUALITY_STATES.ENHANCED);
  });

  test('page-scale background rasters stay in provenance without governing component detail', () => {
    const report = traceAssetSourceDetail({
      asset: {
        id: 'crop', sourceType: 'HIGH_DPI_PAGE_CROP', width: 1000, height: 1000,
        sourceDimensions: { width: 6000, height: 6000 }, crop: { left: 0, top: 0, width: 6000, height: 6000 },
        provenance: { sourcePage: 1 },
      },
      finalBounds: { x: 0, y: 0, width: 1000, height: 1000 },
      pdfLineage: { pages: [{ pageNumber: 1, pageBoundsPoints: [0, 0, 600, 600], rasterOccurrences: [{
        stableNativeObject: true, xref: 99, nativeWidthPx: 100, nativeHeightPx: 100,
        bboxPoints: [0, 0, 600, 600], placementMatrix: [600, 0, 0, 600, 0, 0],
      }] }] },
    });
    expect(report.qualityState).toBe(QUALITY_STATES.PASS);
    expect(report.violationCount).toBe(0);
    expect(report.traces[0].qualityRelevant).toBe(false);
  });

  test('an official press-asset crop is evaluated from its owned crop pixels, not unrelated PDF xrefs', () => {
    const report = traceAssetSourceDetail({
      asset: {
        id: 'press-crop', sourceType: 'OFFICIAL_HIGH_RES', width: 500, height: 345,
        sourceDimensions: { width: 5000, height: 2910 }, crop: { left: 55, top: 1445, width: 500, height: 345 },
        provenance: { sourcePage: 2 },
      },
      finalBounds: { x: 0, y: 0, width: 480, height: 331 },
      pdfLineage: { pages: [{ pageNumber: 2, pageBoundsPoints: [0, 0, 500, 500], rasterOccurrences: [] }] },
    });
    expect(report.qualityState).toBe(QUALITY_STATES.PASS);
    expect(report.traces[0].sourceKind).toBe('OFFICIAL_HIGH_RES');
    expect(report.traces[0].trueSourcePixelsPerDisplayPixel).toBeGreaterThan(1);
  });

  test('explicit project review may exempt a tiny non-component diagram annotation while preserving its trace', () => {
    const report = traceAssetSourceDetail({
      asset: {
        id: 'approved-diagram', sourceType: 'HIGH_DPI_PAGE_CROP', width: 1000, height: 500,
        sourceDimensions: { width: 2000, height: 1000 }, crop: { left: 0, top: 0, width: 2000, height: 1000 },
        provenance: { sourcePage: 1 }, detailReviewExemptions: [{ underlyingRasterXrefs: [17], reviewState: 'PHYSICALLY_APPROVED_REFERENCE' }],
      },
      finalBounds: { x: 0, y: 0, width: 1000, height: 500 },
      pdfLineage: { pages: [{ pageNumber: 1, pageBoundsPoints: [0, 0, 200, 100], rasterOccurrences: [{ stableNativeObject: true, xref: 17, nativeWidthPx: 10, nativeHeightPx: 10, bboxPoints: [20, 20, 40, 40], placementMatrix: [20, 0, 0, 20, 20, 20] }] }] },
    });
    expect(report.qualityState).toBe(QUALITY_STATES.PASS);
    expect(report.traces[0]).toMatchObject({ underlyingRasterXrefs: [17], qualityRelevant: false });
  });
});
