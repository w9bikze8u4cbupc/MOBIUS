# Production Readiness Guide

This document outlines the steps to ensure the Mobius Games Tutorial Generator is production-ready with all recommended polish items implemented.

## Log Rotation (PM2)

### Setup Commands
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 save
```

### Verification
```bash
# Check if pm2-logrotate is installed
pm2 list

# Check log rotation settings
pm2 get pm2-logrotate
```

## Stronger SSRF/URL Guardrails

### Implementation
The system enforces:
- HTTPS only in production
- eTLD+1 allowlist
- Blocking of private IP ranges (10/8, 172.16/12, 192.168/16, 127/8, ::1, link-local)
- DNS resolution verification to public IPs

### Verification
Test with various URLs to ensure proper blocking:
```bash
# Test private IP blocking
curl -X POST http://localhost:3000/api/pdf -d '{"url": "http://192.168.1.1/private.pdf"}'

# Test non-HTTPS in production
curl -X POST http://localhost:3000/api/pdf -d '{"url": "http://example.com/public.pdf"}'
```

## Prometheus Metrics

### Setup
Prometheus metrics are exposed at `/metrics` endpoint with:
- `tts_requests_total` - Counter for TTS requests
- `tts_cache_hits_total` - Counter for TTS cache hits
- `extract_pdf_seconds` - Histogram for PDF extraction duration
- `render_seconds` - Histogram for render duration
- `http_request_duration_seconds` - Histogram for HTTP request duration

### Verification
```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Generate some load and verify counters increment
curl -X POST http://localhost:3000/api/tts -d '{"text": "Hello world", "voice": "test"}'
curl http://localhost:3000/metrics | grep tts_requests_total
```

## Event Loop Delay & Resource Hints

### Implementation
The `/api/health/details` endpoint includes:
- Event loop delay metrics
- Resource usage information
- Memory usage details

### Verification
```bash
# Check health details endpoint
curl http://localhost:3000/api/health/details
```

Expected response fields:
- `eventLoopDelayMs`
- `rssMB`
- `heapUsedMB`
- `cpuUser`
- `cpuSystem`

## CI Environments + Strictness

### Implementation
- Preflight checks are strict in CI environment only
- Development environment stays lenient
- CI fails on missing `ELEVENLABS_API_KEY` or binaries
- Development warns on missing requirements

### Verification
```bash
# Run in development mode (should warn but not fail)
npm run preflight

# Run in CI mode (should fail if requirements missing)
CI=1 npm run preflight -- --strict --require-tts
```

## PM2 Production Profile

### Setup
Use the ecosystem.config.js for PM2 configuration:
```bash
# Start in cluster mode using all CPU cores
pm2 start ecosystem.config.js --env production

# Graceful reload
pm2 reload mobius-api
```

### Verification
```bash
# Check PM2 status
pm2 list

# Check cluster mode and CPU usage
pm2 show mobius-api
```

## Asset Provenance Completeness

### Implementation
Each saved asset has a corresponding `.meta.json` file with:
- `source_url`
- `license`
- `sha256`
- `created_at`
- `modified_at`
- `size_bytes`

### Verification
```bash
# Generate provenance metadata
npm run generate:provenance

# Check metadata coverage
find uploads -type f -name "*.meta.json" | wc -l
find uploads -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.mp4" -o -name "*.wav" \) | wc -l
```

## TTS Smoothing Polish

### Implementation
- Crossfade between TTS chunks to eliminate clicks
- Loudness normalization with loudnorm filter

### Usage
```bash
# Smooth TTS chunks
npm run tts:smoothing -- ./tts_chunks/ output.wav

# Join with crossfade
npm run tts:smooth-join -- chunk1.wav chunk2.wav chunk3.wav output.wav
```

## Storyboard/Timeline Schema Tightening

### Implementation
In strict mode:
- Unknown fields are forbidden
- Discriminators are used for segment types
- Clear AJV error paths for bad payloads

### Verification
```bash
# Validate with strict schema
npm run validate:storyboard:strict
npm run validate:timeline:strict

# Tighten schemas
npm run schemas:tighten
```

## Canary Rollout Plan

### Implementation
1. Start at 5-10% traffic
2. Monitor P95 latency and 5xx alerts
3. Gradually ramp traffic
4. Ensure no error budget burn during canary window

### Verification
Monitor metrics during deployment:
```bash
# Check error rates
curl http://localhost:3000/metrics | grep http_request_duration_seconds_count

# Check latency
curl http://localhost:3000/metrics | grep http_request_duration_seconds_bucket
```

## Quick Verification Commands

### Preflight (non-strict dev)
```bash
npm run preflight
```

### Release gates (CI-like strict)
```bash
node scripts/preflight.cjs --base http://localhost:3000 --strict --require-tts
npm run validate:storyboard
npm run validate:timeline
```

### Concurrency blast (PowerShell)
```powershell
1..40 | ForEach-Object { Start-Job { Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing | Select -Expand StatusCode } } | Receive-Job -Wait -AutoRemoveJob | Sort | Group | % { "(.Count) (.Name)" }
```

### TTS cache timing
Run the same /tts body twice; confirm second call ≪ first.

### A/V verify
```bash
ffprobe -v error -show_streams -of json dist\catan.en.mp4
```

### Cleanup (dry run)
```bash
node scripts/cleanup.js --paths "src/api/uploads,dist" --ttlDays 7 --dryRun
```