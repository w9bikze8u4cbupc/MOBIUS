#!/usr/bin/env bash
set -euo pipefail

echo "1) Running repository verification..."
node scripts/verify-clean-genesis.js

echo "2) Building CI Docker image..."
docker build -f Dockerfile.ci -t mobius-api-ci:local .

echo "3) Starting staging compose..."
docker compose -f docker-compose.staging.yml up -d --build

echo "4) Running smoke tests..."
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2 || {
  echo "Smoke tests failed; collecting logs..."
  docker compose -f docker-compose.staging.yml logs --timestamps > compose-logs.log || true
  tar -czf mobius-ci-artifacts.tar.gz smoke-tests.log compose-logs.log verification-reports || true
  docker compose -f docker-compose.staging.yml down --volumes --remove-orphans || true
  echo "Artifacts: mobius-ci-artifacts.tar.gz"
  exit 1
}

echo "5) Tests passed; collecting artifacts..."
tar -czf mobius-ci-artifacts.tar.gz smoke-tests.log verification-reports || true

echo "Tearing down staging..."
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans || true

echo "Done. Artifacts: mobius-ci-artifacts.tar.gz"
