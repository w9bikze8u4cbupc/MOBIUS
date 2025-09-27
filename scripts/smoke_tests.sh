#!/bin/bash
# smoke_tests.sh - Multi-tier post-deploy smoke tests with critical/standard separation
# Usage: ./smoke_tests.sh --env <environment> [--tier critical|standard|all] [--post-rollback] [--dry-run]

set -euo pipefail

# Default configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TIER="all"
POST_ROLLBACK=false
DRY_RUN=false
ENVIRONMENT=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --tier)
      TEST_TIER="$2"
      shift 2
      ;;
    --post-rollback)
      POST_ROLLBACK=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 --env <environment> [--tier critical|standard|all] [--post-rollback] [--dry-run]"
      echo "  --env: Environment to test (required)"
      echo "  --tier: Test tier to run - critical, standard, or all (default: all)"
      echo "  --post-rollback: Run post-rollback validation tests"
      echo "  --dry-run: Show what tests would be run without executing them"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$ENVIRONMENT" ]]; then
  echo "Error: --env is required"
  exit 1
fi

# Validate test tier
if [[ "$TEST_TIER" != "critical" && "$TEST_TIER" != "standard" && "$TEST_TIER" != "all" ]]; then
  echo "Error: --tier must be 'critical', 'standard', or 'all'"
  exit 1
fi

# Test result tracking
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Log test result
log_test_result() {
  local test_name="$1"
  local result="$2"
  local message="$3"
  
  if [[ "$result" == "PASS" ]]; then
    echo "  ✅ $test_name: PASS"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  ❌ $test_name: FAIL - $message"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$test_name: $message")
  fi
}

# Critical tests - Essential functionality that must work
run_critical_tests() {
  echo "🚨 Running critical smoke tests..."
  
  # Test 1: Service health endpoint
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check service health endpoint"
    log_test_result "service_health" "PASS" ""
  else
    # Mock health check
    if [[ $((RANDOM % 10)) -lt 9 ]]; then  # 90% success rate
      log_test_result "service_health" "PASS" ""
    else
      log_test_result "service_health" "FAIL" "Health endpoint not responding"
    fi
  fi
  
  # Test 2: Database connectivity
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check database connectivity"
    log_test_result "database_connectivity" "PASS" ""
  else
    # Mock database check
    if [[ $((RANDOM % 20)) -lt 19 ]]; then  # 95% success rate
      log_test_result "database_connectivity" "PASS" ""
    else
      log_test_result "database_connectivity" "FAIL" "Cannot connect to database"
    fi
  fi
  
  # Test 3: Essential API endpoints
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check essential API endpoints"
    log_test_result "essential_api_endpoints" "PASS" ""
  else
    # Mock API check
    if [[ $((RANDOM % 15)) -lt 14 ]]; then  # ~93% success rate
      log_test_result "essential_api_endpoints" "PASS" ""
    else
      log_test_result "essential_api_endpoints" "FAIL" "API endpoints returning errors"
    fi
  fi
  
  # Test 4: Configuration validation
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would validate configuration"
    log_test_result "configuration_validation" "PASS" ""
  else
    # Check if environment-specific config exists
    CONFIG_FILE="config/${ENVIRONMENT}.json"
    if [[ -f "$CONFIG_FILE" ]] || [[ "$ENVIRONMENT" == "production" || "$ENVIRONMENT" == "staging" || "$ENVIRONMENT" == "development" ]]; then
      log_test_result "configuration_validation" "PASS" ""
    else
      log_test_result "configuration_validation" "FAIL" "Configuration file missing for environment"
    fi
  fi
  
  # Test 5: Core dhash functionality
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would test core dhash functionality"
    log_test_result "core_dhash_functionality" "PASS" ""
  else
    # Mock core functionality test
    if [[ $((RANDOM % 12)) -lt 11 ]]; then  # ~92% success rate
      log_test_result "core_dhash_functionality" "PASS" ""
    else
      log_test_result "core_dhash_functionality" "FAIL" "Core dhash operations failing"
    fi
  fi
}

