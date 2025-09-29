# MOBIUS CI Infrastructure

This directory contains CI testing infrastructure for the MOBIUS API that provides containerized smoke tests and health checks.

## Overview

The CI infrastructure validates container builds and API behavior without external dependencies or secrets, providing:

- **Mock API server** with predictable responses
- **Docker containerization** with security best practices
- **Comprehensive smoke tests** with retry logic and structured logging
- **Local development support** for testing before CI

## Components

### Mock API Server (`ci-server.js`)

Lightweight Node.js server providing CI-specific endpoints:

- `GET /health` - Health status with timestamp, version, and mode
- `GET /ready` - Readiness check with system metrics
- `GET /api/info` - API metadata and endpoint documentation
- `POST /api/echo` - Request/response validation endpoint

### Container Images

- **Dockerfile.ci** - Optimized Node 20 Alpine image
  - Non-root user (`mobius:1001`) for security
  - Minimal dependencies for faster builds
  - Built-in healthcheck endpoint
  - Production-ready configuration

### Orchestration

- **docker-compose.staging.yml** - Local development and CI stack
  - Service networking and port mapping
  - Health checks and restart policies
  - Log rotation and management

### Smoke Testing

- **smoke-tests.sh** - Comprehensive test runner
  - Configurable timeouts and retry logic
  - Structured logging with timestamps
  - JSON parsing with jq fallback
  - Graceful error handling

## Usage

### Local Development

```bash
# Build and start the stack
docker compose -f docker-compose.staging.yml up -d

# Run smoke tests
./scripts/ci/smoke-tests.sh

# Check logs
docker compose -f docker-compose.staging.yml logs

# Cleanup
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

### NPM Scripts

```bash
# Start CI mock API locally
npm run api:ci

# Run smoke tests against local server
npm run smoke:test
```

### Manual Testing

```bash
# Test different configurations
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Verbose output
VERBOSE=true ./scripts/ci/smoke-tests.sh

# Custom endpoint
./scripts/ci/smoke-tests.sh http://staging.example.com 60 3
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | API server port |
| `NODE_ENV` | `production` | Node.js environment |
| `VERBOSE` | `false` | Enable verbose smoke test output |

### Smoke Test Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `BASE_URL` | `http://localhost:5001` | API base URL |
| `TIMEOUT` | `30` | Request timeout (seconds) |
| `RETRIES` | `2` | Number of retry attempts |

## Expected Responses

### Health Check (`/health`)

```json
{
  "status": "healthy",
  "mode": "mock",
  "timestamp": "2025-01-09T16:00:05Z",
  "version": "1.0.0",
  "uptime": 0.1165
}
```

### Readiness Check (`/ready`)

```json
{
  "ready": true,
  "uptime": 120.45,
  "memory": {
    "rss": 45.2,
    "heapUsed": 12.8,
    "heapTotal": 20.1,
    "external": 1.5
  },
  "cpu": {
    "loadAverage": [0.1, 0.2, 0.15],
    "cores": 4
  },
  "platform": "linux",
  "arch": "x64",
  "nodeVersion": "v20.10.0"
}
```

### API Info (`/api/info`)

```json
{
  "name": "MOBIUS CI Mock API",
  "version": "1.0.0",
  "mode": "mock",
  "description": "Mock API server for CI testing and smoke tests",
  "endpoints": [
    {
      "path": "/health",
      "method": "GET",
      "description": "Health check with status, timestamp, version, and mode"
    }
  ],
  "timestamp": "2025-01-09T16:00:05Z",
  "uptime": 120.45
}
```

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check what's using port 5001
lsof -i :5001

# Use different port in docker-compose.staging.yml
ports:
  - "5002:5001"
```

**Container won't start:**
```bash
# Check build logs
docker compose -f docker-compose.staging.yml build --no-cache

# Check runtime logs
docker compose -f docker-compose.staging.yml logs mobius-api-ci
```

**Smoke tests timing out:**
```bash
# Increase timeout and retries
./scripts/ci/smoke-tests.sh http://localhost:5001 60 3

# Check if service is actually ready
curl http://localhost:5001/health
```

**Permission issues with non-root user:**
```bash
# Check container file permissions
docker compose -f docker-compose.staging.yml exec mobius-api-ci ls -la /app

# Verify user context
docker compose -f docker-compose.staging.yml exec mobius-api-ci whoami
```

### Debug Mode

Enable verbose logging:
```bash
# For smoke tests
VERBOSE=true ./scripts/ci/smoke-tests.sh

# For Docker Compose
docker compose -f docker-compose.staging.yml up --verbose
```

### Mock Data

The CI server provides mock responses only and does not connect to external services:

- All endpoints return predictable test data
- No database or file system dependencies
- No API keys or secrets required
- Stateless operation for consistent testing

### Health Check Failures

If health checks fail in CI:

1. **Check container logs** for startup errors
2. **Verify port binding** is correct
3. **Increase healthcheck timeout** if needed
4. **Ensure base image availability** (Node 20 Alpine)

### Networking Issues

If containers can't communicate:

1. **Verify network configuration** in docker-compose.staging.yml
2. **Check firewall rules** on the host
3. **Test connectivity** between containers
4. **Validate DNS resolution** within Docker network

## CI Integration

This infrastructure integrates with GitHub Actions via the `api-smoke-tests` job that:

1. Builds the Docker image using Buildx
2. Starts the staging stack with docker-compose
3. Waits for service readiness
4. Runs comprehensive smoke tests
5. Collects logs on failure
6. Performs cleanup regardless of outcome

The tests are designed to fail fast with structured debugging information while being resilient to temporary network issues or slow container startup.