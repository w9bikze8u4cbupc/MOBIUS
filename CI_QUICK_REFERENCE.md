# CI Quick Reference Guide

## Quick Start (30 seconds)

```bash
# Verify repo, build, test - all in one
npm run ci:verify-fast && \
npm run ci:docker-build && \
npm run ci:docker-up && \
sleep 5 && \
npm run ci:smoke-tests && \
npm run ci:docker-down
```

## Individual Commands

### Repository Verification
```bash
npm run verify-clean-genesis       # Standard verification
npm run ci:verify-fast             # Fast scan (current files only)
npm run ci:verify-detailed         # Detailed scan (includes history)
```

### Docker Operations
```bash
npm run ci:docker-build            # Build the CI image
npm run ci:docker-up               # Start the compose stack
npm run ci:docker-down             # Stop and clean up
npm run ci:docker-logs             # View container logs
```

### Testing
```bash
npm run ci:smoke-tests             # Run all smoke tests
npm run ci:mock-server             # Run mock API locally (for dev)
```

## Manual Commands (without npm)

### Verification
```bash
node scripts/verify-clean-genesis.js              # Standard
node scripts/verify-clean-genesis.js --fast       # Fast
node scripts/verify-clean-genesis.js --detailed   # Detailed
```

### Docker
```bash
docker build -f Dockerfile.ci -t mobius-api-ci:local .
docker compose -f docker-compose.staging.yml up -d
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
docker compose -f docker-compose.staging.yml logs -f
```

### Smoke Tests
```bash
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
# Params: [base_url] [timeout_seconds] [retry_count]
```

## Health Checks

```bash
# Check if service is running
curl http://localhost:5001/health

# Check API status and available endpoints
curl http://localhost:5001/api/status

# Test a mock endpoint
curl -X POST http://localhost:5001/api/explain-chunk \
  -H "Content-Type: application/json" \
  -d '{"chunk":"test rule","language":"en"}'
```

## Troubleshooting

### Port 5001 already in use
```bash
# Option 1: Find and kill the process
lsof -ti:5001 | xargs kill -9

# Option 2: Change port in docker-compose.staging.yml
ports:
  - "5002:5001"  # Map host 5002 to container 5001
```

### Container keeps restarting
```bash
# Check logs
docker logs mobius-api-ci

# Check container status
docker ps -a --filter "name=mobius-api-ci"

# Rebuild without cache
docker build --no-cache -f Dockerfile.ci -t mobius-api-ci:local .
```

### Verification fails with false positives
```bash
# The script already excludes itself
# If you need to exclude more files, edit:
# scripts/verify-clean-genesis.js
# Add patterns to the EXCLUDED_PATTERNS array
```

### Smoke tests fail
```bash
# Increase timeout and retries
./scripts/ci/smoke-tests.sh http://localhost:5001 60 5

# Check if service is actually running
curl -v http://localhost:5001/health

# Check container logs
docker logs mobius-api-ci
```

## CI Behavior

The GitHub Actions workflow runs automatically on:
- Pull requests to `main`
- Pushes to `main` or `ci/**` branches
- Changes to relevant files (API, Docker, CI scripts)

To test CI locally before pushing:
```bash
# Simulate CI steps
npm install --production express cors
node scripts/verify-clean-genesis.js
docker build -f Dockerfile.ci -t mobius-api-ci:latest .
docker compose -f docker-compose.staging.yml up -d
sleep 10
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
docker compose -f docker-compose.staging.yml down --volumes
```

## File Locations

```
MOBIUS/
├── src/api/
│   └── ci-server.mjs                      # Mock API server
├── scripts/
│   ├── ci/
│   │   └── smoke-tests.sh                 # Smoke test suite
│   └── verify-clean-genesis.js            # Repository verification
├── .github/workflows/
│   └── api-smoke-tests.yml                # CI workflow
├── Dockerfile.ci                          # CI container definition
├── docker-compose.staging.yml             # Compose configuration
├── .dockerignore                          # Build context exclusions
├── PR_BODY.md                             # PR description
└── IMPLEMENTATION_SUMMARY.md              # Full implementation details
```

## Exit Codes

- **0**: Success (all tests pass, repo clean)
- **1**: Failure (test failed, secrets found, error occurred)

## Report Locations

- Verification reports: `verification-reports/{timestamp}/genesis-verification-report.md`
- Smoke test logs: `smoke-tests.log` (if redirected)
- CI artifacts: GitHub Actions artifacts (30-day retention)

## Performance Expectations

- Mock server startup: <1s
- Single smoke test: <1s
- Full smoke suite: <5s
- Verification (fast): <5s
- Docker build: ~60-90s
- Compose up: ~5s

## Support

For issues or questions:
1. Check `IMPLEMENTATION_SUMMARY.md` for detailed info
2. Review `PR_BODY.md` for troubleshooting
3. Check CI logs in GitHub Actions
4. Review container logs: `docker logs mobius-api-ci`
