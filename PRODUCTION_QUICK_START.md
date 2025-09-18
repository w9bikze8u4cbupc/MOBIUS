# Mobius Games Tutorial Generator - Production Quick Start Guide

This guide provides a quick start for deploying and using the Mobius Games Tutorial Generator in a production environment.

## Prerequisites

1. Node.js (version 20.x recommended)
2. FFmpeg
3. Python 3.x (for some validation scripts)
4. Optional: Tesseract OCR (for OCR fallback support)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd mobius-games-tutorial-generator

# Install dependencies
npm ci
```

## Environment Configuration

Set up the required environment variables:

```powershell
# Windows PowerShell
$env:REQUEST_TIMEOUT_MS="60000"
$env:MAX_CONCURRENCY="20"
$env:URL_WHITELIST="localhost,127.0.0.1,yourdomain.com"
$env:USE_PDFJS_LEGACY="1"
$env:OCR_ENABLE="true"  # Optional, requires tesseract
```

```bash
# Unix/Linux/macOS
export REQUEST_TIMEOUT_MS=60000
export MAX_CONCURRENCY=20
export URL_WHITELIST=localhost,127.0.0.1,yourdomain.com
export USE_PDFJS_LEGACY=1
export OCR_ENABLE=true  # Optional, requires tesseract
```

## Starting the Service

### Development Mode
```bash
npm run server
```

### Production Mode (with PM2)
```bash
# Install PM2 globally
npm install -g pm2

# Start the service
pm2 start ecosystem.config.js --env production

# Save the configuration
pm2 save

# Set up startup script
pm2 startup
```

## Production Readiness Verification

Run all production readiness checks:
```bash
npm run production-checks
```

## Key Production Features

### 1. Enhanced TTS with Caching and Smoothing
- Automatic caching based on content hash
- Crossfade stitching for seamless audio transitions
- EBU R128 loudness normalization

```bash
# Test TTS smoothing
npm run tts:smooth-join -- output.mp3 0.1 audio1.mp3 audio2.mp3

# Normalize audio loudness
npm run tts:smooth-join -- --normalize input.mp3 output.mp3
```

### 2. Strict Schema Validation
Validate storyboards and timelines with strict rules that forbid unknown fields:
```bash
npm run validate:storyboard:strict
npm run validate:timeline:strict
```

### 3. Asset Provenance
Generate metadata files for assets:
```bash
# For a single asset
npm run generate:provenance -- asset.png https://example.com/source "CC-BY-4.0"

# For all assets in a directory
npm run generate:provenance -- --directory assets/
```

### 4. Audio/Video Synchronization
Ensure perfect A/V sync with helper scripts:
```bash
# Scale timeline to match audio duration
npm run audio:scale-timeline -- timeline.json audio.mp3

# Trim audio to timeline duration
npm run audio:trim-to-timeline -- timeline.json audio.mp3
```

### 5. File Retention Management
Clean up old files based on TTL:
```bash
# Dry run (recommended first)
node scripts/cleanup-old-files.js --dryRun

# Actual cleanup
node scripts/cleanup-old-files.js
```

## Health Checks

Monitor service health with built-in endpoints:
- Basic health: `GET /api/health`
- Detailed health: `GET /api/health/details`

Run a local monitoring smoke test:
```powershell
1..10 | ForEach-Object {
  $t = Measure-Command { Invoke-WebRequest -Uri "http://localhost:5001/api/health/details" -UseBasicParsing | Out-Null }
  Write-Host (Get-Date -Format "HH:mm:ss") "200 $([math]::Round($t.TotalSeconds,2))s"
  Start-Sleep -Seconds 3
}
```

## CI/CD Integration

The repository includes GitHub Actions workflows for automated testing:
- `.github/workflows/production-readiness.yml` - Production readiness checks
- `.github/workflows/ci.yml` - Standard CI pipeline

## Troubleshooting

### Common Issues

1. **PDF.js/DOMMatrix errors**
   - Ensure `USE_PDFJS_LEGACY=1` is set
   - Use `start-server.js` to properly initialize polyfills

2. **TTS cache misses**
   - Check that the cache directory is writable
   - Verify that the text, voice, and language parameters are consistent

3. **OCR not working**
   - Verify tesseract is installed: `tesseract --version`
   - Check that `OCR_ENABLE=true` is set
   - Ensure PDF files are accessible

### Log Analysis

Check for request correlation:
```powershell
$REQ=[Guid]::NewGuid().ToString()
Invoke-WebRequest -Uri "http://localhost:5001/api/health/details" -Headers @{"X-Request-ID"=$REQ} -UseBasicParsing | Out-Null
# Search logs for $REQ
```

## Performance Optimization

### Concurrency Management
- Adjust `MAX_CONCURRENCY` based on your server capacity
- Monitor memory usage and adjust accordingly

### Caching
- The TTS system caches audio by content hash
- This significantly reduces processing time and API costs

## Security Considerations

### URL Whitelisting
- Always configure `URL_WHITELIST` with trusted domains only
- Never allow arbitrary URLs in production

### Request Validation
- Body size limits prevent resource exhaustion
- Input validation on all endpoints
- Timeout enforcement prevents hanging requests

## Monitoring and Alerting

Set up external monitoring:
- Use UptimeRobot/Pingdom to monitor `/api/health/details`
- Alert on 5xx errors
- Alert on high P95 latency

## Backup and Recovery

### Asset Provenance
- All generated assets can include provenance metadata
- This helps with compliance and auditing requirements

### Regular Cleanup
- Schedule regular cleanup of old files
- Use the retention policy scripts

## Scaling Considerations

### Horizontal Scaling
- The service can be scaled horizontally behind a load balancer
- Ensure shared storage for cache directories if needed

### Resource Requirements
- CPU: Minimum 2 cores recommended
- Memory: Minimum 4GB RAM recommended
- Storage: Adequate space for temporary files and cache

## Support

For issues or questions:
1. Check the documentation in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)
2. Review the troubleshooting section above
3. File an issue in the repository