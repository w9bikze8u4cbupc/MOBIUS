const STRIP_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ver',
  'v',
  'ts',
  '_',
  'cache',
  'width',
  'height',
  'w',
  'h',
]);

/**
 * Canonicalize image URLs to reduce duplicates due to cache-busters and size params
 * @param {string} u - URL to canonicalize
 * @returns {string} Canonicalized URL
 */
export function canonicalizeImageUrl(u) {
  try {
    const url = new URL(u);
    // Keep only non-noisy params
    const kept = [];
    url.searchParams.forEach((value, key) => {
      if (!STRIP_QUERY_PARAMS.has(key.toLowerCase())) {
        kept.push([key, value]);
      }
    });
    url.search = '';
    for (const [k, v] of kept) url.searchParams.append(k, v);
    // Normalize protocol/host casing, trailing slash not needed for files
    return url.toString();
  } catch {
    return u;
  }
}
