Summary
- Adds Image Matcher React component (drag/drop, asset library, match grid).
- Adds Script Workbench container (ScriptEditor + ImageMatcher + PreviewPane).
- Adds preview backend stub: POST /api/preview (validation, dry-run, artifact persisted at DATA_DIR/previews).
- Adds metrics: preview_requests_total, preview_failures_total, preview_duration_ms.
- Adds unit tests and verification scripts.

Acceptance criteria
- Unit tests pass (backend + client).
- Dry-run preview writes artifact and increments metric.
- Queue/back-pressure behavior enforced.

Quick verification checklist:
- [ ] npm test (backend tests pass)
- [ ] cd client && npm test (client tests pass)
- [ ] curl dry-run returns 202 and artifact saved
- [ ] preview_requests_total increments on request
- [ ] scripts/verify-phase-f.sh passes
- [ ] scripts/verify-phase-f.ps1 passes (Windows)