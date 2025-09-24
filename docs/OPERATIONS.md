# Operations Guide

This document provides installation, configuration, and troubleshooting information for the Mobius Games Tutorial Generator image processing pipeline.

## Prerequisites

### Required Software

#### Node.js
- **Minimum Version**: Node.js 18.0.0+
- **Recommended**: Node.js 20.x LTS
- **NPM**: 8.0.0+

Check your version:
```bash
node --version
npm --version
```

#### Poppler Tools (Required)

The image extraction pipeline requires Poppler tools for PDF processing.

##### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install poppler-utils
```

##### macOS
Using Homebrew:
```bash
brew install poppler
```

Using MacPorts:
```bash
sudo port install poppler
```

##### Windows
1. **Using Chocolatey** (Recommended):
   ```powershell
   choco install poppler
   ```

2. **Manual Installation**:
   - Download from: https://github.com/oschwartz10612/poppler-windows/releases/
   - Extract to `C:\Program Files\poppler`
   - Add `C:\Program Files\poppler\Library\bin` to your PATH

3. **Using Scoop**:
   ```powershell
   scoop install poppler
   ```

##### Verify Installation
```bash
pdfimages -v
pdftoppm -v
```

### Optional Dependencies

#### FFmpeg (for video processing)
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
choco install ffmpeg
```

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the project root:

```env
# API Configuration
PORT=5001
OPENAI_API_KEY=your_openai_api_key_here

# Image Processing Configuration
CONF_AUTO_ASSIGN_THRESHOLD=0.90
WEB_WIDTH=1920
THUMB_SIZE=300
CONCURRENCY=4

# Optional: Image Extractor API
IMAGE_EXTRACTOR_API_KEY=your_api_key_here
```

### Recommended Configuration Values

| Variable | Default | Description | Recommended Range |
|----------|---------|-------------|-------------------|
| `CONF_AUTO_ASSIGN_THRESHOLD` | 0.90 | pHash matching threshold | 0.80 - 0.95 |
| `WEB_WIDTH` | 1920 | Web image width (px) | 1280 - 2560 |
| `THUMB_SIZE` | 300 | Thumbnail size (px) | 200 - 400 |
| `CONCURRENCY` | 4 | Processing concurrency | 2 - 8 |

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd mobius-games-tutorial-generator
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Poppler** (see Prerequisites above)

4. **Configure environment** (see Environment Configuration above)

5. **Verify installation**:
   ```bash
   npm run test
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
  "projectId": "optional-project-id"
}
```

**Response Format**:
```json
{
  "success": true,
  "message": "Successfully processed 5 images",
  "extraction": {
    "method": "pdfimages",
    "stats": {
      "extractedCount": 5,
      "processingErrors": 0,
      "fallbackUsed": false
    }
  },
  "processing": {
    "processed": [
      {
        "original": { ... },
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
    ],
    "errors": []
  }
}
```

#### Match Images with pHash
```http
POST /api/match-images-phash
Content-Type: application/json

{
  "componentImages": [/* array of images with phash */],
  "libraryImages": [/* array of library images with phash */],
  "threshold": 0.90,
  "projectId": "optional-project-id"
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

#### Get Configuration
```http
GET /api/processing-config
```

### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `missing_pdf_path` | PDF path not provided |
| 400 | `missing_images` | Image arrays not provided |
| 404 | `pdf_not_found` | PDF file not found |
| 500 | `extraction_failed` | PDF image extraction failed |
| 500 | `processing_failed` | Image processing pipeline failed |
| 500 | `phash_failed` | pHash calculation failed |

## Troubleshooting

### Common Issues

#### 1. "pdfimages: command not found"

**Cause**: Poppler tools not installed or not in PATH.

**Solution**:
- Install Poppler (see Prerequisites)
- Verify installation: `which pdfimages`
- On Windows, ensure PATH includes Poppler bin directory

#### 2. "Sharp build errors" / "libvips not found"

**Cause**: Native Sharp dependencies not properly built.

**Solutions**:
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Force Sharp rebuild
npm rebuild sharp

# On Linux, install libvips
sudo apt-get install libvips-dev

# On macOS
brew install vips
```

#### 3. "Canvas build errors"

**Cause**: Native Canvas dependencies missing.

**Solutions**:
```bash
# Ubuntu/Debian
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# macOS
brew install pkg-config cairo pango libpng jpeg giflib librsvg

# Windows - install windows-build-tools
npm install --global windows-build-tools
```

#### 4. "ENOSPC: no space left on device"

**Cause**: Insufficient disk space or inode limit.

**Solutions**:
- Free up disk space
- Clean up temporary files: `rm -rf uploads/tmp/*`
- Increase processing concurrency limit

#### 5. "Memory allocation failed"

**Cause**: Insufficient memory for large image processing.

**Solutions**:
- Reduce `CONCURRENCY` environment variable
- Reduce `WEB_WIDTH` for smaller output images
- Process images in smaller batches
- Increase Node.js memory limit: `node --max-old-space-size=4096`

#### 6. "PDF parsing errors"

**Cause**: Corrupted or encrypted PDF files.

**Solutions**:
- Verify PDF is not corrupted: `pdfinfo document.pdf`
- For encrypted PDFs, decrypt first
- Try alternative extraction method (pdftoppm fallback)

### Performance Optimization

#### Memory Usage
```bash
# Monitor memory usage
node --inspect --max-old-space-size=4096 src/api/index.js

# Profile memory leaks
node --inspect --expose-gc src/api/index.js
```

#### Processing Speed
- Adjust `CONCURRENCY` based on CPU cores
- Use SSD storage for temporary files
- Optimize image dimensions (`WEB_WIDTH`, `THUMB_SIZE`)

### Logging and Debugging

#### Enable Debug Logging
```bash
export DEBUG=sharp,jimp,blockhash
npm start
```

#### Log Files
- Application logs: `logs/app.log`
- Error logs: `logs/error.log`
- Review candidates: `uploads/review/`

## Security Considerations

### Dependency Security
```bash
# Run security audit
npm audit

# Fix vulnerabilities
npm audit fix
```

### File System Security
- Uploaded files are stored in `uploads/` directory
- Temporary files are cleaned up automatically
- PDF processing runs in sandboxed environment

### API Security
- No external cloud calls by default
- All processing happens locally
- Embedding service (when enabled) runs locally

## License Compatibility

### Included Dependencies

| Package | License | Compatibility |
|---------|---------|---------------|
| Sharp | Apache-2.0 | ✅ Compatible |
| Jimp | MIT | ✅ Compatible |
| blockhash-core | MIT | ✅ Compatible |
| hamming-distance | MIT | ✅ Compatible |
| Poppler | GPL-3.0 | ✅ External tool |

All included dependencies are compatible with MIT license.

## Monitoring and Maintenance

### Health Checks
```bash
# Check system dependencies
curl http://localhost:5001/api/processing-config

# Test PDF processing
curl -X POST http://localhost:5001/api/extract-and-process-images \
  -H "Content-Type: application/json" \
  -d '{"pdfPath": "test.pdf"}'
```

### Regular Maintenance
- Clean temporary files weekly: `rm -rf uploads/tmp/*`
- Monitor disk usage in `uploads/` directory
- Review low-confidence matches in `uploads/review/`
- Update dependencies monthly: `npm update`

### Backup Recommendations
- Backup `uploads/processed/` for processed images
- Backup `uploads/review/` for manual review logs
- Backup project database files