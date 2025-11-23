# MOBIUS Project Status (code-derived)

## Gateway/API (src/api)
- Express server boots with CORS and development-only auth bypass. Imports a `db.js` module that does not exist in the repository, so `/save-project` persistence is currently broken. Routes for GENESIS campaign/feedback/reporting/debug bundles are present, but storage and validation remain implicit. No production auth/session middleware implemented.

## Ingestion (src/ingestion, tests/ingestion)
- Deterministic ingestion pipeline implemented: normalizes PDF pages, detects headings, extracts components, and builds manifest assets per contract (hashing, OCR limits). Error handling covers missing headings and OCR overuse.

## Storyboard (src/storyboard)
- Storyboard generator consumes ingestion manifest, builds timed scenes with motion primitives, overlays (optional), hashes, and serialization helpers. Relies on contract JSON under docs/spec.

## Client (client/src)
- React SPA handles PDF upload, text extraction via pdfjs, metadata capture, sectioned TTS, and GENESIS control panels (feedback/health/artifacts/goals/campaign/inspector/QA bundles). Relies on localhost:5001 API. No routing or deployment config beyond local dev defaults; API key validation is skipped server-side.

## Python workers/utilities (mobius/*)
- Config dataclasses load captions/localization/golden baseline JSON from config/. Useful for rendering/captions tooling; no orchestration entrypoints observed here.

## Rendering/Video pipeline (scripts/, src/compat, tests)
- Node scripts for shotlist compilation, ffmpeg rendering, golden baseline checks, and desktop shortcut utilities are wired in package.json. Jest config targets src/tests. Golden assets and contract tests exist under tests/ but runtime assets/out directories are not tracked.

## CI/CD and validation
- README points to ingestion/storyboard validators (scripts/check_ingestion.cjs, scripts/check_storyboard.cjs) producing JUnit artifacts. Jest-based ingestion/storyboard tests exist. No GitHub Actions or CI workflows present in repo.

## Gaps and inconsistencies
- Missing `src/api/db.js` (or alternative persistence layer) blocks project saving. No auth/session implementation despite TODO. Client and server assume localhost origins with hard-coded ports. Deployment/readiness docs exist but no code-based environment toggles beyond GENESIS flags. Duplicate ingestion namespaces (`src/ingest` vs `src/ingestion`) risk confusion; only `src/ingestion` wired into tests/contracts.

## Next recommended step
Implement and wire a minimal persistence adapter for `/save-project` in `src/api/index.js` (or adjust to in-memory store) to unblock end-to-end project saves, and add an integration test covering project creation with mocked storage. This directly resolves the hard failure from the missing `db.js` import and validates the gateway/client loop without altering rendering or ingestion logic.
