# Mobius Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules, including advanced image extraction and matching capabilities.

## Features

- **Image Extraction**: Extract images from PDF rulebooks using poppler utilities
- **Image Processing**: Normalize, trim, and generate thumbnails and web derivatives
- **Image Matching**: Match extracted images against a library using perceptual hashing (pHash)
- **Video Generation**: Generate tutorial videos from game rules
- **Multi-language Support**: Support for multiple languages

## Quick Start - Image Extraction System

### Install Dependencies

```bash
# Node.js dependencies
npm install

# System dependencies (Ubuntu/Debian)
sudo apt-get update && sudo apt-get install -y poppler-utils
```

### Extract Images from PDF

```bash
node scripts/extract_images.js "Wingspan Rulebook.pdf" extracted_components
```

### Run Tests

```bash
npm run images:test
```

### Match Images Against Library

```bash
# Create library.json with your game library
node scripts/match_all.js extracted_components library.json
```

## Documentation

- **[Image Extraction Guide](docs/image-extraction.md)** - Complete guide for the image extraction and matching system
- Installation, usage, troubleshooting, and API reference

## Commands

| Command | Description |
|---------|-------------|
| `npm run images:test` | Run synthetic end-to-end tests for image system |
| `node scripts/extract_images.js <pdf> <output>` | Extract images from PDF |
| `node scripts/match_all.js <dir> <library>` | Match extracted images against library |

## License

MIT