# Mobius Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules.

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.8+ (for image processing)
- Tesseract OCR (optional, for PDF text extraction fallback)

### Installation
```bash
npm install
```

### Running the Application

#### Start the backend server:
```bash
NODE_ENV=development DATA_DIR=./data OPENAI_API_KEY=<your-key> npm run server
```

#### Start the frontend UI:
```bash
npm run ui
```

Then open http://localhost:3000 in your browser.

#### Ingest a PDF (curl example):
```bash
curl -F "file=@/path/to/rulebook.pdf" http://localhost:5001/api/ingest
```

#### Ingest with BGG metadata:
```bash
curl -F "file=@/path/to/rulebook.pdf" -F "bggId=302723" http://localhost:5001/api/ingest
```

#### Ingest with dry run (skip heavy processing):
```bash
curl -F "file=@/path/to/rulebook.pdf" -F "dryRun=true" http://localhost:5001/api/ingest
```

#### Fetch BGG metadata:
```bash
curl -X POST http://localhost:5001/api/bgg \
  -H "Content-Type: application/json" \
  -d '{"bggIdOrUrl": "https://boardgamegeek.com/boardgame/12345/game-name"}'
```

### Directory Structure
```
./data/                 # Canonical data directory
  ├── projects.db       # SQLite database
  ├── uploads/          # Uploaded PDFs
  ├── output/           # Generated tutorial content
  ├── cache/            # Cached BGG metadata
  ├── previews/         # Generated preview videos
  ├── exports/          # Exported tutorial packages
  └── fixtures/         # Private test files (not committed)
```

### Environment Variables
- `API_VERSION` - API version header (default: `v1`)
- `DATA_DIR` - Path to data directory (default: `./data`)
- `PORT` - Server port (default: 5001)
- `INGEST_MAX_CONCURRENCY` - Maximum concurrent ingestion tasks (default: 3)
- `INGEST_QUEUE_MAX` - Maximum queue size for ingestion (default: 20)
- `UPLOAD_MAX_MB` - Maximum upload file size in MB (default: 25)
- `NODE_ENV` - Environment (production/development)
- `BGG_CACHE_TTL_MS` - BGG cache time-to-live in milliseconds (default: 86400000)
- `BGG_RATE_LIMIT_QPS` - BGG API rate limit in queries per second (default: 2)
- `OPENAI_API_KEY` - OpenAI API key for LLM features

## Development

### Running Tests
```bash
npm test
```

### Running Unit Tests
```bash
npm test -- src/utils/__tests__/scriptUtils.test.js
npm test -- src/ui/__tests__/App.test.jsx
```

### Running Integration Tests
```bash
npm test -- tests/api/ingest.integration.test.js
```

### Testing the Ingest API
#### On Unix/Linux/macOS:
```bash
./scripts/test-ingest-api.sh
```

#### On Windows:
```powershell
.\scripts\test-ingest-api.ps1
```

### Linting
```bash
npm run lint
```

# Mobius Games Tutorial Generator — Phase F Progress

## UI Features

### Script Editor
- Chapters and steps management
- Add/rename chapters
- Add/reorder/delete steps
- Edit step text content
- Undo/redo functionality (50-level snapshot stack)
- Autosave to localStorage
- Export to JSON bundle (chapters + SRT)
- Preview individual chapters

### Image Matcher
- Drag-and-drop image placement
- Image library with sample assets
- Per-step image associations
- Image removal functionality

### Navigation
- Tab-based navigation between Script Editor and Image Matcher
- Responsive layout for different screen sizes

## API Endpoints

### Core Endpoints
- `GET /health` - Health check endpoint
- `GET /metrics` - Prometheus metrics endpoint
- `POST /api/ingest` - PDF ingestion endpoint
- `POST /api/preview` - Chapter preview generation
- `POST /api/export` - Tutorial package export

### Static File Serving
- `/uploads` - Uploaded PDFs
- `/previews` - Generated preview videos
- `/exports` - Exported tutorial packages

## API Response Schema (v1)

### Success Response
```json
{
  "ok": true,
  "id": "string",
  "file": "string",
  "summary": {
    "pages": "number",
    "chunks": "number",
    "tocDetected": "boolean",
    "flags": {
      "pagesWithLowTextRatio": "array",
      "componentsDetected": "boolean",
      "dryRun": "boolean"
    }
  },
  "bgg": {
    "title": "string",
    "year": "number",
    "designers": "array",
    "players": "string",
    "time": "string",
    "age": "string"
  },
  "storyboardPath": "string"
}
```

### Error Response
```json
{
  "error": "string"
}
```

## Data Directory
By default the app uses ./data. Override with DATA_DIR env var. Subdirs are created on startup:
- uploads/
- output/
- pdf_images/
- cache/
- previews/
- exports/
- fixtures/

## Security Features
- File type validation (PDF only in production)
- File size limits (configurable via UPLOAD_MAX_MB)
- PDF header validation
- Suspicious content scanning
- Encrypted PDF rejection
- Rate limiting for external APIs

## Performance Features
- Concurrent ingestion processing (configurable via INGEST_MAX_CONCURRENCY)
- Ingestion queue with back-pressure handling (configurable via INGEST_QUEUE_MAX)
- BGG metadata caching (configurable via BGG_CACHE_TTL_MS)
- BGG API rate limiting (configurable via BGG_RATE_LIMIT_QPS)
- Dry-run mode for CI testing

## Migration
If you have legacy files:

```bash
DATA_DIR=./data npm run migrate:data
```

## Notes
- Do not commit copyrighted rulebooks. Place them under ./data/fixtures or ./data/uploads (gitignored).
- Logs are JSON with requestId for correlation.
- Files are automatically cleaned up after retention periods (30 days for uploads, 90 days for output).

## License
MIT