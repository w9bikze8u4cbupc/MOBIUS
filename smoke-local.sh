#!/usr/bin/env bash
# Local development smoke test script
# Sets sane defaults for quick local validation

set -Eeuo pipefail
IFS=$'\n\t'

# Default configuration for local development
SERVER="${SERVER:-http://localhost:5001}"
FRONTEND="${FRONTEND:-http://localhost:3000}"
TIMEOUT_DEFAULT="${TIMEOUT_DEFAULT:-15}"
TIMEOUT_PREVIEW="${TIMEOUT_PREVIEW:-60}"

# Create artifacts directory
mkdir -p artifacts

# Run smoke test with local defaults
./mobius_golden_path.sh \
  --profile smoke \
  --server "$SERVER" \
  --frontend "$FRONTEND" \
  --timeout-default "$TIMEOUT_DEFAULT" \
  --timeout-preview "$TIMEOUT_PREVIEW" \
  --json-summary artifacts/summary.json \
  --junit artifacts/junit.xml \
  --fail-fast \
  --quiet

echo "✅ Smoke test completed successfully!"
echo "📄 Check artifacts/summary.json for detailed results"
echo "📊 Check artifacts/junit.xml for test report"