ci: add containerized CI mock API, Dockerfile.ci, docker-compose.staging & smoke tests

Implements a comprehensive CI testing infrastructure for the MOBIUS API that validates container builds and API behavior without external dependencies or secrets.

What this PR adds
- Lightweight mock API server (src/api/ci-server.js)
- Dockerfile.ci, docker-compose.staging.yml, .dockerignore
- scripts/ci/smoke-tests.sh with retries/timeouts/logging
- .github/workflows/ci.yml update to run api-smoke-tests job
- README and developer convenience npm scripts for local testing

How to test locally
1) Build image:
   docker build -f Dockerfile.ci -t mobius-api-ci:local .
2) Start staging:
   docker compose -f docker-compose.staging.yml up -d
3) Run smoke tests:
   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
4) Cleanup:
   docker compose -f docker-compose.staging.yml down --volumes --remove-orphans

This PR is CI-only infrastructure (mock-mode API, non-root container) and does not change production behavior.