# MOBIUS CI Smoke Tests

This directory contains the CI smoke test infrastructure for the MOBIUS API.

## Overview

The smoke tests validate that the containerized API is working correctly in CI environments. They test:

- Health endpoint functionality
- Mock API responses
- CORS configuration
- Basic connectivity

## Files

- `smoke-tests.sh` - Main smoke test runner script
- `../api/ci-server.js` - Simplified API server for CI mode
- `../api/mock.js` - Mock response definitions

## Usage

### Local Testing

```bash
# Start the CI API server
npm run api:ci

# In another terminal, run smoke tests
npm run smoke:test
```

### Manual Execution

```bash
# Basic usage
./scripts/ci/smoke-tests.sh http://localhost:5001

# With custom timeout and retries
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

### Docker Testing

```bash
# Build the CI image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start with docker-compose
docker compose -f docker-compose.staging.yml up -d

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Cleanup
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Script Parameters

1. **base_url** (required) - The base URL of the API to test
2. **timeout** (optional, default: 30) - Request timeout in seconds
3. **retries** (optional, default: 2) - Number of retries for failed requests

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Test Coverage

### Health Check
- Validates `/health` endpoint returns `status: "healthy"`
- Confirms API is running in mock mode

### API Endpoints
- Tests BGG components endpoint with mock data
- Tests component extraction endpoint with mock data
- Validates proper JSON responses

### Infrastructure
- Checks CORS headers are present
- Validates basic HTTP connectivity

## Mock Mode

The API runs in mock mode when:
- `MOBIUS_MODE=mock` environment variable is set
- `NODE_ENV=ci` environment variable is set

In mock mode, the API returns predefined test data instead of making external API calls or processing real files.

## CI Integration

The smoke tests are integrated into the GitHub Actions workflow in `.github/workflows/ci.yml` as the `api-smoke-tests` job. This job:

1. Builds the Docker image
2. Starts the staging environment
3. Waits for the API to be ready
4. Runs the smoke tests
5. Collects logs if tests fail
6. Cleans up resources

## Troubleshooting

### Common Issues

1. **Port conflicts** - Change the port in `docker-compose.staging.yml`
2. **Container won't start** - Check Docker logs: `docker compose -f docker-compose.staging.yml logs`
3. **Tests timeout** - Increase timeout parameter or check API health
4. **Missing dependencies** - Ensure Node.js and curl are available

### Debugging

```bash
# Check container status
docker compose -f docker-compose.staging.yml ps

# View container logs
docker compose -f docker-compose.staging.yml logs api-ci

# Test health endpoint manually
curl http://localhost:5001/health

# Enable verbose output in smoke tests (edit script to add -v to curl)
```

## Mock Data

The mock responses include:

- **Health**: Status, mode, timestamp, version, uptime
- **BGG Components**: Sample board game components list
- **Component Extraction**: Mock PDF extraction results
- **BGG Metadata**: Sample board game metadata

Mock data is defined in `../api/mock.js` and can be customized as needed.