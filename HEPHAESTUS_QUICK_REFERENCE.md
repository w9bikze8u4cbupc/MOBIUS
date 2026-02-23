# HEPHAESTUS Quick Reference

**Status**: ✅ COMPLETE  
**Integration Mode**: External Workspace (No Code Vendoring)  
**Feature Flag**: `MOBIUS_ENABLE_HEPHAESTUS=true`

## Quick Start

### 1. Configure External Workspace

```bash
# .env
MOBIUS_ENABLE_HEPHAESTUS=true
HEPHAESTUS_MODE=external
HEPHAESTUS_WORKSPACE=C:\HEPHAESTUS\SRC  # Windows
# HEPHAESTUS_WORKSPACE=/path/to/hephaestus/src  # macOS/Linux
```

### 2. Run Extraction

```bash
# Via API
curl -X POST http://localhost:5001/api/projects/1/pdf/extract-images \
  -H "Content-Type: application/json" \
  -d '{"pdfPath":"/path/to/rulebook.pdf"}'

# Via UI
# Navigate to project → PDF Image Extraction → Run Extraction
```

### 3. Review and Import

```bash
# Get extraction status
curl http://localhost:5001/api/projects/1/pdf/extract-images/status

# Import selected assets
curl -X POST http://localhost:5001/api/projects/1/images/import-hephaestus \
  -H "Content-Type: application/json" \
  -d '{
    "extractionId": "1738512000000",
    "selectedAssetIds": ["uuid1", "uuid2"],
    "notes": "Imported high-confidence cards"
  }'
```

## API Endpoints

### POST /api/projects/:id/pdf/extract-images
Trigger HEPHAESTUS extraction

**Request**:
```json
{
  "pdfPath": "/absolute/path/to/rulebook.pdf",
  "options": {
    "minConfidence": 0.7,
    "cropPadding": 10
  }
}
```

**Response**:
```json
{
  "success": true,
  "extractionId": "1738512000000",
  "outputDir": "data/uploads/project_1/extracted_images/extraction_1738512000000",
  "stats": {
    "imagesExtracted": 15,
    "averageConfidence": 0.87,
    "extractionTime": 45000
  },
  "imageAssets": [...]
}
```

### GET /api/projects/:id/pdf/extract-images/status
Get extraction history and status

**Response**:
```json
{
  "success": true,
  "extractions": [
    {
      "extractionId": "1738512000000",
      "timestamp": 1738512000000,
      "status": "complete",
      "manifest": {...}
    }
  ],
  "metadata": {
    "runs": [...],
    "importedAssets": [...]
  }
}
```

### POST /api/projects/:id/images/import-hephaestus
Import selected assets and confirm gate

**Request**:
```json
{
  "extractionId": "1738512000000",
  "selectedAssetIds": ["uuid1", "uuid2", "uuid3"],
  "notes": "Imported high-confidence cards and tokens"
}
```

**Response**:
```json
{
  "success": true,
  "importedCount": 3,
  "gateStates": {
    "confirm_component_images": {
      "status": "confirmed",
      "confirmedAt": "2026-02-02T12:30:00Z"
    }
  }
}
```

### GET /api/projects/:id/images/imported
Get all imported assets

**Response**:
```json
{
  "success": true,
  "assets": [...],
  "count": 15
}
```

## Truth Gate: CONFIRM_COMPONENT_IMAGES

**Gate ID**: `confirm_component_images`

**Required When**: HEPHAESTUS extraction has been run and images imported

**Blocks**: Storyboard generation, render initiation

**Confirmation**: Automatic upon importing selected assets

**Status Flow**:
```
PENDING → (import assets) → CONFIRMED
```

## Database Schema

### extraction_metadata Column

```json
{
  "runs": [
    {
      "extractionId": "1738512000000",
      "timestamp": 1738512000000,
      "outputDir": "data/uploads/project_1/extracted_images/extraction_1738512000000",
      "manifestPath": "data/uploads/.../manifest.json",
      "stats": {
        "imagesExtracted": 15,
        "averageConfidence": 0.87,
        "extractionTime": 45000
      },
      "status": "imported",
      "importedAt": "2026-02-02T12:30:00Z",
      "importedCount": 12
    }
  ],
  "importedAssets": [
    {
      "id": "uuid1",
      "filename": "component_001.png",
      "relativePath": "component_001.png",
      "status": "confirmed",
      "source": "hephaestus",
      "pageNumber": 3,
      "boundingBox": {...},
      "confidence": 0.95,
      "detectedType": "card",
      "extractionId": "1738512000000",
      "importedAt": "2026-02-02T12:30:00Z"
    }
  ]
}
```

