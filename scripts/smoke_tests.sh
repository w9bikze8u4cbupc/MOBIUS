#!/bin/bash

# dhash Smoke Tests - Post-deployment and post-rollback validation
# Usage: ./scripts/smoke_tests.sh [--env staging|production] [--post-rollback] [--timeout 300]

set -euo pipefail

# Default values
ENVIRONMENT="staging"
POST_ROLLBACK=false
TIMEOUT=300 # seconds
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# Help function
show_help() {
    cat << EOF
dhash Smoke Tests - Post-deployment validation

Usage: $0 [OPTIONS]

OPTIONS:
    --env ENV          Target environment: staging|production (default: staging)
    --post-rollback    Run post-rollback specific tests
    --timeout SECONDS  Test timeout in seconds (default: 300)
    --help             Show this help message

Examples:
    $0 --env staging
    $0 --env production --timeout 600
    $0 --env production --post-rollback

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --post-rollback)
            POST_ROLLBACK=true
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
    exit 1
fi

# Setup logging
setup_logging() {
    mkdir -p "$LOGS_DIR"
    local test_type="smoke"
    if [[ "$POST_ROLLBACK" == "true" ]]; then
        test_type="post-rollback"
    fi
    
    LOG_FILE="$LOGS_DIR/${test_type}_tests_${ENVIRONMENT}_${TIMESTAMP}.log"
    
    {
        echo "=== DHASH SMOKE TESTS ==="
        echo "Environment: $ENVIRONMENT"
        echo "Test type: $test_type"
        echo "Timeout: $TIMEOUT seconds"
        echo "Started at: $(date)"
        echo ""
    } > "$LOG_FILE"
    
    log "Smoke tests starting - Log: $LOG_FILE"
}

# Load service configuration
load_config() {
    # Set service endpoints based on environment
    if [[ "$ENVIRONMENT" == "production" ]]; then
        DHASH_BASE_URL="${DHASH_PROD_URL:-https://dhash-prod.company.com}"
        DHASH_HEALTH_URL="$DHASH_BASE_URL/health"
        DHASH_API_URL="$DHASH_BASE_URL/api/v1"
    else
        DHASH_BASE_URL="${DHASH_STAGING_URL:-https://dhash-staging.company.com}"
        DHASH_HEALTH_URL="$DHASH_BASE_URL/health"
        DHASH_API_URL="$DHASH_BASE_URL/api/v1"
    fi
    
    log "Configuration loaded:"
    log "  Base URL: $DHASH_BASE_URL"
    log "  Health URL: $DHASH_HEALTH_URL"
    log "  API URL: $DHASH_API_URL"
}

# Test counter and results
declare -A TEST_RESULTS
TEST_COUNT=0
PASSED_COUNT=0
FAILED_COUNT=0

# Run individual test with timeout
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="${3:-0}"
    
    ((TEST_COUNT++))
    
    log "Running test: $test_name"
    echo "Test $TEST_COUNT: $test_name" >> "$LOG_FILE"
    
    local start_time=$(date +%s)
    local test_output
    local test_result
    
    # Run test with timeout
    if timeout "$TIMEOUT" bash -c "$test_command" >> "$LOG_FILE" 2>&1; then
        test_result=0
    else
        test_result=$?
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $test_result -eq $expected_result ]]; then
        ((PASSED_COUNT++))
        TEST_RESULTS["$test_name"]="PASS"
        success "✅ $test_name (${duration}s)"
        echo "Result: PASS (${duration}s)" >> "$LOG_FILE"
    else
        ((FAILED_COUNT++))
        TEST_RESULTS["$test_name"]="FAIL"
        error "❌ $test_name (${duration}s) - Expected: $expected_result, Got: $test_result"
        echo "Result: FAIL (${duration}s) - Expected: $expected_result, Got: $test_result" >> "$LOG_FILE"
    fi
    
    echo "" >> "$LOG_FILE"
}

# Basic health check test
test_health_check() {
    local test_cmd="curl -sf -m 30 '$DHASH_HEALTH_URL' | grep -q 'ok\\|healthy\\|UP'"
    run_test "Health Check" "$test_cmd"
}

