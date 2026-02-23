# Ingestion Hardening with Confidence Scoring and Truth Gates

## Status: IN PROGRESS (Phase 1 Complete)

## Overview

This milestone hardens the ingestion pipeline by treating all extraction outputs as "claims" requiring operator confirmation. The system now provides confidence scoring, source attribution, hostile-input guardrails, and operator truth gates to prevent "plausible but wrong" auto-acceptance.

## Completed Work (Phase 1)

### 1. Core Utilities Created

#### `src/utils/confidence.js`
- **Purpose**: Confidence scoring heuristics and normalization
- **Features**:
  - Confidence levels: HIGH (0.8-1.0), MEDIUM (0.5-0.79), LOW (0.2-0.49), NONE (0.0-0.19)
  - `calculateBGGFieldConfidence()` - Scores BGG API data reliability
  - `calculatePDFExtractionConfidence()` - Scores PDF text extraction quality
  - `calculateAIConfidence()` - Scores AI-generated content with hedging detection
  - `calculateComponentConfidence()` - Scores component extraction methods
  - `aggregateConfidence()` - Combines multiple confidence scores
- **Key Insight**: All scores include warnings array for transparency

#### `src/utils/ingestionReport.js`
- **Purpose**: IngestionReport builder and serializer for truth gates
- **Features**:
  - Field status tracking: PENDING, CONFIRMED, CORRECTED, REJECTED
  - Source types: BGG_API, PDF_NATIVE, PDF_OCR, AI_EXTRACTION, USER_INPUT, FALLBACK
  - `IngestionReportBuilder` class for fluent report construction
  - `createFieldClaim()` - Creates field with source + confidence + status
  - `updateFieldStatus()` - Operator confirmation/correction workflow
  - `areRequiredFieldsConfirmed()` - Gate check for progression
  - `unlockProgression()` - Unlocks next stage when all required fields confirmed
  - `getReportSummary()` - Statistics for UI display
- **Key Insight**: Progression is LOCKED by default until operator confirms

#### `src/utils/validation.js`
- **Purpose**: Defensive validation for hostile inputs
- **Features**:
  - `validateBGGId()` - SQL injection, range checks
  - `validateBGGUrl()` - XSS patterns, domain validation, HTTPS enforcement
  - `validatePDFPath()` - Path traversal, null bytes, extension checks
  - `validateAIResponseJSON()` - JSON parsing, size limits, schema validation
  - `validateComponent()` - Component object structure validation
  - `validateMetadata()` - Metadata field type and range validation
  - `sanitizeString()` - Remove dangerous characters
- **Key Insight**: All validators return `ValidationResult` with errors + warnings

### 2. AI Utilities with Defensive Patterns

#### `src/api/aiUtils.js` (CREATED)
- **Purpose**: AI integration with validation and repair
- **Features**:
  - `explainChunkWithAI()` - Chunk explanation with confidence scoring
  - `extractComponentsWithAI()` - Component extraction with retry logic (3 attempts)
  - `extractMetadataWithAI()` - Metadata extraction with schema validation
  - Automatic JSON extraction from markdown code blocks
  - Hedging language detection ("possibly", "might be", "unclear")
  - Size limits (10KB chunks, 20KB text, 1MB responses)
- **Key Insight**: All AI responses include confidence + warnings + attempt count

### 3. BGG Ingestion Hardening

#### `src/ingest/bgg.js` (UPDATED)
- **Changes**:
  - Added imports: `validateBGGId`, `validateBGGUrl`, `calculateBGGFieldConfidence`
  - `fetchBggMetadata()` now validates inputs before API call
  - All fields wrapped with `extractField()` helper that adds:
    - `value` - The actual data
    - `source` - Always 'bgg_api'
    - `confidence` - Score + level + warnings
    - `extractedAt` - ISO timestamp
  - Added `_metadata` object with warnings, fetchedAt, source, apiUrl
  - Error responses include structured metadata
  - Timeout increased to 10 seconds (was 5)
- **Key Insight**: Every field is now a claim with provenance

### 4. PDF Ingestion Hardening

#### `src/ingest/pdf.js` (UPDATED)
- **Changes**:
  - Added imports: `validatePDFPath`, `calculatePDFExtractionConfidence`
  - `ingestPdf()` validates path before processing
  - Each page result includes confidence object
  - Added `extractionMethod` field: 'pdf-parse', 'ocr-fallback', 'ocr-only'
  - Added `warnings` array to result
  - Added `overallConfidence` aggregated from all pages
  - Detects encrypted PDFs and adds warning
  - Tracks low-text pages (< 200 chars) as potential scan artifacts
- **Key Insight**: Extraction method + confidence visible to operator

## Remaining Work (Phase 2)

### 1. Database Persistence

**File**: `src/api/db.js`
- Add `ingestion_report` JSON column to projects table
- Add `gate_states` JSON column for operator confirmations
- Add `progression_locked` boolean column
- Migration script for existing projects

