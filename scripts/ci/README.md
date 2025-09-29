# MOBIUS CI Scripts

This directory contains CI testing infrastructure for the MOBIUS API, enabling containerized testing and validation without external dependencies.

## Overview

The CI infrastructure provides:
- **Mock API server** (`ci-server.js`) for deterministic testing
- **Docker containerization** with security-focused non-root runtime
- **Robust smoke tests** with retries, timeouts, and structured logging
- **Local development support** for testing changes before CI

## Files

- `smoke-tests.sh` - Main smoke test runner with comprehensive endpoint testing
- `README.md` - This documentation file

## Usage

### Local Testing

1. **Build and start the staging environment:**
   ```bash
   # Build the CI container
   docker build -f Dockerfile.ci -t mobius-api-ci:local .
   
   # Start the staging stack
   docker compose -f docker-compose.staging.yml up -d
   ```

2. **Run smoke tests:**
   ```bash
   # Basic smoke test run
   ./scripts/ci/smoke-tests.sh
   
   # With custom timeout and retries
   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
   ```

3. **Cleanup:**
   ```bash
   docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
   ```

### NPM Scripts

```bash
# Start CI mock API locally (non-containerized)
npm run api:ci

# Run smoke tests against local server
npm run smoke:test
```

## Smoke Tests

The smoke test runner (`smoke-tests.sh`) validates:

### Endpoints Tested

1. **GET /health**
   - Status: "healthy"
   - Mode: "mock" 
   - Version and timestamp included
   - Expected response example:
     ```json
     {
       "status": "healthy",
       "mode": "mock", 
       "timestamp": "2025-01-09T16:00:05Z",
       "version": "1.0.0",
       "uptime": 0.1165
     }
     ```

2. **GET /ready**
   - Ready: true
   - Uptime, memory, and CPU metrics
   - System information

3. **GET /api/info** 
   - API metadata
   - Available endpoints list
   - Environment information

4. **POST /api/echo**
   - Request/response validation
   - Metadata verification
   - JSON processing test

### Features

- **Configurable timeouts** - Default 30s, adjustable via parameter
- **Retry logic** - Default 2 retries, adjustable via parameter  
- **Structured logging** - Timestamped, colored output with severity levels
- **JSON parsing** - Uses `jq` when available, falls back to `grep`
- **Exit codes** - Returns 0 for success, 1 for failure (CI-friendly)
- **Service readiness** - Waits for service before testing

### Command Line Options

```bash
./smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
```

- `BASE_URL` - Target API base URL (default: http://localhost:5001)
- `TIMEOUT` - Request timeout in seconds (default: 30)
- `RETRIES` - Number of retries per request (default: 2)

## Mock API Endpoints

The CI mock API server provides these endpoints:

### GET /health
Returns basic health status and server information.
**Use case:** CI health checks, container readiness probes

### GET /ready  
Returns detailed readiness information including system metrics.
**Use case:** Load balancer health checks, detailed monitoring

### GET /api/info
Returns API metadata and available endpoints.
**Use case:** API discovery, documentation validation

### POST /api/echo
Echoes request body with metadata for testing.
**Use case:** Request/response validation, JSON processing tests

## Mock Data Descriptions

### Health Response
- `status`: Always "healthy" in mock mode
- `mode`: Always "mock" for CI testing
- `timestamp`: Current ISO 8601 timestamp
- `version`: Package version from package.json
- `uptime`: Server uptime in seconds (4 decimal precision)

### Ready Response
- `ready`: Always true when service is operational
- `uptime`: Server uptime in seconds (2 decimal precision)
- `memory`: Node.js memory usage (RSS, heap used/total, external)
- `cpu`: Process CPU usage (user/system time)
- `system`: Platform, architecture, Node version, load average

### Echo Response
- `echo`: Always true to confirm echo functionality
- `receivedAt`: Timestamp when request was received
- `requestBody`: Complete request body as received
- `requestMetadata`: Headers, content size, method, path info
- `server`: Server mode, version, uptime

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check if port 5001 is in use
lsof -i :5001

# Use different port in docker-compose.staging.yml
ports:
  - "5002:5001"  # Host port 5002 -> Container port 5001
```

**Container build failures:**
```bash
# Check Docker build logs
docker build -f Dockerfile.ci -t mobius-api-ci:debug . --no-cache --progress=plain

# Verify dependencies
docker run --rm mobius-api-ci:debug npm list
```

**Smoke test failures:**
```bash
# Increase timeout for slow environments
./scripts/ci/smoke-tests.sh http://localhost:5001 60 3

# Check container logs
docker compose -f docker-compose.staging.yml logs mobius-api-ci

# Test individual endpoints manually
curl -v http://localhost:5001/health
```

**Service readiness issues:**
```bash
# Check container health
docker compose -f docker-compose.staging.yml ps

# Monitor health check logs  
docker inspect mobius-api-staging | jq '.[0].State.Health'

# Verify network connectivity
docker compose -f docker-compose.staging.yml exec mobius-api-ci wget -O- http://localhost:5001/health
```

### Debugging Steps

1. **Verify base setup:**
   ```bash
   docker --version
   docker compose --version
   node --version
   npm --version
   ```

2. **Check file permissions:**
   ```bash
   ls -la scripts/ci/smoke-tests.sh
   # Should show executable permissions (x)
   ```

3. **Test outside Docker:**
   ```bash
   # Start API directly
   cd /path/to/MOBIUS
   node src/api/ci-server.js
   
   # Test in another terminal
   curl http://localhost:5001/health
   ```

4. **Examine container environment:**
   ```bash
   docker compose -f docker-compose.staging.yml exec mobius-api-ci env
   docker compose -f docker-compose.staging.yml exec mobius-api-ci ps aux
   ```

### Performance Considerations

- **Container startup time:** ~10-15 seconds typical
- **Test execution time:** ~5-10 seconds for all endpoints
- **Memory usage:** ~50-100MB for Node.js container
- **Network latency:** Add 5-10s timeout buffer in CI environments

### CI Environment Variables

- `NODE_ENV=production` - Production runtime mode
- `API_MODE=mock` - Enables mock responses
- `PORT=5001` - API server port

For CI customization, modify these in `docker-compose.staging.yml` or CI workflow.