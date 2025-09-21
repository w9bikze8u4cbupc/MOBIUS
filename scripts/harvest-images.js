#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { URL as NodeURL } from 'url';
import { fileURLToPath } from 'url';

import { load as loadHtml } from 'cheerio';
import fetch from 'node-fetch';

// Import UBG provider

// Import deduplication utilities

// Import game profiles

// Import new utilities
import { isProviderEnabled, getEnabledProviders } from '../src/config/providers.js';
import { fetchUbgAuto } from '../src/sources/ultraBoardGames.js';
import { confidenceBand, detailedConfidence } from '../src/utils/confidence-badge.js';
import {
  loadGameProfile,
  normalizeComponentName,
  isSupplyOnly,
} from '../src/utils/game-profiles.js';
import { dedupeByPerceptualHash } from '../src/utils/image-dedupe.js';
import { focusScore } from '../src/utils/image-quality.js';
import { scoreImageCandidate } from '../src/utils/scoring.js'; // Import the scoring utility
import { canonicalizeImageUrl } from '../src/utils/url-canon.js';

// Multilingual section headers for component detection
const COMPONENT_SECTION_RE =
  /(components?|contents|setup|material|spielmaterial|contenu|componentes|componenti|matériel|composants|contenidos|materiale)/i;

// Image type allowlist
const IMAGE_TYPE_RE = /\.(png|jpe?g|webp)(\?|$)/i;

// Exclude classes/paths with these terms
const EXCLUDE_TERMS = ['logo', 'icon', 'sprite', 'social', 'banner', 'tracking'];

// Minimum size threshold (in pixels)
const MIN_SIZE = 120;

// Provider weights for scoring normalization
const PROVIDER_WEIGHTS = {
  'web-general': 0.7,
  ubg: 0.85,
  'pdf-embedded': 1.0,
  'pdf-snapshot': 0.7,
};

// Provider definitions for orchestration
const PROVIDERS = [
  { name: 'ubg', fn: harvestImagesFromUbg, weight: 0.85 },
  { name: 'web-general', fn: harvestImagesFromExtraUrls, weight: 0.7 },
];

/**
 * Harvest images from Extra URLs
 * @param {string[]} extraUrls - Array of URLs to harvest images from
 * @param {Object} options - Options including base, labels, and verbose flag
 * @returns {Promise<Array>} Array of image objects
 */