### 2. API Endpoints

**File**: `src/api/index.js`
- `GET /api/projects/:id/ingestion-report` - Retrieve report
- `POST /api/projects/:id/confirm-field` - Confirm/correct field
- `POST /api/projects/:id/unlock-progression` - Attempt unlock
- `GET /api/projects/:id/gate-status` - Check if progression allowed
- Update existing ingestion endpoints to generate reports

### 3. Frontend Truth Gates

**Files**: `client/src/components/IngestionReview.js` (NEW)
- Display IngestionReport with confidence indicators
- Color-coded confidence levels (green/yellow/red)
- Inline field editing for corrections
- Confirm/reject buttons per field
- Progress indicator showing confirmed vs pending fields
- Block "Next" button until all required fields confirmed

### 4. Integration Tests

**File**: `tests/integration/ingest-gates.test.js` (NEW)
- Test hostile BGG IDs (SQL injection, XSS)
- Test malformed PDF paths (path traversal)
- Test AI response validation (invalid JSON, missing fields)
- Test confidence scoring for various scenarios
- Test progression locking/unlocking workflow

### 5. Fixtures for Hostile Inputs

**Directory**: `data/fixtures/ingest/`
- `hostile-bgg-ids.json` - SQL injection patterns
- `hostile-urls.json` - XSS patterns
- `malformed-paths.json` - Path traversal patterns
- `invalid-ai-responses.json` - Broken JSON, missing fields

### 6. Documentation

**File**: `docs/ingestion-truth-control.md` (NEW)
- Architecture overview
- Confidence scoring methodology
- Operator workflow guide
- API reference
- Security considerations

## Design Principles

1. **Claims, Not Facts**: All ingestion outputs are treated as unverified claims
2. **Source Attribution**: Every field tracks where it came from
3. **Confidence Transparency**: Scores + warnings visible to operator
4. **Defensive by Default**: Validate all inputs, sanitize all outputs
5. **Progression Gates**: Block advancement until operator confirms
6. **Beginner-First**: Prevent "plausible but wrong" auto-acceptance
7. **Additive Changes**: Don't break existing project records

## Security Guardrails

### Input Validation
- BGG IDs: Numeric only, range 1-9999999, no SQL injection
- BGG URLs: HTTPS preferred, domain check, XSS pattern detection
- PDF Paths: No path traversal, no null bytes, .pdf extension required
- AI Responses: Size limits, JSON validation, schema enforcement

### Confidence Scoring
- BGG API: 0.85 base (reliable when returns data), reduced for old games/low ratings
- PDF Native: 0.8 base (reliable), reduced for short text
- PDF OCR: 0.4 base (less reliable), reduced for low-text pages
- AI Extraction: 0.6 base (medium-low), reduced for hedging language

### Hostile Input Handling
- SQL injection patterns blocked
- XSS patterns blocked
- Path traversal blocked
- Null bytes blocked
- Excessively long inputs truncated or rejected
- Invalid JSON repaired (3 attempts) or rejected

## Migration Path

### For Existing Projects
1. Run migration to add new DB columns (default: null)
2. Existing projects without reports can proceed (backward compatible)
3. New projects MUST have ingestion reports
4. Operator can optionally generate reports for old projects

### For Existing Code
1. Old ingestion code still works (returns raw values)
2. New code returns structured claims (value + source + confidence)
3. Frontend checks for report presence before showing gates
4. API endpoints backward compatible (report optional)

## Next Steps

1. **Immediate**: Implement database persistence (db.js updates)
2. **Next**: Create API endpoints for report management
3. **Then**: Build frontend IngestionReview component
4. **Finally**: Add integration tests and documentation

## Files Created

- `src/utils/confidence.js` ✅
- `src/utils/ingestionReport.js` ✅
- `src/utils/validation.js` ✅
- `src/api/aiUtils.js` ✅

## Files Updated

- `src/ingest/bgg.js` ✅ (defensive parsing + confidence)
- `src/ingest/pdf.js` ✅ (extraction metadata + confidence)

## Files Pending

- `src/api/db.js` (persistence)
- `src/api/index.js` (endpoints)
- `client/src/components/IngestionReview.js` (UI)
- `tests/integration/ingest-gates.test.js` (tests)
- `data/fixtures/ingest/*.json` (hostile inputs)
- `docs/ingestion-truth-control.md` (documentation)

## Locked Invariants

1. All ingestion outputs MUST include confidence scores
2. All fields MUST track source attribution
3. Progression MUST be locked until required fields confirmed
4. All inputs MUST be validated before processing
5. All AI responses MUST be validated against schema
6. All warnings MUST be surfaced to operator

## Notes

- This builds on the LOCKED storage canonicalization milestone
- Uses canonical storage helpers for all file operations
- No new dependencies required (uses existing better-sqlite3, OpenAI)
- Designed for single-user but extensible to multi-user
- Preserves beginner-first contract by preventing silent errors
