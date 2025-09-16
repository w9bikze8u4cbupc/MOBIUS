# Mobius Games Tutorial Generator v1.0.0

Release date: 2025-09-16

## Highlights
- End-to-end tutorial generation (EN/FR): storyboard → TTS → timeline → render.
- Audio/video synchronization with automatic reconciliation (scaling or trimming).
- TTS quality improvements with chunking and caching.
- PDF extraction resiliency with OCR fallback.
- Security and ops hardening (body size limits, timeouts, concurrency caps, dev/prod URL separation).
- Enhanced observability (extended health checks, correlation headers).
- CI matrix and reproducibility improvements.
- Production-ready with comprehensive monitoring and logging.

## Breaking changes
- Unified /api/extract-components now accepts pdfUrl or pdfPath; legacy routes deprecated.
- URL whitelist behavior changed: localhost/127.0.0.1 only allowed in development.

## New Features
- Audio/video reconciliation scripts (scale-timeline-to-audio.js, trim-audio-to-timeline.js).
- Pipeline summary generator for traceability.
- Retention policy cleanup script.
- Preflight validation script.
- JSON Schema validation for storyboard and timeline.
- Enhanced TTS with chunking and caching.
- OCR fallback for PDF extraction.
- Extended health/details endpoint with system information.
- Request ID tracing for correlation.

## Docs
- Updated README with endpoints, env vars, happy path, and examples.
- Added RELEASE_NOTES.md template.
- Added ARTIFACTS_SUMMARY.md with comprehensive artifact documentation.

## Known limitations
- Some PDFs may require OCR fallback for components extraction.
- ElevenLabs usage requires valid API key and credit; caching recommended.
- PDF.js compatibility issues with Node 20+ (using legacy build).

## Upgrade notes
- Pin pdfjs-dist to legacy build; ensure Node 18+ and ffmpeg/poppler in PATH.
- Set required environment variables: NODE_ENV, OUTPUT_DIR.
- Optional environment variables for enhanced functionality: ELEVENLABS_API_KEY, URL_WHITELIST, OCR_ENABLE.
- Install Tesseract for OCR functionality (optional).