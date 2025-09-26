#!/bin/bash
# Smoke Tests Script
# Runs post-deployment verification tests

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMEOUT="${TIMEOUT:-30}"

log() {
  echo "[SMOKE-TESTS] $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

test_health_endpoint() {
  log "Testing health endpoint"
  
  local health_url="$BASE_URL/health"
  local response
  
  if response=$(curl -s --max-time $TIMEOUT "$health_url" 2>/dev/null); then
    log "Health endpoint responded: $response"
    
    # Check if response contains expected health indicators
    if echo "$response" | grep -q "ok\\|healthy\\|up"; then
      log "✓ Health check passed"
      return 0
    else
      log "✗ Health check failed - unexpected response"
      return 1
    fi
  else
    log "✗ Health endpoint not accessible"
    return 1
  fi
}

test_main_endpoints() {
  log "Testing main application endpoints"
  
  local endpoints=("/" "/api/status")
  local failed_tests=0
  
  for endpoint in "${endpoints[@]}"; do
    local url="$BASE_URL$endpoint"
    log "Testing endpoint: $url"
    
    local http_code
    if http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null); then
      if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        log "✓ Endpoint $endpoint returned HTTP $http_code"
      else
        log "✗ Endpoint $endpoint returned HTTP $http_code"
        ((failed_tests++))
      fi
    else
      log "✗ Endpoint $endpoint failed to respond"
      ((failed_tests++))
    fi
  done
  
  return $failed_tests
}

test_database_connectivity() {
  log "Testing database connectivity"
  
  # This is a placeholder - replace with actual database test
  if [ -n "${DATABASE_URL:-}" ]; then
    log "[PLACEHOLDER] Would test database connection"
    log "✓ Database connectivity test (simulated)"
  else
    log "No DATABASE_URL set - skipping database test"
  fi
}

run_application_tests() {
  log "Running application-specific tests"
  
  # Run any application-specific smoke tests
  if [ -f "scripts/app-smoke-tests.sh" ]; then
    log "Running custom application smoke tests"
    bash scripts/app-smoke-tests.sh
  else
    log "No custom smoke tests found"
  fi
}

main() {
  log "Starting smoke tests"
  
  local failed_tests=0
  
  # Wait for application to be ready
  log "Waiting for application to be ready..."
  sleep 5
  
  test_health_endpoint || ((failed_tests++))
  test_main_endpoints || ((failed_tests += $?))
  test_database_connectivity || ((failed_tests++))
  run_application_tests || ((failed_tests++))
  
  if [ $failed_tests -eq 0 ]; then
    log "✓ All smoke tests passed"
    echo "SMOKE_TESTS_PASSED=true" >> $GITHUB_OUTPUT 2>/dev/null || true
    exit 0
  else
    log "✗ $failed_tests smoke test(s) failed"
    echo "SMOKE_TESTS_PASSED=false" >> $GITHUB_OUTPUT 2>/dev/null || true
    exit 1
  fi
}

main "$@"
