# Preview monitoring & rollback (short)

## Metrics to monitor

- preview_requests_total (counter)
- preview_failures_total (counter)
- preview_duration_ms (histogram)
- preview_queue_length (gauge)
- DATA_DIR free percentage

## Alerts

- preview_failures_total rate >= 1% over 5m → Pager P2
- preview_queue_length >= 80% PREVIEW_QUEUE_MAX for > 10m → Pager P1
- DATA_DIR free < 15% → Pager P1

## First response steps

- Check recent logs for preview_request / preview_response with requestId.
- Inspect preview artifacts under DATA_DIR/previews/<projectId>/.
- Check metrics & job queue depth.
- If failing: set PREVIEW_MAX_CONCURRENCY=0 (stop accepting new render work) and pause traffic.
- If disk space low: free space, move older exports, or increase volume.
- If widespread errors, rollback the service to previous tag.

## Rollback conditions

- sustained preview_failures_total > 5% for 10m AND correlated errors to recent deploy
- queue backlog causing resource exhaustion and high CPU/memory for > 10m
- disk full threat

## Post-incident

- Run forensic script to collect artifacts and send to SRE with timeline and requestIds.
- Re-run verification scripts after rollback to confirm stability.