#!/usr/bin/env node

import { harvestAllImages } from './scripts/harvest-images.js';

// Golden corpus games - expanded set for better calibration
const GOLDEN_GAMES = [
  { slug: 'love-letter', title: 'Love Letter' },
  { slug: 'hanamikoji', title: 'Hanamikoji' },
  { slug: 'abyss', title: 'Abyss' },
  { slug: 'azul', title: 'Azul' },
  { slug: 'ticket-to-ride', title: 'Ticket to Ride' },
  { slug: 'splendor', title: 'Splendor' },
  { slug: '7-wonders', title: '7 Wonders' },
  { slug: 'codenames', title: 'Codenames' },
];

// Simple heuristic to determine if an image is positive (relevant)
// In a real implementation, this would be based on manual labeling
function isPositiveImage(img, gameSlug) {
  // For now, we'll use a simple heuristic based on the URL and alt text
  const url = img.url.toLowerCase();
  const alt = (img.alt || '').toLowerCase();

  // Positive indicators
  const positiveKeywords = [
    'card',
    'token',
    'board',
    'component',
    'setup',
    gameSlug, // game-specific terms
  ];

  // Negative indicators (site chrome, logos, etc.)
  const negativeKeywords = [
    'logo',
    'icon',
    'banner',
    'advertisement',
    'social',
    'footer',
    'header',
    'menu',
    'nav',
  ];

  // Check for negative indicators first
  if (negativeKeywords.some((keyword) => url.includes(keyword) || alt.includes(keyword))) {
    return false;
  }

  // Check for positive indicators
  if (positiveKeywords.some((keyword) => url.includes(keyword) || alt.includes(keyword))) {
    return true;
  }

  // For UBG provider, images near components section are more likely positive
  if (img.provider === 'ubg' && img.sectionDistance !== undefined && img.sectionDistance < 3) {
    return true;
  }

  // Default to false for now
  return false;
}

async function dumpFeatures() {
  // Use console.error for progress messages to keep stdout clean for JSON output
  console.error('Generating feature dump for golden corpus...');

  for (const game of GOLDEN_GAMES) {
    try {
      console.error(`Processing ${game.title}...`);

      const result = await harvestAllImages({
        title: game.title,
        verbose: false,
      });

      console.error(`Got ${result.images.length} images for ${game.title}`);

      // Process each image to extract features
      for (const img of result.images) {
        // Extract features
        const features = {
          slug: game.slug,
          label: img.alt || img.url.split('/').pop() || 'unknown',
          size: img.scores?.sizeScore || 0,
          proximity: img.scores?.proximityScore || 0,
          providerWeight: img.providerWeight || 0,
          focus: img.scores?.focusScore || 0,
          uniqueness: img.uniquenessScore || 0,
          width: img.width || img.w || 0,
          height: img.height || img.h || 0,
          sectionDistance: img.sectionDistance,
          isPositive: isPositiveImage(img, game.slug) ? 1 : 0,
        };

        // Output to stdout as JSON lines
        console.log(JSON.stringify(features));
      }
    } catch (error) {
      console.error(`Error processing ${game.title}:`, error.message);
    }
  }

  console.error('Feature dump completed');
}

// If run directly, output to stdout
dumpFeatures().catch(console.error);
