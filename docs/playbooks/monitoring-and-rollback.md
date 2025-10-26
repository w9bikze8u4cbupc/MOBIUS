# Monitoring & rollback (copy/paste into runbook)

## Metrics to monitor

- preview_requests_total (counter)
- preview_failures_total (counter)
- preview_duration_ms (histogram)
- preview_queue_length (gauge)
- DATA_DIR free space (gauge)

## Alerts & thresholds

- preview_failures_total rate > 1% over 5m → P2 alert
- preview_queue_length >= 80% PREVIEW_QUEUE_MAX for > 10m → P1
- DATA_DIR free < 15% → P1

## Immediate triage steps

- Check logs for requestId.
- Inspect DATA_DIR/previews for artifacts.
- Check metrics and queue depth.
- If failing: set PREVIEW_MAX_CONCURRENCY=0 (block new render jobs) and pause traffic.
- If disk space low: free space or increase volume.
- Rollback to prior staging tag if errors persist and match rollout timeline.