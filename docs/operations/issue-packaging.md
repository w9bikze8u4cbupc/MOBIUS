# Export Packaging — create downloadable tutorial bundle (zip)

## Description

Implement an exporter that packages a project into a downloadable archive (zip) with:
- container.json (script, metadata, component mapping)
- assets/ (referenced images and thumbs)
- captions.srt (if generated)
- manifest + checksums (optional)

## Acceptance criteria

- POST /api/projects/:id/export triggers export job (async) and returns jobToken.
- Exporter produces <projectId>-<timestamp>.zip under DATA_DIR/exports and a downloadUrl.
- Packaging includes container.json containing canonical script + metadata and relative asset paths.
- Export job uses streaming zipping to avoid large memory usage.
- Export endpoint emits metrics: export_requests_total, export_failures_total, export_duration_ms.
- Tests: unit tests for manifest generation; integration to produce a zip for a sample project and assert expected files exist.

## Subtasks

- [ ] Define container.json schema (script + metadata)
- [ ] Implement zip-stream packaging (node-stream-zip or archiver) with checksum manifest
- [ ] Add export job queue with concurrency limits
- [ ] Add endpoint to get export status and download URL

## Test plan

- Unit tests to validate container.json and manifest
- Integration: create small project with script + assets, call export, assert zip contents

## Labels, owner, estimate

- Labels: feature, phase-f, packaging
- Owner: @developer
- ETA: 5 days