## Frontend Component

### PdfImageExtraction.js

**Location**: `client/src/components/PdfImageExtraction.js`

**Usage**:
```jsx
import PdfImageExtraction from './components/PdfImageExtraction';

<PdfImageExtraction 
  projectId={1} 
  pdfPath="/path/to/rulebook.pdf" 
/>
```

**Features**:
- Run extraction button
- Extraction history list
- Image grid with confidence badges
- Select/deselect assets
- Import with notes
- Gate confirmation feedback

## CLI Launchers

### Windows: run-hephaestus.ps1

```powershell
.\scripts\run-hephaestus.ps1 `
  -PdfPath "C:\path\to\rulebook.pdf" `
  -OutputDir "C:\MOBIUS\data\uploads\project_1\extracted_images\extraction_1738512000000" `
  -MinConfidence "0.7"
```

### Unix: run-hephaestus.sh

```bash
./scripts/run-hephaestus.sh \
  --pdf /path/to/rulebook.pdf \
  --output /MOBIUS/data/uploads/project_1/extracted_images/extraction_1738512000000 \
  --min-confidence 0.7
```

## MOBIUS_READY Contract

HEPHAESTUS MUST create:
```
<output_dir>/
├── MOBIUS_READY/
│   └── manifest.json      # REQUIRED marker
├── component_001.png
├── component_002.png
└── ...
```

MOBIUS validates:
1. `MOBIUS_READY/manifest.json` exists
2. Manifest schema is valid
3. All image paths are relative and within output dir
4. All image files exist
5. Confidence values are 0.0-1.0

## Troubleshooting

### "HEPHAESTUS not available"
- Check `MOBIUS_ENABLE_HEPHAESTUS=true`
- Verify `HEPHAESTUS_WORKSPACE` path exists
- Check for entry point: `__main__.py`, `cli.py`, etc.

### "MOBIUS_READY marker not found"
- Ensure HEPHAESTUS creates `MOBIUS_READY/manifest.json`
- Check HEPHAESTUS logs for errors
- Verify `--mode mobius` flag is passed

### "Path validation failed"
- Ensure all `relativePath` entries are relative (no `../`)
- No absolute paths in manifest
- All paths within output directory

### "Extraction timeout"
- Increase `HEPHAESTUS_TIMEOUT_MS` (default 300000 = 5 min)
- Check PDF size (max 50MB)
- Review HEPHAESTUS performance

## Environment Variables

```bash
# Feature flag (default: false)
MOBIUS_ENABLE_HEPHAESTUS=true

# Mode (default: external)
HEPHAESTUS_MODE=external

# External workspace path (REQUIRED for external mode)
HEPHAESTUS_WORKSPACE=C:\HEPHAESTUS\SRC

# Explicit CLI path (optional)
HEPHAESTUS_CLI=/path/to/hephaestus/bin/hephaestus

# Python executable (default: python3)
HEPHAESTUS_PYTHON=python3

# Confidence threshold (default: 0.7)
HEPHAESTUS_MIN_CONFIDENCE=0.7

# Concurrency limit (default: 2)
HEPHAESTUS_MAX_CONCURRENT=2

# Timeout in milliseconds (default: 300000)
HEPHAESTUS_TIMEOUT_MS=300000
```

## Testing

### Integration Tests

```bash
npm test -- tests/integration/hephaestus-extract.test.js
```

**Coverage**:
- Feature flag enforcement
- PDF path validation
- Extraction status retrieval
- Import validation
- Imported assets retrieval

### Manual Testing

```bash
# 1. Configure
export MOBIUS_ENABLE_HEPHAESTUS=true
export HEPHAESTUS_WORKSPACE=/path/to/hephaestus/src

# 2. Start server
npm run dev

