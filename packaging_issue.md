Implement exporter that packages a project into a downloadable zip with container.json, assets, captions.srt and manifest + checksums.

Acceptance criteria:
- POST /api/projects/:id/export triggers async export job, returns jobToken.
- Exports written to DATA_DIR/exports/<project>-<timestamp>.zip and a downloadUrl.
- container.json contains script + metadata + relative asset paths.
- Uses streaming zip to avoid memory spikes.
- Emits metrics: export_requests_total, export_failures_total, export_duration_ms.
- Unit/integration tests validate zip contents.

Subtasks:
- Define container.json schema.
- Implement streaming packager (archiver or streaming lib).
- Add export job queue and result endpoint.

Owner: developer
ETA: 5 days
Labels: feature, phase-f, packaging