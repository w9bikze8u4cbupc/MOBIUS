# MOBIUS CI Scripts

This directory contains CI testing scripts for the MOBIUS API infrastructure.

## Scripts Overview

### `smoke-tests.sh`
Comprehensive smoke test runner with timeout handling, retries, and structured logging.

**Usage:**
```bash
./scripts/ci/smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
```

**Parameters:**
- `BASE_URL` (optional): API base URL (default: `http://localhost:5001`)
- `TIMEOUT` (optional): Request timeout in seconds (default: `30`)
- `RETRIES` (optional): Number of retries per request (default: `2`)

**Example:**
```bash
# Run with defaults
./scripts/ci/smoke-tests.sh

# Run with custom parameters
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

**Features:**
- Comprehensive endpoint testing (`/health`, `/ready`, `/api/info`, `/api/echo`)
- JSON parsing with jq fallback
- Timeout and retry handling
- Structured logging with colors
- Performance testing
- 404 error handling validation

### `simple-smoke-test.sh`
Lightweight CI-optimized smoke tests for fast execution in CI pipelines.

**Usage:**
```bash
./scripts/ci/simple-smoke-test.sh [BASE_URL]
```

**Parameters:**
- `BASE_URL` (optional): API base URL (default: `http://localhost:5001`)

**Example:**
```bash
./scripts/ci/simple-smoke-test.sh http://localhost:5001
```

**Features:**
- Fast execution (10s timeout)
- Essential endpoint validation
- Minimal dependencies
- CI-optimized output

## Test Endpoints

### `/health`
Basic health check endpoint that returns:
```json
{
  "status": "healthy",
  "mode": "mock",
  "timestamp": "2025-09-29T16:00:05Z",
  "version": "1.0.0",
  "uptime": 0.1165,
  "service": "mobius-api-ci"
}
```

### `/ready`
Kubernetes-style readiness probe with system metrics:
```json
{
  "status": "ready",
  "timestamp": "2025-09-29T16:00:05Z",
  "uptime": 0.1165,
  "memory": {
    "rss": 25,
    "heapUsed": 12,
    "heapTotal": 15,
    "external": 1
  },
  "cpu": {
    "user": 12000,
    "system": 5000
  },
  "system": {
    "platform": "linux",
    "arch": "x64",
    "nodeVersion": "v20.0.0",
    "loadAverage": [0.1, 0.2, 0.3]
  }
}
```

### `/api/info`
API documentation and metadata endpoint.

### `/api/echo`
Echo endpoint for request/response validation and debugging.

## Dependencies

### Required
- `curl` - for HTTP requests
- `bash` - shell execution

### Optional
- `jq` - for advanced JSON parsing (falls back to basic parsing if not available)

## Troubleshooting

### Common Issues

1. **Connection refused**
   ```
   curl: (7) Failed to connect to localhost port 5001: Connection refused
   ```
   - Ensure the API server is running
   - Check if the port is correct
   - Verify firewall settings

2. **Timeout errors**
   ```
   curl: (28) Operation timed out after 30000 milliseconds
   ```
   - Increase timeout value
   - Check network connectivity
   - Verify server responsiveness

3. **JSON parsing errors (without jq)**
   ```
   [WARNING] jq not found, using fallback JSON parsing
   ```
   - Install jq for better JSON parsing: `apt-get install jq` or `brew install jq`
   - Fallback parsing should still work for basic validation

4. **Permission errors**
   ```
   bash: ./scripts/ci/smoke-tests.sh: Permission denied
   ```
   - Make script executable: `chmod +x scripts/ci/smoke-tests.sh`

### Debug Mode

For verbose debugging, you can modify the scripts to include debug output:

```bash
# Add debug flag to bash
bash -x ./scripts/ci/smoke-tests.sh

# Or add debug output to curl
curl -v http://localhost:5001/health
```

### Performance Tuning

- For faster CI execution, use `simple-smoke-test.sh`
- Adjust timeout values based on your infrastructure
- Reduce retry counts for faster failure detection
- Use parallel execution for multiple services

## Integration with CI/CD

These scripts are designed to integrate with CI/CD pipelines:

### GitHub Actions
```yaml
- name: Run smoke tests
  run: ./scripts/ci/simple-smoke-test.sh http://localhost:5001
```

### Docker Compose Integration
```bash
# Start services
docker compose -f docker-compose.staging.yml up -d

# Wait for readiness and run tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Cleanup
docker compose -f docker-compose.staging.yml down --volumes
```

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Output Format

The scripts provide structured output with:
- Color-coded log levels (INFO, SUCCESS, WARNING, ERROR)
- Test result summaries
- Performance metrics
- Detailed error messages for debugging