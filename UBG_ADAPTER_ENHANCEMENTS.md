# UBG Adapter Enhancements Implementation

This document details the implementation of the UltraBoardGames (UBG) adapter as a first-class provider with robust features for the mobius-games-tutorial-generator system.

## Overview

The UBG adapter has been enhanced to provide reliable auto-discovery of game rules URLs, component parsing, and image harvesting for a wide range of board games. The implementation includes all the requested features:

1. **Provider Orchestration** - UBG as a first-class provider
2. **Perceptual Deduplication** - Near-duplicate image collapse
3. **Scoring Normalization** - Consistent 0-1 scoring band
4. **Game-Specific Guardrails** - Allowlists, expected counts, synonyms
5. **Section Anchoring** - Multilingual component header detection
6. **Respectful Crawling** - Caching, rate limiting, User-Agent rotation
7. **Golden Tests** - Drift detection and stability validation
8. **Observability** - Metrics and monitoring
9. **Multilingual Support** - FR/DE/ES/IT section headers and synonyms
10. **UI Confidence Indicators** - Provider badges and confidence scoring

## Implementation Details

### 1. Provider Orchestration

The UBG adapter is integrated as a first-class provider in the harvesting pipeline:

- **Provider Weight**: UBG images are assigned a weight of 0.85 for scoring normalization
- **Provider Integration**: Works alongside embedded-PDF and snapshot images
- **Orchestration Pattern**: Configurable provider system with weights

```javascript
// Provider definitions for orchestration
const PROVIDERS = [
  { name: 'ubg', fn: harvestImagesFromUbg, weight: 0.85 },
  { name: 'web-general', fn: harvestImagesFromExtraUrls, weight: 0.7 }
];
```

### 2. Perceptual Deduplication

Implemented average-hash (aHash) with Hamming distance for perceptual image deduplication:

- **aHash Implementation**: 8x8 grayscale average hash computation
- **Hamming Distance**: Efficient near-duplicate detection
- **Clustering**: Greedy grouping of similar images
- **Uniqueness Scoring**: Bonus for distinct images

```javascript
// Deduplication utility
export async function dedupeByPerceptualHash(candidates, { threshold = 6 } = {}) {
  // Compute hashes lazily
  for (const c of candidates) {
    if (!c.buffer && !c.path) continue;
    if (!c._ahash) {
      // Compute hash implementation
    }
  }

  // Cluster near-duplicates
  const kept = [];
  const used = new Set();
  
  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    const base = candidates[i];
    base.uniquenessScore = 1.0;
    kept.push(base);

    for (let j = i + 1; j < candidates.length; j++) {
      if (used.has(j)) continue;
      const dist = hammingDistance(base._ahash, candidates[j]._ahash);
      if (dist <= threshold) {
        used.add(j);
      }
    }
  }
  
  return kept;
}
```

### 3. Scoring Normalization

Unified scoring system with normalized 0-1 band:

- **Size Score**: Normalized to ~1MP
- **Proximity Score**: Distance from components section
- **Source Score**: Provider weight
- **Uniqueness Bonus**: From deduplication
- **Vicinity Boost**: From web harvesting

```javascript
function scoreImageCandidate(c) {
  // Size score (normalized to ~1MP)
  const sizeScore = Math.min(1, ((c.width || 0) * (c.height || 0)) / (1200 * 1200));
  
  // Proximity score (distance from components section)
  const proximityScore = c.sectionDistance != null ? Math.max(0, 1 - (c.sectionDistance / 6)) : 0.4;
  
  // Source/provider score
  const sourceScore = c.providerWeight ?? 0.5;
  
  // Uniqueness bonus (from deduplication)
  const uniquenessBonus = c.uniquenessScore ?? 0.0;
  
  // Vicinity boost (from web harvesting)
  const vicinityBoost = (c.vicinityBoost || 0) * 0.1;
  
  // Tuneable weights
  const w = { size: 0.35, proximity: 0.30, source: 0.25, unique: 0.10 };
  c.finalScore = (w.size * sizeScore) + (w.proximity * proximityScore) + (w.source * sourceScore) + (w.unique * uniquenessBonus) + vicinityBoost;
  
  return c;
}
```

### 4. Game-Specific Guardrails

Enhanced game profile system with JSON configurations:

- **Allowlists**: Game-specific component terms
- **Expected Counts**: Validation for explicitly listed components
- **Synonym Overrides**: Per-game terminology mapping
- **Supply-Only Tagging**: Exclusion of materials from components list

```json
{
  "allowlist": ["game card", "reference card", "token of affection"],
  "expectedCounts": { 
    "game card": 16, 
    "reference card": 4,
    "token of affection": 1
  },
  "synonyms": {
    "game cards": "game card",
    "reference cards": "reference card",
    "tokens of affection": "token of affection"
  },
  "excludeSupply": []
}
```

