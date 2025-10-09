# Preview Feature Monitoring & Rollback Procedures

## Monitoring

### Key Metrics to Watch

1. **preview_failures_total** - Counter for failed preview requests
2. **preview_requests_total** - Counter for total preview requests
3. **preview_duration_ms** - Histogram for preview request processing time
4. **preview_queue_length** - Gauge for current queue depth
5. **DATA_DIR disk usage** - Percentage of disk space used

### Alert Thresholds

- **preview_failures_total rate > 1% for 5m** → Investigate (P2 alert)
- **preview_queue_length >= PREVIEW_QUEUE_MAX * 0.8 for > 10m** → P1 alert
- **DATA_DIR free space < 15%** → P1 alert

## Rollback Procedures

### When to Rollback

1. Sustained preview failure rate > 5% for 10 minutes correlated to recent deploy
2. Queue backlog causes resource exhaustion or increased error rates with CPU/mem > 80% for 10 minutes
3. Disk full risk due to uncontrolled artifact generation

### Rollback Steps

1. **Check Logs**: Use requestId from error responses to trace specific failures in logs
2. **Inspect Artifacts**: Examine preview artifacts under DATA_DIR/previews for corruption or unexpected content
3. **Throttle Traffic**: Set PREVIEW_MAX_CONCURRENCY to 0 or pause incoming traffic to preview endpoint
4. **Rollback Deployment**: Revert to previous staging tag using your standard rollback procedure
5. **Verify Recovery**: Confirm metrics return to normal and new preview requests succeed

### Runbook Actions

1. **For High Failure Rate**:
   - Check logs for error patterns
   - Validate input data formats
   - Verify dependencies (ffmpeg, etc.) are available

2. **For Queue Backlog**:
   - Reduce PREVIEW_MAX_CONCURRENCY temporarily
   - Check worker health and resource allocation
   - Consider increasing PREVIEW_QUEUE_MAX if legitimate traffic spike

3. **For Disk Space Issues**:
   - Implement aggressive cleanup of old preview artifacts
   - Check for orphaned files not associated with active projects
   - Consider reducing retention period for preview artifacts