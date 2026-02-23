# HEPHAESTUS Integration Guide

**Status**: Optional, Feature-Flagged, Sandboxed  
**Version**: 1.0.0  
**Last Updated**: 2026-02-02

## Overview

HEPHAESTUS is an optional PDF image extraction provider integrated into MOBIUS for AI-powered component detection and auto-cropping. It operates as a **sandboxed, feature-flagged service** that outputs normalized `ImageAsset` DTOs treated as unconfirmed claims requiring operator review.

## Architecture

### Integration Boundary

```
┌─────────────────────────────────────────────────────────────┐
│ MOBIUS Ingestion Pipeline                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  PDF Upload → Text/OCR → Component Detection                 │
│                    ↓                                          │
│              Image Extraction (Optional)                      │
│                    ├─ Legacy: pdfimages + manual crop        │
│                    └─ HEPHAESTUS: AI-powered (feature-flagged│
│                                                               │
│  HEPHAESTUS Output: ImageAsset DTOs (status=CLAIM)           │
│                    ↓                                          │
│              Operator Review                                  │
│                    ├─ Accept → status=CONFIRMED              │
│                    ├─ Reject → status=REJECTED               │
│                    └─ Match → status=MATCHED                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Safety Boundaries

1. **Feature-Flagged**: Disabled by default, requires explicit enablement
2. **Sandboxed IO**: All outputs written to canonical project directories only
3. **Path Validation**: All paths validated against traversal attacks
4. **Claims-Based**: Outputs treated as unconfirmed until operator accepts
5. **Non-Destructive**: Never overwrites existing assets
6. **Resource Limits**: Max PDF size, timeout, concurrent extractions

## Installation

### Prerequisites

- Node.js 18+ (if HEPHAESTUS is Node-based)
- Python 3.8+ (if HEPHAESTUS is Python-based)
- Poppler utils (for PDF rendering)
- OpenCV or similar (for image processing)

### Setup Steps

1. **Place HEPHAESTUS in tools directory**:
   ```bash
   # Copy HEPHAESTUS tool to tools/hephaestus/
   cp -r /path/to/hephaestus tools/hephaestus/
   ```

2. **Install dependencies**:
   ```bash
   cd tools/hephaestus
   npm install  # or pip install -r requirements.txt
   ```

3. **Enable in environment**:
   ```bash
   # Add to .env
   MOBIUS_ENABLE_HEPHAESTUS=true
   HEPHAESTUS_MODE=embedded
   HEPHAESTUS_MIN_CONFIDENCE=0.7
   ```

4. **Verify availability**:
   ```bash
   # Check HEPHAESTUS is available
   curl http://localhost:5001/api/projects/1/pdf/extract-images/status
   ```

## Configuration

### Environment Variables

```bash
# Enable/disable HEPHAESTUS (default: false)
MOBIUS_ENABLE_HEPHAESTUS=true

# Execution mode
HEPHAESTUS_MODE=embedded  # or 'external'

# Python executable (if Python-based)
HEPHAESTUS_PYTHON=python3

# External binary path (if external mode)
HEPHAESTUS_BIN=/path/to/hephaestus

# Minimum confidence threshold (0.0-1.0)
HEPHAESTUS_MIN_CONFIDENCE=0.7

# Max concurrent extractions
HEPHAESTUS_MAX_CONCURRENT=2

# Extraction timeout (milliseconds)
HEPHAESTUS_TIMEOUT_MS=300000  # 5 minutes
```

### Resource Limits

| Limit | Value | Reason |
|-------|-------|--------|
| Max PDF Size | 50MB | Prevent memory exhaustion |
| Max Extraction Time | 5 minutes | Prevent hanging processes |
| Max Concurrent | 2 | Prevent CPU saturation |
| Max Images per PDF | 500 | Prevent DoS via manifest |

## API Endpoints

### POST /api/projects/:id/pdf/extract-images

Trigger image extraction for a PDF.

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

**Response** (success):
```json
{
  "success": true,
  "extractionId": "1738512000000",
  "outputDir": "/data/uploads/project_123/extracted_images/extraction_1738512000000",
  "imageAssets": [
    {
      "id": "uuid",
      "filename": "component_001.png",
      "relativePath": "component_001.png",
      "status": "claim",
      "source": "hephaestus",
      "pageNumber": 3,
      "boundingBox": { "x": 100, "y": 200, "width": 300, "height": 400 },
      "confidence": 0.95,
      "detectedType": "card",
      "hash": "sha256:...",
      "extractedAt": "2026-02-02T12:00:00Z"
    }
  ],
  "stats": {
    "imagesExtracted": 15,
    "averageConfidence": 0.87,
    "extractionTime": 45000
  }
}
```

**Response** (feature disabled):
```json
{
  "error": "HEPHAESTUS not available",
  "reason": "HEPHAESTUS is disabled (set MOBIUS_ENABLE_HEPHAESTUS=true)",
  "code": "HEPHAESTUS_NOT_AVAILABLE"
}
```

### GET /api/projects/:id/pdf/extract-images/status

List all extractions for a project.

**Response**:
```json
{
  "success": true,
  "projectId": 123,
  "extractions": [
    {
      "extractionId": "1738512000000",
      "timestamp": 1738512000000,
      "exists": true,
      "status": "complete",
      "manifest": { /* ... */ }
    }
  ],
  "count": 1
}
```

### GET /api/projects/:id/pdf/extract-images/:extractionId

Get specific extraction results.

**Response**:
```json
{
  "success": true,
  "status": "complete",
  "extractionId": "1738512000000",
  "manifest": { /* ... */ },
  "imageAssets": [ /* ... */ ],
  "extractionDir": "/data/uploads/project_123/extracted_images/extraction_1738512000000"
}
```

## Operator Workflow

### 1. Upload PDF and Run Extraction

```javascript
// Frontend: Trigger extraction
const response = await fetch(`/api/projects/${projectId}/pdf/extract-images`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pdfPath: uploadedPdfPath,
    options: { minConfidence: 0.7 }
  })
});