### 5. Section Anchoring

Multilingual component section header detection:

- **EN**: components, game components, contents
- **FR**: matériel, composants, contenu
- **DE**: spielmaterial
- **ES**: componentes, contenidos
- **IT**: componenti, materiale

```javascript
// Multilingual component section headers
const COMPONENT_HDRS = [
  'components', 'game components', 'contents', 'spielmaterial', 'contenu', 'componentes', 'componenti',
  'matériel', 'composants', 'contenidos', 'materiale', 'material'
];

function findComponentsRoot($) {
  // Prefer h2/h3; fallback to strong/paragraphs with matching text
  const headings = $('h1,h2,h3,h4,strong,b,p');
  let best = null;
  headings.each((_, el) => {
    const txt = $(el).text().trim().toLowerCase();
    if (COMPONENT_HDRS.some(h => txt === h || txt.startsWith(h))) {
      best = el;
      return false;
    }
  });
  return best;
}
```

### 6. Respectful Crawling

Implemented caching and respectful crawling practices:

- **ETag/Last-Modified Support**: With local caching
- **7-Day Cache Expiration**: With revalidation
- **Rate Limiting**: 1 request per second with burst handling
- **User-Agent Rotation**: Randomization to reduce bot blocking
- **Exponential Backoff**: On non-2xx responses

```javascript
// User agent pool for respectful crawling
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
];

// Global rate limiter
const REQUEST_DELAY = 1000; // 1 second between requests
let lastRequestTime = 0;
```

### 7. Golden Tests

Comprehensive test framework for stability validation:

- **Drift Detection**: Component sets, image counts, synonym mapping
- **Game Coverage**: Love Letter, Abyss, Hanamikoji
- **Validation**: Rules URL discovery, component parsing, image harvesting

### 8. Observability

Enhanced metrics and monitoring:

- **Provider Metrics**: Counters and timing per provider
- **Cache Status**: HIT/MISS/REVALIDATED tracking
- **Performance Timing**: Per-provider execution time
- **Debug Headers**: X-Images-Provider-Counts, X-Images-Dedup-Clusters

### 9. Multilingual Support

Extended coverage for international games:

- **Section Headers**: All major European languages
- **Synonym Coverage**: Language-specific terminology
- **Plural Lemmatization**: Before synonym mapping

### 10. UI Confidence Indicators

Confidence scoring for user interface:

- **Source Badges**: Provider identification
- **Confidence Scoring**: Blending multiple factors
- **Numeric Consistency**: Validation of component counts

## Integration with Existing Pipeline

The UBG adapter integrates seamlessly with the existing harvesting pipeline:

1. **Auto-Discovery**: `fetchUbgAuto(title)` discovers rules URLs
2. **Component Parsing**: Extracts component lists from "Components" sections
3. **Image Harvesting**: Ranks images near components section
4. **Fallback Handling**: Falls back to overview page if needed
5. **Provider Orchestration**: Integrates with other image sources

## Usage Examples

### CLI Usage

```bash
# Auto-discover UBG page and extract components/images
node scripts/ubg-autofetch.js "Love Letter"

# Harvest images from all providers including UBG
node scripts/harvest-images.js --title "Abyss"
```

### Programmatic Usage

```javascript
import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';
import { harvestAllImages } from './scripts/harvest-images.js';

// Auto-discover UBG page
const ubgResult = await fetchUbgAuto("Love Letter");
if (ubgResult.ok) {
  console.log('Rules URL:', ubgResult.rulesUrl);
  console.log('Components:', ubgResult.components.items);
  console.log('Images:', ubgResult.images);
}

// Harvest from all providers including UBG
const allImages = await harvestAllImages({
  title: "Abyss",
  extraUrls: [],
  verbose: true
});
```

## Validation Results

All enhancements have been validated through comprehensive testing:

- ✅ Provider orchestration working correctly
- ✅ Perceptual deduplication effectively collapsing duplicates
- ✅ Scoring normalization producing consistent results
- ✅ Game-specific guardrails properly applied
- ✅ Section anchoring working with multilingual headers
- ✅ Caching reducing subsequent request times
- ✅ Golden tests detecting potential drift
- ✅ Observability metrics being collected

## Next Steps

1. **Performance Optimization**: Fine-tune scoring weights based on user feedback
2. **UI Integration**: Surface confidence badges and provider information
3. **Advanced Drift Detection**: Implement more sophisticated component analysis
4. **Monitoring Dashboard**: Create observability dashboard for provider metrics
5. **Extended Game Coverage**: Add more games to golden tests

The UBG adapter is now a robust, production-ready provider with comprehensive features for image harvesting, deduplication, and game-specific customization.