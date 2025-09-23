# PDF Image Extraction and Perceptual Matching

A complete Node.js system for extracting images from PDFs, processing them for video production workflows, and matching them to game libraries using perceptual hashing.

## Features

### 📄 PDF Image Extraction
- **Dual extraction methods**: Prefers `pdfimages` (Poppler) for lossless extraction, falls back to `pdftoppm` for page rendering
- **Structured metadata**: Outputs detailed `images.json` with image dimensions, DPI, bounding boxes, and perceptual hashes
- **Robust error handling**: Continues processing even if individual images fail

### 🖼️ Image Processing Pipeline  
- **Sharp-powered processing**: High-performance image manipulation using Sharp library
- **Auto-trim borders**: Removes white borders while preserving content
- **Contrast normalization**: Enhances image quality with gamma correction and sharpening
- **Multiple output formats**:
  - **PNG masters**: Lossless archival copies
  - **JPEG web derivatives**: 1920px width, optimized for video editing
  - **Thumbnails**: 300px quick previews

### 🔍 Perceptual Matching System
- **pHash implementation**: Robust perceptual hashing for image similarity
- **Hamming distance calculation**: Precise similarity measurement
- **Configurable thresholds**: Auto-assignment confidence levels (default: 90%)
- **Library matching**: Compare images against existing game component libraries
- **Duplicate detection**: Find similar images within collections
- **CLIP integration ready**: Future semantic matching support

## Installation

### System Requirements

#### Required Dependencies
```bash
# Install Node.js dependencies
npm install

# Install Poppler utilities (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install poppler-utils

# Install Poppler utilities (macOS)
brew install poppler

# Install Poppler utilities (Windows)
# Download from: https://github.com/oschwartz10612/poppler-windows
```

#### Optional Dependencies
```bash
# For advanced image processing
sudo apt-get install imagemagick

# For OCR capabilities  
sudo apt-get install tesseract-ocr
```

### Node.js Dependencies

The system automatically installs these npm packages:

```json
{
  "sharp": "^0.33.2",       // Image processing
  "image-hash": "^5.3.2",   // Perceptual hashing
  "node-fetch": "^2.7.0"    // HTTP client for CLIP integration
}
```

## Usage

### Basic PDF Image Extraction

```bash
# Extract images from a PDF
npm run images:extract input.pdf output_directory

# Example
npm run images:extract manual.pdf extracted_images
```

### Direct Script Usage

```bash
# Use the script directly
node scripts/extract_images.js rulebook.pdf game_images

# With custom output directory
node scripts/extract_images.js "Board Game Manual.pdf" "assets/components"
```

### Output Structure

The extraction creates this directory structure:

```
output_directory/
├── images/
│   ├── image_001.png          # Lossless PNG master
│   ├── image_001.jpg          # Web-optimized JPEG
│   ├── image_002.png
│   ├── image_002.jpg
│   └── thumbnails/
│       ├── image_001_thumb.jpg # 300px thumbnail
│       └── image_002_thumb.jpg
└── images.json                 # Structured metadata
```

### Metadata Format

The `images.json` file contains detailed information:

```json
{
  "extractionMethod": "success",
  "totalImages": 3,
  "extractedAt": "2024-01-15T10:30:00.000Z",
  "images": [
    {
      "id": "image_001",
      "originalPath": "/tmp/temp_extracted/img-000.png",
      "masterPath": "output_directory/images/image_001.png",
      "webPath": "output_directory/images/image_001.jpg", 
      "thumbnailPath": "output_directory/images/thumbnails/image_001_thumb.jpg",
      "width": 800,
      "height": 1200,
      "format": "png",
      "size": 245760,
      "density": 300,
      "perceptualHash": "a1b2c3d4e5f6g7h8",
      "extractedAt": "2024-01-15T10:30:01.000Z"
    }
  ]
}
```

## Testing

### Run Synthetic Tests

```bash
# Run the complete test suite
npm run images:test

# Run tests directly with Jest
npx jest tests/simple-extract-match.test.js

# Run tests with verbose output
npx jest tests/simple-extract-match.test.js --verbose
```

### Test Coverage

The test suite validates:

- ✅ Complete image processing pipeline
- ✅ Perceptual hash calculation
- ✅ 100% confidence matching for identical images
- ✅ Library matching with multiple candidates
- ✅ Edge case handling (missing files, empty libraries)
- ✅ Metadata structure validation

## API Reference

### Image Processing (`src/utils/imageProcessing.js`)

#### `processImage(inputPath, outputDir, thumbnailDir, baseName)`
Process a single image through the complete pipeline.

**Parameters:**
- `inputPath` (string): Path to input image
- `outputDir` (string): Directory for processed images
- `thumbnailDir` (string): Directory for thumbnails  
- `baseName` (string): Base name for output files

**Returns:** Object with paths to all generated files

#### `batchProcessImages(inputPaths, outputDir, thumbnailDir, namePrefix)`
Process multiple images in batch.

**Parameters:**
- `inputPaths` (Array<string>): Array of input image paths
- `outputDir` (string): Directory for processed images
- `thumbnailDir` (string): Directory for thumbnails
- `namePrefix` (string): Prefix for output files

**Returns:** Array of processing results

#### `analyzeImage(imagePath)`
Analyze image characteristics to determine processing needs.

