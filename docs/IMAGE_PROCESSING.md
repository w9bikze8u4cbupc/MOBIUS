# Image Processing and pHash Matching System

This system provides comprehensive image extraction, processing, and perceptual hashing capabilities for game component analysis and matching.

## Overview

The system implements a complete pipeline for:

1. **Image Extraction** - Extract images from PDFs using lossless methods
2. **Image Processing** - Create web derivatives and thumbnails
3. **Perceptual Hashing** - Generate and compare image fingerprints
4. **Component Matching** - Automatically assign images to game components
5. **Batch Processing** - Handle large collections efficiently

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PDF Input     │───▶│  Image Extraction │───▶│  Raw Images     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Components     │◀───│ Component Matching│◀───│ Image Processing│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Assignments   │    │ Perceptual Hash  │    │   Derivatives   │
└─────────────────┘    │    Database      │    │ • PNG Masters   │
                       └──────────────────┘    │ • JPEG Web      │
                                              │ • Thumbnails    │
                                              └─────────────────┘
```

## Core Modules

### 1. Image Extraction (`src/utils/imageExtraction.js`)

**Purpose**: Extract images from PDFs with multiple strategies

**Key Features**:
- Primary: lossless `pdfimages` (poppler-utils)
- Fallback: `pdftoppm` page rendering
- Automatic strategy selection
- Batch processing support
- Image validation and filtering

**Usage**:
```javascript
import { extractImagesFromPDF } from './utils/imageExtraction.js';

const result = await extractImagesFromPDF('rulebook.pdf', 'extracted/', 'auto');
console.log(`Extracted ${result.images.length} images using ${result.strategy}`);
```

### 2. Image Processing (`src/utils/imageProcessing.js`)

**Purpose**: Create standardized image derivatives

**Output Formats**:
- **Masters**: Lossless PNG preservation
- **Web**: 1920px progressive JPEG (quality ~90)
- **Thumbnails**: 300px square JPEG

**Usage**:
```javascript
import { processImageDerivatives } from './utils/imageProcessing.js';

const result = await processImageDerivatives('input.jpg', 'processed/');
// Creates: processed/masters/input_master.png
//          processed/web/input_web.jpg
//          processed/thumbnails/input_thumb.jpg
```

### 3. Perceptual Hashing (`src/utils/perceptualHashing.js`)

**Purpose**: Generate and compare image fingerprints

**Features**:
- pHash algorithm with 8x8 = 64-bit hashes
- Hamming distance similarity calculation
- Configurable similarity thresholds
- Hash database building and querying
- Duplicate detection

**Usage**:
```javascript
import { generatePHash, compareImages } from './utils/perceptualHashing.js';

// Generate hash
const hash = await generatePHash('image.jpg');

// Compare images
const comparison = await compareImages('image1.jpg', 'image2.jpg');
console.log(`Similarity: ${comparison.percentage}%`);
```

### 4. Match Runner (`src/utils/matchRunner.js`)

**Purpose**: Orchestrate complete workflows

**Workflows**:
- Complete pipeline (extraction → processing → hashing → matching)
- Basic workflow (simplified configuration)
- Batch workflow (multiple PDFs)

**Usage**:
```javascript
import { runCompleteWorkflow } from './utils/matchRunner.js';

const workflow = await runCompleteWorkflow({
  pdfPath: 'rulebook.pdf',
  outputDir: 'output/',
  components: [
    { name: 'Game Board', referenceImage: 'board.jpg' },
    { name: 'Cards', referenceImage: 'cards.jpg' }
  ],
  threshold: 0.90
});
```

## CLI Tools

### Bulk Processing Utility (`src/utils/bulk-phash.js`)

Command-line tool for batch operations:

```bash
# Extract images from PDFs
node src/utils/bulk-phash.js extract input.pdf -o extracted/

# Process images to create derivatives
node src/utils/bulk-phash.js process extracted/ -o processed/

# Build perceptual hash database
node src/utils/bulk-phash.js hash processed/ -o database.json

# Find similar images
node src/utils/bulk-phash.js match target.jpg processed/ -t 0.90

# Remove duplicates
node src/utils/bulk-phash.js dedupe processed/ -t 0.95 --dry-run
```

### NPM Scripts

```bash
# Individual operations
npm run phash:extract
npm run phash:process
npm run phash:hash
npm run phash:match
npm run phash:dedupe

