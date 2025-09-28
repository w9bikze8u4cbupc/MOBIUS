# CI/CD Configuration

This repository uses a multi-platform GitHub Actions workflow for continuous integration.

## Required Secrets

Add the following secret in **Settings → Secrets and variables → Actions → New repository secret**:

- **Name**: `ALLOWED_TOKEN`
- **Value**: Generate a CI-only token for authenticated API tests
- **Example generation**:
  ```bash
  echo "mobius-ci-$(openssl rand -hex 16)-$(date +%Y%m)"
  ```

**Important**: Do not use production credentials for CI testing.

## Workflow Overview

The CI pipeline includes:

1. **Lint & Tests** (Ubuntu, macOS, Windows)
   - Multi-OS Node.js testing matrix
   - Installs root and client dependencies
   - Runs linting (if configured) 
   - Runs unit tests with proper handling of empty test suites
   - Collects test artifacts

2. **API Smoke Test** (Ubuntu only)
   - Starts the Node.js API server
   - Tests public endpoint (`/`)
   - Tests authenticated health endpoint (`/health`) if ALLOWED_TOKEN provided
   - Installs FFmpeg for video processing features

3. **Staging E2E** (staging branch only)
   - Runs Docker Compose staging stack
   - Performs end-to-end health checks
   - Collects logs for debugging

## Branch Configuration

The workflow triggers on:
- **Push**: `main`, `staging`, `**/feature/**`
- **Pull Request**: `main`, `staging`

## API Endpoints

The following endpoints are available for smoke testing:

- `GET /` - Public health check
- `GET /health` - Authenticated health check (requires Bearer token)

## Troubleshooting

If the API smoke test fails:
1. Check that `ALLOWED_TOKEN` secret is configured
2. Verify the API server starts successfully
3. Check artifact logs for detailed error information

The workflow is designed to be resilient and will continue even if API startup fails due to pre-existing code issues.