# 3. Run extraction
curl -X POST http://localhost:5001/api/projects/1/pdf/extract-images \
  -H "Content-Type: application/json" \
  -d '{"pdfPath":"/path/to/test.pdf"}'

# 4. Check status
curl http://localhost:5001/api/projects/1/pdf/extract-images/status

# 5. Import assets
curl -X POST http://localhost:5001/api/projects/1/images/import-hephaestus \
  -H "Content-Type: application/json" \
  -d '{"extractionId":"1738512000000","selectedAssetIds":["uuid1"]}'

# 6. Verify gate
curl http://localhost:5001/api/projects/1/ingestion/gates
```

## Files Modified/Created

### Backend
- `src/api/db.js` - Added extraction metadata persistence
- `src/api/index.js` - Added 4 HEPHAESTUS endpoints
- `src/services/HephaestusService.js` - External workspace support
- `src/utils/gateConstants.js` - Added CONFIRM_COMPONENT_IMAGES gate

### Frontend
- `client/src/components/PdfImageExtraction.js` - Extraction UI

### Scripts
- `scripts/run-hephaestus.ps1` - Windows launcher
- `scripts/run-hephaestus.sh` - Unix launcher

### Tests
- `tests/integration/hephaestus-extract.test.js` - Updated with new tests

### Documentation
- `HEPHAESTUS_EXTERNAL_WORKSPACE.md` - Comprehensive guide
- `HEPHAESTUS_QUICK_REFERENCE.md` - This document
- `tools/hephaestus/README.md` - Updated for external mode

## Locked Invariants

1. **No Code Vendoring** - HEPHAESTUS stays in external workspace
2. **MOBIUS_READY Contract** - Required marker for validation
3. **Path Sandboxing** - All outputs under canonical data root
4. **Claims-Based** - All images require operator confirmation
5. **Gate Enforcement** - CONFIRM_COMPONENT_IMAGES blocks downstream
6. **Feature-Flagged** - Disabled by default

## Next Steps

1. Test with real HEPHAESTUS workspace
2. Validate MOBIUS_READY outputs
3. Train operators on workflow
4. Monitor extraction success rate
5. Iterate based on feedback

## References

- [External Workspace Guide](HEPHAESTUS_EXTERNAL_WORKSPACE.md)
- [Integration Documentation](docs/hephaestus-integration.md)
- [ImageAsset DTO](src/utils/imageAsset.js)
- [Gate Constants](src/utils/gateConstants.js)
- [HephaestusService](src/services/HephaestusService.js)


## Testing Prerequisites

### Running Integration Tests

**Note**: Integration tests now use Node's built-in test runner (stable, no Jest ESM issues).

#### Setup
```bash
# No additional dependencies needed - uses native fetch (Node 18+)

# Set environment variable
$env:NODE_ENV="test"  # Windows
export NODE_ENV="test"  # Unix
```

#### Run Tests
```bash
# Run HEPHAESTUS integration tests
npm run test:integration

# Run unit tests (Jest)
npm run test:unit

# Run all tests
npm run test:all
```

#### Test Coverage
- Feature flag enforcement (disabled/enabled)
- PDF path validation
- Extraction status retrieval
- Import validation
- Imported assets retrieval
- Gate enforcement (CONFIRM_COMPONENT_IMAGES)
- Canonical path enforcement

### Test Architecture

**Integration Tests**: Node's built-in test runner (`node:test`)
- File: `tests/integration/hephaestus-extract.node.test.mjs`
- Uses native `fetch` API
- Ephemeral port allocation (no collisions)
- Fast, stable, no experimental flags

**Unit Tests**: Jest
- Files: `src/__tests__/**/*.test.js`
- TypeScript support via ts-jest
- Isolated from integration tests

### Manual Testing (Alternative)

For quick validation without running full test suite:

```bash
# 1. Start server
npm run dev

# 2. Test endpoints with curl
curl -X POST http://localhost:5001/api/projects/1/pdf/extract-images \
  -H "Content-Type: application/json" \
  -d '{"pdfPath":"/path/to/test.pdf"}'

# 3. Verify responses
curl http://localhost:5001/api/projects/1/pdf/extract-images/status
```

