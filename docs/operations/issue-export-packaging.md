# Export Packaging — create downloadable tutorial bundle (zip)

## Description

Implement exporter that packages a project into a downloadable zip with container.json (script + metadata), assets, captions.srt, and checksum manifest.

## Acceptance criteria

- POST /api/projects/:id/export triggers async export, returns jobToken.
- Export files saved to DATA_DIR/exports/<projectId>-<timestamp>.zip and a download URL is produced.
- container.json contains script + metadata + relative asset paths.
- Uses streaming zip to avoid memory spikes.
- Emits metrics: export_requests_total, export_failures_total, export_duration_ms.
- Tests validate zip contents.

## Subtasks

- Define container.json schema
- Implement streaming packager
- Add export job queue and status endpoint

## Owner
developer

## ETA
5 days

## Labels
feature, phase-f, packaging