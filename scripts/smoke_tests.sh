#!/bin/bash
# dhash Smoke Tests - Post-deployment validation
# Usage: ./scripts/smoke_tests.sh [--env ENV] [--quick] [--endpoint URL] [--timeout SECONDS]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/monitor_logs"

# Default values
ENVIRONMENT="production"
QUICK_MODE=false
BASE_ENDPOINT="http://localhost:3000"
TIMEOUT=30
VERBOSE=false
DRY_RUN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --quick)
      QUICK_MODE=true
      shift
      ;;
    --endpoint)
      BASE_ENDPOINT="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--env ENV] [--quick] [--endpoint URL] [--timeout SECONDS] [--verbose] [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --env ENV           Target environment (default: production)"
      echo "  --quick            Run only critical smoke tests"
      echo "  --endpoint URL     Base endpoint URL (default: http://localhost:3000)"
      echo "  --timeout SECONDS  Request timeout (default: 30)"
      echo "  --verbose          Enable verbose output"
      echo "  --dry-run          Show what tests would be run without executing"
      echo "  --help             Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --env production --quick"
      echo "  $0 --env staging --verbose --endpoint http://staging.example.com:3000"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging functions
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log_verbose() {
  if [[ "${VERBOSE}" == "true" ]]; then
    log "$@"
  fi
}

log_error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Initialize logging
initialize_logging() {
  mkdir -p "${LOG_DIR}"
  local timestamp=$(date +%Y%m%d_%H%M%S)
  SMOKE_TEST_LOG="${LOG_DIR}/smoke_tests_${ENVIRONMENT}_${timestamp}.log"
  
  log "dhash Smoke Tests Starting" | tee "${SMOKE_TEST_LOG}"
  log "Environment: ${ENVIRONMENT}" | tee -a "${SMOKE_TEST_LOG}"
  log "Endpoint: ${BASE_ENDPOINT}" | tee -a "${SMOKE_TEST_LOG}"
  log "Quick mode: ${QUICK_MODE}" | tee -a "${SMOKE_TEST_LOG}"
  log "Dry run: ${DRY_RUN}" | tee -a "${SMOKE_TEST_LOG}"
}

# HTTP request helper
make_request() {
  local method="$1"
  local path="$2"
  local expected_code="${3:-200}"
  local body="${4:-}"
  local description="${5:-HTTP $method $path}"
  
  local url="${BASE_ENDPOINT}${path}"
  local curl_args=("-s" "-w" "%{http_code}" "--max-time" "${TIMEOUT}")
  
  if [[ "${method}" == "POST" && -n "${body}" ]]; then
    curl_args+=("-X" "POST" "-H" "Content-Type: application/json" "-d" "${body}")
  elif [[ "${method}" != "GET" ]]; then
    curl_args+=("-X" "${method}")
  fi
  
  curl_args+=("${url}")
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would test - ${description}"
    log_verbose "DRY-RUN: curl ${curl_args[*]}"
    echo "200" # Simulate success
    return 0
  fi
  
  log_verbose "Testing: ${description}"
  log_verbose "Request: curl ${curl_args[*]}"
  
  local response
  if ! response=$(curl "${curl_args[@]}" 2>/dev/null); then
    log_error "Request failed: ${description}"
    echo "000"
    return 1
  fi
  
  # Extract HTTP code (last 3 characters)
  local http_code="${response: -3}"
  local response_body="${response%???}"
  
  log_verbose "Response code: ${http_code}"
  if [[ "${VERBOSE}" == "true" && -n "${response_body}" ]]; then
    log_verbose "Response body: ${response_body:0:200}$(if [[ ${#response_body} -gt 200 ]]; then echo '...'; fi)"
  fi
  
  echo "${http_code}"
  return 0
}

