# Preview Worker Subtasks Breakdown

## Overview
This document provides a prioritized breakdown of the Preview Worker implementation with acceptance criteria, implementation notes, and estimates to enable immediate development while PR/auth issues are being resolved.

## Core Design Choices
- **Queue System**: BullMQ (Redis) for production with SQLite fallback for local development
- **Language**: Node.js (same codebase) with optional Python/ffmpeg spawning
- **Storage**: DATA_DIR with content-hash paths
- **Metrics**: prom-client counters/histograms exposed via existing metrics endpoint

## Top Priority Subtasks (Ready for Implementation)

### 1. Worker Skeleton & Job Model (P0, 6-10h)
**File**: `preview_worker_issue_1.json`

Key implementation:
- New worker process at `src/worker/previewWorker.js`
- BullMQ with Redis or SQLite fallback
- Basic metrics registration
- Start script documentation

### 2. Queue & Concurrency Controls (P0, 4-6h)
**File**: `preview_worker_issue_2.json`

Key implementation:
- `PREVIEW_MAX_CONCURRENCY` and `PREVIEW_QUEUE_MAX` environment variables
- Backpressure handling (429 responses when queue full)
- Queue size metrics

### 3. Renderer Integration (P0, 8-16h)
**File**: `preview_worker_issue_3.json`

Key implementation:
- Spawn external renderer (Python/ffmpeg)
- Stream logs to files
- Handle dry-run vs. real rendering
- Process exit status handling

### 4. Job Status & API Endpoints (P0, 4-6h)
**File**: `preview_worker_issue_4.json`

Key implementation:
- POST /api/preview enhancement
- GET /api/preview/:jobId/status endpoint
- GET /api/preview/:jobId/artifact endpoint

## Additional Subtasks (For Future Implementation)

5. **Storage & Asset Hashing** (P1, 4-6h)
   - Content-hash paths for artifacts
   - container.json with checksums

6. **Retry Logic, Errors, and Dead-letter** (P1, 4-6h)
   - Exponential backoff retries
   - Dead-letter queue for persistent failures

7. **Metrics & Logging** (P0, 3-5h)
   - Expanded Prometheus metrics
   - Structured JSON logging

8. **Security & Secrets Handling** (P1, 2-4h)
   - Prevent secret leakage in logs
   - Auth for artifact downloads

9. **Unit/Integration Tests** (P0, 6-10h)
   - Jest unit tests
   - Integration smoke tests

10. **Staging Runbook & Verification Script Updates** (P1, 3-4h)
    - Update SMOKE_TESTS.md and MONITORING_AND_ROLLBACK.md
    - Add worker checks to verification scripts

11. **CI Job for Worker Smoke Testing** (P2, 4-8h)
    - GitHub Action to test worker post-deployment

12. **Ops: Redis Readiness + Fallback Config** (P1, 1-2h)
    - Configure Redis for BullMQ in staging
    - Document fallback path for local development

## Job Payload Schema
```json
{
  "jobId": "uuid-v4",
  "projectId": "project-123",
  "previewRequest": {
    "chapterId": "chapter-1",
    "steps": [...],
    "assets": [...],
    "audio": {...}
  },
  "dryRun": true|false,
  "requestId": "req-abc-123"
}
```

## Implementation Guidance
- Keep job handlers idempotent and side-effect safe
- Use streaming I/O for large files
- Add requestId correlation for log tracing
- Stream renderer stdout/stderr to log files
- Avoid passing raw secrets to renderer
- Mock renderer for fast, deterministic tests

## Total Estimated Effort
- Core worker implementation: 40-60 developer hours
- Additional tasks (CI, Ops): 6-12 hours

## Files Created
1. `preview_worker_issue_1.json` - Worker Skeleton & Job Model
2. `preview_worker_issue_2.json` - Queue & Concurrency Controls
3. `preview_worker_issue_3.json` - Renderer Integration
4. `preview_worker_issue_4.json` - Job Status & API Endpoints
5. `PREVIEW_WORKER_SUBTASKS.md` - This summary document

These JSON files can be used with the existing `create_prs_and_issues` scripts or manually created through the GitHub web interface.