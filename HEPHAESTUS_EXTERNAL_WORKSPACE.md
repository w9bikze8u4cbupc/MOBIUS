# HEPHAESTUS External Workspace Integration

**Status**: ✅ COMPLETE  
**Date**: 2026-02-02  
**Mode**: External CLI Engine (No Vendoring)

## Executive Summary

HEPHAESTUS has been integrated into MOBIUS as an **external CLI engine** without vendoring code. The integration uses a strict IO contract where MOBIUS invokes HEPHAESTUS via CLI, and HEPHAESTUS outputs a `MOBIUS_READY` marker with validated manifest and images. All outputs are treated as unconfirmed claims requiring operator confirmation via the `CONFIRM_COMPONENT_IMAGES` gate.

## Architecture

### External Workspace Model

```
┌─────────────────────────────────────────────────────────────┐
│ MOBIUS (C:\MOBIUS\)                                          │
├─────────────────────────────────────────────────────────────┤
│  src/services/HephaestusService.js                           │
│    ├─ Resolves CLI from HEPHAESTUS_WORKSPACE                │
│    ├─ Invokes: python -m hephaestus extract --mode mobius   │
│    └─ Validates: MOBIUS_READY/manifest.json                 │
└─────────────────────────────────────────────────────────────┘
                          ↓ CLI invocation
┌─────────────────────────────────────────────────────────────┐
│ HEPHAESTUS (C:\HEPHAESTUS\SRC\)                             │
├─────────────────────────────────────────────────────────────┤
│  __main__.py or cli.py                                       │
│    ├─ Receives: PDF path, output dir, options               │
│    ├─ Extracts: Component images with AI detection          │
│    └─ Outputs: MOBIUS_READY/manifest.json + images          │
└─────────────────────────────────────────────────────────────┘
                          ↓ Validated outputs
┌─────────────────────────────────────────────────────────────┐
│ MOBIUS Canonical Storage                                     │
├─────────────────────────────────────────────────────────────┤
│  data/uploads/project_<id>/extracted_images/extraction_<ts>/ │
│    ├─ MOBIUS_READY/manifest.json (validated)                │
│    ├─ component_001.png                                     │
│    ├─ component_002.png                                     │
│    └─ ...                                                    │
│                                                               │
│  Converted to ImageAsset DTOs (status=CLAIM)                │
│  Requires CONFIRM_COMPONENT_IMAGES gate                      │
└─────────────────────────────────────────────────────────────┘
```

## IO Contract

### MOBIUS → HEPHAESTUS

**Command**:
```bash
python -m hephaestus extract --mode mobius <pdf_path> --out <output_dir> --min-confidence <threshold>
```

**Environment**:
```bash
MOBIUS_MODE=true
MOBIUS_PROJECT_DIR=<output_dir>
```

**Requirements**:
- PDF path must be absolute and readable
- Output dir must be under canonical MOBIUS data root
- Exit code 0 on success, non-zero on failure

### HEPHAESTUS → MOBIUS

**Required Output Structure**:
```
<output_dir>/
├── MOBIUS_READY/
│   └── manifest.json      # REQUIRED: Marker + manifest
├── component_001.png      # Extracted images
├── component_002.png
└── ...
```

**Manifest Schema** (`MOBIUS_READY/manifest.json`):
```json
{
  "version": "1.0",
  "extractedAt": "2026-02-02T12:00:00Z",
  "pdfPath": "rulebook.pdf",
  "pdfHash": "sha256:abc123...",
  "images": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "component_001.png",
      "relativePath": "component_001.png",
      "pageNumber": 3,
      "boundingBox": {
        "x": 100,
        "y": 200,
        "width": 300,
        "height": 400
      },
      "confidence": 0.95,
      "detectedType": "card",
      "hash": "sha256:def456...",
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

**Validation Rules**:
1. `MOBIUS_READY/manifest.json` MUST exist
2. `version` MUST be "1.0"
3. `images` MUST be an array with at least 1 entry
4. Each image `relativePath` MUST be within output dir (no traversal)
5. Each image file MUST exist
6. `confidence` MUST be between 0.0 and 1.0
7. Max 500 images per extraction

## Configuration

### Environment Variables

```bash
# Enable HEPHAESTUS (default: false)
MOBIUS_ENABLE_HEPHAESTUS=true

# Mode: 'external' for production, 'embedded' for stub testing
HEPHAESTUS_MODE=external

# External workspace path (REQUIRED for external mode)
# Windows:
HEPHAESTUS_WORKSPACE=C:\HEPHAESTUS\SRC
# macOS/Linux:
HEPHAESTUS_WORKSPACE=/Users/username/hephaestus/src

# Explicit CLI path (optional, overrides workspace resolution)
HEPHAESTUS_CLI=/path/to/hephaestus/bin/hephaestus

# Python executable (default: python3)
HEPHAESTUS_PYTHON=python3

# Confidence threshold (default: 0.7)
HEPHAESTUS_MIN_CONFIDENCE=0.7