**Parameters:**
- `imagePath` (string): Path to image

**Returns:** Analysis results including dimensions, format, and processing recommendations

### Perceptual Matching (`src/utils/imageMatching.js`)

#### `calculatePerceptualHash(imagePath)`
Calculate perceptual hash for an image.

**Parameters:**
- `imagePath` (string): Path to image file

**Returns:** Promise<string> - Hex-encoded perceptual hash

#### `matchImageToLibrary(queryImagePath, library, threshold)`
Compare an image against a library of images.

**Parameters:**
- `queryImagePath` (string): Path to query image
- `library` (Array<Object>): Array of library images with metadata
- `threshold` (number): Minimum confidence threshold (default: 90)

**Returns:** Promise<Object> - Match results with confidence scores

#### `findDuplicates(images, threshold)`
Find duplicate images in a collection.

**Parameters:**
- `images` (Array<Object>): Array of images with perceptual hashes
- `threshold` (number): Similarity threshold (default: 95)

**Returns:** Array of duplicate groups

## Configuration

### Extraction Preferences

The system automatically chooses the best extraction method:

1. **pdfimages** (preferred): Extracts embedded images losslessly
2. **pdftoppm** (fallback): Renders PDF pages as images

### Processing Settings

Default processing settings (can be customized in code):

```javascript
// Web derivative settings
const WEB_MAX_WIDTH = 1920;    // Max width for web JPEGs
const WEB_QUALITY = 90;        // JPEG quality (1-100)

// Thumbnail settings  
const THUMB_SIZE = 300;        // Thumbnail dimensions
const THUMB_QUALITY = 80;      // Thumbnail JPEG quality

// Matching settings
const DEFAULT_THRESHOLD = 90;   // Auto-assignment confidence
const DUPLICATE_THRESHOLD = 95; // Duplicate detection threshold
```

### CLIP Integration (Optional)

Future enhancement for semantic matching:

```javascript
// Configure CLIP embedding service URL
const CLIP_SERVICE_URL = 'http://localhost:8080';

// Use combined scoring (pHash + CLIP)
const PHASH_WEIGHT = 0.7;  // 70% pHash, 30% CLIP
```

## Troubleshooting

### Common Issues

#### "pdfimages: command not found"
```bash
# Install poppler-utils
sudo apt-get install poppler-utils  # Ubuntu/Debian
brew install poppler                 # macOS
```

#### "Failed to calculate hash"
```bash
# Ensure image file exists and is valid
file path/to/image.png

# Check file permissions
ls -la path/to/image.png
```

#### "Sharp installation failed"
```bash
# Reinstall sharp with platform-specific binaries
npm uninstall sharp
npm install sharp --platform=linux-x64  # Adjust for your platform
```

#### Low matching confidence
```javascript
// Adjust threshold for more permissive matching
const threshold = 70;  // Lower threshold (default: 90)

// Check image preprocessing
const analysis = await analyzeImage(imagePath);
console.log('Needs processing:', analysis.needsProcessing);
```

### Debug Mode

Enable detailed logging:

```javascript
// In your extraction script
process.env.DEBUG = 'true';

// This will output:
// - Extraction method selection
// - Image processing steps  
// - Hash calculations
// - Matching scores
```

### Performance Tips

#### Optimize for Large PDFs
- Use `pdfimages` when available (faster for embedded images)
- Process images in batches to manage memory usage
- Consider parallel processing for large image sets

#### Memory Management
```javascript
// For large image batches, process in chunks
const BATCH_SIZE = 10;
for (let i = 0; i < images.length; i += BATCH_SIZE) {
  const batch = images.slice(i, i + BATCH_SIZE);
  await batchProcessImages(batch, outputDir, thumbnailDir);
}
```

## Integration Examples

### With Existing Workflow

```javascript
const { main: extractImages } = require('./scripts/extract_images.js');
const { matchImageToLibrary, createLibrary } = require('./src/utils/imageMatching.js');

// Extract images from PDF
await extractImages(['rulebook.pdf', 'output_dir']);

// Load extraction results
const metadata = require('./output_dir/images.json');

// Create searchable library
const library = createLibrary(metadata.images);

// Match new images against library
const result = await matchImageToLibrary('new_image.png', library, 90);
console.log(`Match confidence: ${result.bestMatch?.confidence}%`);
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Extract and process images
  run: |
    npm install
    npm run images:extract assets/rulebook.pdf extracted/
    npm run images:test
    
- name: Archive results
  uses: actions/upload-artifact@v3
  with:
    name: extracted-images
    path: extracted/
```

## Contributing

### Development Setup

```bash
git clone <repository>
cd mobius-games-tutorial-generator
npm install

# Run tests
npm run images:test

# Test with sample PDFs
npm run images:extract sample.pdf test_output/
```

### Adding New Features

1. **Image Processing**: Extend `src/utils/imageProcessing.js`
2. **Matching Algorithms**: Enhance `src/utils/imageMatching.js`  
3. **Extraction Methods**: Modify `scripts/extract_images.js`
4. **Tests**: Add cases to `tests/simple-extract-match.test.js`

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Run tests to validate your setup: `npm run images:test`
3. Open an issue with:
   - System information (OS, Node.js version)
   - Error messages and logs
   - Sample files (if possible)