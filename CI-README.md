# MOBIUS CI/CD Pipeline

This repository now includes a comprehensive multi-platform CI/CD pipeline with FastAPI-style robustness and testing.

## Overview

The CI pipeline includes:
- **Multi-platform testing**: Ubuntu, macOS, Windows (Python 3.11, Node.js 20)
- **Code quality**: Python (black, isort, flake8) and JavaScript linting
- **Testing**: Jest with coverage and JUnit XML reporting
- **Docker**: Multi-stage builds with smoke testing
- **Staging E2E**: Full-stack smoke tests for staging environment

## CI Pipeline Structure

### 1. Lint and Test (Multi-Platform)
Runs on Ubuntu, macOS, and Windows:
- Python code formatting with `black==23.9.1`
- Import sorting with `isort`
- Linting with `flake8`
- Jest tests with coverage
- Artifact collection (test results, coverage reports)

### 2. Docker Build & Smoke Test
- Multi-stage Docker build
- Container health checks
- Basic API connectivity testing
- Log collection and artifact upload

### 3. Staging E2E (Staging-Only)
- Runs only on staging branch or staging PRs
- Full docker-compose stack testing
- Extended health checks and validation
- Comprehensive log collection

## Required Secrets

Add these repository secrets for the CI to function properly:

### `ALLOWED_TOKEN`
- **Purpose**: CI-only authentication token
- **Generate**: `echo "mobius-ci-$(openssl rand -hex 16)-$(date +%Y%m)"`
- **Important**: Use CI-only credentials, not production tokens

## Local Development

### Testing
```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in CI mode
npm test -- --ci --coverage
```

### Python Code Quality
```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Format Python code
black src/
isort src/

# Lint Python code
flake8 src/
```

### Docker
```bash
# Build image
docker build -t mobius-app .

# Run staging environment
docker-compose -f docker-compose.staging.yml up
```

## Files Structure

### CI Configuration
- `.github/workflows/ci.yml` - Main CI pipeline
- `pyproject.toml` - Python tooling configuration
- `requirements-dev.txt` - Python development dependencies

### Docker
- `Dockerfile` - Multi-stage production build
- `.dockerignore` - Docker build exclusions
- `docker-compose.staging.yml` - Staging environment

### Testing
- `src/__tests__/` - Jest test files
- `package.json` - Jest and reporting configuration
- `tests/reports/` - Generated test reports (CI artifacts)

## Production Readiness Checklist

Before deploying to production, ensure:
- [ ] OAuth2/JWT authentication implementation
- [ ] Redis/Celery durable job processing
- [ ] Persistent artifact storage (S3/Database)
- [ ] Prometheus metrics and health endpoints
- [ ] Production secrets management
- [ ] Database migrations and backup strategy

## CI Workflow Triggers

- **Push**: All branches
- **Pull Request**: main, staging branches
- **Staging E2E**: Only staging branch or PRs targeting staging

## Artifact Collection

The CI collects and uploads:
- Test results (JUnit XML)
- Coverage reports (LCOV, text)
- Docker container logs
- E2E test logs and container status
- Platform-specific build artifacts

All artifacts are retained for 7-30 days based on type and importance.