# Concurrency limit (default: 2)
HEPHAESTUS_MAX_CONCURRENT=2

# Timeout in milliseconds (default: 300000 = 5 minutes)
HEPHAESTUS_TIMEOUT_MS=300000
```

### CLI Resolution Logic

1. If `HEPHAESTUS_CLI` is set and exists → use it directly
2. Else if `HEPHAESTUS_WORKSPACE` is set:
   - Check for `__main__.py`, `cli.py`, `extract.py`, or `hephaestus.py`
   - Invoke as: `python -m hephaestus` from workspace directory
3. Else → fail with clear error message

## Truth Gate: CONFIRM_COMPONENT_IMAGES

### Gate Definition

**Gate ID**: `confirm_component_images`

**Title**: Confirm Component Images

**Description**: Review and confirm extracted component images from HEPHAESTUS

**Required When**: HEPHAESTUS extraction has been run and images imported

**Blocks**: Storyboard generation, render initiation

### Gate Lifecycle

```
1. Extraction Run
   └─ Gate initialized to PENDING

2. Operator Reviews Images
   ├─ Views confidence scores
   ├─ Checks bounding boxes
   └─ Identifies issues

3. Operator Confirms/Rejects
   ├─ Confirm → Gate status = CONFIRMED
   ├─ Correct → Gate status = CORRECTED (with notes)
   └─ Reject → Gate status = REJECTED (blocks downstream)

4. Downstream Operations
   └─ Storyboard/Render blocked until gate CONFIRMED or CORRECTED
```

### API Endpoints

**Confirm Gate**:
```bash
POST /api/projects/:id/gates/confirm
Body: {
  "gateId": "confirm_component_images",
  "status": "confirmed",
  "notes": "All images look good"
}
```

**Check Gate Status**:
```bash
GET /api/projects/:id/gates
Response: {
  "confirm_component_images": {
    "status": "confirmed",
    "confirmedAt": "2026-02-02T12:30:00Z",
    "notes": "All images look good"
  }
}
```

## Safety Boundaries

### 1. No Code Vendoring
- HEPHAESTUS code stays in external workspace
- MOBIUS only invokes CLI
- No dependency conflicts
- Independent versioning

### 2. Path Sandboxing
- All outputs under canonical MOBIUS data root
- Path traversal validation on all manifest entries
- No writes outside project directory
- Legacy path guard enforced

### 3. Manifest Validation
- Schema validation (version, images array, required fields)
- Path validation (no `../`, no absolute paths)
- Confidence clamping (0.0-1.0)
- Image count limit (max 500)
- File existence verification

### 4. Claims-Based Workflow
- All extracted images have `status=CLAIM`
- Requires operator confirmation via gate
- Consistent with ingestion gates philosophy
- No auto-acceptance

### 5. Feature-Flagged
- Disabled by default
- Requires explicit `MOBIUS_ENABLE_HEPHAESTUS=true`
- Returns 503 when disabled
- No breaking changes

## Cross-Platform Support

### Windows

**Launcher**: `scripts/run-hephaestus.ps1`

```powershell
.\scripts\run-hephaestus.ps1 `
  -PdfPath "C:\path\to\rulebook.pdf" `
  -OutputDir "C:\MOBIUS\data\uploads\project_123\extracted_images\extraction_1738512000000" `
  -MinConfidence "0.7"
```

**Features**:
- Handles Windows path quoting
- Validates MOBIUS_READY marker
- Returns proper exit codes

### macOS/Linux

**Launcher**: `scripts/run-hephaestus.sh`

```bash
./scripts/run-hephaestus.sh \
  --pdf /path/to/rulebook.pdf \
  --output /MOBIUS/data/uploads/project_123/extracted_images/extraction_1738512000000 \
  --min-confidence 0.7
```

**Features**:
- POSIX-compliant
- Validates MOBIUS_READY marker
- Returns proper exit codes

## Workflow Example

```
1. Operator uploads PDF
   └─ PDF stored in canonical uploads directory

2. Operator triggers HEPHAESTUS extraction
   POST /api/projects/123/pdf/extract-images
   ├─ Feature flag checked (MOBIUS_ENABLE_HEPHAESTUS=true)
   ├─ PDF validated (exists, size < 50MB)
   ├─ Output directory created: data/uploads/project_123/extracted_images/extraction_<timestamp>
   └─ HEPHAESTUS invoked via CLI

3. HEPHAESTUS runs extraction
   ├─ Receives: PDF path, output dir, min confidence
   ├─ Extracts: Component images with AI detection
   ├─ Writes: MOBIUS_READY/manifest.json + images
   └─ Exits: Code 0 on success

4. MOBIUS validates outputs
   ├─ Checks: MOBIUS_READY/manifest.json exists
   ├─ Validates: Manifest schema
   ├─ Sanitizes: Paths, confidence values
   ├─ Verifies: Image files exist
   └─ Converts: To ImageAsset DTOs (status=CLAIM)

5. CONFIRM_COMPONENT_IMAGES gate initialized
   └─ Status: PENDING

6. Operator reviews extracted images
   ├─ Views: Thumbnails, confidence scores, bounding boxes
   ├─ Identifies: Low-confidence crops, incorrect detections
   └─ Decides: Accept, reject, or request re-extraction

7. Operator confirms gate
   POST /api/projects/123/gates/confirm
   ├─ Gate status: CONFIRMED
   └─ Downstream operations unblocked

8. Storyboard/Render proceeds
   └─ Uses confirmed component images
```

