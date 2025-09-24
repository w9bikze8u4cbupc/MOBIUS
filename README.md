# Mobius Games Tutorial Generator

A comprehensive pipeline for generating game tutorial videos from structured game rules, featuring advanced image extraction and perceptual matching capabilities.

## Features

### Core Pipeline
- **PDF Image Extraction**: Lossless extraction using `pdfimages` with `pdftoppm` fallback
- **Sharp Processing Pipeline**: PNG masters (archival) + optimized JPEG derivatives
- **Perceptual Hash Matching**: blockhash-based pHash with configurable Hamming distance thresholds
- **Automatic Component Matching**: 0.90 default threshold with confidence scoring
- **Duplicate Detection**: Built-in deduplication using image similarity

### Processing Capabilities
- **Multi-format Support**: PNG masters (lossless), 1920px web JPEG, 300px thumbnails
- **Deterministic Matching**: Reproducible pHash calculations with canonical storage format
- **Low-confidence Review**: Automatic logging of candidates requiring manual review
- **Configurable Thresholds**: Per-component-type matching sensitivity

## Prerequisites

### System Requirements
- Node.js 18.0.0+ (20.x LTS recommended)
- NPM 8.0.0+

### Required Dependencies
- **Poppler Tools**: For PDF image extraction (`pdfimages`, `pdftoppm`)
- **Sharp/libvips**: For image processing pipeline
- **FFmpeg**: For video processing (optional)

#### Installation

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install poppler-utils libvips-dev
```

**macOS:**
```bash
brew install poppler vips
```

**Windows:**
```powershell
choco install poppler
```

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for detailed installation instructions.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Verify installation:**
   ```bash
   npm test
   pdfimages -v
   pdftoppm -v
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

## API Reference

### Image Processing Endpoints

#### Extract and Process Images
```http
POST /api/extract-and-process-images
Content-Type: application/json

{
  "pdfPath": "/path/to/document.pdf",
  "projectId": "my-project"
}
```

**Response:**
```json
{
  "success": true, 
  "message": "Successfully processed 5 images",
  "extraction": {
    "method": "pdfimages", // or "pdftoppm" 
    "stats": {
      "extractedCount": 5,
      "fallbackUsed": false
    }
  },
  "processing": {
    "processed": [
      {
        "master": "/path/to/master.png",
        "web": "/path/to/web.jpg", 
        "thumb": "/path/to/thumb.jpg",
        "phash": {
          "hex": "a1b2c3d4e5f67890",
          "base64": "obLD1OX2eJA=", 
          "bits": 64,
          "algorithm": "blockhash",
          "version": "1.0"
        }
      }
    ]
  }
}
```

#### Match Images with pHash
```http
POST /api/match-images-phash
Content-Type: application/json

{
  "componentImages": [...],
  "libraryImages": [...], 
  "threshold": 0.90,
  "projectId": "my-project"
}
```

#### Compare Two Images
```http
POST /api/compare-images
Content-Type: application/json

{
  "image1Path": "/path/to/image1.jpg",
  "image2Path": "/path/to/image2.jpg"  
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONF_AUTO_ASSIGN_THRESHOLD` | 0.90 | pHash matching threshold (0.80-0.95) |
| `WEB_WIDTH` | 1920 | Web image width in pixels |
| `THUMB_SIZE` | 300 | Thumbnail size in pixels |
| `CONCURRENCY` | 4 | Processing concurrency limit |

### Image Processing Pipeline

- **Masters**: PNG format, compression level 9 (archival quality)
- **Web**: Progressive JPEG, 85% quality, max 1920px width
- **Thumbnails**: JPEG, 75% quality, 300x300px max
- **pHash**: 64-bit blockhash with hex + base64 storage

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test suite
npm test -- --testNamePattern="pHash"
```

### Test Coverage
- **pHash boundary cases**: Identical, 1-bit diff, maximum difference
- **Rotated/cropped variants**: Small hash differences
- **Configurable thresholds**: High/low confidence scenarios
- **Error handling**: Invalid inputs, missing data

## Architecture

### Processing Flow
1. **PDF → Images**: `pdfimages` (lossless) → `pdftoppm` (fallback)
2. **Image Pipeline**: Sharp processing → PNG/JPEG variants
3. **pHash Calculation**: blockhash → 64-bit hex representation
4. **Matching**: Hamming distance → confidence scoring
5. **Auto-assignment**: Threshold-based → manual review queue

### Storage Format
```json
{
  "phash": {
    "hex": "a1b2c3d4e5f67890",
    "base64": "obLD1OX2eJA=", 
    "bits": 64,
    "algorithm": "blockhash",
    "version": "1.0"
  },
  "metadata": {
    "originalDPI": 300,
    "extractionMethod": "pdfimages",
    "processingTimestamp": "2024-01-01T00:00:00Z"
  }
}
```

## Security & Privacy

- **Local Processing**: No external cloud calls by default
- **Sandboxed PDF Processing**: Isolated extraction environment  
- **Secure File Handling**: Temporary file cleanup
- **Audit Trail**: All processing steps logged

## Performance

### Optimization Guidelines
- **Concurrency**: Adjust `CONCURRENCY` based on CPU cores
- **Memory**: Use `--max-old-space-size=4096` for large batches
- **Storage**: SSD recommended for temporary files
- **Batch Size**: Process images in groups of 50-100

### Benchmarks
- **Extraction Speed**: ~2-5 seconds per PDF page
- **Processing Pipeline**: ~500ms per image (PNG+JPEG+thumb)
- **pHash Calculation**: ~50ms per image
- **Memory Usage**: ~100-200MB per concurrent job

## Troubleshooting

Common issues and solutions are documented in [docs/OPERATIONS.md](docs/OPERATIONS.md).

Quick diagnostics:
```bash
# Check system dependencies
curl http://localhost:5001/api/processing-config

# Verify Poppler installation
pdfimages -v && pdftoppm -v

# Test image processing
npm test -- --testNamePattern="imageProcessing"
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Dependencies

### Core Dependencies
- **Sharp** (Apache-2.0): High-performance image processing
- **Jimp** (MIT): JavaScript image manipulation
- **blockhash-core** (MIT): Perceptual hashing algorithm
- **hamming-distance** (MIT): Bit difference calculation

All dependencies are MIT/Apache-2.0 compatible.

For detailed operations guide, see [docs/OPERATIONS.md](docs/OPERATIONS.md).