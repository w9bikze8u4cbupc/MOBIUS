# Release Note Snippet

## Title:
Make tutorial generator visibility configurable via environment variables

## Details:
Introduces REACT_APP_SHOW_TUTORIAL to toggle the "A→Z Tutorial Generator" UI without code changes.

Introduces REACT_APP_DEBUG_TUTORIAL to enable development-only diagnostic logging (gated to NODE_ENV=development).

Adds a centralized env helper, unit tests, validation scripts, documentation, and CI to ensure quality and prevent regressions.