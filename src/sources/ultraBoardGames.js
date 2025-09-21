import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import * as cheerio from 'cheerio';

import { readCache, writeCache } from '../utils/disk-cache.js';
import { focusScore } from '../utils/image-quality.js';
import { pickBestImageUrl } from '../utils/image-upsize.js';
import { probeRemoteSize } from '../utils/probeSize.js';
import { parseSizeFromUrl, parseSizeFromSrcset, toAbsoluteUrl } from '../utils/sizeExtract.js';
import { collectWithinSection } from '../utils/ubg-section.js';
import { canonicalizeImageUrl } from '../utils/url-canon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UBG_BASE = 'https://www.ultraboardgames.com';

// Cache directory
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache', 'ubg');
// Create cache directory if it doesn't exist
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Multilingual component section headers
const COMPONENT_HDRS = [
  'components',
  'game components',
  'contents',
  'spielmaterial',
  'contenu',
  'componentes',
  'componenti',
  // Add more multilingual variants
  'matériel',
  'composants',
  'contenidos',
  'componenti',
  'materiale',
  'material',
];

// User agent pool for respectful crawling
const USER_AGENTS = [
  'MobiusTutorialGenerator/1.0 (+contact@yourdomain)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
];

// Global rate limiter
const REQUEST_DELAY = 1000; // 1 second between requests
let lastRequestTime = 0;

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respectfulRequest(url, options = {}) {
  // Implement global rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_DELAY) {
    await delay(REQUEST_DELAY - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  // Randomize User-Agent
  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const defaultOptions = {
    redirect: 'follow',
    headers: {
      'User-Agent': randomUserAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  };

  return fetch(url, { ...defaultOptions, ...options });
}

function getCachePath(slug) {
  return path.join(CACHE_DIR, `${slug}.json`);
}

function readCacheOld(slug) {
  try {
    const cachePath = getCachePath(slug);
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      // Check if cache is older than 7 days
      const cacheAge = Date.now() - new Date(data.timestamp).getTime();
      if (cacheAge < 7 * 24 * 60 * 60 * 1000) {
        // 7 days
        return data;
      }
    }
  } catch (error) {
    console.warn('Cache read error:', error.message);
  }
  return null;
}

function writeCacheOld(slug, data) {
  try {
    const cachePath = getCachePath(slug);
    const cacheData = {
      ...data,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
  } catch (error) {
    console.warn('Cache write error:', error.message);
  }
}

async function getHtml(url, slug = null) {
  // Check disk cache first
  const cacheKey = `ubg:${url}`;
  let cacheData = readCache(cacheKey);

  // Also check old cache format for backward compatibility
  if (!cacheData && slug) {
    cacheData = readCacheOld(slug);
  }

  let cacheStatus = 'MISS';

  if (cacheData && cacheData.url === url) {
    // Check if we should revalidate (older than 1 day)
    const cacheAge = Date.now() - new Date(cacheData.timestamp).getTime();
    if (cacheAge < 24 * 60 * 60 * 1000) {
      // 1 day
      cacheStatus = 'HIT';
      return {
        ok: true,
        url: cacheData.url,
        html: cacheData.html,
        status: cacheData.status,
        cache: cacheStatus,
      };
    } else {
      cacheStatus = 'REVALIDATED';
      // Add cache validation headers
      try {
        const res = await respectfulRequest(url, {
          method: 'HEAD',
        });

        if (res.status === 304) {
          // Not modified, use cached content
          return {
            ok: true,
            url: cacheData.url,
            html: cacheData.html,
            status: cacheData.status,
            cache: 'REVALIDATED',
          };
        }
      } catch (error) {
        // If revalidation fails, use cache anyway
        return {
          ok: true,
          url: cacheData.url,
          html: cacheData.html,
          status: cacheData.status,
          cache: 'REVALIDATED',
        };
      }
    }
  }

  try {
    const res = await respectfulRequest(url);
    if (res.ok) {
      const html = await res.text();
      // Cache the response
      const cacheEntry = {
        url,
        html,
        status: res.status,
        timestamp: new Date().toISOString(),
      };
      writeCache(cacheKey, cacheEntry);

      // Also write to old cache format for backward compatibility
      if (slug) {
        writeCacheOld(slug, cacheEntry);
      }

      return {
        ok: true,
        url: res.url,
        html,
        status: res.status,
        cache: cacheStatus,
      };
    }
    return { ok: false, status: res.status, cache: cacheStatus };
  } catch (error) {
    // If we have cached data, use it as fallback
    if (cacheData) {
      return {
        ok: true,
        url: cacheData.url,
        html: cacheData.html,
        status: cacheData.status,
        cache: 'FALLBACK',
      };
    }
    return { ok: false, error: error.message, cache: cacheStatus };
  }
}

function slugifyCandidates(title) {
  const variantsSeed = new Set();

  const v = (s) => s.trim();
  const base = v(title);

  // Generate seed variants
  variantsSeed.add(base);
  if (base.includes(':')) variantsSeed.add(v(base.split(':')[0])); // drop subtitle
  if (/^\s*the\s+/i.test(base)) variantsSeed.add(v(base.replace(/^\s*the\s+/i, '')));
  variantsSeed.add(v(base.replace(/\s*\(.*?\)\s*/g, ''))); // drop parentheses
  variantsSeed.add(v(base.replace(/&/g, 'and')));

  // Normalize to slug
  const slugs = new Set();
  for (const s of variantsSeed) {
    let t = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); // strip diacritics
    t = t.toLowerCase();
    t = t.replace(/’|‘|´|`/g, '\'');
    t = t.replace(/[^a-z0-9]+/g, '-');
    t = t.replace(/^-+|-+$/g, '');
    t = t.replace(/-{2,}/g, '-');
    if (t) {
      slugs.add(t);
      // drop generic suffixes
      slugs.add(t.replace(/-(board|card)-game$/, ''));
    }
  }
  return [...slugs].filter(Boolean);
}

export async function resolveUbgRulesUrl(gameTitle) {
  const slugs = slugifyCandidates(gameTitle);
  const tried = [];
  for (const slug of slugs) {
    // Primary: rules page
    const rulesUrl = `${UBG_BASE}/${slug}/game-rules.php`;
    tried.push(rulesUrl);
    try {
      const r1 = await getHtml(rulesUrl, slug);
      if (r1.ok) return { url: rulesUrl, html: r1.html, slug, tried, cache: r1.cache };
    } catch (_) {}

    // Fallback: overview page + follow Game Rules link
    const overviewUrl = `${UBG_BASE}/${slug}/index.php`;
    tried.push(overviewUrl);
    try {
      const r2 = await getHtml(overviewUrl, slug);
      if (r2.ok) {
        const $ = cheerio.load(r2.html);
        const rulesLink = $('a:contains("Game Rules"), a:contains("Basic Game Rules")')
          .first()
          .attr('href');
        if (rulesLink) {
          const abs = new URL(rulesLink, overviewUrl).toString();
          const r3 = await getHtml(abs, slug);
          if (r3.ok) return { url: abs, html: r3.html, slug, tried, cache: r3.cache };
        }
      }
    } catch (_) {}
  }
  return { url: null, tried };
}

/**
 * Check if element is site chrome (sidebar, footer, ads, etc.)
 * @param {Object} $ - Cheerio instance
 * @param {Object} el - Element to check
 * @returns {boolean} True if element is site chrome
 */
function isChrome($, el) {
  const cls = ($(el).attr('class') || '').toLowerCase();
  const id = ($(el).attr('id') || '').toLowerCase();
  return (
    cls.includes('sidebar') ||
    cls.includes('footer') ||
    cls.includes('advert') ||
    id.includes('comments')
  );
}

/**
 * Find components section root element
 * @param {Object} $ - Cheerio instance
 * @returns {Object|null} Components section root element or null
 */
function findComponentsRoot($) {
  // Prefer h2/h3; fallback to strong/paragraphs with matching text
  const headings = $('h1,h2,h3,h4,strong,b,p');
  let best = null;
  headings.each((_, el) => {
    const txt = $(el).text().trim().toLowerCase();
    if (COMPONENT_HDRS.some((h) => txt === h || txt.startsWith(h))) {
      best = el;
      return false;
    }
  });
  return best;
}

/**
 * Collect nodes within a section until next equal/higher-level heading
 * @param {Object} $ - Cheerio instance
 * @param {Object} startHeading - Starting heading element
 * @returns {Array} Array of nodes in the section
 */
function sectionNodesAfter($, startHeading) {
  // Collect nodes until next equal/higher-level heading
  const nodes = [];
  let node = $(startHeading).next();
  while (node.length) {
    if (/^H[1-6]$/i.test(node[0].tagName)) break;
    nodes.push(node[0]);
    node = node.next();
  }
  return nodes;
}

/**
 * Assign distances to images based on their position in the section
 * @param {Object} $ - Cheerio instance
 * @param {Array} sectionNodes - Nodes in the section
 * @param {Array} results - Image results array
 */
function assignDistances($, sectionNodes, results) {
  const imgIndex = new Map();
  sectionNodes.forEach((el, idx) => {
    if (el.tagName && el.tagName.toLowerCase() === 'img') imgIndex.set(el, idx);
    $('img', el).each((_, child) => imgIndex.set(child, idx));
  });
  // For each harvested image with a backing element, set distance
  for (const r of results) {
    if (!r._el) continue; // if you saved the element reference
    const idx = imgIndex.get(r._el);
    if (typeof idx === 'number') r.sectionDistance = idx;
  }
}

/**
 * Calculate proximity score from distance with exponential decay
 * @param {number} d - Distance from components section
 * @param {number} k - Decay factor (default: 4)
 * @returns {number} Proximity score between 0 and 1
 */
function proximityFromDistance(d, k = 4) {
  return typeof d === 'number' ? Math.exp(-d / k) : 0;
}

/**
 * Push an image to the results with size and proximity information
 * @param {Object} $ - Cheerio instance
 * @param {Object} img - Image element
 * @param {number} score - Base score
 * @param {string} context - Context information
 * @param {Object} options - Options including baseUrl and results array
 */
async function pushImage($, img, score, context, options) {
  const { baseUrl, results } = options;
  const $img = $(img);
  const src = $img.attr('src') || $img.attr('data-src') || '';
  const srcset = $img.attr('srcset') || $img.attr('data-srcset') || '';
  if (!src) return;

  // Get width and height from attributes
  let w = parseInt($img.attr('width') || '0', 10);
  let h = parseInt($img.attr('height') || '0', 10);

  // Fallback to parsing from URL patterns
  if (!w || !h) {
    const fromSet = parseSizeFromSrcset(srcset) || parseSizeFromUrl(src);
    if (fromSet) {
      w = w || fromSet.w;
      h = h || fromSet.h;
    }
  }

  // Optional probing (env-gated)
  if ((!w || !h) && process.env.UBG_PROBE_SIZE === '1') {
    try {
      const absUrl = toAbsoluteUrl(baseUrl, src);
      const probed = await probeRemoteSize(absUrl);
      if (probed) {
        w = probed.w;
        h = probed.h;
      }
    } catch (_) {
      // Silently fail probing errors
    }
  }

  // Heuristic fallbacks with better defaults
  if (!w && !h) {
    // For component-like nodes, use larger default
    if (context === 'components-nearby') {
      w = 320;
      h = 240;
    } else {
      // For general page images
      w = 200;
      h = 150;
    }
  }

  // Canonicalize URL to reduce duplicates
  const canonicalSrc = canonicalizeImageUrl(src);

  const alt = ($img.attr('alt') || '').toLowerCase();
  if (w && h && (w < 120 || h < 120)) return;
  if (/\.(svg|gif)$/i.test(canonicalSrc)) return;

  // Boost score for component-related images
  let s = score;
  if (/component|setup|cards?|board|tokens?|tiles?/i.test(alt)) s += 10;
  if (/\/(img|images|pics)\//i.test(canonicalSrc)) s += 2;

  // Try to get focus score if we can access the image
  let qualityFocus = 0.5; // Default score
  try {
    // In a real implementation, we would fetch the image to calculate focus
    // For now, we'll use a placeholder
    qualityFocus = 0.5;
  } catch (e) {
    // Keep default score
  }

  results.push({
    url: canonicalSrc,
    w: w || 0,
    h: h || 0,
    alt,
    score: s,
    context,
    qualityFocus,
    _el: img, // Store element reference for distance calculation
  });
}

/**
 * Harvest images near a root element
 * @param {Object} $ - Cheerio instance
 * @param {Object} rootEl - Root element to search near
 * @param {string} baseUrl - Base URL for resolving image URLs
 * @param {number} maxToCollect - Maximum images to collect
 * @returns {Array} Array of image objects
 */
function harvestImagesNear($, rootEl, baseUrl, maxToCollect = 12) {
  const startTag = rootEl?.name?.toLowerCase() || 'h2';
  const level = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(startTag);
  const imgs = [];
  let el = $(rootEl).next();
  let distance = 0;

  const isHeading = (node) => {
    const t = node?.name?.toLowerCase();
    if (!t) return false;
    const lvl = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(t);
    return lvl >= 0 && lvl <= level; // equal or higher-level heading closes section
  };

  while (el.length && imgs.length < maxToCollect) {
    const node = el[0];
    if (isHeading(node)) break;

    // Skip site chrome
    if (isChrome($, node)) {
      el = el.next();
      continue;
    }

    el.find('img, picture img').each((_, n) => {
      // Skip site chrome elements
      if (isChrome($, n)) return;

      // Use the enhanced image URL picker
      const bestUrl = pickBestImageUrl($, n, baseUrl);
      if (bestUrl) {
        imgs.push({ url: bestUrl, sectionDistance: distance, _el: n });
      }
    });
    el = el.next();
    distance++;
  }
  return imgs;
}

export function extractComponentsFromUbg(html) {
  const $ = cheerio.load(html);
  const header = findComponentsRoot($);
  if (!header) return { items: [], reason: 'no-components-header' };

  const items = [];
  // Traverse siblings until next header; collect LIs and "component-like" paragraphs
  for (let el = header.nextSibling; el; el = el.nextSibling) {
    if (el.tagName && /^(h1|h2|h3)$/i.test(el.tagName)) break;

    // Skip site chrome
    if (isChrome($, el)) continue;

    const node = $(el);
    node.find('li').each((_, li) => {
      const raw = $(li).text().trim().replace(/\s+/g, ' ');
      if (raw) items.push(raw);
    });
    if (node.is('p')) {
      const raw = node.text().trim().replace(/\s+/g, ' ');
      if (/card|board|token|marker|tile|die|dice|pawn|meeple/i.test(raw)) items.push(raw);
    }
  }
  return { items };
}

export async function extractImagesFromUbg(html, baseUrl) {
  const $ = cheerio.load(html);
  const images = [];

  // Use improved section anchoring
  const compHeader = findComponentsRoot($);
  let sectionNodes = [];
  if (compHeader) {
    sectionNodes = sectionNodesAfter($, compHeader);
  }

  if (compHeader) {
    // Harvest images near the components section first
    const nearbyImages = harvestImagesNear($, compHeader, baseUrl, 12);
    for (const img of nearbyImages) {
      // Find the actual image element to get its attributes
      const imgEl = $(`img[src="${img.url}"]`).first();
      if (imgEl.length) {
        // Get width and height with fallbacks
        let w = parseInt(imgEl.attr('width') || '0', 10);
        let h = parseInt(imgEl.attr('height') || '0', 10);

        // Fallback to parsing from URL patterns
        if (!w || !h) {
          const fromUrl = parseSizeFromUrl(img.url);
          if (fromUrl) {
            w = w || fromUrl.w;
            h = h || fromUrl.h;
          }
        }

        // Get srcset for better size detection
        const srcset = imgEl.attr('srcset') || imgEl.attr('data-srcset') || '';
        if (!w || !h) {
          const fromSet = parseSizeFromSrcset(srcset);
          if (fromSet) {
            w = w || fromSet.w;
            h = h || fromSet.h;
          }
        }

        // Optional probing (env-gated)
        if ((!w || !h) && process.env.UBG_PROBE_SIZE === '1') {
          try {
            const absUrl = toAbsoluteUrl(baseUrl, img.url);
            const probed = await probeRemoteSize(absUrl);
            if (probed) {
              w = probed.w;
              h = probed.h;
            }
          } catch (_) {
            // Silently fail probing errors
          }
        }

        // Heuristic fallbacks with better defaults
        if (!w && !h) {
          // For component-like nodes, use larger default
          w = 320;
          h = 240;
        }

        images.push({
          url: img.url,
          w: w || 0,
          h: h || 0,
          alt: imgEl.attr('alt') || '',
          score: 50,
          context: 'components-nearby',
          qualityFocus: 0.5,
          sectionDistance: img.sectionDistance,
          _el: img._el, // Store element reference for distance calculation
        });
      }
    }
  }

  // Page-wide fallback
  const pageImages = $('article img, .content img, .post img, img');
  for (let i = 0; i < pageImages.length; i++) {
    // Skip site chrome
    const imgEl = pageImages[i];
    if (isChrome($, imgEl)) continue;

    // Get width and height with fallbacks
    const $img = $(imgEl);
    let w = parseInt($img.attr('width') || '0', 10);
    let h = parseInt($img.attr('height') || '0', 10);
    const src = $img.attr('src') || '';

    // Fallback to parsing from URL patterns
    if (!w || !h) {
      const fromUrl = parseSizeFromUrl(src);
      if (fromUrl) {
        w = w || fromUrl.w;
        h = h || fromUrl.h;
      }
    }

    // Get srcset for better size detection
    const srcset = $img.attr('srcset') || $img.attr('data-srcset') || '';
    if (!w || !h) {
      const fromSet = parseSizeFromSrcset(srcset);
      if (fromSet) {
        w = w || fromSet.w;
        h = h || fromSet.h;
      }
    }

    // Optional probing (env-gated)
    if ((!w || !h) && process.env.UBG_PROBE_SIZE === '1') {
      try {
        const absUrl = toAbsoluteUrl(baseUrl, src);
        const probed = await probeRemoteSize(absUrl);
        if (probed) {
          w = probed.w;
          h = probed.h;
        }
      } catch (_) {
        // Silently fail probing errors
      }
    }

    // Heuristic fallbacks with better defaults
    if (!w && !h) {
      // For general page images
      w = 200;
      h = 150;
    }

    // Skip very small images
    if (w && h && (w < 120 || h < 120)) continue;
    if (/\.(svg|gif)$/i.test(src)) continue;

    images.push({
      url: src,
      w: w || 0,
      h: h || 0,
      alt: $img.attr('alt') || '',
      score: 10,
      context: 'page',
      qualityFocus: 0.5,
      sectionDistance: compHeader ? 10 : null, // Far from components if we found a header
      _el: imgEl, // Store element reference for distance calculation
    });
  }

  // Assign distances to images based on their position in the section
  if (sectionNodes.length > 0) {
    assignDistances($, sectionNodes, images);
  }

  // Rank + dedupe
  const seen = new Set();
  const ranked = images
    .map((x) => ({ ...x, key: x.url.replace(/\?.*$/, '') }))
    .filter((x) => (seen.has(x.key) ? false : seen.add(x.key)))
    .sort((a, b) => b.score - a.score || b.w * b.h - a.w * a.h);
  return ranked;
}

export async function fetchUbgAuto(gameTitle, { alsoOverview = true } = {}) {
  const resolved = await resolveUbgRulesUrl(gameTitle);
  if (!resolved.url) return { ok: false, reason: 'not-found', tried: resolved.tried };

  const rulesUrl = resolved.url;
  const rulesHtml = resolved.html;

  const components = extractComponentsFromUbg(rulesHtml);
  let images = await extractImagesFromUbg(rulesHtml, rulesUrl);

  // Optional: look at the overview page for extra images
  if (alsoOverview) {
    const overviewUrl = `${UBG_BASE}/${resolved.slug}/index.php`;
    try {
      const r = await getHtml(overviewUrl, resolved.slug);
      if (r.ok) images = [...images, ...(await extractImagesFromUbg(r.html, overviewUrl))];
    } catch {}
  }

  // Top N images
  images = images.slice(0, 10);

  return {
    ok: true,
    rulesUrl,
    slug: resolved.slug,
    components,
    images,
    cache: resolved.cache || 'MISS',
  };
}
