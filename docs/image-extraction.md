# Image Extraction System

This document covers the installation, usage, and troubleshooting for the image extraction and matching system.

## Overview

The image extraction system provides a complete pipeline for:
1. **Extracting images from PDFs** using poppler utilities (pdfimages/pdftoppm)
2. **Processing images** with normalization, trimming, and derivative generation
3. **Matching images** against a library using perceptual hashing (pHash)

## Installation

### System Dependencies

Install poppler utilities (required for PDF processing):

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y poppler-utils

# macOS with Homebrew  
brew install poppler

# CentOS/RHEL
sudo yum install -y poppler-utils
```

### Node.js Dependencies

Install the required Node.js packages:

```bash
npm install sharp image-hash node-fetch jimp
```

## Usage

### 1. Extract Images from PDF

```bash
node scripts/extract_images.js "path/to/rulebook.pdf" "output_directory"
```

**Example:**
```bash
node scripts/extract_images.js "Wingspan Rulebook.pdf" extracted_components
```

This will create:
- `extracted_components/masters/` - Lossless PNG masters
- `extracted_components/web/` - Web-optimized JPEG derivatives (max 1920px width)
- `extracted_components/images.json` - Metadata about extracted images

### 2. Process Images

```javascript
const { processImageComplete } = require('./src/utils/imageProcessing');

const result = await processImageComplete('input.png', 'output_dir', {
  normalize: true,      // Auto-rotate and normalize color space
  trim: true,          // Remove whitespace borders
  thumbnail: true,     // Generate 300x300 thumbnail
  webDerivative: true, // Generate web-optimized version
  thumbnailSize: 300,
  webMaxWidth: 1920,
  webQuality: 85
});
```

### 3. Match Images Against Library

First, create a library JSON file:

```json
{
  "items": [
    {
      "id": "game-001",
      "title": "Wingspan",
      "phash": "a1b2c3d4e5f6..."
    },
    {
      "id": "game-002", 
      "title": "Terraforming Mars",
      "phash": "f6e5d4c3b2a1..."
    }
  ]
}
```

Then run matching:

```javascript
const { matchImageToLibrary } = require('./src/utils/imageMatching');

const result = await matchImageToLibrary(imageData, libraryItems, {
  autoAssignThreshold: 0.90,  // Auto-assign if similarity >= 90%
  useEmbedding: false,        // Use only pHash for now
  phashWeight: 1.0,
  returnTopN: 5
});
```

### 4. Run End-to-End Tests

```bash
npm run images:test
```

This runs synthetic tests that validate the complete pipeline.

## Output Layout

### Extraction Output
```
extracted_components/
├── masters/           # Lossless PNG masters
│   ├── img-000.png
│   └── img-001.png
├── web/              # Web-optimized JPEG derivatives
│   ├── img-000.jpg
│   └── img-001.jpg
└── images.json       # Metadata file
```

### Processing Output
```
processed/
├── normalized/       # Auto-rotated, color-corrected images
├── trimmed/         # Whitespace-trimmed images
├── thumbnails/      # 300x300 thumbnails
└── web/            # Web derivatives
```

## Library Format

The library JSON format supports the following structure:

```json
{
  "created": "2024-01-01T00:00:00.000Z",
  "total_items": 2,
  "items": [
    {
      "id": "unique-id",
      "title": "Human-readable title",
      "phash": "perceptual-hash-string",
      "filename": "original-filename.jpg",
      "width": 800,
      "height": 600,
      "format": "jpeg"
    }
  ]
}
```

## Command Line Examples

### Quick Setup and Test
```bash
# Install dependencies
npm install sharp image-hash node-fetch jimp
sudo apt-get update && sudo apt-get install -y poppler-utils

# Extract images from a PDF
node scripts/extract_images.js "Wingspan Rulebook.pdf" extracted_components

# Run synthetic tests
npm run images:test

# Match all extracted images against a library
node scripts/match_all.js extracted_components
```

### Create Library from Directory
```javascript
const { buildLibraryFromDirectory } = require('./src/utils/imageMatching');

const library = await buildLibraryFromDirectory('path/to/images', 'library.json');
```

## Troubleshooting

### Common Issues

**1. "pdfimages not found" or "pdftoppm not found"**
- Install poppler-utils: `sudo apt-get install -y poppler-utils`
- Verify installation: `which pdfimages && which pdftoppm`

**2. "No images could be extracted from the PDF"**
- The PDF may not contain embedded images
- Try a different PDF or check if the PDF is corrupted
- Verify PDF can be opened in a standard PDF viewer

**3. "Failed to compute hash for image"**
- Check that the image file exists and is readable
- Verify the image format is supported (PNG, JPEG, etc.)
- Check file permissions

**4. Sharp installation issues**
- Run `npm rebuild sharp` to rebuild native dependencies
- On some systems: `npm install --platform=linux --arch=x64 sharp`

**5. Memory issues with large images**
- Reduce image resolution before processing
- Process images in smaller batches
- Increase Node.js memory limit: `node --max-old-space-size=4096`

### Debug Mode

Enable verbose logging by setting environment variable:
```bash
DEBUG=image-extraction node scripts/extract_images.js input.pdf output/
```

### Testing Different PDFs

**Test with small PDFs first (1-5 pages):**
- Empty PDF → Should gracefully handle with error message
- PDF with no embedded images → Should fallback to page rendering
- PDF with special characters in filename → Should handle properly

**Edge cases:**
- Very large PDFs (>100 pages) → May require memory optimization
- Password-protected PDFs → Currently not supported
- Corrupted PDFs → Should fail gracefully with error message

## Performance Notes

- **Extraction**: ~1-3 seconds per page for fallback rendering
- **Processing**: ~0.5-2 seconds per image depending on size
- **Matching**: ~0.1 seconds per image against 1000-item library
- **Memory**: ~50-200MB per 1920px image during processing

## Algorithm Details

### pHash (Perceptual Hash)
- Uses 16-bit hash by default (configurable)
- Resistant to minor changes (compression, scaling, color adjustments)
- Hamming distance used for similarity calculation
- Similarity score: 1.0 = identical, 0.0 = completely different

### Auto-Assignment Threshold
- Default: 0.90 (90% similarity)
- Adjustable based on your accuracy requirements
- Higher threshold = fewer false positives, more manual review needed
- Lower threshold = more automatic assignments, higher risk of errors

### Extraction Methods
1. **pdfimages**: Extracts embedded images directly (faster, better quality)
2. **pdftoppm**: Renders PDF pages as images (fallback, slower but works with any PDF)

## API Reference

See the individual module files for complete API documentation:
- `scripts/extract_images.js` - Image extraction from PDFs
- `src/utils/imageProcessing.js` - Image processing and normalization  
- `src/utils/imageMatching.js` - Perceptual hashing and matching