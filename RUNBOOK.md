# Mobius Games Tutorial Generator - Runbook

## Overview
This document provides essential information for on-call engineers supporting the Mobius Games Tutorial Generator pipeline.

## System Architecture
- **Frontend**: React application (port 3000)
- **Backend API**: Node.js/Express server (port 5001)
- **Database**: SQLite
- **External Services**: OpenAI, ElevenLabs, BoardGameGeek API
- **Infrastructure**: PM2 process manager

## Key Endpoints

### Health and Monitoring
- `GET /api/health` - Basic health check
- `GET /api/health/details` - Detailed health information
- `GET /livez` - Kubernetes liveness probe
- `GET /readyz` - Kubernetes readiness probe
- `GET /metrics` - Prometheus metrics (secured)

### Core Functionality
- `POST /api/extract-bgg-html` - Extract game metadata from BGG
- `POST /api/extract-components` - Extract components from rulebook
- `POST /tts` - Text-to-speech generation
- `POST /summarize` - Generate tutorial script

## Common Issues and Resolutions

### HighErrorRate

#### Investigation Steps:
1. Check `/metrics` for error rate spikes
2. Examine `http_request_duration_seconds` and `tts_cache_hits_total` ratio
3. Review PM2 logs:
   ```bash
   pm2 logs mobius-api --lines 300
   ```

#### Resolution:
- If TTS provider is degraded:
  - Toggle `FEATURE_TTS_DISABLE` environment variable
  - Switch to cached-only mode
  - Redeploy with updated configuration

### LatencyP95TooHigh

#### Investigation Steps:
1. Inspect event loop delay metrics
2. Check RSS (memory usage)
3. Review upstream latency from external services

#### Resolution:
- Scale out PM2 cluster:
  ```bash
  pm2 scale mobius-api 4
  ```
- Reduce `MAX_CONCURRENCY` setting
- Check upstream service latency (OpenAI, ElevenLabs)

### Resource Exhaustion

#### Investigation Steps:
1. Monitor system resources:
   ```bash
   pm2 monit
   ```
2. Check for memory leaks in PM2 logs

#### Resolution:
- Restart PM2 processes:
  ```bash
  pm2 restart mobius-api
  ```
- Check for file descriptor leaks
- Verify temporary file cleanup

## Environment Variables

### Critical Variables
- `OPENAI_API_KEY` - OpenAI API key
- `ELEVENLABS_API_KEY` - ElevenLabs TTS API key
- `IMAGE_EXTRACTOR_API_KEY` - Image extraction service key

### Security Variables
- `METRICS_TOKEN` - Bearer token for metrics endpoint
- `CORS_ORIGIN` - Allowed CORS origins
- `TTS_RATE_LIMIT` - TTS requests per minute per IP

### Operational Variables
- `PORT` - API server port (default: 5001)
- `OUTPUT_DIR` - Output directory for generated content
- `REQUEST_BODY_LIMIT` - Maximum request body size
- `REQUEST_TIMEOUT_MS` - Request timeout in milliseconds

## Monitoring and Alerting

### Key Metrics to Watch
- `tts_requests_total` - Total TTS requests
- `tts_cache_hits_total` - TTS cache hit rate
- `http_request_duration_seconds` - HTTP request latency
- `extract_pdf_seconds` - PDF extraction duration
- `build_info` - Deployment tracking

### Alerting Rules (Prometheus)
```yaml
# High error rate
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High error rate (instance {{ $labels.instance }})"
    description: "High error rate detected\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"

# High latency
- alert: LatencyP95TooHigh
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Latency P95 too high (instance {{ $labels.instance }})"
    description: "Latency P95 above 2 seconds\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"

# TTS service issues
- alert: TTSServiceDegraded
  expr: rate(tts_requests_total[5m]) == 0
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "TTS service degraded (instance {{ $labels.instance }})"
    description: "No TTS requests processed in last 10 minutes\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"
```

## Deployment and Maintenance

### Standard Deployment
```bash
# Update code
git pull origin main

# Install dependencies
npm ci

# Restart services
pm2 reload all
```

### Emergency Rollback
```bash
# Revert to previous version
git reset --hard HEAD~1

# Reinstall dependencies
npm ci

# Restart services
pm2 reload all
```

### Log Rotation
```bash
# PM2 log rotation is configured automatically
# Check configuration:
pm2 conf
```

## Contact Information

### Development Team
- Primary: [dev-team-email]
- Slack: #mobius-games-dev

### External Services
- OpenAI Support: https://help.openai.com
- ElevenLabs Support: https://help.elevenlabs.io
- BoardGameGeek API: https://boardgamegeek.com/wiki/page/BGG_XML_API2

## Change History
- v1.0.0: Initial runbook creation