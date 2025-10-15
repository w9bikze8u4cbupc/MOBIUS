# PowerShell script to output the exact commands for creating PR and issues

Write-Host "=== Phase F Rollout Execution Plan ===" -ForegroundColor Green
Write-Host ""

Write-Host "1. Create the Phase F feature PR" -ForegroundColor Yellow
Write-Host "   Go to your repository on GitHub and create a new PR with these settings:" -ForegroundColor Gray
Write-Host "   - Base: staging" -ForegroundColor Gray
Write-Host "   - Head: phase-f/preview-image-matcher" -ForegroundColor Gray
Write-Host "   - Title: Phase F: Image Matcher UI + Preview backend stub" -ForegroundColor Gray
Write-Host "   - Description: Use the content from pr_body.md file" -ForegroundColor Gray
Write-Host "   - Labels: feature, phase-f, needs-review, ready-for-staging" -ForegroundColor Gray
Write-Host "   - Reviewers: developer, ops, team-lead" -ForegroundColor Gray
Write-Host "   - Assignee: developer" -ForegroundColor Gray
Write-Host ""

Write-Host "2. Create the CI workflow PR" -ForegroundColor Yellow
Write-Host "   Go to your repository on GitHub and create a new PR with these settings:" -ForegroundColor Gray
Write-Host "   - Base: staging" -ForegroundColor Gray
Write-Host "   - Head: ci/add-phase-f-verify-workflow" -ForegroundColor Gray
Write-Host "   - Title: CI: Add staging verify workflow for Phase F" -ForegroundColor Gray
Write-Host "   - Description: Adds post-deploy verification jobs (Linux + Windows) to verify Phase F preview and matcher functionality. Runs scripts/verify-phase-f.sh and .ps1. See docs/runbook-preview.md for run instructions." -ForegroundColor Gray
Write-Host "   - Labels: ci, phase-f" -ForegroundColor Gray
Write-Host "   - Reviewers: ops" -ForegroundColor Gray
Write-Host "   - Assignee: developer" -ForegroundColor Gray
Write-Host ""

Write-Host "3. Create the three follow-up issues" -ForegroundColor Yellow
Write-Host ""

Write-Host "   Issue 1: Preview Worker" -ForegroundColor Cyan
Write-Host "   Title: Preview Worker -- render queued chapter previews (Phase F)" -ForegroundColor Gray
Write-Host "   Description:" -ForegroundColor Gray
Write-Host "     Implement a background worker that consumes queued preview requests (created by /api/preview) and produces a concrete preview artifact (manifest and optionally a short MP4/thumbnail)." -ForegroundColor Gray
Write-Host "   Acceptance criteria:" -ForegroundColor Gray
Write-Host "     - Worker picks up queued preview artifacts from DATA_DIR/previews or a job queue." -ForegroundColor Gray
Write-Host "     - Produces preview-manifest.json with metadata and a preview.mp4 or thumbnails." -ForegroundColor Gray
Write-Host "     - Writes status (success|failed) and logs with requestId correlation." -ForegroundColor Gray
Write-Host "     - Emits metrics: preview_worker_jobs_total, preview_worker_jobs_failed_total, preview_worker_duration_ms." -ForegroundColor Gray
Write-Host "     - Unit and integration tests validating outputs." -ForegroundColor Gray
Write-Host "     - UI Preview triggers job and artifacts are retrievable via /api/preview/status/:jobToken." -ForegroundColor Gray
Write-Host "   Subtasks:" -ForegroundColor Gray
Write-Host "     - Define worker contract and schema." -ForegroundColor Gray
Write-Host "     - Implement job acquisition and locking." -ForegroundColor Gray
Write-Host "     - Integrate renderer or stub (ffmpeg/Python)." -ForegroundColor Gray
Write-Host "     - Add status endpoints, metrics, logs, and tests." -ForegroundColor Gray
Write-Host "   Owner: developer" -ForegroundColor Gray
Write-Host "   ETA: 5 days" -ForegroundColor Gray
Write-Host "   Labels: feature, phase-f, priority-high" -ForegroundColor Gray
Write-Host ""

