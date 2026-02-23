# HEPHAESTUS - PDF Image Extraction Tool

**Version**: 2.0.0  
**Integration Status**: External Workspace, Feature-Flagged  
**Purpose**: Extract and crop component images from rulebook PDFs

## Overview

HEPHAESTUS is a specialized tool for extracting and cropping images from board game rulebook PDFs. It is integrated into MOBIUS as an **external CLI engine** that outputs normalized `ImageAsset` DTOs for operator review.

## Integration Architecture

```
MOBIUS Ingestion Pipeline
├─ PDF Upload
├─ Text/OCR Extraction (existing)
├─ Component Detection (existing)
└─ Image Extraction (NEW - optional)
   ├─ Legacy: pdfimages + manual crop
   └─ HEPHAESTUS: AI-powered extraction (external workspace)
      ├─ MOBIUS invokes CLI: extract --mode mobius <pdf> --out <dir>
      ├─ HEPHAESTUS writes: MOBIUS_READY/manifest.json + images
      └─ MOBIUS validates and imports as ImageAsset claims
```

## External Workspace Mode

HEPHAESTUS lives in a separate workspace (e.g., `C:\HEPHAESTUS\SRC`) and is invoked as an external CLI. This avoids vendoring heavy dependencies into MOBIUS.

### IO Contract

**MOBIUS → HEPHAESTUS**:
```bash
python -m hephaestus extract --mode mobius <pdf_path> --out <output_dir> --min-confidence 0.7
```

**HEPHAESTUS → MOBIUS**:
```
<output_dir>/
├── MOBIUS_READY/
│   └── manifest.json      # Required marker + manifest
├── component_001.png
├── component_002.png
└── ...
```

**Manifest Schema** (`MOBIUS_READY/manifest.json`):
```json
{
  "version": "1.0",
  "extractedAt": "2026-02-02T12:00:00Z",
  "pdfPath": "rulebook.pdf",
  "pdfHash": "sha256:...",
  "images": [
    {
      "id": "uuid",
      "filename": "component_001.png",
      "relativePath": "component_001.png",
      "pageNumber": 3,
      "boundingBox": { "x": 100, "y": 200, "width": 300, "height": 400 },
      "confidence": 0.95,
      "detectedType": "card",
      "hash": "sha256:..."
    }
  ],
  "stats": {
    "totalPages": 24,
    "imagesExtracted": 15,
    "averageConfidence": 0.87
  }
}
```

## Safety Boundaries

1. **Sandboxed IO**: All outputs written to canonical project directories only
2. **Feature-Flagged**: Disabled by default, requires explicit enablement
3. **Claims-Based**: Outputs treated as unconfirmed until operator accepts
4. **Non-Destructive**: Never overwrites existing assets
5. **Path Validation**: All paths validated against traversal attacks

## Installation

### Prerequisites

- HEPHAESTUS workspace (separate project)
- Python 3.8+ (if HEPHAESTUS is Python-based)
- Poppler utils (for PDF rendering)
- OpenCV or similar (for image processing)

### Setup

```bash
# 1. Ensure HEPHAESTUS is installed in external workspace
# Example: C:\HEPHAESTUS\SRC or /Users/username/hephaestus/src

# 2. Configure MOBIUS to use external workspace
# Add to .env:
MOBIUS_ENABLE_HEPHAESTUS=true
HEPHAESTUS_MODE=external
HEPHAESTUS_WORKSPACE=C:\HEPHAESTUS\SRC  # Windows
# or
HEPHAESTUS_WORKSPACE=/Users/username/hephaestus/src  # macOS/Linux

# 3. Verify HEPHAESTUS is callable
python -m hephaestus --version

# 4. Test extraction
curl -X POST http://localhost:5001/api/projects/1/pdf/extract-images \
  -H "Content-Type: application/json" \
  -d '{"pdfPath":"/path/to/test.pdf"}'
```

## Usage

### CLI Interface

```bash
# Extract images from PDF
node tools/hephaestus/extract.js \
  --input path/to/rulebook.pdf \
  --output data/projects/123/extracted_images \
  --manifest data/projects/123/extracted_images/manifest.json
```

### Programmatic Interface

