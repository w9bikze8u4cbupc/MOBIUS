# Mobius Games Tutorial Generator

A comprehensive pipeline for generating game tutorial videos from structured game rules, featuring advanced image processing and perceptual hashing capabilities.

## Features

### Core Functionality
- PDF text extraction and component identification
- AI-powered content summarization and tutorial generation
- Multi-language support for tutorial content
- Text-to-speech integration with ElevenLabs

### 🆕 Image Processing & Matching System
- **Lossless image extraction** from PDFs using poppler-utils (pdfimages)
- **Perceptual hashing (pHash)** for image similarity detection
- **Automated component matching** with configurable similarity thresholds
- **Multi-format support**: PNG masters, JPEG web derivatives, square thumbnails
- **Batch processing** with CLI tools for large-scale operations
- **Cross-platform CI/CD** support with GitHub Actions

## Quick Start

### Prerequisites
```bash
# Install poppler-utils for PDF image extraction
# Ubuntu/Debian:
sudo apt-get install poppler-utils

# macOS:
brew install poppler

# Windows:
choco install poppler
```

### Installation
```bash
npm install
cd client && npm install
```

### Development
```bash
# Start the backend server
npm run start

# Start the frontend (in another terminal)
cd client && npm start
```

## Image Processing API

### New Endpoints

#### Enhanced Extraction and Matching
```http
POST /extract-and-match
Content-Type: application/json

{
  "pdfPath": "path/to/rulebook.pdf",
  "components": [
    {"name": "Game Board", "referenceImage": "board.jpg"},
    {"name": "Cards", "referenceImage": "cards.jpg"}
  ],
  "threshold": 0.90,
  "strategy": "auto"
}
```

#### Generate Perceptual Hash
```http
POST /generate-phash
Content-Type: multipart/form-data

image: [image file]
```

#### Find Similar Images
```http
POST /find-similar
Content-Type: multipart/form-data

target: [image file]
threshold: 0.90
candidateDir: "uploads/processed/web"
```

#### Build Hash Database
```http
POST /build-hash-database
Content-Type: application/json

{
  "imageDir": "uploads/processed/web",
  "outputPath": "hash-database.json"
}
```

#### Quick Image Processing
```http
POST /process-image
Content-Type: multipart/form-data

image: [image file]
```

## CLI Tools

### Bulk Processing Utility

```bash
# Extract images from PDF
npm run phash:extract input.pdf -o extracted/

# Process images to create derivatives
npm run phash:process extracted/ -o processed/

# Build perceptual hash database
npm run phash:hash processed/ -o database.json

# Find similar images
npm run phash:match target.jpg processed/ -t 0.90

# Remove duplicates
npm run phash:dedupe processed/ -t 0.95
```

## Testing

### Validation Script
```bash
# Test all image processing utilities
node src/__tests__/validate.js
```

## Architecture

### Image Processing Pipeline
```
PDF Input → Image Extraction → Image Processing → Perceptual Hashing → Component Matching
```

### Key Components
- **Image Extraction**: Lossless PDF image extraction with fallback strategies
- **Image Processing**: Multi-format derivative generation with Sharp
- **Perceptual Hashing**: pHash + Hamming distance for similarity detection
- **Match Runner**: Automated workflow orchestration
- **Bulk Utilities**: CLI tools for batch processing

## Performance

- **Image Processing**: 2-5 seconds per image
- **pHash Generation**: 100-500ms per image
- **Similarity Comparison**: <1ms per comparison
- **Batch Processing**: Scales with configurable concurrency

## License

MIT
