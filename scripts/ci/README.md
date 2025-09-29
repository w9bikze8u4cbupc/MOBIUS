# MOBIUS CI Testing Scripts

This directory contains scripts for testing the MOBIUS API in CI environments.

## Scripts

### smoke-tests.sh

Comprehensive smoke test runner with advanced features:

- **Timeout handling**: Configurable request timeouts
- **Retries**: Automatic retry logic for flaky network conditions
- **Structured logging**: Detailed logs with timestamps and color coding
- **jq fallback**: Works with or without jq for JSON parsing
- **Response validation**: Validates both HTTP status and response content

**Usage:**
```bash
./smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
```

**Parameters:**
- `BASE_URL`: API base URL (default: http://localhost:5001)
- `TIMEOUT`: Request timeout in seconds (default: 30)
- `RETRIES`: Number of retries on failure (default: 2)

**Examples:**
```bash
# Basic usage with defaults
./smoke-tests.sh

# Custom URL and timeout
./smoke-tests.sh http://localhost:5001 45 3

# CI environment
./smoke-tests.sh http://api-server:5001 60 5
```

**Exit codes:**
- `0`: All tests passed
- `1`: One or more tests failed

### simple-smoke-test.sh

Lightweight smoke tests optimized for fast CI execution:

- **Fast execution**: Minimal overhead for quick CI feedback
- **Essential checks**: Tests only critical endpoints
- **Simple output**: Clear pass/fail indicators
- **No dependencies**: Uses only curl and bash

**Usage:**
```bash
./simple-smoke-test.sh [BASE_URL] [TIMEOUT]
```

**Parameters:**
- `BASE_URL`: API base URL (default: http://localhost:5001)
- `TIMEOUT`: Request timeout in seconds (default: 10)

**Examples:**
```bash
# Basic usage
./simple-smoke-test.sh

# Custom URL and timeout
./simple-smoke-test.sh http://localhost:5001 15
```

## Endpoints Tested

All scripts test these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with service status |
| `/ready` | GET | Readiness probe with system metrics |
| `/api/info` | GET | API documentation and metadata |
| `/api/echo` | POST | Request/response validation (comprehensive only) |
| `/nonexistent` | GET | 404 error handling |

## Local Development

### Start the API server
```bash
# Using npm
npm run api:ci

# Using Docker
docker build -f Dockerfile.ci -t mobius-api-ci:local .
docker run -p 5001:5001 mobius-api-ci:local

# Using Docker Compose
docker compose -f docker-compose.staging.yml up -d
```

### Run smoke tests
```bash
# Comprehensive tests
npm run smoke:test:full
# or directly
./scripts/ci/smoke-tests.sh

# Simple tests
npm run smoke:test
# or directly
./scripts/ci/simple-smoke-test.sh
```

### Cleanup
```bash
# Stop Docker containers
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans

# Remove Docker images
docker rmi mobius-api-ci:local
```

## CI Integration

The scripts are designed to work in various CI environments:

### GitHub Actions
```yaml
- name: Run API smoke tests
  run: |
    docker compose -f docker-compose.staging.yml up -d
    ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
    docker compose -f docker-compose.staging.yml down
```

### Docker-based CI
```bash
# Build and test in one go
docker build -f Dockerfile.ci -t mobius-api-ci:test .
docker run -d --name api-test -p 5001:5001 mobius-api-ci:test
sleep 10  # Wait for startup
./scripts/ci/simple-smoke-test.sh http://localhost:5001 10
docker stop api-test && docker rm api-test
```

## Troubleshooting

### Common Issues

**Connection refused:**
- Ensure the API server is running
- Check port mapping in Docker setup
- Verify firewall settings

**Timeout errors:**
- Increase timeout values
- Check system resources
- Monitor network connectivity

**JSON parsing errors:**
- Install jq for better parsing: `apt-get install jq` or `brew install jq`
- Scripts will fall back to grep-based parsing without jq

**Permission denied:**
- Make scripts executable: `chmod +x scripts/ci/*.sh`
- Check Docker permissions for non-root user

### Debug Mode

Add debug output to scripts:
```bash
# Enable bash debug mode
bash -x ./scripts/ci/smoke-tests.sh

# View detailed logs
tail -f /tmp/smoke-tests-*.log
```

### Network Debugging

```bash
# Test connectivity
curl -v http://localhost:5001/health

# Check Docker network
docker network ls
docker network inspect mobius-ci

# Container logs
docker compose -f docker-compose.staging.yml logs -f
```

## Contributing

When modifying these scripts:

1. Test both with and without jq installed
2. Verify timeout and retry logic works
3. Test in both local and containerized environments
4. Update this README with any new parameters or behavior
5. Ensure exit codes are consistent (0 = success, 1 = failure)