```javascript
import { HephaestusService } from './src/services/HephaestusService.js';

const service = new HephaestusService();
const result = await service.extractImages({
  pdfPath: '/path/to/rulebook.pdf',
  outputDir: '/canonical/project/dir',
  options: {
    minConfidence: 0.7,
    cropPadding: 10
  }
});

// result.manifest contains ImageAsset DTOs
```

## Output Format

### Manifest Schema

```json
{
  "version": "1.0",
  "extractedAt": "2026-02-02T12:00:00Z",
  "pdfPath": "relative/path/to/source.pdf",
  "pdfHash": "sha256:...",
  "images": [
    {
      "id": "uuid",
      "filename": "component_001.png",
      "relativePath": "component_001.png",
      "pageNumber": 3,
      "boundingBox": { "x": 100, "y": 200, "width": 300, "height": 400 },
      "confidence": 0.95,
      "detectedType": "card|token|board|piece",
      "hash": "sha256:...",
      "metadata": {
        "extractionMethod": "hephaestus",
        "model": "gpt-5.2",
        "timestamp": "2026-02-02T12:00:00Z"
      }
    }
  ],
  "stats": {
    "totalPages": 24,
    "imagesExtracted": 15,
    "averageConfidence": 0.87
  }
}
```

## Integration Points

### MOBIUS Services

- `src/services/HephaestusService.js` - Wrapper service
- `src/ingest/pdfImages.js` - Orchestration layer
- `src/utils/imageAsset.js` - DTO normalization

### API Endpoints

- `POST /api/projects/:id/pdf/extract-images` - Trigger extraction
- `GET /api/projects/:id/pdf/extract-images/status` - Check status
- `GET /api/projects/:id/pdf/extract-images/results` - Get results

### Frontend

- `client/src/components/PdfImageExtraction.js` - Extraction UI
- `client/src/components/ImageMatcher.js` - Import extracted assets

## Configuration

### Environment Variables

```bash
# Enable HEPHAESTUS integration
MOBIUS_ENABLE_HEPHAESTUS=true

# Execution mode
HEPHAESTUS_MODE=embedded  # or 'external'

# Python executable (if Python-based)
HEPHAESTUS_PYTHON=python3

# Binary path (if external)
HEPHAESTUS_BIN=/path/to/hephaestus

# Confidence threshold
HEPHAESTUS_MIN_CONFIDENCE=0.7

# Max concurrent extractions
HEPHAESTUS_MAX_CONCURRENT=2
```

## Security Considerations

### Path Traversal Prevention

All paths validated using `validateExtractorPath()`:
- No `../` or `..\` patterns
- Must be within canonical project directories
- Null byte rejection

### Resource Limits

- Max PDF size: 50MB
- Max extraction time: 5 minutes
- Max output images: 500 per PDF

### Sandboxing

- Runs in isolated process
- No network access required
- Writes only to designated output directory

## Troubleshooting

### "HEPHAESTUS not available"

- Check `MOBIUS_ENABLE_HEPHAESTUS=true` in `.env`
- Verify dependencies installed
- Check Python/Node version

### "Extraction failed"

- Verify PDF is readable
- Check disk space in output directory
- Review logs in `data/tmp/hephaestus_*.log`

### "Path validation failed"

- Ensure output directory is under canonical project root
- Check for path traversal patterns
- Verify directory permissions

## Development

### Adding New Extraction Methods

1. Implement in `tools/hephaestus/extractors/`
2. Register in `tools/hephaestus/index.js`
3. Update manifest schema if needed
4. Add tests in `tests/integration/hephaestus-extract.test.js`

### Testing

```bash
# Run integration tests
npm test tests/integration/hephaestus-extract.test.js

# Test with fixture PDF
npm run test:hephaestus:fixture
```

## Limitations

- Requires high-quality PDF source
- May struggle with scanned/low-resolution images
- Confidence scores are estimates, not guarantees
- Large PDFs may take several minutes

## Roadmap

- [ ] Batch processing support
- [ ] Custom crop refinement UI
- [ ] Multi-language component detection
- [ ] Integration with external image APIs
- [ ] Caching for repeated extractions

## License

Same as MOBIUS project

## Support

See main MOBIUS documentation for support channels