# API connectivity test
test_api_connectivity() {
    local test_cmd="curl -sf -m 30 -H 'Accept: application/json' '$DHASH_API_URL/status' | grep -q '\"status\"'"
    run_test "API Connectivity" "$test_cmd"
}

# Database connectivity test (through API)
test_database_connectivity() {
    local test_cmd="curl -sf -m 30 '$DHASH_API_URL/db-health' | grep -q 'connected\\|ok\\|healthy'"
    run_test "Database Connectivity" "$test_cmd"
}

# Hash operation test
test_hash_operations() {
    # Test hash creation
    local test_data='{"key":"smoke_test_key","data":"test_data_for_smoke_test"}'
    local test_cmd="curl -sf -m 30 -X POST -H 'Content-Type: application/json' -d '$test_data' '$DHASH_API_URL/hash' | grep -q 'hash\\|success'"
    run_test "Hash Creation" "$test_cmd"
    
    # Test hash retrieval
    local get_cmd="curl -sf -m 30 '$DHASH_API_URL/hash/smoke_test_key' | grep -q 'hash\\|data'"
    run_test "Hash Retrieval" "$get_cmd"
}

# Performance test - basic latency check
test_basic_performance() {
    # Test that health check responds within acceptable time (2 seconds)
    local test_cmd="time curl -sf -m 2 '$DHASH_HEALTH_URL' >/dev/null"
    run_test "Basic Performance (2s)" "$test_cmd"
}

# Concurrency test - multiple requests
test_concurrency() {
    local concurrent_requests=5
    local test_cmd="
        for i in {1..$concurrent_requests}; do
            curl -sf -m 10 '$DHASH_HEALTH_URL' >/dev/null &
        done
        wait
    "
    run_test "Concurrency Test ($concurrent_requests req)" "$test_cmd"
}

# Memory and resource usage check (through metrics endpoint)
test_resource_usage() {
    local test_cmd="curl -sf -m 30 '$DHASH_API_URL/metrics' | grep -E 'memory|cpu|connections'"
    run_test "Resource Usage Check" "$test_cmd"
}

# Post-rollback specific tests
test_post_rollback_data_integrity() {
    if [[ "$POST_ROLLBACK" != "true" ]]; then
        return
    fi
    
    log "Running post-rollback data integrity checks..."
    
    # Test that known data still exists after rollback
    local test_cmd="curl -sf -m 30 '$DHASH_API_URL/integrity-check' | grep -q 'ok\\|valid'"
    run_test "Data Integrity Post-Rollback" "$test_cmd"
    
    # Test that rollback restored expected version
    local version_cmd="curl -sf -m 30 '$DHASH_API_URL/version' | grep -v 'latest\\|dev'"
    run_test "Version Check Post-Rollback" "$version_cmd"
}

# Configuration validation
test_configuration() {
    local config_cmd="curl -sf -m 30 '$DHASH_API_URL/config/validate' | grep -q 'valid\\|ok'"
    run_test "Configuration Validation" "$config_cmd"
}

# Security headers check
test_security_headers() {
    local security_cmd="curl -sI -m 30 '$DHASH_BASE_URL' | grep -E 'X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security'"
    run_test "Security Headers" "$security_cmd"
}

# Error handling test
test_error_handling() {
    # Test 404 handling
    local error_cmd="curl -sf -m 30 '$DHASH_API_URL/nonexistent' | grep -q 'error\\|not found'"
    run_test "Error Handling (404)" "$error_cmd"
}

# Cleanup test data
cleanup_test_data() {
    log "Cleaning up test data..."
    
    # Remove test hash if it exists
    curl -sf -m 30 -X DELETE "$DHASH_API_URL/hash/smoke_test_key" >/dev/null 2>&1 || true
    
    log "Test data cleanup completed"
}

