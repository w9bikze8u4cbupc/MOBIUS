# UBG Adapter Enhancements Summary

This document summarizes all the enhancements made to the UltraBoardGames (UBG) adapter to make it a first-class provider with robust features.

## 1. Provider Orchestration

- **Integrated UBG as a first-class provider** alongside embedded-PDF images and snapshot images
- **Assigned consistent source weights** to UBG images (0.85) for scoring normalization
- **Provider orchestration pattern** implemented with configurable weights

## 2. Perceptual Deduplication

- **Implemented average-hash (aHash)** for lightweight perceptual image deduplication
- **Hamming distance calculation** to identify near-duplicate images
- **Deduplication clustering** to avoid flooding UI with repeated component sheets
- **Uniqueness scoring** to boost distinct images in final results

## 3. Image Scoring Normalization

- **Unified scoring system** normalizing all provider scores into a single 0-1 band
- **Multiple scoring factors**:
  - Size/quality score (area × sharpness proxy)
  - Section proximity (distance from "Components" block)
  - Source/provider weight
  - Uniqueness bonus from deduplication
- **Tunable weights** for fine-tuning results

## 4. Game-Specific Guardrails

- **Game profile configuration system** with JSON files
- **Allowlists** for game-specific component terms
- **Expected counts** validation for explicitly listed components
- **Synonym overrides** for per-game terminology
- **Supply-only tagging** to exclude materials from components list

## 5. Enhanced Section Anchoring

- **Multilingual section header detection** (EN/FR/DE/ES/IT):
  - components, game components, contents, spielmaterial, contenu, componentes, componenti
  - matériel, composants, contenidos, materiale
- **Improved DOM traversal** to harvest nearby images first
- **Site chrome filtering** to ignore logos, ads, and other non-component images

## 6. Respectful Crawling + Caching

- **ETag/Last-Modified support** with caching mechanism
- **Local cache implementation** with gameSlug-based paths
- **7-day cache expiration** with revalidation
- **Global rate limiter** (1 req/s with burst=3)
- **Exponential backoff with jitter** on non-2xx responses
- **Randomized User-Agent pool** to reduce bot blocking

## 7. Golden Tests and Drift Detection

- **Golden test framework** for key UBG games (Abyss, Hanamikoji, Love Letter)
- **Drift detection system** that fails when:
  - Component sets change without updating allowlists
  - Count totals deviate from expectedCounts
  - Synonym maps collapse distinct nouns unexpectedly
- **Automated validation** of component parsing and image extraction

## 8. Observability Extensions

- **Per-provider counters and timing** metrics
- **Cache status tracking** (HIT/MISS/REVALIDATED)
- **Warning-level event logging** for:
  - Missing DOM components sections
  - Low image harvest counts from UBG
  - Missing allowlisted nouns in parsed components

## 9. Multilingual Coverage

- **Expanded multilingual section headers** for FR/DE/ES/IT
- **Extended synonym coverage** for international terms
- **Plural lemmatization** before synonym mapping

## 10. UI Confidence Indicators

- **Confidence scoring** blending:
  - Source mix
  - Noun normalization certainty
  - Proximity to components section
  - Repetition detection
  - Numeric consistency
- **Provider badges** for source transparency

## Files Modified/Added

### Core Implementation
- `src/sources/ultraBoardGames.js` - Enhanced with caching, rate limiting, and improved section anchoring
- `scripts/harvest-images.js` - Updated with provider orchestration and scoring normalization
- `src/utils/image-dedupe.js` - Perceptual deduplication utilities
- `src/utils/game-profiles.js` - Game profile management and validation

### Configuration Files
- `src/config/game-profiles/abyss.json` - Game-specific configuration
- `src/config/game-profiles/hanamikoji.json` - Game-specific configuration
- `src/config/game-profiles/love-letter.json` - Game-specific configuration

### Test Scripts
- `test-ubg-enhanced.js` - Comprehensive UBG pipeline testing
- `test-golden-ubg.js` - Golden tests with drift detection
- `test-caching.js` - Caching functionality validation

### Package Updates
- `package.json` - Added new test scripts

## Validation Results

All enhancements have been successfully validated:
- ✅ Provider orchestration working correctly
- ✅ Perceptual deduplication effectively collapsing duplicates
- ✅ Scoring normalization producing consistent results
- ✅ Game-specific guardrails properly applied
- ✅ Section anchoring working with multilingual headers
- ✅ Caching reducing subsequent request times
- ✅ Golden tests detecting potential drift
- ✅ Observability metrics being collected

## Next Steps

1. **Performance Optimization**: Further tune scoring weights based on user feedback
2. **Additional Game Profiles**: Expand to cover more games in the catalog
3. **UI Integration**: Surface confidence badges and provider information in the image picker
4. **Advanced Drift Detection**: Implement more sophisticated component analysis
5. **Monitoring Dashboard**: Create observability dashboard for provider metrics

The UBG adapter is now a robust, production-ready provider with comprehensive features for image harvesting, deduplication, and game-specific customization.