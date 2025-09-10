import { canonicalizeImageUrl } from './url-canon.js';

/**
 * Prefer original WordPress images by stripping size suffixes
 * e.g., /uploads/board-300x200.jpg -> /uploads/board.jpg
 * @param {string} u - URL to process
 * @returns {string} URL with size suffixes removed
 */
export function preferOriginalWordPress(u) {
  return u.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
}

/**
 * Pick the best image URL from candidates, preferring full-size originals
 * @param {Object} $ - Cheerio instance
 * @param {Object} imgEl - Image element
 * @param {string} baseUrl - Base URL for resolution
 * @returns {string|null} Best image URL or null if none found
 */
export function pickBestImageUrl($, imgEl, baseUrl) {
  const $img = $(imgEl);
  let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original') || '';
  const parentHref = $img.closest('a').attr('href') || '';

  // Prefer anchor href if it looks like a higher-res image
  const candidates = [];
  if (parentHref && /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(parentHref)) candidates.push(parentHref);
  if (src) candidates.push(src);

  // Normalize candidates and strip WP size suffixes
  const norm = candidates
    .map(preferOriginalWordPress)
    .map(u => canonicalizeImageUrl(new URL(u, baseUrl).toString()));

  // De-dupe while preserving order
  const seen = new Set();
  for (const u of norm) { 
    if (!seen.has(u)) seen.add(u); 
  }

  // Return best guess (first normalized candidate)
  return [...seen][0] || null;
}