# Test service health endpoint
test_health_endpoint() {
  log "Testing health endpoint..."
  
  local http_code
  http_code=$(make_request "GET" "/health" "200" "" "Health check")
  
  if [[ "${http_code}" == "200" ]]; then
    log "✓ Health endpoint responding correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ Health endpoint failed (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Test metrics endpoint
test_metrics_endpoint() {
  log "Testing metrics endpoint..."
  
  local http_code
  http_code=$(make_request "GET" "/metrics" "200" "" "Metrics endpoint")
  
  if [[ "${http_code}" == "200" ]]; then
    log "✓ Metrics endpoint responding correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ Metrics endpoint failed (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Test dhash API endpoint
test_dhash_api() {
  log "Testing dhash API endpoint..."
  
  local test_payload='{"input": "test_hash_input", "algorithm": "dhash"}'
  local http_code
  http_code=$(make_request "POST" "/api/dhash" "200" "${test_payload}" "dhash API")
  
  if [[ "${http_code}" == "200" || "${http_code}" == "201" ]]; then
    log "✓ dhash API responding correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ dhash API failed (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Test dhash batch processing
test_dhash_batch() {
  if [[ "${QUICK_MODE}" == "true" ]]; then
    log "Skipping dhash batch test (quick mode)" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  fi
  
  log "Testing dhash batch processing..."
  
  local batch_payload='{"batch": [{"input": "test1"}, {"input": "test2"}], "algorithm": "dhash"}'
  local http_code
  http_code=$(make_request "POST" "/api/dhash/batch" "200" "${batch_payload}" "dhash batch processing")
  
  if [[ "${http_code}" == "200" || "${http_code}" == "202" ]]; then
    log "✓ dhash batch processing responding correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ dhash batch processing failed (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Test dhash queue status
test_queue_status() {
  log "Testing queue status endpoint..."
  
  local http_code
  http_code=$(make_request "GET" "/api/dhash/queue/status" "200" "" "Queue status")
  
  if [[ "${http_code}" == "200" ]]; then
    log "✓ Queue status endpoint responding correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ Queue status endpoint failed (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Test service configuration
test_configuration() {
  if [[ "${QUICK_MODE}" == "true" ]]; then
    log "Skipping configuration test (quick mode)" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  fi
  
  log "Testing configuration endpoint..."
  
  local http_code
  http_code=$(make_request "GET" "/api/config" "200" "" "Configuration")
  
  if [[ "${http_code}" == "200" ]]; then
    log "✓ Configuration endpoint responding correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ Configuration endpoint failed (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Test error handling
test_error_handling() {
  if [[ "${QUICK_MODE}" == "true" ]]; then
    log "Skipping error handling test (quick mode)" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  fi
  
  log "Testing error handling..."
  
  # Test with invalid payload
  local invalid_payload='{"invalid": "json structure"}'
  local http_code
  http_code=$(make_request "POST" "/api/dhash" "400" "${invalid_payload}" "Error handling (invalid payload)")
  
  if [[ "${http_code}" == "400" || "${http_code}" == "422" ]]; then
    log "✓ Error handling working correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ Error handling not working correctly (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Test authentication (if applicable)
test_authentication() {
  if [[ "${QUICK_MODE}" == "true" ]]; then
    log "Skipping authentication test (quick mode)" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  fi
  
  log "Testing authentication..."
  
  # Test accessing protected endpoint without auth
  local http_code
  http_code=$(make_request "GET" "/api/admin/status" "401" "" "Authentication (no auth)")
  
  if [[ "${http_code}" == "401" || "${http_code}" == "403" ]]; then
    log "✓ Authentication protection working correctly" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  elif [[ "${http_code}" == "404" ]]; then
    log "~ Authentication endpoint not found (may not be implemented)" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "✗ Authentication not working correctly (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Run performance check
run_performance_check() {
  if [[ "${QUICK_MODE}" == "true" ]]; then
    log "Skipping performance check (quick mode)" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  fi
  
  log "Running basic performance check..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would run performance check" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  fi
  
  # Simple performance test: measure response time for health endpoint
  local start_time=$(date +%s.%N)
  local http_code
  http_code=$(make_request "GET" "/health" "200" "" "Performance check")
  local end_time=$(date +%s.%N)
  
  if [[ "${http_code}" == "200" ]]; then
    local response_time
    response_time=$(echo "${end_time} - ${start_time}" | bc 2>/dev/null || echo "0")
    local response_time_ms
    response_time_ms=$(echo "${response_time} * 1000" | bc 2>/dev/null || echo "0")
    
    if (( $(echo "${response_time_ms} < 1000" | bc -l 2>/dev/null || echo "0") )); then
      log "✓ Performance check passed (${response_time_ms}ms)" | tee -a "${SMOKE_TEST_LOG}"
      return 0
    else
      log "⚠ Performance slower than expected (${response_time_ms}ms)" | tee -a "${SMOKE_TEST_LOG}"
      return 0  # Warning, not failure
    fi
  else
    log_error "✗ Performance check failed (HTTP ${http_code})" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Main test runner
run_all_tests() {
  log "Starting smoke tests..." | tee -a "${SMOKE_TEST_LOG}"
  
  local tests_passed=0
  local tests_failed=0
  local tests_total=0
  
  # Define test functions and their criticality
  local critical_tests=(
    "test_health_endpoint"
    "test_dhash_api"
  )
  
  local standard_tests=(
    "test_metrics_endpoint"
    "test_queue_status"
    "test_dhash_batch"
    "test_configuration"
    "test_error_handling"
    "test_authentication"
    "run_performance_check"
  )
  
  # Run critical tests first
  log "Running critical tests..." | tee -a "${SMOKE_TEST_LOG}"
  for test_func in "${critical_tests[@]}"; do
    ((tests_total++))
    if ${test_func}; then
      ((tests_passed++))
    else
      ((tests_failed++))
      log_error "CRITICAL TEST FAILED: ${test_func}" | tee -a "${SMOKE_TEST_LOG}"
    fi
  done
  
  # Run standard tests if not in quick mode or if critical tests passed
  if [[ "${QUICK_MODE}" == "false" && "${tests_failed}" -eq 0 ]]; then
    log "Running standard tests..." | tee -a "${SMOKE_TEST_LOG}"
    for test_func in "${standard_tests[@]}"; do
      ((tests_total++))
      if ${test_func}; then
        ((tests_passed++))
      else
        ((tests_failed++))
      fi
    done
  elif [[ "${tests_failed}" -gt 0 ]]; then
    log "Skipping standard tests due to critical test failures" | tee -a "${SMOKE_TEST_LOG}"
  fi
  
  # Generate summary
  log "" | tee -a "${SMOKE_TEST_LOG}"
  log "Smoke Test Summary:" | tee -a "${SMOKE_TEST_LOG}"
  log "  Environment: ${ENVIRONMENT}" | tee -a "${SMOKE_TEST_LOG}"
  log "  Endpoint: ${BASE_ENDPOINT}" | tee -a "${SMOKE_TEST_LOG}"
  log "  Tests passed: ${tests_passed}" | tee -a "${SMOKE_TEST_LOG}"
  log "  Tests failed: ${tests_failed}" | tee -a "${SMOKE_TEST_LOG}"
  log "  Total tests: ${tests_total}" | tee -a "${SMOKE_TEST_LOG}"
  log "  Success rate: $(( tests_passed * 100 / tests_total ))%" | tee -a "${SMOKE_TEST_LOG}"
  log "  Log file: ${SMOKE_TEST_LOG}" | tee -a "${SMOKE_TEST_LOG}"
  
  if [[ "${tests_failed}" -eq 0 ]]; then
    log "🎉 All smoke tests passed!" | tee -a "${SMOKE_TEST_LOG}"
    return 0
  else
    log_error "💥 ${tests_failed} smoke test(s) failed!" | tee -a "${SMOKE_TEST_LOG}"
    return 1
  fi
}

# Main execution
main() {
  initialize_logging
  
  if run_all_tests; then
    log "Smoke tests completed successfully"
    exit 0
  else
    log_error "Smoke tests failed"
    exit 1
  fi
}

# Execute main function
main "$@"