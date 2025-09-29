# ci: add containerized CI mock API, Dockerfile.ci, docker-compose.staging & smoke tests

Implements a comprehensive CI testing infrastructure for the MOBIUS API that validates container builds and API behavior without external dependencies or secrets.

## What this PR adds

### Lightweight mock API server (`src/api/ci-server.js`)
- **GET /health** — status, timestamp, version, mode (mock-by-default)
- **GET /ready** — readiness, uptime, memory and CPU info  
- **GET /api/info** — API metadata and available endpoints
- **POST /api/echo** — request/response validation

### Docker infrastructure
- **Dockerfile.ci** — optimized Node 20 Alpine image, non-root user (mobius:1001), healthcheck
- **docker-compose.staging.yml** — local/CI orchestration for staging smoke tests
- **.dockerignore** — minimal build context

### Robust testing framework
- **scripts/ci/smoke-tests.sh** — comprehensive smoke-test runner with timeouts, retries, structured logs, jq fallback
- **scripts/ci/simple-smoke-test.sh** — lightweight smoke test for CI environments
- **scripts/ci/README.md** — usage, troubleshooting, mock data descriptions

### GitHub Actions integration
- **.github/workflows/ci.yml** — adds `api-smoke-tests` job to run smoke tests after lint/test jobs

### NPM convenience scripts
- **npm run api:ci** — run CI mock API locally
- **npm run smoke:test** — run smoke tests against local server
- **npm run smoke:test:full** — run comprehensive smoke tests

## Why

- **Deterministic CI validation** of built container images and API health without secrets
- **Fast, hermetic checks** that fail fast and provide structured debugging information  
- **Security-focused**: non-root runtime and mock-first approach to avoid external integrations in CI

## How to test locally

### Build image:
```bash
docker build -f Dockerfile.ci -t mobius-api-ci:local .
# or with compose
docker compose -f docker-compose.staging.yml build
```

### Start staging service:
```bash
docker compose -f docker-compose.staging.yml up -d
```

### Run smoke tests (30s timeout example):
```bash
./scripts/ci/simple-smoke-test.sh http://localhost:5001 30
# or comprehensive tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

### Cleanup:
```bash
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Expected /health response (example)
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

## CI behavior
- **New job**: `api-smoke-tests` (runs after lint/test)
- Builds Dockerfile.ci via Buildx, boots compose stack, waits for readiness, runs smoke tests
- On failure, collects container logs and fails the job; always performs cleanup

## Risk & mitigation
- **Port conflicts on dev machines**: adjust host port in docker-compose.staging.yml
- **CI flakiness due to timeouts**: increase timeout/retry in scripts and re-run  
- **Non-root runtime differences on some runners**: validate logs and adjust file permissions in image if needed

## Reviewer checklist
- [ ] Run smoke tests locally and confirm /health returns mode: "mock"
- [ ] Inspect Dockerfile.ci for non-root user and minimal dependencies
- [ ] Confirm docker-compose.staging.yml ports, healthcheck and volumes  
- [ ] Validate smoke tests contain retries/timeouts and structured logs
- [ ] Confirm api-smoke-tests job runs and collects logs on failure
- [ ] Approve only if CI passes and no production code is affected

## Files changed
- `src/api/ci-server.js` - New lightweight mock API server
- `Dockerfile.ci` - Container build configuration  
- `docker-compose.staging.yml` - Service orchestration
- `.dockerignore` - Build context optimization
- `scripts/ci/smoke-tests.sh` - Comprehensive test runner
- `scripts/ci/simple-smoke-test.sh` - Lightweight CI tests
- `scripts/ci/README.md` - Documentation and troubleshooting
- `.github/workflows/ci.yml` - CI integration
- `package.json` - Added convenience scripts and dependencies