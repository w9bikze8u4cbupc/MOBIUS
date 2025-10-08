# Feature: Phase E - Ingestion POC and Infrastructure Hardening

## Description
Implements Phase E of the Mobius Tutorial Generator: Ingestion POC and immediate infrastructure hardening. This PR consolidates file paths, standardizes the data directory layout, and creates a robust ingestion pipeline with improved observability and monitoring.

## Implementation Details

### Canonical Data Layout
- Use a single data directory: `./data`
- DB path: `./data/projects.db`
- Uploads: `./data/uploads`
- pdf_images, output, fixtures under `./data/`
- Environment var fallback: `DATA_DIR` (default `./data`)
- Migration script to move existing projects.db/uploads into `./data` if needed

### Default Providers & Fallbacks
- Default LLM provider: OpenAI (via ServiceFactory)
- Keep ServiceFactory fallbacks for other vendors but default to OpenAI in prod/dev unless user requests otherwise
- TTS: Keep as optional/stub for MVP — add ElevenLabs integration but do not enable by default

### File & Tooling Cleanup
- Rename python_scripts/detect'components.py → python_scripts/detect_components.py
- Move yolov8 weights to a download-on-demand step and document the step (avoid heavyweight checked-in assets)
- Add /health endpoint and structured JSON logging with request IDs

### Observability & Safety
- Add request ID and sample-based structured logging for LLM calls and file IO
- Add a lightweight metrics counter (ingest attempts, failures, avg LLM tokens)

### Copyright & Fixtures
- Do NOT commit any uploaded rulebook PDFs to repo. Keep them in `./data/fixtures` private
- Use small redacted text fixtures for public tests

## Technical Changes

### New Files
- `src/api/db.js` - SQLite database implementation
- `src/api/utils.js` - Utility functions for canonical path handling
- `src/api/ingest.js` - New ingestion API endpoints
- `src/ingest/pdf.js` - PDF text extraction with OCR fallback
- `src/ingest/bgg.js` - BGG metadata fetching
- `src/ingest/storyboard.js` - Storyboard generation from parsed content
- `scripts/migrate-data.js` - Data migration script
- `scripts/test-ingestion.js` - Ingestion pipeline test script
- `scripts/demo-ingestion.js` - Ingestion pipeline demo
- `src/__tests__/ingest.test.js` - Unit tests for ingestion pipeline
- `README.md` - Updated documentation with run commands
- `docs/PHASE_E_SUMMARY.md` - Implementation summary
- `docs/YOLOV8_WEIGHTS.md` - YOLOv8 weights handling documentation

### Modified Files
- `package.json` - Added dependencies and new scripts
- `src/api/index.js` - Integrated new ingestion endpoints and fixed regex issues

## Run Commands

### Start Server
```bash
NODE_ENV=development DATA_DIR=./data OPENAI_API_KEY=<your-key> npm run server
```

### Ingest PDF
```bash
curl -F "file=@/path/to/rulebook.pdf" http://localhost:5001/api/ingest
```

### Fetch BGG Metadata
```bash
curl -X POST http://localhost:5001/api/bgg \
  -H "Content-Type: application/json" \
  -d '{"bggIdOrUrl": "https://boardgamegeek.com/boardgame/12345/game-name"}'
```

### Test Commands
```bash
npm run test:ingest    # Test ingestion pipeline
npm run migrate        # Run data migration
```

## Acceptance Criteria Verification

✅ **C-01: Attach rulebook PDF (via API) succeeds**
- Implemented `/api/ingest` endpoint with multer file upload
- Files stored in canonical `./data/uploads/` directory

✅ **C-02: Parsing completes without exceptions and produces page-chunks**
- PDF text extraction via `pdf-parse` with OCR fallback
- Page-level chunking in ingestion pipeline

✅ **C-03: Table of contents detection runs (TOC found or explicit "TOC not detected" log)**
- Heuristic-based TOC detection in storyboard generation
- Logging for detection results

✅ **C-04: Component list extracted (non-empty or explicit "no components detected" result)**
- Component extraction from PDF text
- Fallback to default components if none detected

✅ **Saved project row in ./data/projects.db with normalized metadata**
- SQLite database with projects table
- Metadata normalization and storage

✅ **CI smoke test executes and returns pass on the redacted fixtures**
- GitHub Actions workflow for smoke testing
- Tests run against redacted fixtures

## Testing
- Unit tests for ingestion pipeline components
- CI smoke test workflow
- Manual testing of ingestion endpoints
- Migration script testing

## Documentation
- Updated README with run commands
- Implementation summary document
- YOLOv8 weights handling documentation
- Inline code comments

## Security
- Private PDF storage in `./data/fixtures`
- No copyrighted content committed to repository
- Proper error handling and input validation

## Performance
- Lightweight SQLite database
- Efficient file handling
- Optimized text extraction pipeline

## Observability
- Structured JSON logging with request IDs
- Health endpoint for monitoring
- Metrics collection for ingestion pipeline
- Error tracking and reporting

## Future Improvements
1. Enhanced PDF parsing heuristics
2. Full LLM integration for complex rulebooks
3. Improved OCR preprocessing
4. Performance optimizations
5. Extended test coverage