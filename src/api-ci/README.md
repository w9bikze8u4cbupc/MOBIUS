# MOBIUS CI API

A lightweight API for CI smoke testing in the MOBIUS Games tutorial generator pipeline.

## Quick Start

### Using Docker Compose (Recommended)
```bash
docker compose -f docker-compose.staging.yml up -d
```

### Using Docker
```bash
docker build -f Dockerfile.ci -t mobius-ci-api .
docker run -p 5001:5001 mobius-ci-api
```

### Local Development
```bash
cd src/api-ci
npm install
npm start
```

## Endpoints

- `GET /health` - Health check
- `GET /ready` - Readiness check with system info
- `GET /api/info` - API information
- `POST /api/echo` - Echo test for POST requests

## Testing

Run the comprehensive smoke test suite:
```bash
./scripts/ci/smoke-tests.sh
```

## CI Integration

This API is automatically tested in the GitHub Actions CI pipeline as part of the `api-smoke-tests` job.

## Documentation

See [docs/ci/api-documentation.md](../../docs/ci/api-documentation.md) for complete documentation.