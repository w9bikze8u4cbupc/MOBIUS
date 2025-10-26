# Mobius Rendering Pipeline Runbook

This document provides guidance for incident response and operational procedures for the Mobius Tutorial Generator's video rendering pipeline.

## Service Level Indicators (SLIs)

- Render success rate = completed / (started)
- P50/P95 render duration (preview/full separately)
- Timeout rate = timeouts / (started)
- FFmpeg speed ratio distribution (median, 5th percentile)

## Service Level Objectives (SLOs)

- Success rate: ≥ 99.5% rolling 7 days
- P95 duration: preview ≤ 45s wall time; full ≤ configured budget
- Timeouts: ≤ 0.5% of renders per 7 days

## Alerting

### Prometheus Alert Rules

Alert rules are defined in [alerts/rendering.rules.yml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/alerts/rendering.rules.yml):

1. **RenderErrorSpike** - Triggers when render failures exceed 5% over 5 minutes
2. **RenderTimeoutSpike** - Triggers when timeouts exceed 1% over 10 minutes
3. **RenderDurationP95Exceeded** - Triggers when P95 render duration exceeds budget

## Incident Response

### Symptoms and First Response

#### Alert: RenderErrorSpike → Many failures
**First response:**
- Pull latest NDJSON logs and render_meta.json from failing runs
- Check metrics endpoint: `curl http://host:9464/metrics`
- Verify system resources: CPU, IO, memory, tmp space
- Validate ffmpeg version and fonts availability

#### Alert: RenderTimeoutSpike → Stuck/stalled ffmpeg or resource starvation
**First response:**
- Check system resource usage (CPU, memory, disk IO)
- Verify temporary directory space
- Check for zombie FFmpeg processes
- Review timeout configuration

#### Alert: DurationP95Exceeded → Performance regression or input skew
**First response:**
- Analyze FFmpeg speed ratio metrics
- Check for changes in input data size or complexity
- Review system performance metrics

### Remediation Playbooks

#### Timeouts
- Raise timeoutMs and add backoff
- Confirm checkpoint resume skips done stages
- Check for resource constraints (CPU, memory, disk IO)

#### Performance Regression
- Inspect speed ratio metrics
- Down-tune caps (maxFps/bitrate)
- Enable envelope ducking over sidechain if CPU-bound

#### Failures Clustering by Reason
- Fix root cause (path validation, escaping, missing inputs)
- Add validation for common failure modes
- Update test fixtures to cover the regression

### Post-Incident Actions

1. Update test fixtures to cover the regression
2. Add alert annotation with root cause and remediation code links
3. Document lessons learned in this runbook
4. Review and update SLOs if needed

## Log Policy and Compliance

### NDJSON Fields

All logs include these fields:
- `ts`: Timestamp
- `level`: Log level
- `sessionId`: Render session identifier
- `jobId`: Render job identifier
- `stage`: Current rendering stage
- `message`: Log message
- `progress`: Completion percentage
- `etaSec`: Estimated time of arrival in seconds
- `speed`: Processing speed ratio
- `fps`: Frames per second
- `reason`: Failure reason (on failure)

### Redaction

- Strip PII and external absolute paths
- Truncate long subtitle lines
- Escape safely for vf=subtitles

### Retention

- CI: 30 days for failure artifacts
- Production: 7-14 days hot, 90 days cold (S3 IA/Glacier)

### Rotation

- Daily rollover by size/time
- Gzip old logs

## Operational Toggles and Safe Defaults

### Environment Flags

- `METRICS_PORT=9464`
- `LOG_LEVEL=info`
- `RENDER_TIMEOUT_MS=900000`
- `MEDIA_CAPS`: maxWidth=1920, maxHeight=1080, maxFps=30, maxBitrateKbps=6000
- `LOUDNESS`: enabled=true, targetI=-16, lra=11, tp=-1.5

### CLI Examples

Start metrics server:
```bash
node scripts/demo-observability.js --metrics-port 9464
```

Force caps and loudness:
```bash
node scripts/render.js --mode full --caps.maxFps 30 --loudness.enabled true
```

## Deployment Notes

### Container Deployment

Recommended docker run:
```bash
docker run --cpus=2 --memory=3g --pids-limit=256 -p 9464:9464 -v /input:/input -v /output:/output mobius-renderer:latest node scripts/render.js --mode preview
```

### Kubernetes Resources

Resource requests/limits:
- requests: cpu 1000m, mem 1.5Gi
- limits: cpu 2000m, mem 3Gi

### Health Checks

- Liveness: metrics endpoint 200 OK
- Readiness: quick dry-run arg build endpoint (optional)