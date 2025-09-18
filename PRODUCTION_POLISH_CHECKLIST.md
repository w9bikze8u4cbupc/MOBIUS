# Mobius Games Tutorial Generator - Production Polish Checklist

This checklist ensures the pipeline is fully production-ready with all critical refinements implemented.

## 1. OCR Enablement (When You Have Admin)

### Installation (Windows/Chocolatey, Admin)
```powershell
choco install tesseract
# Reopen terminal so PATH refreshes
tesseract --version
```

### Acceptance Criteria
- [ ] `tesseract` prints a version
- [ ] Endpoint with `{"ocr":true}` returns 200 without crashing
- [ ] OCR is behind env flag: `OCR_ENABLE=true`
- [ ] Tunable with `OCR_TIMEOUT_MS` and `OCR_LANGS`

## 2. Prod Runtime Config

### PowerShell (Windows)
```powershell
$env:REQUEST_TIMEOUT_MS="60000"
$env:MAX_CONCURRENCY="20"
$env:URL_WHITELIST="localhost,127.0.0.1,example.com" # adjust
$env:USE_PDFJS_LEGACY="1"
npm run server
```

### Acceptance Criteria
- [ ] Health endpoints return 200
- [ ] Concurrency blast test returns predominantly 200 with no 5xx

## 3. TTS Stability + Smoothing

### Smoke Test for Cache and Audio Quality
```powershell
# Call your TTS twice to confirm cache
Measure-Command { Invoke-RestMethod -Uri "http://localhost:5001/tts" -Method POST -Body (@{text="Smooth join check."; game="Catan"; lang="en"} | ConvertTo-Json) -ContentType "application/json" | Out-Null }
Measure-Command { Invoke-RestMethod -Uri "http://localhost:5001/tts" -Method POST -Body (@{text="Smooth join check."; game="Catan"; lang="en"} | ConvertTo-Json) -ContentType "application/json" | Out-Null }
```

### Acceptance Criteria
- [ ] 2nd call notably faster
- [ ] Playback has no audible clicks at chunk boundaries

### Optional Polish (Later)
- [ ] Replace silence splice with short acrossfade in ffmpeg
- [ ] Normalize loudness to EBU R128 using loudnorm

## 4. Render with Audio (Non-Preview)

### Command
```powershell
node scripts/render_with_audio.js `
  --timeline "work\timeline.en.json" `
  --audioDir "src\api\uploads" `
  --out "dist\catan.en.mp4"

