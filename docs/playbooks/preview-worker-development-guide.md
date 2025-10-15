# Preview Worker Development Guide

## Overview
This guide provides everything needed to begin development on the Preview Worker while PR creation/auth issues are being resolved. It includes issue breakdowns, setup scripts, and implementation guidance.

## Files Created

### Issue Definitions (JSON)
1. `preview_worker_issue_1.json` - Worker Skeleton & Job Model
2. `preview_worker_issue_2.json` - Queue & Concurrency Controls
3. `preview_worker_issue_3.json` - Renderer Integration
4. `preview_worker_issue_4.json` - Job Status & API Endpoints

### Documentation
5. `PREVIEW_WORKER_SUBTASKS.md` - Complete breakdown of all 12 subtasks
6. `PREVIEW_WORKER_DEVELOPMENT_GUIDE.md` - This document

### Setup Scripts
7. `setup_preview_worker.ps1` - PowerShell setup script for Windows
8. `setup_preview_worker.sh` - Bash setup script for Unix/Linux/macOS

## Getting Started

### 1. Environment Setup
Run the appropriate setup script for your platform:

**Windows (PowerShell):**
```powershell
.\setup_preview_worker.ps1
```

**Unix/Linux/macOS (Bash):**
```bash
chmod +x setup_preview_worker.sh
./setup_preview_worker.sh
```

Both scripts will:
- Verify Node.js and npm installation
- Create required directories
- Set up environment variables
- Install necessary dependencies (BullMQ, SQLite3)
- Create a worker script template
- Update package.json with run scripts

### 2. Run the Worker
After setup, you can start the worker with:
```bash
npm run worker:preview
```

### 3. Create GitHub Issues
Use the JSON files with your existing `create_prs_and_issues` scripts or manually create issues through the GitHub web interface.

## Development Approach

### Priority Order
1. **Worker Skeleton & Job Model** - Establish the basic worker infrastructure
2. **Queue & Concurrency Controls** - Implement job queuing and resource management
3. **Renderer Integration** - Connect the worker to the actual rendering process
4. **Job Status & API Endpoints** - Enable monitoring and control of jobs

### Key Implementation Details

#### Directory Structure
```
src/
  worker/
    previewWorker.js        # Main worker implementation
    jobHandlers/            # Job processing logic
      renderPreview.js      # Preview rendering handler
data/
  previews/                 # Preview artifacts storage
    {projectId}/
      {jobId}/
        preview.json        # Job result metadata
        preview.mp4         # Rendered preview (or other formats)
logs/                       # Worker logs
```

#### Environment Variables
- `DATA_DIR` - Root directory for data storage
- `REDIS_URL` - Redis connection URL (optional)
- `DEV_JOB_STORE` - Fallback to SQLite when Redis unavailable
- `PREVIEW_MAX_CONCURRENCY` - Maximum concurrent jobs
- `PREVIEW_QUEUE_MAX` - Maximum queue length

#### Metrics to Implement
- `preview_worker_jobs_total` (labels: outcome=success|failure|retry)
- `preview_worker_job_duration_seconds` (histogram)
- `preview_worker_queue_size` (gauge)
- `preview_worker_active_jobs` (gauge)

## Testing Strategy

### Unit Tests
- Mock job handlers to test success/failure paths
- Validate job payload processing
- Test concurrency and queue limits

### Integration Tests
- Run worker with small test jobs
- Verify artifact creation in DATA_DIR
- Test dry-run vs. real rendering

### CI/CD Considerations
- Use small, fast renderers for CI
- Set low concurrency for CI environments
- Test both Redis and SQLite paths

## Security Considerations

- Prevent secret leakage in logs
- Implement auth for artifact downloads
- Validate job payloads
- Sanitize file paths to prevent directory traversal

## Next Steps

1. **Immediate**: Run setup script and verify worker starts
2. **Short-term**: Implement the top 4 priority issues
3. **Medium-term**: Add metrics, logging, and security features
4. **Long-term**: Implement full test suite and CI integration

## Files Summary

| File | Purpose | Type |
|------|---------|------|
| `preview_worker_issue_*.json` | GitHub issue definitions | JSON |
| `PREVIEW_WORKER_SUBTASKS.md` | Complete task breakdown | Documentation |
| `setup_preview_worker.ps1` | Windows setup script | PowerShell |
| `setup_preview_worker.sh` | Unix/Linux setup script | Bash |

These files provide a complete foundation for beginning Preview Worker development immediately, even while resolving GitHub token and PR creation issues.