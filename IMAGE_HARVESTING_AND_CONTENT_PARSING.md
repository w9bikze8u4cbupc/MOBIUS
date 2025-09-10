# Image Harvesting and Enhanced Content Parsing

## Overview
This document describes the implementation of image harvesting from Extra URLs and enhanced content parsing for board game components.

## Features Implemented

### 1. Image Harvesting from Extra URLs

#### Capabilities
- Parse HTML content using Cheerio for robust DOM traversal
- Resolve relative URLs to absolute URLs
- Filter images by type (png/jpg/webp) and size (skip tiny icons)
- Prioritize images near "Components/Setup" sections with multilingual support
- Filter by alt/title text for component-related keywords
- Deduplicate images and prefer highest-resolution variants
- Support multiple Extra URLs per game with fallback mechanisms

#### Multilingual Section Detection
Supports section headers in multiple languages:
- English: Components, Contents, Setup, Material
- Spanish: Componentes
- German: Inhalt
- French: Composants
- Italian: Materiali

#### Image Filtering
- **Type filtering**: Only .png, .jpg, .jpeg, .webp files
- **Size filtering**: Minimum 120x120 pixels
- **Position filtering**: Prefer images near component sections
- **Content filtering**: Include images with component-related alt/title text
- **Exclusion filtering**: Skip logos, icons, sprites, social media images

#### Deduplication and Ranking
- Normalize URLs by stripping size suffixes (e.g., -150x150)
- Deduplicate by normalized URL
- Prefer images with higher vicinity boost or larger dimensions
- Rank images by relevance to canonical component labels

### 2. Enhanced Content Parsing

#### Multilingual Section Scoping
- Extended section detection to support multiple languages
- Improved fallback logic with confidence requirements
- Better end-of-section detection to avoid parsing rules text

#### OCR and Layout Resilience
- Enhanced OCR normalization for common confusions
- Smart quote/dash normalization
- Repeated word de-duplication
- Stray character normalization around counts

#### Breakdown Parsing and Validation
- Parse parenthetical details (e.g., "65 Allies & 6 Monsters")
- Handle multiplier formats (e.g., "2×4, 9×3, 9×2")
- Validate that subtype/multiplier sums match top-level counts
- Store breakdown information for downstream use

#### Verbose Triage and Debugging
- Standardized reason codes for all keep/drop decisions
- Dead-letter capture for excluded-but-suspicious lines
- Low-confidence fallback when section headers are missing
- Detailed logging for troubleshooting

## Files Created

1. `scripts/harvest-images.js` - Main image harvesting script
2. `test-hanamikoji-images.js` - Test script for Hanamikoji image harvesting
3. `test-hanamikoji-content.js` - Test script for Hanamikoji content parsing
4. `test-hanamikoji-complete.js` - Combined test for both features
5. `IMAGE_HARVESTING_AND_CONTENT_PARSING.md` - This documentation

## Enhanced Features in Existing Files

1. `src/api/utils.js` - Enhanced content parsing with:
   - Multilingual section detection
   - Improved OCR normalization
   - Breakdown parsing and validation
   - Better synonym coverage
   - Enhanced verbose logging

2. `package.json` - Added new test scripts:
   - `test:hanamikoji-images` - Test Hanamikoji image harvesting
   - `test:hanamikoji-content` - Test Hanamikoji content parsing
   - `harvest-images` - Run the image harvester directly

## Usage Examples

### Image Harvesting
```bash
# Harvest images for Hanamikoji
node scripts/harvest-images.js \
  --extra https://www.ultraboardgames.com/hanamikoji/game-rules.php \
  --labels "Game board,Geisha cards,Item cards,Action markers,Victory markers" \
  --verbose
```

### Content Parsing
```bash
# Parse components with verbose output
npm run extract:text -- fixtures/abyss.contents.txt --verbose
```

### Combined Testing
```bash
# Run complete test for Hanamikoji
node test-hanamikoji-complete.js
```

## Test Results

### Image Harvesting
- Successfully parses HTML content using Cheerio
- Resolves relative URLs to absolute URLs
- Filters images by type and size
- Prioritizes images near component sections
- Deduplicates and ranks images appropriately

### Content Parsing
- Correctly identifies multilingual section headers
- Extracts components with proper quantities
- Parses and validates breakdown sums
- Excludes reward/caption/instruction lines
- Provides detailed verbose logging with reason codes

## Benefits

1. **Robust Image Harvesting**: Reliable extraction of component images from web sources
2. **Multilingual Support**: Works with rulebooks in multiple languages
3. **OCR Resilience**: Handles common scanning artifacts and text recognition errors
4. **Enhanced Validation**: Ensures data consistency with breakdown sum validation
5. **Comprehensive Debugging**: Detailed logging for troubleshooting and optimization
6. **Scalable Architecture**: Easy to extend with new synonyms, languages, and filtering rules
7. **Fallback Mechanisms**: Graceful handling when preferred sources are unavailable

## Future Enhancements

1. **In-PDF Image Extraction**: Add fallback to extract images directly from PDFs
2. **Rate Limiting**: Implement per-domain rate limiting for image harvesting
3. **Caching**: Add caching mechanism for harvested images
4. **Retry Logic**: Implement retry with exponential backoff for failed requests
5. **Additional Sources**: Add support for BGG gallery pages and publisher press kits
6. **Image Quality Assessment**: Implement quality scoring for harvested images
7. **Golden Tests**: Create comprehensive test suite for image harvesting across multiple games

## Integration with Existing System

The new features integrate seamlessly with the existing component extraction system:
- Uses the same canonical component labels
- Shares synonym and normalization logic
- Extends the verbose logging approach
- Maintains backward compatibility
- Enhances the overall robustness of the tutorial generation pipeline