Write-Host "   Issue 2: Asset Uploads and Hashed Storage" -ForegroundColor Cyan
Write-Host "   Title: Asset uploads and hashed storage -- upload endpoint + thumbnails" -ForegroundColor Gray
Write-Host "   Description:" -ForegroundColor Gray
Write-Host "     Implement server-side asset upload endpoints and hashed storage under DATA_DIR/assets. Compute content-hash for dedupe and generate thumbnails." -ForegroundColor Gray
Write-Host "   Acceptance criteria:" -ForegroundColor Gray
Write-Host "     - POST /api/projects/:id/assets accepts image uploads (multipart/form-data), validates MIME and size." -ForegroundColor Gray
Write-Host "     - Stores file at DATA_DIR/assets/<hash>/<original.ext> and generates thumb.jpg." -ForegroundColor Gray
Write-Host "     - GET /api/projects/:id/assets returns list with previewUrl, dimensions, mime type." -ForegroundColor Gray
Write-Host "     - Duplicate uploads deduped by hash." -ForegroundColor Gray
Write-Host "     - Unit & integration tests (upload -> thumbnail -> listing)." -ForegroundColor Gray
Write-Host "   Subtasks:" -ForegroundColor Gray
Write-Host "     - Endpoint + validation." -ForegroundColor Gray
Write-Host "     - Hash-based store + thumbnail generation (sharp)." -ForegroundColor Gray
Write-Host "     - Asset metadata store (JSON or SQLite table)." -ForegroundColor Gray
Write-Host "     - Client integration for asset library listing." -ForegroundColor Gray
Write-Host "   Owner: developer" -ForegroundColor Gray
Write-Host "   ETA: 3 days" -ForegroundColor Gray
Write-Host "   Labels: feature, phase-f, ux" -ForegroundColor Gray
Write-Host ""

Write-Host "   Issue 3: Packaging & Export Endpoint" -ForegroundColor Cyan
Write-Host "   Title: Export Packaging -- create downloadable tutorial bundle (zip)" -ForegroundColor Gray
Write-Host "   Description:" -ForegroundColor Gray
Write-Host "     Implement exporter that packages a project into a downloadable zip with container.json, assets, captions.srt and manifest + checksums." -ForegroundColor Gray
Write-Host "   Acceptance criteria:" -ForegroundColor Gray
Write-Host "     - POST /api/projects/:id/export triggers async export job, returns jobToken." -ForegroundColor Gray
Write-Host "     - Exports written to DATA_DIR/exports/<project>-<timestamp>.zip and a downloadUrl." -ForegroundColor Gray
Write-Host "     - container.json contains script + metadata + relative asset paths." -ForegroundColor Gray
Write-Host "     - Uses streaming zip to avoid memory spikes." -ForegroundColor Gray
Write-Host "     - Emits metrics: export_requests_total, export_failures_total, export_duration_ms." -ForegroundColor Gray
Write-Host "     - Unit/integration tests validate zip contents." -ForegroundColor Gray
Write-Host "   Subtasks:" -ForegroundColor Gray
Write-Host "     - Define container.json schema." -ForegroundColor Gray
Write-Host "     - Implement streaming packager (archiver or streaming lib)." -ForegroundColor Gray
Write-Host "     - Add export job queue and result endpoint." -ForegroundColor Gray
Write-Host "   Owner: developer" -ForegroundColor Gray
Write-Host "   ETA: 5 days" -ForegroundColor Gray
Write-Host "   Labels: feature, phase-f, packaging" -ForegroundColor Gray
Write-Host ""

Write-Host "=== Next Steps ===" -ForegroundColor Green
Write-Host "After creating the PRs and issues:" -ForegroundColor Gray
Write-Host "1. Confirm PRs opened and reviewers assigned." -ForegroundColor Gray
Write-Host "2. Confirm the staging-verify workflow PR exists and CI passes on that PR." -ForegroundColor Gray
Write-Host "3. Confirm the three issues exist and are assigned to developer." -ForegroundColor Gray
Write-Host "4. Run a manual dry-run of /api/preview after staging deploy and verify artifact + metric." -ForegroundColor Gray
Write-Host "5. Share failing logs or artifacts if something breaks -- cite requestId(s)." -ForegroundColor Gray