export async function harvestImagesFromExtraUrls(extraUrls, { base, labels, verbose = false }) {
  const results = [];

  for (const u of extraUrls) {
    if (verbose) console.log(`🔍 Fetching URL: ${u}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const res = await fetch(u, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'MobiusTutorialGenerator/1.0 (+contact@yourdomain)',
        },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (verbose) console.log(`⚠️  HTTP ${res.status} for ${u}`);
        continue;
      }

      const html = await res.text();
      const $ = loadHtml(html);
      const imgs = [];

      if (verbose) console.log(`📄 Parsing ${$('img').length} images from ${u}`);

      $('img').each((_, el) => {
        const src = $(el).attr('src') || '';
        const alt = ($(el).attr('alt') || '').trim();
        const title = ($(el).attr('title') || '').trim();
        const className = ($(el).attr('class') || '').toLowerCase();
        const parentClass = ($(el).parent().attr('class') || '').toLowerCase();

        // Skip if no src or wrong type
        if (!src || !IMAGE_TYPE_RE.test(src)) return;

        // Skip if excluded by class or parent class
        if (EXCLUDE_TERMS.some((term) => className.includes(term) || parentClass.includes(term))) {
          if (verbose) console.log(`⏭️  Skipping excluded image: ${src}`);
          return;
        }

        // Resolve to absolute URL and canonicalize
        let abs;
        try {
          abs = new NodeURL(src, u).toString();
          abs = canonicalizeImageUrl(abs); // Reduce duplicates
        } catch (e) {
          if (verbose) console.log(`⏭️  Skipping invalid URL: ${src}`);
          return;
        }

        // Vicinity score: check nearest headings
        let vicinityBoost = 0;
        let heading = '';

        // Look for nearby headings
        const parent = $(el).closest('section,article,div');
        if (parent.length) {
          heading = parent.find('h1,h2,h3,h4,h5,h6').first().text() || '';
          if (COMPONENT_SECTION_RE.test(heading)) {
            vicinityBoost = 2; // High boost for component sections
          } else {
            // Check if any nearby text contains component keywords
            const nearbyText = parent.text().toLowerCase();
            if (labels.some((label) => nearbyText.includes(label.toLowerCase().split(' ')[0]))) {
              vicinityBoost = 1; // Medium boost for label-related content
            }
          }
        }

        // Size heuristic (best-effort: data- attrs, width/height)
        const widthAttr = $(el).attr('width') || $(el).attr('data-width') || '0';
        const heightAttr = $(el).attr('height') || $(el).attr('data-height') || '0';
        const w = parseInt(widthAttr, 10);
        const h = parseInt(heightAttr, 10);

        // Also check naturalWidth/naturalHeight if available
        const naturalWidth = $(el).attr('naturalWidth') || '0';
        const naturalHeight = $(el).attr('naturalHeight') || '0';
        const nw = parseInt(naturalWidth, 10);
        const nh = parseInt(naturalHeight, 10);

        // Use the best available size information
        const bestWidth = nw > 0 ? nw : w;
        const bestHeight = nh > 0 ? nh : h;

        // Skip if too small
        const tooSmall =
          (bestWidth > 0 && bestWidth < MIN_SIZE) || (bestHeight > 0 && bestHeight < MIN_SIZE);
        if (tooSmall) {
          if (verbose) console.log(`⏭️  Skipping small image (${bestWidth}x${bestHeight}): ${src}`);
          return;
        }

        imgs.push({
          url: abs,
          alt,
          title,
          vicinityBoost,
          heading,
          width: bestWidth,
          height: bestHeight,
          provider: 'web-general',
          providerWeight: PROVIDER_WEIGHTS['web-general'],
        });

        if (verbose)
          console.log(
            `✅ Collected image: ${abs} (boost: ${vicinityBoost}, size: ${bestWidth}x${bestHeight})`,
          );
      });

      const ranked = dedupeAndRank(imgs, labels, verbose);
      results.push(...ranked.all);

      if (verbose) {
        console.log(`📊 Found ${ranked.all.length} images from ${u}`);
        console.log('🏷️  By label distribution:');
        for (const [label, images] of Object.entries(ranked.byLabel)) {
          if (images.length > 0) {
            console.log(`   ${label}: ${images.length} images`);
          }
        }
      }
    } catch (error) {
      if (verbose) console.log(`❌ Error fetching ${u}: ${error.message}`);
      // Continue with next URL
    }
  }

  return results;
}

/**
 * Harvest images from UltraBoardGames
 * @param {string} gameTitle - Game title to search for
 * @param {Object} options - Options including labels and verbose flag
 * @returns {Promise<Array>} Array of UBG images
 */
export async function harvestImagesFromUbg(gameTitle, { labels, verbose = false }) {
  // Check if UBG provider is enabled
  if (!isProviderEnabled('ubg')) {
    if (verbose) console.log('⏭️  UBG provider disabled, skipping');
    return [];
  }

  if (verbose) console.log(`🔍 Fetching UBG images for: ${gameTitle}`);

  try {
    const res = await fetchUbgAuto(gameTitle);
    if (!res.ok) {
      if (verbose) console.log(`⚠️  UBG not found for ${gameTitle}`);
      return [];
    }

    if (verbose) console.log(`📄 Found UBG page: ${res.rulesUrl} (Cache: ${res.cache || 'MISS'})`);

    const imgs = res.images.map((img) => ({
      url: img.url,
      alt: img.alt,
      width: img.w,
      height: img.h,
      context: img.context,
      provider: 'ubg',
      providerWeight: PROVIDER_WEIGHTS['ubg'],
      sectionDistance: img.context === 'components-nearby' ? 0 : 1,
      qualityFocus: img.qualityFocus || 0.5, // Default if not provided
    }));

    if (verbose) console.log(`📊 Found ${imgs.length} images from UBG`);

    return imgs;
  } catch (error) {
    if (verbose) console.log(`❌ Error fetching UBG images: ${error.message}`);
    return [];
  }
}

/**
 * Harvest images from all providers
 * @param {Object} ctx - Context object with game title and other info
 * @returns {Promise<Object>} Object containing images and provider headers
 */
export async function harvestAllImages(ctx) {
  const { title, extraUrls = [], verbose = false } = ctx;

  // Load game profile for normalization and validation
  const gameProfile = await loadGameProfile(title);

  if (verbose) {
    console.log(`🎮 Game: ${title}`);
    console.log(`📋 Allowlist terms: ${gameProfile.allowlist.join(', ')}`);
    console.log(`🔄 Synonyms: ${Object.keys(gameProfile.synonyms).length} defined`);
    console.log(`⚙️  Enabled providers: ${getEnabledProviders().join(', ')}`);
  }

  const results = [];
  const providerMetrics = {};
  const providerCounts = {}; // Track per-provider counts

  // Harvest from all enabled providers
  for (const provider of PROVIDERS) {
    // Check if provider is enabled
    if (!isProviderEnabled(provider.name)) {
      if (verbose) console.log(`⏭️  Provider ${provider.name} disabled, skipping`);
      continue;
    }

    try {
      const startTime = Date.now();
      let imgs = [];

      if (provider.name === 'ubg') {
        imgs = await provider.fn(title, { labels: gameProfile.allowlist, verbose });
      } else if (provider.name === 'web-general') {
        imgs = await provider.fn(extraUrls, { base: '', labels: gameProfile.allowlist, verbose });
      }

      const endTime = Date.now();
      providerMetrics[provider.name] = {
        count: imgs.length,
        time: endTime - startTime,
      };

      // Track provider counts
      providerCounts[provider.name] = imgs.length;

      // Add provider info to images
      for (const img of imgs) {
        results.push({
          ...img,
          provider: provider.name,
          providerWeight: provider.weight,
        });
      }

      if (verbose)
        console.log(
          `📊 Provider ${provider.name}: ${imgs.length} images (${endTime - startTime}ms)`,
        );
    } catch (e) {
      if (verbose) console.warn(`Provider ${provider.name} failed: ${e.message}`);
      providerMetrics[provider.name] = { count: 0, time: 0, error: e.message };
      providerCounts[provider.name] = 0;
    }
  }

  // Apply scoring to all images using the scoring utility
  const withScores = results.map((img) => {
    // Map UBG properties to standard properties for scoring
    const scoringInput = {
      ...img,
      width: img.width || img.w || 0,
      height: img.height || img.h || 0,
    };
    return scoreImageCandidate(scoringInput);
  });

  // Deduplicate using perceptual hashing
  const deduped = await dedupeByPerceptualHash(withScores, { threshold: 6 });

  // Add cluster IDs for UI grouping ("More like this")
  deduped.forEach((img, index) => {
    img.clusterId = index; // Simple sequential IDs
  });

  // Sort by finalScore desc
  deduped.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));

  // Apply game-specific guardrails (but be less restrictive for now)
  const filtered = deduped.filter((img, index) => {
    // For now, just ensure we have some results
    // In a real implementation, we would apply more specific filtering
    return index < 20; // Limit to top 20 images
  });

  if (verbose) {
    console.log(`📊 Final results: ${filtered.length} unique images from all providers`);
    // Log provider distribution
    const finalProviderCounts = {};
    filtered.forEach((img) => {
      finalProviderCounts[img.provider] = (finalProviderCounts[img.provider] || 0) + 1;
    });
    console.log('🏷️  Provider distribution:', finalProviderCounts);
    console.log('⏱️  Provider metrics:', providerMetrics);

    // Log confidence distribution
    const confidenceCounts = { High: 0, Medium: 0, Low: 0 };
    filtered.forEach((img) => {
      confidenceCounts[img.confidence] = (confidenceCounts[img.confidence] || 0) + 1;
    });
    console.log('⭐ Confidence distribution:', confidenceCounts);
  }

  // Add observability headers
  const headers = {
    'X-Providers-Enabled': getEnabledProviders().join(','),
    'X-Images-Provider-Counts': Object.entries(providerCounts)
      .map(([k, v]) => `${k}:${v}`)
      .join(','),
  };

  return {
    images: filtered,
    headers,
    providerMetrics,
    providerCounts,
  };
}

/**
 * Deduplicate and rank images
 * @param {Array} imgs - Array of image objects
 * @param {Array} labels - Canonical component labels
 * @param {boolean} verbose - Verbose logging flag
 * @returns {Object} Deduplicated and ranked images
 */
function dedupeAndRank(imgs, labels, verbose = false) {
  // First deduplicate by normalized URL
  const byUrl = new Map();
  for (const img of imgs) {
    const norm = canonicalizeImageUrl(img.url); // Use canonical URL for deduplication
    const prev = byUrl.get(norm);

    // Keep the one with higher vicinity boost or larger size
    if (
      !prev ||
      img.vicinityBoost > prev.vicinityBoost ||
      (img.vicinityBoost === prev.vicinityBoost &&
        (img.width > prev.width || img.height > prev.height))
    ) {
      byUrl.set(norm, img);
    }
  }

  const all = [...byUrl.values()];

  // Naive label mapping by substring match
  const labelBuckets = {};
  for (const L of labels) labelBuckets[L] = [];

  // Also add a "hero" bucket for general images
  labelBuckets['hero'] = [];

  for (const img of all) {
    const hay = [img.alt, img.title, img.heading].join(' ').toLowerCase();
    let matched = false;

    // Try to match to specific labels
    for (const L of labels) {
      const key = L.toLowerCase();
      // Match on first word of label (e.g., "cards" from "Geisha Cards")
      const firstWord = key.split(' ')[0];
      if (hay.includes(firstWord)) {
        labelBuckets[L].push(img);
        matched = true;
        if (verbose) console.log(`🏷️  Assigned to label '${L}': ${img.url}`);
      }
    }

    // If no specific label match, put in hero bucket if it has a boost
    if (!matched && img.vicinityBoost > 0) {
      labelBuckets['hero'].push(img);
      if (verbose) console.log(`🦸 Assigned to hero: ${img.url}`);
    }
  }

  return { all, byLabel: labelBuckets };
}

/**
 * Normalize URL by stripping size suffixes
 * @param {string} u - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(u) {
  // Strip known WP thumbnail suffix patterns like -150x150
  return u.replace(/-\d{2,4}x\d{2,4}(?=\.(png|jpe?g|webp)\b)/i, '');
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const extraUrls = [];
  const labels = [];
  let verbose = false;
  let gameTitle = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--extra' && i + 1 < args.length) {
      extraUrls.push(args[i + 1]);
      i++; // Skip next argument
    } else if (args[i] === '--labels' && i + 1 < args.length) {
      labels.push(...args[i + 1].split(',').map((l) => l.trim()));
      i++; // Skip next argument
    } else if (args[i] === '--title' && i + 1 < args.length) {
      gameTitle = args[i + 1];
      i++; // Skip next argument
    } else if (args[i] === '--verbose') {
      verbose = true;
    }
  }

  if (!gameTitle && extraUrls.length === 0) {
    console.log(
      'Usage: node harvest-images.js [--title "Game Name"] [--extra <url1>] [--extra <url2>] --labels "Label1,Label2" [--verbose]',
    );
    process.exit(1);
  }

  if (verbose) {
    console.log('🚀 Starting image harvest...');
    if (gameTitle) console.log(`🎮 Game Title: ${gameTitle}`);
    console.log(`🔗 URLs: ${extraUrls.join(', ')}`);
    console.log(`🏷️  Labels: ${labels.join(', ')}`);
  }

  harvestAllImages({ title: gameTitle, extraUrls, verbose })
    .then((results) => {
      console.log('\n🏁 Harvest complete!');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((error) => {
      console.error('💥 Harvest failed:', error);
      process.exit(1);
    });
}
