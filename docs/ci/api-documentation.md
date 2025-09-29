# MOBIUS CI API Documentation

## Overview

This document describes the lightweight CI API (`src/api-ci/`) that provides health checks and basic endpoints for smoke testing in the MOBIUS Games CI pipeline.

## Architecture

The CI API is separate from the main game processing API (`src/api/`) to provide:
- Lightweight container for CI testing
- Fast startup time
- Minimal dependencies
- Focused endpoints for monitoring

## Endpoints

### Health Check
```
GET /health
```

Returns the health status of the API service.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-29T10:24:11.495Z",
  "service": "mobius-api-ci",
  "version": "1.0.0"
}
```

### Readiness Check
```
GET /ready
```

Returns readiness status with system information.

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2025-09-29T10:24:11.507Z",
  "checks": {
    "server": "ok",
    "memory": {
      "rss": 58142720,
      "heapTotal": 7839744,
      "heapUsed": 6752272,
      "external": 2181203,
      "arrayBuffers": 16619
    },
    "uptime": 11.966846579
  }
}
```

### API Information
```
GET /api/info
```

Returns API information and available endpoints.

**Response:**
```json
{
  "name": "MOBIUS Games CI API",
  "description": "Lightweight API for CI smoke tests",
  "version": "1.0.0",
  "endpoints": [
    "GET /health - Health check",
    "GET /ready - Readiness check", 
    "GET /api/info - API information",
    "POST /api/echo - Echo test"
  ]
}
```

### Echo Test
```
POST /api/echo
Content-Type: application/json

{
  "test": "example-data"
}
```

Echoes back the sent data for testing POST requests.

**Response:**
```json
{
  "message": "Echo successful",
  "received": {
    "test": "example-data"
  },
  "timestamp": "2025-09-29T10:24:11.540Z"
}
```

## Docker Usage

### Build the Image
```bash
docker build -f Dockerfile.ci -t mobius-ci-api .
```

### Run with Docker
```bash
docker run -p 5001:5001 mobius-ci-api
```

### Run with Docker Compose
```bash
docker compose -f docker-compose.staging.yml up -d
```

## CI Pipeline Integration

The API is integrated into the GitHub Actions CI pipeline as the `api-smoke-tests` job:

1. **Container Deployment**: Uses `docker-compose.staging.yml` to deploy services
2. **Health Checks**: Waits for services to be ready
3. **Smoke Tests**: Runs comprehensive endpoint tests via `scripts/ci/smoke-tests.sh`
4. **Cleanup**: Automatically tears down services

### Manual Smoke Tests

Run smoke tests manually:

```bash
# Start services
docker compose -f docker-compose.staging.yml up -d

# Run tests
./scripts/ci/smoke-tests.sh

# Clean up
docker compose -f docker-compose.staging.yml down
```

### Smoke Test Options

```bash
./scripts/ci/smoke-tests.sh [options]

Options:
  --api-url URL        API base URL (default: http://localhost:5001)
  --timeout SECONDS    Request timeout (default: 30)
  --retry-count COUNT  Readiness check retries (default: 5)
  -h, --help          Show help message
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | API server port |
| `NODE_ENV` | | Node.js environment (`staging`, `production`, etc.) |

## Development

### Local Development
```bash
cd src/api-ci
npm install
npm start
```

### Testing Endpoints
```bash
# Health check
curl http://localhost:5001/health

# Readiness check  
curl http://localhost:5001/ready

# API info
curl http://localhost:5001/api/info

# Echo test
curl -X POST http://localhost:5001/api/echo \
  -H "Content-Type: application/json" \
  -d '{"test": "hello"}'
```

## Monitoring

The API includes:
- Built-in Docker health checks
- Comprehensive endpoint testing
- Memory usage reporting
- Uptime tracking
- Request logging

## Security

The CI API:
- Accepts all origins (for CI testing flexibility)
- Has no authentication (by design for CI use)
- Only exposes safe, read-only operations
- Is separate from production APIs