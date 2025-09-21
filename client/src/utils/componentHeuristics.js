// client/src/utils/componentHeuristics.js
export function scoreImage(img) {
  // img: { url, width, height, type, sizeBytes, page, name }
  let score = 0;
  const w = img.width || 0;
  const h = img.height || 0;
  const area = w * h;

  // Size/area
  if (area >= 256 * 256) score += 2;
  else if (area >= 160 * 160) score += 1;
  else score -= 1;

  // Aspect ratio near square or card-ish
  if (w && h) {
    const r = w / h;
    if (r > 0.7 && r < 1.5) score += 1;
  }

  // PNGs often contain transparency/cutouts
  if (
    (img.type || '').includes('png') ||
    (img.url || '').toLowerCase().endsWith('.png')
  )
    score += 1;

  // Bytes per pixel (rough density proxy)
  if (img.sizeBytes && area) {
    const bpp = img.sizeBytes / area;
    if (bpp > 0.4) score += 1;
  }

  // Page index (later pages often contain component spreads)
  if (typeof img.page === 'number' && img.page >= 3) score += 0.5;

  return score;
}

export function isLikelyComponent(img, threshold = 2.5) {
  return scoreImage(img) >= threshold;
}

export function categorizeImages(images, threshold = 2.5) {
  const components = [];
  const others = [];
  for (const img of images || []) {
    (isLikelyComponent(img, threshold) ? components : others).push(img);
  }
  return { components, others };
}
