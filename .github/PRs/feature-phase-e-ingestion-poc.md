# Feature: Phase E - Ingestion POC and Infrastructure Hardening

## Overview
This PR introduces the initial ingestion pipeline for the Mobius Games Tutorial Generator with infrastructure hardening:
- PDF text extraction with pdf-parse and OCR fallback
- BGG metadata fetching
- Simple storyboard generation from rulebook content
- Canonical data directory layout
- Observability and safety improvements
- CI smoke tests

## Files Added/Modified

### Core Ingestion Pipeline
- `src/ingest/pdf.js` - PDF text extraction with pdf-parse primary extraction + Tesseract OCR fallback
- `src/ingest/bgg.js` - BGG XML API fetcher
- `src/ingest/storyboard.js` - Simple heuristic storyboard generator

### Infrastructure Hardening
- `src/api/index.js` - API endpoints with request ID tracking
- `src/utils/logger.js` - Structured logging with request IDs
- `src/utils/metrics.js` - Lightweight metrics counters
- `scripts/migrate-data.js` - Migration script for existing data

### CLI and Testing
- `scripts/ingest-sample.js` - CLI script to produce storyboard.json
- `scripts/test-ingestion.js` - Test script for the ingestion pipeline
- `tests/fixtures/README.md` - Guidance for fixtures
- `tests/ingest/pdf.test.js` - Basic missing-file test
- `tests/ingest/bgg.test.js` - Minimal test for fetchBggMetadata
- `tests/ingest/storyboard.test.js` - Test for storyboard generation
- `tests/fixtures/selected_fixtures.txt` - Lists the uploaded PDFs to use as test fixtures

### CI and Observability
- `.github/workflows/ingest-smoke-test.yml` - CI smoke test workflow
- `src/api/health.js` - Health check endpoint

## Implementation Details

### Canonical Data Layout
- Use a single data directory: `./data`
- DB path: `./data/projects.db`
- Uploads: `./data/uploads`
- pdf_images, output, fixtures under `./data/`
- Environment var fallback: `DATA_DIR` (default `./data`)
- Migration script to move existing projects.db/uploads into `./data` if needed

### PDF Ingestion Improvements
- Improved pdf.js/pdf-parse extraction heuristics (TOC detection, page-level chunking)
- Added retries and robust error handling around pdf parsing
- Unit tests for parsing heuristics using the supplied rulebook PDFs as private fixtures

### BGG Metadata Integration
- Hardened bgg.js scraping with fallback to XML API if available
- Normalized output to metadata schema
- Added unit tests and sample fixtures

### Storyboard Generator
- Finalized storyboard JSON format (chapter -> step -> text -> images/crops/priority)
- Integrated basic heuristics to convert extracted components/steps into storyboard steps

### Observability & Safety
- Added request ID and sample-based structured logging for LLM calls and file IO
- Added lightweight metrics counter (ingest attempts, failures, avg LLM tokens)
- Added /health endpoint and structured JSON logging with request IDs

### Copyright & Fixtures
- Do NOT commit any uploaded rulebook PDFs to repo. Keep them in `./data/fixtures` private
- Use small redacted text fixtures for public tests

## Testing
- Unit tests for each module
- CI smoke test that runs an ingest→parse→save smoke test (using redacted fixtures)
- Test fixtures guidance for CI/local testing
- Error handling verification

## Usage
```bash
# Start server
NODE_ENV=development DATA_DIR=./data OPENAI_API_KEY=<key> npm run server

# Ingest PDF (curl example)
curl -F "file=@/path/to/rulebook.pdf" http://localhost:5001/api/ingest
```

## Acceptance Criteria
- C-01: Attach rulebook PDF (via API) succeeds
- C-02: Parsing completes without exceptions and produces page-chunks
- C-03: Table of contents detection runs (TOC found or explicit "TOC not detected" log)
- C-04: Component list extracted (non-empty or explicit "no components detected" result)
- Saved project row in `./data/projects.db` with normalized metadata
- CI smoke test executes and returns pass on the redacted fixtures

## Next Steps
1. Run local smoke tests against sample PDFs
2. Iterate on heuristic improvements
3. Add CI job for smoke testing
4. Add Docker job for OCR tests in CI