# Testing
npm run test:phash
npm run test:processing
npm run test:integration
```

## Configuration

### Similarity Thresholds

- **Default**: 0.90 (90% similarity)
- **Strict**: 0.95 (95% similarity for deduplication)
- **Loose**: 0.85 (85% similarity for broader matching)

### Processing Settings

- **Web derivatives**: Max 1920px, progressive JPEG, quality 90
- **Thumbnails**: 300x300px square, JPEG, quality 75
- **Masters**: PNG with compression level 6
- **Concurrency**: Configurable (default 3 concurrent operations)

### Extraction Strategies

- **auto**: Try pdfimages, fallback to pdftoppm
- **pdfimages**: Use only poppler pdfimages (lossless)
- **pdftoppm**: Use only poppler pdftoppm (page rendering)

## API Integration

### Enhanced Extraction Endpoint

The system integrates with the existing API in `src/api/index.js`:

```javascript
// Enhanced image extraction with pHash matching
app.post('/extract-and-match', async (req, res) => {
  try {
    const { pdfPath, components, threshold = 0.90 } = req.body;
    
    // Run complete workflow
    const workflow = await runCompleteWorkflow({
      pdfPath,
      outputDir: 'uploads/processed',
      components,
      threshold,
      reportsDir: 'uploads/reports'
    });
    
    res.json({
      success: workflow.success,
      workflow,
      extractedImages: workflow.results.extraction?.imageCount || 0,
      processedImages: workflow.results.processing?.successful || 0,
      matchedComponents: workflow.results.matching?.successfulAssignments || 0
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Testing

### Validation Script

Run the validation script to verify all components:

```bash
node src/__tests__/validate.js
```

Expected output:
```
=== Testing Image Processing Utilities ===
Processing test image...
Processing result:
- Outputs: 3
- Errors: 0
  master: test_master.png (200x150)
  web: test_web.jpg (200x150)  
  thumbnail: test_thumb.jpg (300x300)

Testing perceptual hashing...
Generated hash: [64-bit hex hash]
Algorithm: phash

✅ All utilities working correctly!

=== Testing Bulk Utility ===
Building hash database...
Database created with 3/3 images

✅ Bulk utility working correctly!

🎉 All validation tests passed!
```

### Test Suites

- **Unit Tests**: Individual function testing
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Batch processing validation

## CI/CD Integration

### GitHub Actions

The system is integrated with CI/CD in `.github/workflows/ci.yml`:

```yaml
- name: Install poppler-utils (Ubuntu)
  if: runner.os == 'Linux'
  run: sudo apt-get update && sudo apt-get install -y poppler-utils

- name: Install poppler (macOS)  
  if: runner.os == 'macOS'
  run: brew install poppler

- name: Install poppler (Windows)
  if: runner.os == 'Windows'  
  run: choco install poppler --yes
```

### Artifact Generation

The workflow generates artifacts for validation:
- Processing reports
- Hash databases
- Matched component assignments
- Performance metrics

## Performance Characteristics

### Benchmarks

- **Image Processing**: ~2-5 seconds per image (depending on size)
- **pHash Generation**: ~100-500ms per image
- **Similarity Comparison**: <1ms per comparison
- **Batch Processing**: Scales linearly with configurable concurrency

### Memory Usage

- **Single Image**: ~50-100MB peak memory
- **Batch Processing**: Memory usage scales with concurrency setting
- **Hash Database**: ~1KB per image hash

## Error Handling

### Graceful Degradation

- Continue processing if individual images fail
- Fallback extraction strategies
- Partial workflow completion
- Detailed error reporting

### Common Issues

1. **Missing poppler-utils**: System falls back to alternative methods
2. **Corrupted images**: Skipped with warning, processing continues
3. **Memory constraints**: Configurable batch sizes and concurrency
4. **Network issues**: Local processing, no external dependencies

## Extensibility

### Optional CLIP Integration

The system includes hooks for optional CLIP embedding:

```javascript
// Future CLIP integration point
const clipEmbeddings = await generateCLIPEmbedding(imagePath); // opt-in
```

### Custom Algorithms

Easy to extend with additional hashing algorithms:

```javascript
// Add new algorithm support
const customHash = await generateHash(imagePath, 'dhash'); // future
```

## Production Deployment

### Requirements

- Node.js 18+
- poppler-utils (pdfimages, pdftoppm)
- Sufficient disk space for image derivatives
- Memory: 512MB+ recommended for batch processing

### Environment Setup

```bash
# Ubuntu/Debian
sudo apt-get install poppler-utils

# macOS  
brew install poppler

# Windows
choco install poppler
```

### Configuration

```javascript
// Production configuration
const PRODUCTION_CONFIG = {
  extraction: {
    strategy: 'auto',
    minImageSize: 2048,
    outputDir: '/data/extracted'
  },
  processing: {
    concurrency: 4,
    outputDir: '/data/processed',
    skipExisting: true
  },
  matching: {
    threshold: 0.92,
    buildDatabase: true,
    databasePath: '/data/phash-database.json'
  }
};
```

This completes the comprehensive image processing and pHash matching system implementation.