# Generate test report
generate_report() {
    local report_file="$LOGS_DIR/smoke_test_report_${ENVIRONMENT}_${TIMESTAMP}.json"
    
    # Build JSON report
    local test_results_json="{"
    local first=true
    for test_name in "${!TEST_RESULTS[@]}"; do
        if [[ "$first" != "true" ]]; then
            test_results_json+=","
        fi
        test_results_json+="\"$test_name\":\"${TEST_RESULTS[$test_name]}\""
        first=false
    done
    test_results_json+="}"
    
    cat > "$report_file" << EOF
{
    "smoke_test_report": {
        "environment": "$ENVIRONMENT",
        "test_type": "$(if [[ "$POST_ROLLBACK" == "true" ]]; then echo "post-rollback"; else echo "post-deployment"; fi)",
        "timestamp": "$(date -Iseconds)",
        "duration_seconds": $(($(date +%s) - $(stat -c %Y "$LOG_FILE"))),
        "summary": {
            "total_tests": $TEST_COUNT,
            "passed": $PASSED_COUNT,
            "failed": $FAILED_COUNT,
            "success_rate": "$(echo "scale=2; $PASSED_COUNT * 100 / $TEST_COUNT" | bc 2>/dev/null || echo "0")%"
        },
        "test_results": $test_results_json,
        "log_file": "$LOG_FILE",
        "report_file": "$report_file"
    }
}
EOF
    
    log "Test report generated: $report_file"
}

# Print test summary
print_summary() {
    echo ""
    log "=== SMOKE TEST SUMMARY ==="
    log "Environment: $ENVIRONMENT"
    if [[ "$POST_ROLLBACK" == "true" ]]; then
        log "Type: Post-rollback validation"
    else
        log "Type: Post-deployment validation"
    fi
    log "Total tests: $TEST_COUNT"
    log "Passed: $PASSED_COUNT"
    log "Failed: $FAILED_COUNT"
    
    if [[ $FAILED_COUNT -eq 0 ]]; then
        success "🎉 All tests passed!"
        log "Service is healthy and functioning correctly"
    else
        error "❌ $FAILED_COUNT test(s) failed"
        log "Service may have issues that require attention"
        
        # List failed tests
        log "Failed tests:"
        for test_name in "${!TEST_RESULTS[@]}"; do
            if [[ "${TEST_RESULTS[$test_name]}" == "FAIL" ]]; then
                error "  - $test_name"
            fi
        done
    fi
    
    log "Detailed log: $LOG_FILE"
    echo ""
}

# Send notification about test results
send_notification() {
    local notification_script="$SCRIPT_DIR/notify.js"
    
    if [[ ! -f "$notification_script" ]] || ! command -v node &> /dev/null; then
        log "Notification system not available - skipping notification"
        return
    fi
    
    local test_type="deployment"
    if [[ "$POST_ROLLBACK" == "true" ]]; then
        test_type="rollback"
    fi
    
    local message
    if [[ $FAILED_COUNT -eq 0 ]]; then
        message="Smoke tests PASSED - $test_type validation successful ($PASSED_COUNT/$TEST_COUNT tests passed)"
        node "$notification_script" --type success --env "$ENVIRONMENT" --message "$message" 2>/dev/null || true
    else
        message="Smoke tests FAILED - $test_type validation issues detected ($PASSED_COUNT/$TEST_COUNT tests passed, $FAILED_COUNT failed)"
        node "$notification_script" --type warning --env "$ENVIRONMENT" --message "$message" 2>/dev/null || true
    fi
}

# Main execution
main() {
    log "🧪 dhash Smoke Tests - Environment: $ENVIRONMENT"
    
    if [[ "$POST_ROLLBACK" == "true" ]]; then
        log "Running post-rollback validation tests"
    else
        log "Running post-deployment validation tests"
    fi
    
    setup_logging
    load_config
    
    # Core functionality tests
    test_health_check
    test_api_connectivity
    test_database_connectivity
    test_configuration
    
    # Application-specific tests
    test_hash_operations
    test_basic_performance
    test_concurrency
    test_resource_usage
    
    # Security and error handling
    test_security_headers
    test_error_handling
    
    # Post-rollback specific tests
    if [[ "$POST_ROLLBACK" == "true" ]]; then
        test_post_rollback_data_integrity
    fi
    
    # Cleanup
    cleanup_test_data
    
    # Generate reports
    generate_report
    print_summary
    send_notification
    
    # Exit with appropriate code
    if [[ $FAILED_COUNT -eq 0 ]]; then
        success "Smoke tests completed successfully"
        exit 0
    else
        error "Smoke tests completed with failures"
        exit 1
    fi
}

# Error handling
trap 'error "Smoke tests interrupted at line $LINENO"' ERR

# Execute main function
main "$@"