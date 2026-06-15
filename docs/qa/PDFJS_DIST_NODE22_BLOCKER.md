# pdfjs-dist Node 22 Real Extraction – Blocker

## Status: DEFERRED

## Summary

The direct pdfjs-dist extraction engine (added in PR #414) cannot currently run
in Node.js server environments on GitHub Actions CI. The Node 22 validation job
(added in PR #415) was removed because it could not honestly pass.

## Root Cause

`pdfjs-dist` v5.4.624 requires browser-like global APIs that do not exist in
Node.js, even in Node 22:

- `DOMMatrix` – partially polyfillable but pdfjs-dist uses internal patterns
  that go beyond simple 2D matrix math
- `process.getBuiltinModule` – used by pdfjs-dist v5 for internal require
  resolution (requires Node 22.12+)
- Additional internal browser assumptions during `getDocument()` that prevent
  successful PDF loading even with DOMMatrix/Path2D/ImageData polyfills

## What Works

- **Adapter architecture** (`src/ingestion/pdfExtractor.js`) – engine selection,
  capability detection, and polyfill injection are all in place
- **Auto fallback** – on Node 20 and unsupported Node 22 environments, the
  adapter gracefully falls back to pdf-parse with clear diagnostics
- **Mocked validation** – all normalization helpers, block conversion, and
  pipeline handoff are tested through 54+ unit tests on Node 20
- **Engine gate** – `detectPdfjsDistCapability()` correctly identifies Node 22+

## What Blocks Real CI Validation

1. pdfjs-dist v5.4 assumes a browser runtime for document loading
2. Partial polyfills (DOMMatrix, Path2D, ImageData) are insufficient
3. pdf-lib generates modern PDFs that pdf-parse's old pdfjs (v1.10.100) cannot
   handle as fallback

## Resolution Path

One of the following will unblock this:

1. **pdfjs-dist releases a server-compatible build** – watch for official Node.js
   support in pdfjs-dist releases
2. **Add jsdom test environment** – configure the CI job with `testEnvironment:
   jsdom` so pdfjs-dist gets the full browser API surface (adds dependency weight)
3. **Pin an older pdfjs-dist** – use a pre-v5 version (e.g., 3.x or 4.x) that
   has lighter browser requirements
4. **Use pdf2json or unpdf** – alternative server-first PDF libraries that
   extract text with coordinates without browser requirements

## Timeline

Deferred until one of the resolution paths is implemented. The adapter
architecture is ready and will activate automatically once the runtime supports
direct pdfjs-dist usage.

## Related PRs

- PR #413 – Base extraction adapter (merged)
- PR #414 – Engine selection + capability gate (merged)
- PR #415 – Node 22 CI job (merged, now reverted)
- PR #416 – Polyfill attempts (to be closed)
