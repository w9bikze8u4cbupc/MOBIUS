# MOBIUS CI Testing Infrastructure

This directory contains the CI testing infrastructure for the MOBIUS API, including containerized mock services, smoke tests, and documentation.

## Overview

The CI infrastructure provides:
- **Lightweight mock API server** for deterministic testing
- **Docker containerization** with health checks and non-root security
- **Comprehensive smoke tests** with retries and structured logging
- **CI/CD integration** for automated validation

## Quick Start

### Local Testing

1. **Start the mock API locally:**
   ```bash
   npm run api:ci
   ```

2. **Run smoke tests:**
   ```bash
   npm run smoke:test
   # or directly:
   ./scripts/ci/smoke-tests.sh
   ```

### Docker Testing

1. **Build and start services:**
   ```bash
   docker compose -f docker-compose.staging.yml up -d
   ```

2. **Run smoke tests against containerized API:**
   ```bash
   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
   ```

3. **Cleanup:**
   ```bash
   docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
   ```

## Components

### 🚀 Mock API Server (`src/api/ci-server.js`)

Lightweight Express.js server providing:

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/health` | GET | Health check with status, version, uptime |
| `/ready` | GET | Readiness probe with system metrics |
| `/api/info` | GET | API documentation and metadata |
| `/api/echo` | POST | Request/response validation |

**Example `/health` response:**
```json
{
  "status": "healthy",
  "mode": "mock",
  "timestamp": "2025-09-29T16:00:05Z",
  "version": "1.0.0",
  "uptime": 0.1165
}
```

**Key features:**
- Mock-by-default mode (no external dependencies)
- Comprehensive request/response validation
- Memory and CPU monitoring
- Graceful shutdown handling
- Security-focused (non-root execution)

### 🐳 Docker Infrastructure

#### `Dockerfile.ci`
- **Base image:** `node:20-alpine` (minimal, secure)
- **User:** Non-root `mobius:1001` for security
- **Health check:** Built-in `/health` endpoint monitoring
- **Size:** Optimized for fast CI builds

#### `docker-compose.staging.yml`
- **Service orchestration:** Single API service with health checks
- **Port mapping:** `5001:5001` (configurable)
- **Resource limits:** CPU/memory constraints for CI stability
- **Logging:** Structured logs with rotation

#### `.dockerignore`
- **Minimal context:** Excludes unnecessary files for faster builds
- **Security:** Prevents secrets and dev files from entering container

### 🧪 Smoke Test Suite (`scripts/ci/smoke-tests.sh`)

Comprehensive test runner with:

- **Timeout handling:** Configurable per-request timeouts
- **Retry logic:** Automatic retries with exponential backoff
- **Structured logging:** Color-coded output with verbosity control
- **JSON parsing:** jq support with grep/sed fallback
- **Exit codes:** Proper CI/CD integration

**Test coverage:**
1. ✅ Health check endpoint validation
2. ✅ Readiness probe with system metrics
3. ✅ API documentation completeness
4. ✅ Request/response echo functionality
5. ✅ Error handling (404, invalid JSON)
6. ✅ Mode verification (mock vs production)

## Usage Examples

### Basic Smoke Testing
```bash
# Use defaults (localhost:5001, 30s timeout, 3 retries)
./scripts/ci/smoke-tests.sh

# Custom URL and settings
./scripts/ci/smoke-tests.sh http://api.staging.example.com 60 5

# Verbose output for debugging
SMOKE_TEST_VERBOSE=true ./scripts/ci/smoke-tests.sh
```

### Environment Variables
```bash
export SMOKE_TEST_URL="http://localhost:5001"
export SMOKE_TEST_TIMEOUT=30
export SMOKE_TEST_RETRIES=3
export SMOKE_TEST_VERBOSE=false
```

### CI Integration
```yaml
# GitHub Actions example
- name: Run smoke tests
  run: |
    ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
  timeout-minutes: 5
