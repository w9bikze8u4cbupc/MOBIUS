# CI: Add CI-only Mock API, Dockerfile.ci, Compose, Smoke Tests & Verification Tooling

Implements CI-only infrastructure for deterministic container validation (mock-mode API, non-root container, smoke tests, and repo verification tooling). This change is test/CI infrastructure only and does not modify production behavior.

## What this PR adds

### Core Infrastructure Files

- **`src/api/ci-server.mjs`** — lightweight mock API for CI with endpoints:
  - `GET /health` — container health + mode
  - `GET /api/status` — mock-mode status
  - Mock endpoints for `explain-chunk`, `extract-bgg-html`, `extract-components`, etc.
  - Graceful shutdown, CORS enabled, non-root run user

- **`Dockerfile.ci`** — Node 20 Alpine, non-root user (UID 1001), production deps only, healthcheck

- **`docker-compose.staging.yml`** — single-service staging compose (5001:5001), healthchecks, network isolation

- **`.dockerignore`** — reduced build context (excludes tests, client, build artifacts)

### Testing & Verification

- **`scripts/ci/smoke-tests.sh`** — robust smoke tests (11 endpoints, retries, timeouts, structured logs)

- **`scripts/verify-clean-genesis.js`** — repo verification tool (fast/detailed modes, CI-ready exit codes)
  - Scans for secrets, API keys, passwords, private keys
  - Generates detailed markdown reports
  - Excludes itself and known false positives

### CI/CD

- **`.github/workflows/api-smoke-tests.yml`** — CI job to:
  - Verify repo cleanliness
  - Build Docker image with Buildx
  - Run compose stack
  - Execute smoke tests
  - Upload logs and reports on completion

### Configuration Updates

- **`package.json` updates**: npm scripts to run verification, mock server, build/up/down/logs, and smoke-tests:
  - `npm run ci:mock-server` - Start mock API locally
  - `npm run ci:verify` - Run repository verification
  - `npm run ci:docker-build` - Build Docker image
  - `npm run ci:docker-up` - Start compose stack
  - `npm run ci:docker-down` - Stop and clean up
  - `npm run ci:smoke-tests` - Run smoke tests
  - `npm run verify-clean-genesis` - Alias for verification

- **`.gitignore` updated** to exclude `verification-reports/`

## Why

- Provides hermetic, fast CI validation for containerization and API contract checks without secrets
- Ensures PRs that change CI, containerization, or packaging are validated in a consistent environment
- Keeps production code untouched; mock-first approach prevents secret leakage
- Non-root container execution improves security
- Automated smoke tests catch regressions early

## How to verify locally

### Verify repo cleanliness (fast)
```bash
npm run verify-clean-genesis
# or
node scripts/verify-clean-genesis.js
```

### Build image
```bash
docker build -f Dockerfile.ci -t mobius-api-ci:local .
# or
npm run ci:docker-build
```

### Start staging
```bash
docker compose -f docker-compose.staging.yml up -d
# or
npm run ci:docker-up
```

### Run smoke tests
```bash
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
# or
npm run ci:smoke-tests
```

### Cleanup
```bash
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
# or
npm run ci:docker-down
```

## Expected quick checks

- `/health` returns `{"status":"healthy","mode":"mock",...}`
- Smoke-tests: all 11 endpoints return expected statuses and payload shapes
- Verification: exit code 0 on clean repo and a report placed under `verification-reports/`

## CI behavior

`api-smoke-tests` job runs on PRs and pushes to `main/ci/**`:

1. Runs repo verification (non-blocking warnings)
2. Builds `Dockerfile.ci` with Docker Buildx
3. Starts compose stack
4. Waits for readiness and runs smoke tests
5. Uploads logs and verification reports (always) and tears down

## Security & best practices

✅ Non-root container execution (UID 1001)  
✅ Minimal Alpine base and production deps only  
✅ No secrets in CI; mock-first approach  
✅ Healthchecks and graceful shutdowns included  
✅ Repository verification prevents secret leakage  

## Troubleshooting (common)

- **Port conflict**: change local host mapping in `docker-compose.staging.yml` or free port 5001
- **Missing Docker permissions**: ensure Docker daemon is running and user in docker group or use sudo
- **Smoke-tests flaky in CI**: increase timeout/retry parameters in `scripts/ci/smoke-tests.sh` and re-run
- **Verification finds matches in history**: coordinate a history-rewrite (BFG/git-filter-repo) — do not perform without team coordination

## Test Results

✅ All 11 smoke tests passed locally:
1. Health endpoint returns 200
2. API status endpoint returns 200
3. Explain chunk with valid data
4. Explain chunk without data returns 400
5. Extract BGG HTML with valid URL
6. Extract BGG HTML with invalid URL returns 400
7. Extract components endpoint
8. Summarize endpoint
9. Upload PDF endpoint
10. Load project endpoint
11. Non-existent endpoint returns 404

✅ Repository verification: Clean (no secrets detected)  
✅ Docker build: Successful  
✅ Docker container: Running and healthy  

## Reviewer checklist

- [ ] Run `npm run verify-clean-genesis` and confirm exit code 0; attach verification report if desired
- [ ] Confirm `Dockerfile.ci` uses non-root user and only production dependencies
- [ ] Confirm `docker-compose.staging.yml` healthcheck and port mappings are acceptable
- [ ] Run smoke tests locally and confirm all endpoints pass:
  ```bash
  ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
  ```
- [ ] Inspect `.github/workflows/api-smoke-tests.yml` for CI correctness and artifact collect behavior
- [ ] Security: approve non-root execution and lack of secrets in CI
- [ ] Ops: confirm runbook/rollback steps are feasible for the staging flow

## Suggested labels

- `type/ci`
- `infra/docker`
- `status/needs-review`

## Post-merge steps

- [ ] Tag a release candidate (e.g., `v0.1.0-rc1`) and run one final full verification + smoke tests in a clean runner
- [ ] Keep `verify-clean-genesis` in PR gating to prevent regression
- [ ] Add nightly verification runs (optional) to catch regressions early

### Commands to tag (after merge):

```bash
git checkout main
git pull origin main
git tag -a v0.1.0-rc1 -m "release: add CI smoke-test infra for MOBIUS"
git push origin v0.1.0-rc1
```
