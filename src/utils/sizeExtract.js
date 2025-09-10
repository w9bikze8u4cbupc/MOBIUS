/**
 * Parse image dimensions from URL patterns
 * @param {string} u - Image URL
 * @returns {Object|null} Object with w and h properties or null
 */
export function parseSizeFromUrl(u) {
  try {
    const url = new URL(u);
    const w1 = parseInt(url.searchParams.get('w') || url.searchParams.get('width') || '', 10);
    const h1 = parseInt(url.searchParams.get('h') || url.searchParams.get('height') || '', 10);
    if (w1 > 0 && h1 > 0) return { w: w1, h: h1 };
    const resize = url.searchParams.get('resize'); // "300,225" or "300%2C225"
    if (resize) {
      const m = resize.match(/(\d+)[^\d]+(\d+)/);
      if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
    }
    const m2 = url.pathname.match(/-(\d+)x(\d+)\.(?:jpe?g|png|webp|gif)$/i);
    if (m2) return { w: parseInt(m2[1], 10), h: parseInt(m2[2], 10) };
  } catch (_) {}
  return null;
}

/**
 * Parse image dimensions from srcset attribute
 * @param {string} srcset - Srcset attribute value
 * @returns {Object|null} Object with w, h, and url properties or null
 */
export function parseSizeFromSrcset(srcset) {
  if (!srcset) return null;
  const candidates = srcset.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const [u, desc] = entry.split(/\s+/);
    let w = 0, h = 0;
    if (desc && desc.endsWith('w')) w = parseInt(desc, 10) || 0;
    const fromUrl = parseSizeFromUrl(u);
    if (fromUrl) { w = fromUrl.w || w; h = fromUrl.h || h; }
    const area = w * (h || Math.round(w * 0.66)); // approximate if h missing
    return { u, w, h, area };
  });
  if (!candidates.length) return null;
  candidates.sort((a,b) => b.area - a.area);
  const top = candidates[0];
  return { w: top.w || 0, h: top.h || 0, url: top.u };
}

/**
 * Convert relative URL to absolute URL
 * @param {string} baseUrl - Base URL
 * @param {string} relativeUrl - Relative URL
 * @returns {string} Absolute URL
 */
export function toAbsoluteUrl(baseUrl, relativeUrl) {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch (_) {
    return relativeUrl;
  }
}