```

## Mock Data and Test Scenarios

### Health Check Data
- **Status:** Always "healthy" in mock mode
- **Mode:** Always "mock" (distinguishes from production)
- **Uptime:** Real server uptime in seconds
- **Version:** Static "1.0.0" for consistency

### Readiness Probe Data
- **Memory metrics:** Real RSS, heap usage in MB
- **CPU info:** Architecture, platform, core count
- **Process info:** PID, Node.js version

### Echo Test Data
The smoke tests send structured JSON to validate:
- Request body parsing
- Header preservation
- Response metadata injection
- Validation flag accuracy

Example test payload:
```json
{
  "test": "smoke-test-data",
  "timestamp": "2025-09-29T16:00:05Z",
  "number": 42
}
```

## Troubleshooting

### Common Issues

#### Port Conflicts
```bash
# Check what's using port 5001
lsof -i :5001
netstat -tulpn | grep :5001

# Use different port in docker-compose.staging.yml
ports:
  - "5002:5001"  # Host:Container
```

#### Docker Build Issues
```bash
# Clear Docker cache
docker builder prune -f

# Build with no cache
docker compose -f docker-compose.staging.yml build --no-cache

# Check Dockerfile syntax
docker build -f Dockerfile.ci -t test-build .
```

#### Test Failures
```bash
# Run with verbose logging
SMOKE_TEST_VERBOSE=true ./scripts/ci/smoke-tests.sh

# Check API logs
docker compose -f docker-compose.staging.yml logs mobius-api-ci

# Test individual endpoints
curl -f http://localhost:5001/health
curl -f http://localhost:5001/ready
```

#### Permission Issues
```bash
# Ensure script is executable
chmod +x scripts/ci/smoke-tests.sh

# Check file ownership
ls -la scripts/ci/smoke-tests.sh
```

### Debugging Commands

```bash
# Check container status
docker compose -f docker-compose.staging.yml ps

# Follow logs in real-time
docker compose -f docker-compose.staging.yml logs -f

# Execute shell in container
docker compose -f docker-compose.staging.yml exec mobius-api-ci sh

# Check health status
docker inspect --format='{{.State.Health.Status}}' mobius-api-staging
```

### Performance Tuning

#### Faster CI Builds
- Use `.dockerignore` to minimize build context
- Pin Node.js version for consistent layer caching
- Run `npm ci` instead of `npm install`

#### Reduce Test Flakiness
- Increase timeout for slow CI runners
- Add retry logic with exponential backoff
- Use health checks before running tests

```bash
# Wait for service to be ready
./scripts/ci/smoke-tests.sh http://localhost:5001 60 5
```

## Security Considerations

### Container Security
- ✅ Non-root user execution (`mobius:1001`)
- ✅ Minimal Alpine Linux base image
- ✅ No secrets or credentials in container
- ✅ Resource limits to prevent DoS

### Mock Mode Safety
- ✅ No external API calls or dependencies
- ✅ No persistent data storage
- ✅ Deterministic responses for testing
- ✅ Clear mode identification in responses

### CI/CD Security
- ✅ Read-only file system compatible
- ✅ No privilege escalation required
- ✅ Isolated network namespace
- ✅ Proper secret management (none needed)

## Contributing

### Adding New Tests
1. Extend `smoke-tests.sh` with new test functions
2. Follow existing naming conventions (`test_*`)
3. Include proper error handling and logging
4. Update this README with new test descriptions

### Modifying Mock Responses
1. Edit `src/api/ci-server.js`
2. Ensure backward compatibility
3. Update test expectations in `smoke-tests.sh`
4. Document changes in API responses

### Performance Testing
```bash
# Load testing with Apache Bench
ab -n 1000 -c 10 http://localhost:5001/health

# Stress testing with curl
for i in {1..100}; do curl -s http://localhost:5001/health; done
```

## Support

For issues with the CI infrastructure:
1. Check the troubleshooting section above
2. Review container logs for errors
3. Verify network connectivity and port availability
4. Ensure Docker and Node.js versions are compatible

## License

This CI infrastructure is part of the MOBIUS project and follows the same licensing terms.