const { imageAssets, stats } = await response.json();
```

### 2. Review Extracted Images

```javascript
// Display images with confidence scores
imageAssets.forEach(asset => {
  console.log(`${asset.filename}: ${asset.detectedType} (${asset.confidence.toFixed(2)})`);
  
  if (asset.confidence < 0.8) {
    console.warn('Low confidence - review carefully');
  }
});
```

### 3. Accept/Reject Images

```javascript
// Accept image (update status to CONFIRMED)
await fetch(`/api/projects/${projectId}/images/${asset.id}/confirm`, {
  method: 'POST',
  body: JSON.stringify({ notes: 'Looks good' })
});

// Reject image (update status to REJECTED)
await fetch(`/api/projects/${projectId}/images/${asset.id}/reject`, {
  method: 'POST',
  body: JSON.stringify({ reason: 'Incorrect crop' })
});
```

### 4. Match to Components

```javascript
// Match confirmed image to component
await fetch(`/api/projects/${projectId}/images/${asset.id}/match`, {
  method: 'POST',
  body: JSON.stringify({ componentId: 'action-card' })
});
```

## Security Considerations

### Path Traversal Prevention

All paths validated using `validateExtractorPath()`:

```javascript
// Blocked patterns
../../../etc/passwd  // Path traversal
C:\Windows\System32  // System directories
/proc/self/environ   // Process info
${HOME}/secrets      // Template injection
`rm -rf /`           // Command injection
```

### Manifest Sanitization

All manifests sanitized using `sanitizeExtractorManifest()`:

- Validates required fields
- Sanitizes strings (max length, no HTML)
- Normalizes bounding boxes
- Clamps confidence to [0, 1]
- Limits image count to 500

### Resource Limits

- PDF size: 50MB max
- Extraction timeout: 5 minutes
- Concurrent extractions: 2 max
- Output images: 500 max per PDF

## Troubleshooting

### "HEPHAESTUS not available"

**Cause**: Feature flag disabled or tool not found

**Solution**:
1. Check `.env`: `MOBIUS_ENABLE_HEPHAESTUS=true`
2. Verify `tools/hephaestus/` exists
3. Check entry point: `extract.js` or `extract.py`
4. Restart server

### "Extraction failed"

**Cause**: PDF unreadable, timeout, or tool error

**Solution**:
1. Verify PDF is valid and readable
2. Check PDF size < 50MB
3. Review logs in `data/tmp/hephaestus_*.log`
4. Increase timeout if needed: `HEPHAESTUS_TIMEOUT_MS=600000`

### "Path validation failed"

**Cause**: Output path outside canonical project directory

**Solution**:
1. Ensure output directory is under `data/uploads/project_<id>/`
2. Check for path traversal patterns (`../`)
3. Verify directory permissions

### "Maximum concurrent extractions reached"

**Cause**: Too many simultaneous extractions

**Solution**:
1. Wait for current extractions to complete
2. Increase limit: `HEPHAESTUS_MAX_CONCURRENT=4`
3. Check for stuck processes

## Testing

### Integration Tests

```bash
# Run HEPHAESTUS integration tests
npm test tests/integration/hephaestus-extract.test.js
```

### Manual Testing

```bash
# 1. Enable HEPHAESTUS
export MOBIUS_ENABLE_HEPHAESTUS=true

# 2. Start server
npm run dev

# 3. Upload test PDF
curl -X POST http://localhost:5001/api/projects/1/pdf/extract-images \
  -H "Content-Type: application/json" \
  -d '{"pdfPath":"/path/to/test.pdf"}'

# 4. Check status
curl http://localhost:5001/api/projects/1/pdf/extract-images/status
```

## Limitations

- Requires high-quality PDF source
- May struggle with scanned/low-resolution images
- Confidence scores are estimates, not guarantees
- Large PDFs may take several minutes
- No batch processing (yet)

## Backward Compatibility

- Existing manual extraction workflow remains functional
- Projects without HEPHAESTUS extractions unaffected
- Feature flag ensures no breaking changes
- Can be disabled at any time without data loss

## Future Enhancements

- [ ] Batch processing support
- [ ] Custom crop refinement UI
- [ ] Multi-language component detection
- [ ] Integration with external image APIs
- [ ] Caching for repeated extractions
- [ ] Progress streaming for long extractions

## References

- [ImageAsset DTO](../src/utils/imageAsset.js) - Canonical image metadata
- [Path Validation](../src/utils/validation.js) - Security validators
- [Storage Canonicalization](./storage-canonicalization.md) - File storage patterns
- [HEPHAESTUS README](../tools/hephaestus/README.md) - Tool documentation

## Support

For issues or questions:
1. Check this documentation
2. Review integration tests
3. Check server logs
4. File issue with reproduction steps