ffprobe -v error -show_streams -of json dist\catan.en.mp4 | jq .
```

### Acceptance Criteria
- [ ] Video stream: h264
- [ ] Audio stream: aac
- [ ] Duration within ~250 ms of intended A/V target

## 5. Log Correlation + Hygiene Spot-Check

### PowerShell
```powershell
$REQ=[Guid]::NewGuid().ToString()
Invoke-WebRequest -Uri "http://localhost:5001/api/health/details" -Headers @{"X-Request-ID"=$REQ} -UseBasicParsing | Out-Null
# Check server logs for that requestId; verify no secrets/PII are logged.
```

### Acceptance Criteria
- [ ] requestId present in logs
- [ ] No secrets/PII in logs

## 6. Retention Cleanup Dry Run

### Command
```powershell
node scripts/cleanup.js --paths "src/api/uploads,dist" --ttlDays 7 --dryRun
```

### Acceptance Criteria
- [ ] Lists candidates over TTL
- [ ] Does not delete in dry run
- [ ] Schedule with Windows Task Scheduler for daily runs without --dryRun in prod

## 7. Monitoring Smoke (Local Synthetic)

### PowerShell
```powershell
1..10 | ForEach-Object {
  $t = Measure-Command { Invoke-WebRequest -Uri "http://localhost:5001/api/health/details" -UseBasicParsing | Out-Null }
  Write-Host (Get-Date -Format "HH:mm:ss") "200 $([math]::Round($t.TotalSeconds,2))s"
  Start-Sleep -Seconds 3
}
```

### Acceptance Criteria
- [ ] All 200 with stable latency (no upward drift)
- [ ] Add external synthetic (UptimeRobot/Pingdom) on /api/health/details in production

## 8. CI Release Gates

### Strict Preflight in CI
```bash
node scripts/preflight.cjs --base http://localhost:5001 --strict --require-tts
```

### Schema Validation
```bash
npm run validate:storyboard
npm run validate:timeline
```

### Acceptance Criteria
- [ ] Preflight 0 failures in CI image; warnings treated as failures under --strict
- [ ] All schema validations PASS

## 9. Windows Service (Survives Reboots)

### Option A: PM2 (Works on Windows)
```bash
npm i -g pm2
pm2 start start-server.js --name mobius-api --time
pm2 save
pm2 startup # follow instructions (admin PowerShell)
```

### Option B: NSSM (Non-Sucking Service Manager)
1. Install nssm
2. `nssm install MobiusAPI "C:\Program Files\nodejs\node.exe" "C:\path\to\start-server.js"`
3. Set Start directory, environment variables, and stdout/stderr redirection

### Acceptance Criteria
- [ ] Service auto-starts on boot
- [ ] Logs are rotated or captured by PM2/NSSM

## 10. Asset Provenance (Optional Compliance)

### Pattern
For each saved image X.png also write X.png.meta.json with:
- [ ] source_url
- [ ] retrieval_timestamp
- [ ] license/terms (if known)
- [ ] hash (sha256)

## 11. Edge-Case Tests (To Run Later)

- [ ] Very small PDFs (only cover page)
- [ ] Very large PDFs (size/time thresholds respected)
- [ ] Non-BGG PDFs with "Contents/Components" phrasing in FR/DE/ES
- [ ] TTS paragraphs > 5k chars (chunking holds, cache uses consistent hash)
- [ ] Timeline without audio track (renderer still outputs valid video or fails with clear error)

## 12. ESM Safety Patterns (Already Implemented)

- [ ] Use dynamic import for Node core modules in routes where needed:
  ```javascript
  const { createHash } = await import('node:crypto');
  ```
- [ ] Lazy-load pdfjs legacy inside handlers; avoid top-level imports to prevent startup crashes

## Log Rotation (PM2)
- [ ] Install pm2-logrotate
- [ ] Configure max_size to 10M
- [ ] Set retain to 14
- [ ] Enable compression
- [ ] Save PM2 configuration

## Stronger SSRF/URL Guardrails
- [ ] Enforce HTTPS only in production
- [ ] Implement eTLD+1 allowlist
- [ ] Block private IP ranges (10/8, 172.16/12, 192.168/16, 127/8, ::1, link-local)
- [ ] Verify DNS resolves to public IPs
- [ ] Return 400/403 for non-whitelisted/private targets
- [ ] Log audit entries for blocked requests

## Prometheus Metrics
- [ ] Install prom-client
- [ ] Create /metrics endpoint
- [ ] Implement counters: tts_requests_total, tts_cache_hits_total
- [ ] Implement histograms: extract_pdf_seconds, render_seconds, http_request_duration_seconds
- [ ] Verify metrics endpoint returns text format
- [ ] Confirm counters increment during load

## Event Loop Delay & Resource Hints
- [ ] Add monitorEventLoopDelay from node:perf_hooks
- [ ] Include process.resourceUsage()
- [ ] Add memory usage metrics
- [ ] Expose fields: eventLoopDelayMs, rssMB, heapUsedMB, cpuUser/system

## CI Environments + Strictness
- [ ] Make preflight strict in CI only
- [ ] Keep dev environment lenient
- [ ] CI fails on missing ELEVENLABS_API_KEY or binaries
- [ ] Dev warns on missing requirements

## PM2 Production Profile
- [ ] Configure cluster mode with all CPU cores
- [ ] Set up ecosystem.config.js with env vs env_production
- [ ] Implement graceful reloads
- [ ] Verify all CPU cores are utilized

## Asset Provenance Completeness
- [ ] Ensure each asset.jpg has asset.jpg.meta.json
- [ ] Include source_url, license, sha256, timestamps in metadata
- [ ] Verify 1:1 meta coverage with find command

## TTS Smoothing Polish
- [ ] Replace silence joins with short crossfade
- [ ] Normalize with loudnorm
- [ ] Ensure no audible clicks between chunks
- [ ] Maintain consistent perceived loudness

## Storyboard/Timeline Schema Tightening
- [ ] Forbid unknown fields in strict mode
- [ ] Use discriminators for segment types
- [ ] Return 400 with clear AJV error paths for bad payloads

## Canary Rollout Plan
- [ ] Start at 5-10% traffic
- [ ] Monitor P95 latency and 5xx alerts
- [ ] Ramp traffic gradually
- [ ] Ensure no error budget burn during canary window
