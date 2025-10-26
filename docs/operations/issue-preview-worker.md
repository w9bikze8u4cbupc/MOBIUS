# Preview Worker — render queued chapter previews (Phase F)

## Description

Implement a background worker that consumes queued preview requests (created by /api/preview) and produces a concrete preview artifact (manifest and optionally a short MP4/thumbnail).

## Acceptance criteria

- Worker picks up queued preview artifacts from DATA_DIR/previews or a job queue.
- Produces preview-manifest.json and preview.mp4 (or thumbnails).
- Writes status file (success|failed) and logs with requestId correlation.
- Emits metrics: preview_worker_jobs_total, preview_worker_jobs_failed_total, preview_worker_duration_ms.
- Unit and integration tests validating outputs.
- UI Preview triggers job and artifacts are retrievable via /api/preview/status/:jobToken.

## Subtasks

- Define worker contract (input schema / output schema).
- Implement job acquisition & locking.
- Integrate ffmpeg/Python renderer or stub first then swap in real renderer.
- Add status & result endpoints and metrics.
- Add tests and CI verification.

## Owner
developer

## ETA
5 days

## Labels
feature, phase-f, priority-high