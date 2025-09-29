# MOBIUS API Smoke Tests

This document describes how to run the containerized API smoke tests locally and troubleshoot common issues.

## Overview

The MOBIUS CI infrastructure includes a lightweight API designed specifically for container smoke testing. The smoke tests validate that the containerized API is working correctly by testing all endpoints and error handling.

## Components

- **API**: Lightweight Node.js Express API in `src/api-ci/`
- **Container**: `Dockerfile.ci` builds a secure Alpine Linux container
- **Orchestration**: `docker-compose.staging.yml` manages the container
- **Tests**: `scripts/ci/smoke-tests.sh` runs comprehensive API validation
- **CI**: `.github/workflows/ci.yml` includes automated testing

## API Endpoints

The CI API provides the following endpoints:

- `GET /health` - Basic health check (liveness probe)
- `GET /ready` - Comprehensive readiness check with system info
- `GET /api/info` - API metadata and endpoint documentation
- `POST /api/echo` - Echo service for testing request/response handling

## Running Tests Locally

### Prerequisites

Install required tools:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install curl jq docker.io docker-compose

# macOS
brew install curl jq docker docker-compose

# Verify installation
curl --version
jq --version
docker --version
docker-compose --version
```

### Quick Start

1. **Build and start the container:**
   ```bash
   docker-compose -f docker-compose.staging.yml build
   docker-compose -f docker-compose.staging.yml up -d api-ci
   ```

2. **Run smoke tests:**
   ```bash
   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
   ```

3. **Clean up:**
   ```bash
   docker-compose -f docker-compose.staging.yml down -v
   ```

### Detailed Steps

#### 1. Build the Container Image

```bash
# Build the image
docker-compose -f docker-compose.staging.yml build api-ci

# Verify the image was created
docker images | grep mobius
```

#### 2. Start the API Container

```bash
# Start in detached mode
docker-compose -f docker-compose.staging.yml up -d api-ci

# Check container status
docker-compose -f docker-compose.staging.yml ps

# View logs
docker-compose -f docker-compose.staging.yml logs api-ci
```

#### 3. Run Smoke Tests

```bash
# Basic smoke test run
./scripts/ci/smoke-tests.sh http://localhost:5001

# With custom timeout and retry settings
./scripts/ci/smoke-tests.sh http://localhost:5001 45 3

# View detailed logs
cat scripts/ci/smoke-tests.log
```

#### 4. Manual API Testing

You can also test the API manually:

```bash
# Health check
curl http://localhost:5001/health | jq

# Readiness check  
curl http://localhost:5001/ready | jq

# API info
curl http://localhost:5001/api/info | jq

# Echo test
curl -X POST http://localhost:5001/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World", "data": {"test": true}}' | jq

# Test 404 handling
curl http://localhost:5001/nonexistent | jq
```

## Troubleshooting

### Container Won't Start

**Problem**: Container fails to start or exits immediately.

**Diagnosis**:
```bash
# Check container logs
docker-compose -f docker-compose.staging.yml logs api-ci

# Check if port is in use
netstat -tlnp | grep 5001
lsof -i :5001
```

**Solutions**:
- Ensure port 5001 is available
- Check Docker daemon is running
- Verify Dockerfile.ci syntax
- Review container logs for Node.js errors

### Service Not Ready

**Problem**: Smoke tests fail with "Service not ready" error.

**Diagnosis**:
```bash
# Check container health
docker-compose -f docker-compose.staging.yml ps

# Test health endpoint manually
curl -v http://localhost:5001/health

# Check container resource usage
docker stats
```

**Solutions**:
- Increase timeout value in smoke tests
- Verify container has sufficient resources
- Check if API dependencies are installed correctly
- Ensure health check endpoint is responding

### Network Connection Issues

**Problem**: Tests fail with connection errors.

**Diagnosis**:
```bash
# Test network connectivity
ping localhost
telnet localhost 5001

# Check Docker network
docker network ls
docker network inspect mobius-ci_mobius-ci
```

**Solutions**:
- Verify Docker network is created
- Check firewall settings
- Ensure container is bound to correct interface (0.0.0.0:5001)
- Try using container IP directly

### JSON Response Issues

**Problem**: Tests fail with "Response is not valid JSON" error.

**Diagnosis**:
```bash
# Check raw response
curl -v http://localhost:5001/health

# Validate JSON manually
curl http://localhost:5001/health | jq .
```

**Solutions**:
- Check API code for proper JSON serialization
- Verify Content-Type headers
- Look for extra characters in response
- Check for UTF-8 encoding issues

### Performance Issues

**Problem**: Tests timeout or run slowly.

**Diagnosis**:
```bash
# Check container resource usage
docker stats mobius-api-ci

# Check system resources
top
df -h
```

**Solutions**:
- Increase container memory limits
- Check available disk space
- Reduce test timeout for faster feedback
- Optimize container image size

## Configuration

### Environment Variables

The API supports these environment variables:

- `PORT`: Port to bind to (default: 5001)
- `NODE_ENV`: Environment mode (production for CI)

### Smoke Test Parameters

The smoke test script accepts these parameters:

1. **Base URL**: API base URL (required)
2. **Timeout**: Maximum wait time for service readiness (default: 30s)
3. **Retry Interval**: Time between readiness checks (default: 2s)

### Docker Compose Overrides

You can customize the container configuration:

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  api-ci:
    ports:
      - "8001:5001"  # Use different host port
    environment:
      - DEBUG=true   # Enable debug mode
    mem_limit: 512m  # Limit memory usage
```

## CI Integration

The smoke tests are automatically run in GitHub Actions as part of the `api-smoke-tests` job. This job:

1. Builds the container image
2. Starts the API service
3. Runs smoke tests with artifact collection
4. Always cleans up containers
5. Uploads logs and artifacts on failure

## File Structure

```
├── src/api-ci/                 # CI-only API source
│   ├── index.js               # Main API application
│   └── package.json           # API dependencies
├── scripts/ci/                # CI scripts
│   ├── smoke-tests.sh         # Smoke test runner
│   └── smoke-tests.log        # Test execution log
├── docs/
│   └── SMOKE_TESTS.md         # This documentation
├── Dockerfile.ci              # Container definition
├── .dockerignore              # Docker build excludes
└── docker-compose.staging.yml # Local orchestration
```

## Best Practices

1. **Always clean up**: Use `docker-compose down -v` to remove containers and volumes
2. **Check logs first**: Review container logs before running tests
3. **Use appropriate timeouts**: Adjust timeout based on your system performance
4. **Monitor resources**: Ensure sufficient CPU and memory for containers
5. **Regular updates**: Keep Docker images and dependencies up to date

## Contributing

When modifying the smoke tests:

1. Test changes locally first
2. Update documentation if adding new endpoints
3. Ensure tests are deterministic and don't depend on external services
4. Add appropriate error handling and logging
5. Follow the existing test pattern for consistency