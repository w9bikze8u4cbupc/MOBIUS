/**
 * Collect images within a section, stopping at the next heading of equal or higher level
 * @param {Object} $ - Cheerio instance
 * @param {Object} headingEl - Heading element to start from
 * @param {Object} options - Configuration options
 * @param {number} options.maxImgs - Maximum images to collect
 * @returns {Array} Array of image objects with section distance
 */
export function collectWithinSection($, headingEl, { maxImgs = 16 } = {}) {
  const startTag = headingEl?.name?.toLowerCase() || 'h2';
  const level = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(startTag);
  const imgs = [];
  let el = $(headingEl).next();
  let distance = 0;

  const isHeading = (node) => {
    const t = node?.name?.toLowerCase();
    if (!t) return false;
    const lvl = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(t);
    return lvl >= 0 && lvl <= level; // equal or higher-level heading closes section
  };

  while (el.length && imgs.length < maxImgs) {
    const node = el[0];
    if (isHeading(node)) break;
    el.find('img, picture img').each((_, n) => {
      imgs.push({ node: n, sectionDistance: distance });
    });
    el = el.next();
    distance++;
  }
  return imgs;
}
