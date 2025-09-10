// client/src/api/extractActions.js
const API_BASE = (process.env.REACT_APP_API_BASE || '').replace(/\/$/, ''); // e.g. http://localhost:5001

// Extended interface for extracted images with new scoring fields
export interface ExtractedImage {
  url: string;
  fileName: string;
  width: number;
  height: number;
  fileSize: number;
  format: string;
  page: number;
  // New optional fields:
  score?: number;
  source?: 'embedded' | 'snapshot';
  hasAlpha?: boolean; // reserved for a later step
}

// Type for extractActions options
export interface ExtractActionsOptions {
  lang?: string;                 // e.g., 'en'
  langs?: string | string[];     // e.g., 'all' or 'en,fr' or ['en','fr']
  extraKeywords?: string;        // e.g., 'turn,how to play'
}

// New: returns images + header-parsed pages
export async function extractActionsByUrlWithMeta(pdfUrl, opts = {}) {
  if (!pdfUrl) throw new Error('pdfUrl is required');

  const qs = new URLSearchParams({ pdfUrl });
  if (opts.lang) qs.set('lang', String(opts.lang));
  if (opts.langs) {
    const langs = Array.isArray(opts.langs) ? opts.langs.join(',') : String(opts.langs);
    qs.set('langs', langs);
  }
  if (opts.extraKeywords) qs.set('extraKeywords', String(opts.extraKeywords));

  const url = API_BASE ? `${API_BASE}/api/extract-actions?${qs.toString()}` : `/api/extract-actions?${qs.toString()}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  
  const images = await res.json();
  const pagesHdr = res.headers.get('X-Actions-Pages');
  const actionsPages = pagesHdr ? pagesHdr.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n)) : [];
  
  // Ensure images have proper absolute URLs for cross-port compatibility
  const processedImages = images.map((img) => {
    const rawUrl = img.url || '';
    const absoluteUrl = API_BASE ? new URL(rawUrl, API_BASE).toString() : rawUrl;
    return {
      ...img,
      url: absoluteUrl,
      fileName: img.fileName || img.name || 'action_image',
      format: (img.type || img.format || '').toLowerCase(),
      // Ensure consistent structure
      width: img.width || 0,
      height: img.height || 0,
      fileSize: img.fileSize || img.sizeBytes || 0,
      page: img.page || 0,
      // Add component scoring hints
      isActionImage: true,
    };
  });
  
  return { images: processedImages, actionsPages };
}

// Backward compatible alias: still returns an array
export async function extractActionsByUrl(pdfUrl, opts = {}) {
  const { images } = await extractActionsByUrlWithMeta(pdfUrl, opts);
  return images;
}

// Helper function for sorting as suggested by GPT-5
export function sortImagesForPicking(images) {
  // Prefer server-provided score; fallback to area -> PNG -> page
  return [...images].sort((a, b) => {
    const sa = typeof a.score === 'number' ? a.score : null;
    const sb = typeof b.score === 'number' ? b.score : null;
    if (sa !== null && sb !== null && sb !== sa) return sb - sa;

    const areaA = (a.width || 0) * (a.height || 0);
    const areaB = (b.width || 0) * (b.height || 0);
    if (areaA !== areaB) return areaB - areaA;

    const fa = String(a.format || '').toLowerCase();
    const fb = String(b.format || '').toLowerCase();
    if (fa !== fb) {
      if (fa === 'png') return -1;
      if (fb === 'png') return 1;
    }
    return (a.page || 0) - (b.page || 0);
  });
}

// Legacy compatibility function (keep existing code working)
export async function extractActions(pdfUrl) {
  return extractActionsByUrl(pdfUrl);
}