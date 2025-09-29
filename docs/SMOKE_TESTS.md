# Containerized API Smoke Tests (local & CI)

This document describes how to run the CI-focused containerized smoke tests locally. The CI workflow runs the same steps.

Prereqs:
- Docker & Docker Compose installed
- Ports: 5001 must be available on local machine

Build and run locally:

1. Build

```bash
docker-compose -f docker-compose.staging.yml build
```

2. Start the CI API service

```bash
docker-compose -f docker-compose.staging.yml up -d api-ci
```

3. Run the smoke test script (bundled in repo)

```bash
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

4. Tear down

```bash
docker-compose -f docker-compose.staging.yml down -v
```

Expected /health JSON:

```json
{
  "status": "healthy",
  "timestamp": "2025-09-29T01:14:01.319Z",
  "version": "0.1.0",
  "mode": "mock"
}
```

Notes:
- The CI API runs in "mock" mode by default when started from the compose file (USE_MOCKS=true). This ensures no external services or secrets are required.
- The smoke test script validates /health, /ready, /api/info, POST /api/echo, and 404 behavior. It provides logs and exits non-zero if any checks fail.

Security:
- No secrets are needed for these tests. Do NOT add production secrets to CI for these smoke tests.

Troubleshooting:
- If Docker build fails on CI, inspect `api-ci-compose-logs` artifact uploaded by the workflow.
- If tests time out, increase the timeout parameter when running the script locally.