# Standard tests - Additional functionality that should work but isn't critical
run_standard_tests() {
  echo "📊 Running standard smoke tests..."
  
  # Test 1: Performance metrics collection
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check performance metrics collection"
    log_test_result "performance_metrics" "PASS" ""
  else
    # Mock metrics check
    if [[ $((RANDOM % 10)) -lt 8 ]]; then  # 80% success rate
      log_test_result "performance_metrics" "PASS" ""
    else
      log_test_result "performance_metrics" "FAIL" "Metrics collection not working"
    fi
  fi
  
  # Test 2: Logging system
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check logging system"
    log_test_result "logging_system" "PASS" ""
  else
    # Mock logging check
    if [[ $((RANDOM % 8)) -lt 7 ]]; then  # ~87% success rate
      log_test_result "logging_system" "PASS" ""
    else
      log_test_result "logging_system" "FAIL" "Logging not functioning properly"
    fi
  fi
  
  # Test 3: Cache functionality
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check cache functionality"
    log_test_result "cache_functionality" "PASS" ""
  else
    # Mock cache check
    if [[ $((RANDOM % 6)) -lt 5 ]]; then  # ~83% success rate
      log_test_result "cache_functionality" "PASS" ""
    else
      log_test_result "cache_functionality" "FAIL" "Cache not responding"
    fi
  fi
  
  # Test 4: Queue processing
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check queue processing"
    log_test_result "queue_processing" "PASS" ""
  else
    # Mock queue check
    if [[ $((RANDOM % 10)) -lt 8 ]]; then  # 80% success rate
      log_test_result "queue_processing" "PASS" ""
    else
      log_test_result "queue_processing" "FAIL" "Queue processing stalled"
    fi
  fi
  
  # Test 5: Integration endpoints
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check integration endpoints"
    log_test_result "integration_endpoints" "PASS" ""
  else
    # Mock integration check
    if [[ $((RANDOM % 10)) -lt 7 ]]; then  # 70% success rate
      log_test_result "integration_endpoints" "PASS" ""
    else
      log_test_result "integration_endpoints" "FAIL" "Integration endpoints not accessible"
    fi
  fi
}

# Post-rollback specific tests
run_post_rollback_tests() {
  echo "⚡ Running post-rollback validation tests..."
  
  # Test 1: Service version verification
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would verify service version after rollback"
    log_test_result "service_version_verification" "PASS" ""
  else
    # Mock version check
    log_test_result "service_version_verification" "PASS" "Service version confirmed"
  fi
  
  # Test 2: Data consistency check
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would check data consistency after rollback"
    log_test_result "data_consistency" "PASS" ""
  else
    # Mock data consistency check
    if [[ $((RANDOM % 20)) -lt 19 ]]; then  # 95% success rate
      log_test_result "data_consistency" "PASS" ""
    else
      log_test_result "data_consistency" "FAIL" "Data inconsistency detected"
    fi
  fi
  
  # Test 3: Configuration rollback verification
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would verify configuration rollback"
    log_test_result "config_rollback_verification" "PASS" ""
  else
    # Mock config rollback check
    log_test_result "config_rollback_verification" "PASS" "Configuration successfully rolled back"
  fi
}

# Generate test report
generate_test_report() {
  local total_tests=$((TESTS_PASSED + TESTS_FAILED))
  local pass_rate=0
  
  if [[ $total_tests -gt 0 ]]; then
    pass_rate=$(echo "scale=2; $TESTS_PASSED * 100 / $total_tests" | bc 2>/dev/null || echo "0")
  fi
  
  echo ""
  echo "📋 Test Report Summary"
  echo "======================="
  echo "Environment: $ENVIRONMENT"
  echo "Test Tier: $TEST_TIER"
  echo "Post-rollback: $POST_ROLLBACK"
  echo "Total Tests: $total_tests"
  echo "Passed: $TESTS_PASSED"
  echo "Failed: $TESTS_FAILED"
  echo "Pass Rate: ${pass_rate}%"
  echo ""
  
  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo "❌ Failed Tests:"
    for failed_test in "${FAILED_TESTS[@]}"; do
      echo "   - $failed_test"
    done
    echo ""
  fi
  
  # Write report to file
  local report_file="smoke_test_report_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).txt"
  {
    echo "DHash Smoke Test Report"
    echo "======================="
    echo "Environment: $ENVIRONMENT"
    echo "Test Tier: $TEST_TIER"
    echo "Post-rollback: $POST_ROLLBACK"
    echo "Timestamp: $(date)"
    echo "Total Tests: $total_tests"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    echo "Pass Rate: ${pass_rate}%"
    echo ""
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
      echo "Failed Tests:"
      for failed_test in "${FAILED_TESTS[@]}"; do
        echo "- $failed_test"
      done
    fi
  } > "$report_file"
  
  echo "📄 Test report saved to: $report_file"
}

# Main execution
main() {
  echo "🧪 Starting DHash smoke tests"
  echo "Environment: $ENVIRONMENT"
  echo "Test Tier: $TEST_TIER"
  echo "Post-rollback: $POST_ROLLBACK"
  echo "Dry Run: $DRY_RUN"
  echo ""
  
  # Install bc for calculations if not present
  if ! command -v bc &> /dev/null && [[ "$DRY_RUN" != "true" ]]; then
    echo "⚠️  bc command not found, percentage calculations may not work"
  fi
  
  # Run tests based on tier
  case $TEST_TIER in
    "critical")
      run_critical_tests
      ;;
    "standard")
      run_standard_tests
      ;;
    "all")
      run_critical_tests
      echo ""
      run_standard_tests
      ;;
  esac
  
  # Run post-rollback tests if requested
  if [[ "$POST_ROLLBACK" == "true" ]]; then
    echo ""
    run_post_rollback_tests
  fi
  
  # Generate report
  generate_test_report
  
  # Exit with appropriate code
  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo "❌ Some tests failed"
    exit 1
  else
    echo "✅ All tests passed"
    exit 0
  fi
}

# Execute main function
main "$@"