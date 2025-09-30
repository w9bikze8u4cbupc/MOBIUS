# MOBIUS Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules with comprehensive CI/CD testing infrastructure.

## Features

- Game tutorial video generation pipeline
- Golden reference testing for video/audio quality
- Containerized CI testing with mock API
- Repository verification and cleanliness checks
- Automated smoke tests with retries

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- FFmpeg (for video processing)
- npm

### Installation

```bash
npm install
```

## CI Testing Infrastructure

This repository includes a comprehensive CI testing infrastructure that validates containerization and API behavior without requiring external dependencies or secrets.

### Components

1. **Mock CI API Server** (`src/api/ci-server.js`)
   - Lightweight Express server for CI/CD testing
   - No external dependencies or database connections
   - Health checks and basic API endpoints

2. **Verification Script** (`scripts/verify-clean-genesis.js`)
   - Scans repository for accidental "genesis" references
   - Generates detailed reports in `verification-reports/`
   - Configurable exclusion patterns

3. **Docker Configuration**
   - `Dockerfile.ci` - Production-ready container with non-root user
   - `docker-compose.staging.yml` - Local/CI testing orchestration
   - `.dockerignore` - Optimized Docker builds

4. **Smoke Tests** (`scripts/ci/smoke-tests.sh`)
   - Automated endpoint testing with retries
   - Timeout handling and detailed logging
   - Validates health, status, and API endpoints

### Local Testing

#### Test Verification Script

```bash
# Fast mode (default)
npm run verify-clean-genesis

# Detailed mode with context
node scripts/verify-clean-genesis.js --detailed

# Quiet mode
node scripts/verify-clean-genesis.js --quiet
```

#### Test Mock API Locally

```bash
# Start mock API server
npm run api:ci

# In another terminal, run smoke tests
npm run smoke-tests
```

#### Test with Docker

```bash
# Build the CI image
npm run docker:build
# or
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start the staging environment
npm run docker:up
# or
docker compose -f docker-compose.staging.yml up -d

# Run smoke tests
npm run smoke-tests
# or
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# View logs
npm run docker:logs
# or
docker compose -f docker-compose.staging.yml logs -f

# Stop and cleanup
npm run docker:down
# or
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

### Complete Workflow Testing

Use the `finish_mobius_release.sh` script for end-to-end testing:

```bash
# Run complete verification, build, test, and PR workflow
bash finish_mobius_release.sh
```

This script will:
1. Run repository verification
2. Apply patches (if present)
3. Build Docker images
4. Start staging environment
5. Run smoke tests
6. Collect logs and artifacts
7. Create PR (requires GitHub CLI)

### CI/CD Integration

The `.github/workflows/ci.yml` includes an `api-smoke-tests` job that:
- Verifies repository cleanliness
- Builds the Docker image
- Starts the staging environment
- Runs smoke tests
- Collects logs on failure

## Available Scripts

### Development

- `npm test` - Run unit tests
- `npm run verify` - Run verification script
- `npm run test-pipeline` - Run full pipeline test

### Golden Testing

- `npm run golden:check` - Check all golden references
- `npm run golden:update` - Update golden references
- `npm run golden:check:sushi` - Check Sushi Go golden
- `npm run golden:check:loveletter` - Check Love Letter golden

### CI Testing

- `npm run verify-clean-genesis` - Verify repository cleanliness
- `npm run api:ci` - Start CI mock API server
- `npm run docker:build` - Build Docker CI image
- `npm run docker:up` - Start Docker compose staging
- `npm run docker:down` - Stop Docker compose staging
- `npm run docker:logs` - View Docker compose logs
- `npm run smoke-tests` - Run API smoke tests

## Project Structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline configuration
├── scripts/
│   ├── ci/
│   │   └── smoke-tests.sh      # Smoke test suite
│   ├── verify-clean-genesis.js # Repository verification
│   ├── check_golden.js         # Golden reference checker
│   └── generate_golden.js      # Golden reference generator
├── src/
│   └── api/
│       ├── ci-server.js        # CI mock API server
│       └── index.js            # Main API server
├── tests/
│   └── golden/                 # Golden reference files
├── Dockerfile.ci               # CI container definition
├── docker-compose.staging.yml  # Staging orchestration
├── .dockerignore              # Docker build exclusions
└── finish_mobius_release.sh   # Automation script
```

## Verification Reports

The verification script generates reports in `verification-reports/` with:
- Timestamp and search parameters
- List of matches (if any)
- Pass/fail status
- Excluded patterns

Reports are excluded from git commits.

## Docker Best Practices

The CI Docker configuration follows best practices:
- Non-root user execution
- Multi-stage builds (implicit with node:alpine)
- Health checks
- Minimal attack surface
- Production dependencies only

## Troubleshooting

### Docker build fails

```bash
# Clean and rebuild
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
docker rmi mobius-api-ci:local
docker build --no-cache -f Dockerfile.ci -t mobius-api-ci:local .
```

### Smoke tests timeout

- Check if the container is running: `docker ps`
- View logs: `docker compose -f docker-compose.staging.yml logs`
- Increase timeout: `./scripts/ci/smoke-tests.sh http://localhost:5001 60 3`

### Verification script finds matches

Review the report in `verification-reports/` and:
- Ensure matches aren't false positives
- Update exclusion patterns if needed
- Remove accidental references

## Contributing

1. Run verification before committing: `npm run verify-clean-genesis`
2. Test locally with Docker: `npm run docker:build && npm run docker:up && npm run smoke-tests`
3. Ensure all tests pass: `npm test`

## License

MIT
