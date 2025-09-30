#!/usr/bin/env bash
# scripts/ci/smoke-tests.sh
# Smoke tests for CI mock API with retries, timeouts, and structured logging

set -euo pipefail

# Configuration
SMOKE_URL="${1:-http://localhost:5001}"
SMOKE_TIMEOUT="${2:-30}"
SMOKE_RETRIES="${3:-2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

# Test counter
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper with retries
run_test() {
  local test_name="$1"
  local test_command="$2"
  local retries=0
  
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  log_info "Running test: ${test_name}"
  
  while [ $retries -le "$SMOKE_RETRIES" ]; do
    if eval "$test_command"; then
      log_info "✓ PASS: ${test_name}"
      TESTS_PASSED=$((TESTS_PASSED + 1))
      return 0
    else
      retries=$((retries + 1))
      if [ $retries -le "$SMOKE_RETRIES" ]; then
        log_warn "Retry ${retries}/${SMOKE_RETRIES} for: ${test_name}"
        sleep 2
      fi
    fi
  done
  
  log_error "✗ FAIL: ${test_name}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  return 1
}

# Wait for service to be ready
wait_for_service() {
  local url="$1"
  local timeout="$2"
  local elapsed=0
  
  log_info "Waiting for service at ${url} (timeout: ${timeout}s)"
  
  while [ $elapsed -lt "$timeout" ]; do
    if curl -sf "${url}/health" >/dev/null 2>&1; then
      log_info "Service is ready"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  log_error "Service did not become ready within ${timeout}s"
  return 1
}

# Start smoke tests
log_info "=== Starting Smoke Tests ==="
log_info "Target URL: ${SMOKE_URL}"
log_info "Timeout: ${SMOKE_TIMEOUT}s"
log_info "Retries: ${SMOKE_RETRIES}"

# Wait for service
if ! wait_for_service "$SMOKE_URL" "$SMOKE_TIMEOUT"; then
  log_error "Service not available, aborting tests"
  exit 1
fi

# Test 1: Health check endpoint
run_test "Health check returns 200" \
  "curl -sf '${SMOKE_URL}/health' -o /dev/null -w '%{http_code}' | grep -q '^200$'"

run_test "Health check returns valid JSON" \
  "curl -sf '${SMOKE_URL}/health' | jq -e '.status == \"ok\"' >/dev/null"

# Test 2: Status endpoint
run_test "Status endpoint returns 200" \
  "curl -sf '${SMOKE_URL}/api/status' -o /dev/null -w '%{http_code}' | grep -q '^200$'"

run_test "Status endpoint returns mock mode" \
  "curl -sf '${SMOKE_URL}/api/status' | jq -e '.mode == \"mock\"' >/dev/null"

# Test 3: Mock API endpoints
run_test "Explain chunk endpoint accepts POST" \
  "curl -sf -X POST '${SMOKE_URL}/api/explain-chunk' \
    -H 'Content-Type: application/json' \
    -d '{\"chunk\":\"test\",\"language\":\"en\"}' \
    -o /dev/null -w '%{http_code}' | grep -q '^200$'"

run_test "BGG extract endpoint accepts POST" \
  "curl -sf -X POST '${SMOKE_URL}/api/extract-bgg-html' \
    -H 'Content-Type: application/json' \
    -d '{\"url\":\"https://boardgamegeek.com/boardgame/12345\"}' \
    -o /dev/null -w '%{http_code}' | grep -q '^200$'"

# Test 4: 404 handling
run_test "Unknown endpoint returns 404" \
  "curl -s '${SMOKE_URL}/api/nonexistent' -o /dev/null -w '%{http_code}' | grep -q '^404$'"

# Test 5: Response structure
run_test "Health response contains timestamp" \
  "curl -sf '${SMOKE_URL}/health' | jq -e '.timestamp' >/dev/null"

run_test "Health response contains uptime" \
  "curl -sf '${SMOKE_URL}/health' | jq -e '.uptime' >/dev/null"

# Test 6: CORS headers
run_test "CORS headers present" \
  "curl -sf -I '${SMOKE_URL}/health' | grep -iq 'access-control-allow-origin'"

# Summary
log_info "=== Smoke Tests Complete ==="
log_info "Total: ${TESTS_TOTAL}, Passed: ${TESTS_PASSED}, Failed: ${TESTS_FAILED}"

if [ "$TESTS_FAILED" -eq 0 ]; then
  log_info "✓ All smoke tests passed"
  exit 0
else
  log_error "✗ ${TESTS_FAILED} smoke test(s) failed"
  exit 1
fi
