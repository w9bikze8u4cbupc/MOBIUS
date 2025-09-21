// utils/orchestrate.js
export async function orchestrateExtraction({
  pdfUrl,
  websiteUrl,
  lang = 'fr',
  includeWebsite = true,
}) {
  // 1) Detect actions
  const target = websiteUrl || pdfUrl;
  const detectRes = await fetch(
    `/api/detect-actions?url=${encodeURIComponent(target)}&lang=${encodeURIComponent(lang)}`
  );
  const detectJson = await detectRes.json().catch(() => ({}));
  let pages = Array.isArray(detectJson.pages) ? detectJson.pages : [];
  if (!pages.length) {
    const hdr = detectRes.headers.get('X-Actions-Pages');
    if (hdr)
      pages = hdr
        .split(',')
        .map(s => Number(s.trim()))
        .filter(Number.isFinite);
  }

  // 2) Extract with boosts (PDF-first)
  const params = new URLSearchParams({
    pdfUrl,
    dpi: '300',
    trim: '1',
    convert: '1',
    bgremove: '0',
    minW: '300',
    minH: '300',
    maxAspect: '5',
    boostFactor: '1.2',
    embeddedBoost: '1.04',
  });
  if (pages.length) params.set('boostPages', pages.join(','));

  const extractRes = await fetch(
    `/api/extract-components?${params.toString()}`
  );
  const extract = await extractRes.json();

  return { detectedPages: pages, extract };
}

// Advanced orchestration with configurable options
export async function orchestrateExtractionAdvanced({
  pdfUrl,
  websiteUrl,
  lang = 'fr',
  includeWebsite = true,
  options = {},
}) {
  const defaultOptions = {
    dpi: '300',
    trim: '1',
    convert: '1',
    bgremove: '0',
    bgthreshold: '245',
    minW: '300',
    minH: '300',
    maxAspect: '5',
    boostFactor: '1.2',
    embeddedBoost: '1.04',
  };

  const finalOptions = { ...defaultOptions, ...options };

  // 1) Detect actions with enhanced error handling
  const target = websiteUrl || pdfUrl;
  let pages = [];
  let detectError = null;

  try {
    const detectRes = await fetch(
      `/api/detect-actions?url=${encodeURIComponent(target)}&lang=${encodeURIComponent(lang)}`
    );

    if (detectRes.ok) {
      const detectJson = await detectRes.json().catch(() => ({}));
      pages = Array.isArray(detectJson.pages) ? detectJson.pages : [];

      if (!pages.length) {
        const hdr = detectRes.headers.get('X-Actions-Pages');
        if (hdr)
          pages = hdr
            .split(',')
            .map(s => Number(s.trim()))
            .filter(Number.isFinite);
      }
    } else {
      detectError = `Actions detection failed: ${detectRes.status} ${detectRes.statusText}`;
    }
  } catch (e) {
    detectError = `Actions detection error: ${e.message}`;
    console.warn(
      'Actions detection failed, continuing with extraction only:',
      e
    );
  }

  // 2) Extract with boosts (PDF-first)
  const params = new URLSearchParams({
    pdfUrl,
    ...finalOptions,
  });
  if (pages.length) params.set('boostPages', pages.join(','));

  const extractRes = await fetch(
    `/api/extract-components?${params.toString()}`
  );
  const extract = await extractRes.json();

  // 3) Enhanced response with metadata
  return {
    detectedPages: pages,
    extract,
    metadata: {
      detectError,
      pagesDetected: pages.length,
      imagesExtracted: extract.images?.length || 0,
      source: extract.source,
      cache: extract.cache,
      popplerMissing: extract.popplerMissing,
      options: finalOptions,
    },
  };
}
