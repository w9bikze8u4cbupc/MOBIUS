# Enhanced Image Extraction and Matching System

## Overview

This document describes the enhanced image extraction and matching system that provides robust image extraction with metadata preservation, quality improvements, and automated matching capabilities.

## Features

### Core Extraction Pipeline
- **Multi-format Support**: Handles PDFs and URLs with automatic fallback
- **Robust Extraction**: Prefers poppler/pdfimages with PyMuPDF fallback
- **Metadata Preservation**: Captures page numbers, DPI, dimensions, hashes, and more
- **Standardized Output**: PNG primary format with JPEG/WEBP derivatives
- **Thumbnail Generation**: Multiple sizes for web use

### Image Processing
- **Auto-cropping**: Removes white/background margins intelligently
- **Contrast Enhancement**: Automatic brightness and contrast normalization
- **Deskewing**: Detects and corrects image skew (requires OpenCV)
- **Quality Metrics**: Analyzes brightness, contrast, and other quality indicators
- **Batch Processing**: Efficient processing of multiple images

### Matching Automation
- **Perceptual Hashing**: Fast similarity detection using pHash/aHash algorithms
- **Confidence Scoring**: High/Medium/Low confidence levels with thresholds
- **Match Reports**: Detailed JSON reports with recommendations
- **Approval Queue**: Low-confidence matches flagged for manual review

## API Endpoints

### Enhanced Image Extraction
```
POST /api/extract-images-enhanced
```

**Request Body:**
```json
{
  "source": "path/to/file.pdf" | "https://example.com/page",
  "options": {
    "preferPoppler": true,
    "dpi": 150,
    "format": "png",
    "generateThumbnails": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "method": "poppler|pdf-to-img",
    "images": [
      {
        "path": "/extracted/page-1.png",
        "pageNumber": 1,
        "width": 1200,
        "height": 800,
        "dpi": 150,
        "format": "png",
        "size": 245760,
        "hash": "abc123...",
        "derivatives": [...],
        "extractionMethod": "poppler"
      }
    ],
    "metadata": {
      "sourcePath": "input.pdf",
      "extractionTime": "2024-01-01T12:00:00Z",
      "totalPages": 10
    }
  },
  "enhanced": true
}
```

### CLI Usage

The system includes a comprehensive CLI for local testing and automation:

```bash
# Basic extraction
node scripts/extract-images.js input.pdf ./output

# Full pipeline with processing and matching
node scripts/extract-images.js input.pdf ./output \
  --mode all \
  --library ./game-library \
  --process \
  --match

# Extract from URL
node scripts/extract-images.js https://example.com/page ./output \
  --api-key YOUR_API_KEY
```

## Testing

Run the unit tests:

```bash
npm test
```

## Integration

The enhanced system integrates seamlessly with the existing API through backward-compatible endpoints and enhanced functionality.