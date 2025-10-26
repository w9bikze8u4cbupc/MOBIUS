# Phase F: Image Matcher UI + Preview backend stub

## Summary

Adds Image Matcher React component (drag/drop, asset library, match grid).
Adds Script Workbench container (ScriptEditor + ImageMatcher + PreviewPane).
Adds preview backend stub: POST /api/preview (validation, dry-run, artifact persisted at DATA_DIR/previews).
Adds metrics: preview_requests_total, preview_failures_total, preview_duration_ms.
Adds unit tests and verification scripts.
Adds CI verification workflow (separate PR).

## Acceptance criteria

- Unit tests pass (backend + client).
- Dry-run preview writes artifact and increments metric.
- Queue/back-pressure behavior enforced.
- Docs updated (docs/api/preview.md and runbook).

## Files of interest

- src/api/handlers/previewChapter.js
- src/api/index.js
- client/src/ScriptWorkbench.jsx
- client/src/components/ImageMatcher.jsx
- tests/api/previewChapter.test.js
- scripts/verify-phase-f.{sh,ps1}
- docs/api/preview.md

## Labels
feature, phase-f, needs-review, ready-for-staging

## Reviewers
developer, ops, team-lead (replace with real handles)

## Assignee
developer (replace as needed)