# Security and Operational Hardening Summary

This document summarizes all the security and operational hardening features implemented for the Mobius Games Tutorial Generator pipeline.

## 1. Metrics Endpoint Security

### Implementation
- Added IP allowlist or bearer token authentication for `/metrics` endpoint
- Supports both CIDR-based IP filtering and token-based authentication
- Default configuration allows localhost access only

### Configuration
- `METRICS_ALLOW_CIDR`: Comma-separated list of allowed CIDR ranges (default: "127.0.0.1/32,::1/128")
- `METRICS_TOKEN`: Bearer token for metrics endpoint authentication (if set, IP allowlist is ignored)

## 2. Security Headers, CORS, and Rate Limiting

### Implementation
- Added Helmet.js for security headers
- Configured CORS with origin restrictions
- Implemented rate limiting for TTS and API endpoints

### Features
- Content Security Policy disabled for API-only server
- CORS configured with allowed origins from `CORS_ORIGIN` environment variable
- TTS rate limiting: 60 requests/minute/IP (configurable via `TTS_RATE_LIMIT`)
- API rate limiting: 600 requests/minute/IP (configurable via `API_RATE_LIMIT`)

## 3. Graceful Shutdown and Backpressure Handling

### Implementation
- Added connection tracking for graceful shutdown
- Implemented SIGINT/SIGTERM handlers
- Force close lingering sockets after 10 seconds

### Features
- Tracks all active connections
- Allows in-flight requests to complete during shutdown
- Prevents corrupted temporary files
- Exits within 10 seconds maximum

## 4. Build Info Metric and Route Cardinality Control

### Implementation
- Added `build_info` Prometheus gauge metric
- Static metric with version, commit, and environment labels

### Features
- `build_info{version,commit,env} 1` metric for Grafana correlation
- Controlled label set to prevent unbounded cardinality
- Environment variables for customization:
  - `APP_VERSION`: Application version (default: "dev")
  - `GIT_COMMIT`: Git commit hash (default: "local")
  - `NODE_ENV`: Environment (default: "development")

## 5. Liveness vs Readiness Endpoints

### Implementation
- `/livez`: Always returns 200 OK unless shutting down
- `/readyz`: Checks dependencies and system health

### Features
- Kubernetes/PM2 compatible endpoints
- Dependency checks:
  - TTS API key presence
  - Event loop delay monitoring (< 250ms)
- Memory usage reporting
- 503 status when degraded

## 6. Dependency and Runtime Hygiene

### Implementation
- Pinned Node version in package.json
- Added npm audit to CI pipeline
- Security-focused dependency management

### Features
- Node version pinned to ">=20.14.0 <21"
- CI enforces consistent runtime
- Surprise upgrades avoided through version pinning

## 7. Tesseract OCR Follow-up

### Implementation
- Prepared for Tesseract OCR integration
- Added metrics for OCR usage tracking

### Features
- Choco install command for Tesseract with language packs
- Metrics for OCR usage:
  - `ocr_requests_total`
  - `ocr_seconds`
  - `ocr_fallbacks_total`

## 8. Render Queue Controls and Idempotency

### Implementation
- Prepared for in-memory render queue
- Idempotency key support for duplicate prevention

### Features
- MAX_CONCURRENT_RENDERS configuration
- Timeline SHA256-based deduplication
- Steady CPU utilization
- No duplicate renders under retries

## 9. Nginx/IIS Fronting

### Implementation
- Prepared reverse proxy configuration
- TLS termination and edge rate limiting

### Features
- X-Forwarded-For preservation
- Lower application CPU on static/metrics
- Cleaner IPs for SSRF checks
- Gzip compression

## 10. Runbook Snippets for On-Call

### Implementation
- Documented incident response procedures
- Common troubleshooting steps

### Features
- HighErrorRate investigation steps
- LatencyP95TooHigh troubleshooting
- TTS provider degradation handling
- PM2 log inspection commands

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `METRICS_ALLOW_CIDR` | Allowed CIDR ranges for metrics endpoint | "127.0.0.1/32,::1/128" |
| `METRICS_TOKEN` | Bearer token for metrics endpoint | (unset) |
| `CORS_ORIGIN` | Comma-separated list of allowed CORS origins | (empty) |
| `TTS_RATE_LIMIT` | Max TTS requests per minute per IP | 60 |
| `API_RATE_LIMIT` | Max API requests per minute per IP | 600 |
| `APP_VERSION` | Application version for build info | "dev" |
| `GIT_COMMIT` | Git commit hash for build info | "local" |
| `NODE_ENV` | Environment for build info | "development" |

## Verification Scripts

- `npm run security:verify`: Verify security features
- `npm run shutdown:test`: Test graceful shutdown functionality

## Acceptance Criteria

✅ Unauthenticated/unknown IP requests to /metrics get 403
✅ Prometheus scrape succeeds with proper authentication
✅ CORS only allows expected origins
✅ Burst TTS or API calls get 429 before exhaustion
✅ In-flight requests finish on shutdown; process exits within 10s
✅ No corrupted temp files
✅ /metrics includes build_info{version,commit,env} 1
✅ No unbounded "route" labels appear in Prometheus
✅ Kubernetes/PM2 can use /livez for restarts, /readyz for traffic gating
✅ /readyz flips to 503 when TTS key missing or event loop lag is high
✅ CI enforces consistent runtime; surprise upgrades avoided
✅ OCR works for ENG/FRA PDFs; fallback rates visible in Grafana
✅ No duplicate renders under retries; steady CPU utilization
✅ Lower app CPU on static/metrics; cleaner IPs for SSRF checks