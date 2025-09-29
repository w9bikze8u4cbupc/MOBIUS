# MOBIUS API Smoke Tests

This document describes the containerized API smoke testing infrastructure for the MOBIUS CI pipeline.

## Overview

The smoke testing system validates container builds and API health without touching production code. It provides:

- ✅ Fast feedback on container build issues
- ✅ API health verification in isolation  
- ✅ Zero production impact
- ✅ No secrets required
- ✅ Comprehensive logging and artifacts

## Components

### 1. CI-Only API (`src/api-ci/`)

A lightweight Express.js API designed specifically for smoke testing:

**Endpoints:**
- `GET /health` - Health check with timestamp and version
- `GET /ready` - Readiness check 
- `GET /api/info` - API information and available endpoints
- `POST /api/echo` - Echo endpoint for testing POST requests
- `GET /nonexistent` - Returns 404 for error handling tests

**Sample Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-29T01:14:01.319Z",
  "version": "0.1.0",
  "mode": "mock"
}
```

### 2. Container Infrastructure

**Dockerfile.ci:**
- Node.js 20 Alpine base (small, secure)
- Non-root user for security
- Optimized layers for fast builds
- Built-in health checks

**docker-compose.staging.yml:**
- Service orchestration
- Port mapping (5001)
- Health check configuration
- Network isolation

### 3. Smoke Test Script (`scripts/ci/smoke-tests.sh`)

Robust testing script with:
- HTTP status code validation
- JSON response verification
- 404 behavior testing
- Comprehensive logging
- Exit codes for CI integration

## Local Usage

### Quick Start

1. **Build and start the container:**
   ```bash
   docker compose -f docker-compose.staging.yml build
   docker compose -f docker-compose.staging.yml up -d api-ci
   ```

2. **Run smoke tests:**
   ```bash
   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
   ```

3. **Clean up:**
   ```bash
   docker compose -f docker-compose.staging.yml down -v
   ```

### Parameters

The smoke test script accepts these parameters:

```bash
./scripts/ci/smoke-tests.sh <base_url> [timeout] [retries]
```

- `base_url`: API base URL (default: http://localhost:5001)
- `timeout`: Request timeout in seconds (default: 30)
- `retries`: Number of retries per test (default: 2)

### Environment Variables

- `LOG_FILE`: Custom log file path (default: smoke-tests.log)

## CI Integration

The smoke tests run automatically in GitHub Actions as the `api-smoke-tests` job:

1. **Triggers:** After `build-and-qa` job completes
2. **Runner:** ubuntu-latest only
3. **Steps:**
   - Build container
   - Start API service
   - Wait for health check
   - Run smoke tests
   - Upload logs/artifacts on failure
   - Always cleanup containers

### Artifacts on Failure

- `api-smoke-test-logs`: Contains smoke-tests.log
- `api-ci-compose-logs`: Contains docker container logs

## Troubleshooting

### Common Issues

**1. Container won't start**
```bash
# Check container logs
docker compose -f docker-compose.staging.yml logs api-ci

# Check container status  
docker compose -f docker-compose.staging.yml ps
```

**2. Health check fails**
```bash
# Test health endpoint manually
curl http://localhost:5001/health

# Check if port is bound
netstat -tlnp | grep 5001
```

**3. Smoke tests fail**
```bash
# Run with debugging
bash -x ./scripts/ci/smoke-tests.sh http://localhost:5001

# Check log file
cat smoke-tests.log
```

**4. Permission denied on script**
```bash
# Make executable
chmod +x ./scripts/ci/smoke-tests.sh
```

### Debug Commands

```bash
# Test individual endpoint
curl -v http://localhost:5001/health

# Check JSON validity
curl -s http://localhost:5001/health | python3 -m json.tool

# Monitor container health
watch 'docker compose -f docker-compose.staging.yml ps'

# Follow container logs in real-time
docker compose -f docker-compose.staging.yml logs -f api-ci
```

### Performance Tuning

If tests timeout or are slow:

1. **Increase timeouts:**
   ```bash
   ./scripts/ci/smoke-tests.sh http://localhost:5001 60 3
   ```

2. **Tune Docker health checks in docker-compose.staging.yml:**
   ```yaml
   healthcheck:
     interval: 10s      # Check more frequently  
     timeout: 5s        # Allow longer response time
     retries: 5         # More retries
     start_period: 30s  # Longer startup time
   ```

3. **Check system resources:**
   ```bash
   docker stats
   docker system df
   ```

## Development

### Modifying the API

1. Edit `src/api-ci/server.js`
2. Rebuild container: `docker compose -f docker-compose.staging.yml build`
3. Test changes: `./scripts/ci/smoke-tests.sh`

### Adding Tests

Add new test cases to `scripts/ci/smoke-tests.sh`:

```bash
# Test 6: New endpoint
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 🧪 Testing new endpoint" | tee -a "$LOG_FILE"
total_tests=$((total_tests + 1))
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/new-endpoint" 2>/dev/null || echo -e "\n000")
status=$(echo "$response" | tail -n1)
if [ "$status" = "200" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: ✅ New endpoint PASSED" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ❌ New endpoint FAILED (status: $status)" | tee -a "$LOG_FILE"
    failed_tests=$((failed_tests + 1))
fi
```

### Security Considerations

- ✅ Non-root container user
- ✅ No secrets or credentials required
- ✅ Isolated network namespace
- ✅ Read-only container filesystem (where possible)
- ✅ Minimal attack surface (Alpine Linux)
- ✅ Only development/testing ports exposed

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub Actions CI                       │
├─────────────────────────────────────────────────────────────────┤
│  1. build-and-qa (matrix: ubuntu/mac/windows)                  │
│     ├── Unit tests                                             │
│     ├── Integration tests                                      │
│     └── Artifacts upload                                       │
│                                                                 │
│  2. api-smoke-tests (ubuntu-latest only)                       │
│     ├── docker compose build                                   │
│     ├── docker compose up -d api-ci                           │
│     ├── Wait for health check                                  │
│     ├── ./scripts/ci/smoke-tests.sh                           │
│     ├── Upload logs on failure                                 │
│     └── docker compose down -v (always)                       │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Container (api-ci)                    │
├─────────────────────────────────────────────────────────────────┤
│  Node.js 20 Alpine                                             │
│  ├── Express.js API (port 5001)                               │
│  │   ├── GET  /health                                         │
│  │   ├── GET  /ready                                          │
│  │   ├── GET  /api/info                                       │
│  │   ├── POST /api/echo                                       │
│  │   └── 404  handler                                         │
│  └── Health check via curl                                     │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Smoke Test Script                              │
├─────────────────────────────────────────────────────────────────┤
│  ├── Health endpoint (200 OK + JSON)                          │
│  ├── Ready endpoint (200 OK + JSON)                           │  
│  ├── Info endpoint (200 OK + JSON)                            │
│  ├── Echo endpoint (POST 200 OK + JSON)                       │
│  ├── 404 behavior (404 + error JSON)                          │
│  └── Results summary + exit code                               │
└─────────────────────────────────────────────────────────────────┘
```

## Next Steps

Future enhancements could include:

- Multi-architecture container builds (ARM64, AMD64)
- Performance benchmarking endpoints
- Database connection health checks
- External service dependency mocking
- Load testing integration
- Security scanning integration