## Testing

### Integration Tests

**File**: `tests/integration/hephaestus-extract.test.js`

**Coverage**:
- Feature flag enforcement (503 when disabled)
- External workspace resolution
- MOBIUS_READY marker validation
- Path sandboxing
- Manifest validation
- Gate initialization
- Canonical directory enforcement

### Manual Testing

```bash
# 1. Configure external workspace
export MOBIUS_ENABLE_HEPHAESTUS=true
export HEPHAESTUS_MODE=external
export HEPHAESTUS_WORKSPACE=/path/to/hephaestus/src

# 2. Start MOBIUS
npm run dev

# 3. Trigger extraction
curl -X POST http://localhost:5001/api/projects/1/pdf/extract-images \
  -H "Content-Type: application/json" \
  -d '{"pdfPath":"/path/to/test.pdf"}'

# 4. Verify MOBIUS_READY marker
ls data/uploads/project_1/extracted_images/extraction_*/MOBIUS_READY/manifest.json

# 5. Check gate status
curl http://localhost:5001/api/projects/1/gates

# 6. Confirm gate
curl -X POST http://localhost:5001/api/projects/1/gates/confirm \
  -H "Content-Type: application/json" \
  -d '{"gateId":"confirm_component_images","status":"confirmed"}'
```

## Troubleshooting

### "HEPHAESTUS not available"

**Cause**: Workspace not configured or not found

**Solution**:
1. Check `.env`: `HEPHAESTUS_WORKSPACE=C:\HEPHAESTUS\SRC`
2. Verify workspace exists: `ls $HEPHAESTUS_WORKSPACE`
3. Check for entry point: `ls $HEPHAESTUS_WORKSPACE/__main__.py`
4. Test CLI: `python -m hephaestus --version`

### "MOBIUS_READY marker not found"

**Cause**: HEPHAESTUS didn't create required output

**Solution**:
1. Check HEPHAESTUS logs for errors
2. Verify HEPHAESTUS is in MOBIUS mode: `--mode mobius`
3. Ensure HEPHAESTUS creates `MOBIUS_READY/manifest.json`
4. Check output directory permissions

### "Path validation failed"

**Cause**: Manifest references paths outside output directory

**Solution**:
1. Ensure all `relativePath` entries are relative (no `../`)
2. Verify no absolute paths in manifest
3. Check for null bytes or suspicious patterns

### "Extraction timeout"

**Cause**: HEPHAESTUS took longer than 5 minutes

**Solution**:
1. Increase timeout: `HEPHAESTUS_TIMEOUT_MS=600000`
2. Check PDF size (max 50MB)
3. Verify HEPHAESTUS is not hanging
4. Review HEPHAESTUS logs for performance issues

## Locked Invariants

1. **No Code Vendoring** - HEPHAESTUS stays in external workspace
2. **MOBIUS_READY Contract** - Required marker for validation
3. **Path Sandboxing** - All outputs under canonical data root
4. **Claims-Based** - All images require operator confirmation
5. **Gate Enforcement** - CONFIRM_COMPONENT_IMAGES blocks downstream
6. **Feature-Flagged** - Disabled by default, no breaking changes

## Files Modified

```
src/services/HephaestusService.js    - External workspace support
src/utils/gateConstants.js           - CONFIRM_COMPONENT_IMAGES gate
.env.example                         - External workspace config
tools/hephaestus/README.md           - Updated documentation
```

## Files Created

```
scripts/run-hephaestus.ps1           - Windows launcher
scripts/run-hephaestus.sh            - Unix launcher
HEPHAESTUS_EXTERNAL_WORKSPACE.md     - This document
```

## Next Steps

1. **Test with Real HEPHAESTUS**
   - Configure external workspace
   - Run extraction on real PDFs
   - Validate MOBIUS_READY outputs

2. **Operator Training**
   - Document workflow
   - Train on gate confirmation
   - Collect feedback

3. **Performance Tuning**
   - Monitor extraction times
   - Optimize confidence thresholds
   - Adjust concurrency limits

4. **Production Rollout**
   - Deploy to staging
   - Enable feature flag
   - Monitor success rate
   - Iterate based on feedback

## References

- [HEPHAESTUS Tool README](tools/hephaestus/README.md)
- [Integration Guide](docs/hephaestus-integration.md)
- [ImageAsset DTO](src/utils/imageAsset.js)
- [Gate Constants](src/utils/gateConstants.js)
- [Storage Canonicalization](docs/storage-canonicalization.md)
- [Ingestion Gates](docs/ingestion-truth-gates.md)
