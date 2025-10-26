# Preview Worker Artifacts Summary

## Overview
This document catalogs all artifacts related to the Preview Worker implementation, including manifests, scripts, secrets, and validation procedures.

## Core Implementation Files

### Worker Service
- `src/worker/previewWorker.js` - Main worker implementation with BullMQ integration
- `src/worker/previewWorkerClient.js` - Client for enqueuing jobs and checking status
- `src/worker/previewMetrics.js` - Metrics collection for the worker
- `src/worker/health.js` - Health check endpoint for the worker system
- `src/worker/jobHandlers/renderPreview.js` - Preview rendering handler (placeholder)

### Schema and Validation
- `schemas/preview-job.schema.json` - JSON Schema for strict payload validation
- `scripts/validatePreviewPayload.js` - Payload validation helper
- `preview_payload_minimal.json` - Minimal valid payload example
- `preview_payload_full.json` - Full/realistic payload example

## Testing Artifacts

### Unit Tests
- `tests/worker/previewWorker.comprehensive.test.js` - Comprehensive test suite
- `tests/worker/previewWorker.test.js` - Unit tests for worker functionality

### Validation Tests
- `scripts/testPreviewPayloads.js` - Automated test suite for validation
- `scripts/testPreviewPayloads.mjs` - ES module version of test suite

## CI/CD Artifacts

### GitHub Actions Workflow
- `.github/workflows/ci-preview-worker.yml` - CI workflow for worker tests

## Deployment Artifacts

### Systemd Service
- `preview-worker.service` - systemd unit file for running worker as a service

### Environment Configuration
- `/etc/mobius/preview-worker.env` - Environment file for production deployment (example)

## Verification and Validation Scripts

### Cross-Platform Verification
- `scripts/verify-preview-worker.sh` - Unix/Linux/macOS verification script
- `scripts/verify-preview-worker.ps1` - Windows PowerShell verification script

### Payload Validation
- `scripts/validate_preview_payload.sh` - Bash validation script
- `scripts/validate_preview_payload.ps1` - PowerShell validation script

## Documentation

### Implementation Documentation
- `PREVIEW_WORKER_IMPLEMENTATION_SUMMARY.md` - Implementation summary
- `PREVIEW_PAYLOAD_VALIDATION_SUMMARY.md` - Validation summary
- `IMPLEMENTATION_SUMMARY.md` - Overall implementation summary

### User Documentation
- `docs/preview_payload_validation.md` - Documentation for payload validation
- `ROLLOUT_PLAN_PREVIEW_WORKER.md` - Rollout plan with monitoring and alerting

### PR Documentation
- `PR_BODY_PREVIEW_WORKER.md` - PR body for the implementation

## API Endpoints

### Job Management
- `POST /api/preview/job` - Enqueue a preview job
- `GET /api/preview/job/:jobId/status` - Get job status
- `GET /api/preview/job/:jobId/artifact` - Get job artifact URL

### Monitoring
- `GET /api/preview/queue/metrics` - Get queue metrics
- `GET /api/preview/worker/health` - Get worker health status

## Dependencies

### Production Dependencies
- `bullmq` - Job queue system (v5.61.0)
- `ioredis` - Redis client (v5.8.1)

### Development Dependencies
- `@babel/preset-env` - Babel preset for environment targeting
- `@babel/preset-typescript` - Babel preset for TypeScript
- `jest` - Testing framework
- `@types/jest` - Jest type definitions

## Environment Variables

### Required
- `REDIS_URL` - Redis connection string (default: redis://127.0.0.1:6379)

### Optional
- `PREVIEW_QUEUE_NAME` - Name of the preview job queue (default: preview-jobs)
- `PREVIEW_WORKER_CONCURRENCY` - Number of concurrent jobs (default: 2)
- `PREVIEW_QUEUE_MAX` - Maximum queue size (default: 20)
- `DATA_DIR` - Directory for storing preview artifacts (default: ./data)

## npm Scripts

### Worker Scripts
- `worker:preview` - Run the preview worker

### Test Scripts
- `test:preview-payloads` - Run payload validation tests
- `test` - Run all unit tests

## Metrics

### Counters
- `preview_worker_job_outcomes_total` - Total number of preview jobs by outcome
- `preview_requests_total` - Total number of preview requests
- `preview_failures_total` - Total number of preview failures

### Histograms
- `preview_worker_job_duration_seconds` - Duration of preview job processing in seconds

## Health Check Endpoints

### Worker Health
- `GET /api/preview/worker/health` - Returns health status of the worker system

### Response Format
```json
{
  "status": "healthy",
  "timestamp": "2025-10-08T12:00:00.000Z",
  "redis": {
    "status": "connected",
    "url": "redis://127.0.0.1:6379"
  },
  "queue": {
    "name": "preview-jobs",
    "waiting": 0,
    "active": 0,
    "completed": 0,
    "failed": 0,
    "delayed": 0,
    "total": 0
  }
}
```

## Rollout and Monitoring

### Deployment Commands
```bash
# Copy service file
sudo cp preview-worker.service /etc/systemd/system/

# Reload systemd and start
sudo systemctl daemon-reload
sudo systemctl enable preview-worker
sudo systemctl start preview-worker

# View logs
sudo journalctl -u preview-worker -f
```

### Monitoring Endpoints
- Health check: `GET /api/preview/worker/health`
- Queue metrics: `GET /api/preview/queue/metrics`
- Prometheus metrics: `/metrics` (if configured)

### Alerting Rules (Prometheus Examples)
- High failure rate: `rate(preview_job_failed[5m]) / max(1, rate(preview_job_started[5m])) > 0.1`
- Queue backlog: `increase(bullmq_queue_jobs_waiting_total{queue="preview-jobs"}[5m]) > 100`

## Rollback Procedures

### Service Rollback
```bash
# Stop worker service
sudo systemctl stop preview-worker

# Revert commit or restore previous image
# Redeploy previous worker/service
```

### Data Considerations
- Failed jobs in DLQ may need manual remediation
- Critical jobs may need reprocessing after rollback