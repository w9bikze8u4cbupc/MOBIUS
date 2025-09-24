#!/bin/bash
set -euo pipefail

# smoke_test.sh - Post-deployment smoke tests for dhash migration system
# Tests a small set of known matches and logs results

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LIBRARY_FILE="${PROJECT_ROOT}/library.json"
LOGS_DIR="${PROJECT_ROOT}/logs"
RESULTS_DIR="${PROJECT_ROOT}/tmp/smoke-test-results"

# Configuration
HEALTH_ENDPOINT="http://localhost:5001/health"
METRICS_ENDPOINT="http://localhost:5001/metrics/dhash"
TEST_OUTPUT_FILE=""
QUIET=false
JUNIT_OUTPUT=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    if [[ "$QUIET" != "true" ]]; then
        echo -e "${BLUE}[INFO]${NC} $*" >&2
    fi
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

# Initialize test environment
init_smoke_test() {
    local timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
    mkdir -p "$LOGS_DIR" "$RESULTS_DIR"
    TEST_OUTPUT_FILE="${RESULTS_DIR}/smoke-test-${timestamp}.log"
    
    log_info "Starting smoke test suite at $timestamp"
    log_info "Results will be saved to: $TEST_OUTPUT_FILE"
    
    # Initialize results file
    cat > "$TEST_OUTPUT_FILE" << EOF
MOBIUS DHash Post-Deployment Smoke Test Results
===============================================
Test Suite Started: $timestamp
Library File: $LIBRARY_FILE
Health Endpoint: $HEALTH_ENDPOINT
Metrics Endpoint: $METRICS_ENDPOINT

EOF
}

# Test 1: Library file integrity
test_library_integrity() {
    log_info "Test 1: Verifying library.json integrity"
    
    if [[ ! -f "$LIBRARY_FILE" ]]; then
        log_error "Library file not found: $LIBRARY_FILE"
        echo "FAIL: Library file missing" >> "$TEST_OUTPUT_FILE"
        return 1
    fi
    
    # Test JSON validity
    if command -v jq >/dev/null 2>&1; then
        if jq . "$LIBRARY_FILE" >/dev/null 2>&1; then
            log_success "Library file is valid JSON"
            echo "PASS: JSON validity check" >> "$TEST_OUTPUT_FILE"
        else
            log_error "Library file is not valid JSON"
            echo "FAIL: JSON validity check" >> "$TEST_OUTPUT_FILE"
            return 1
        fi
    elif command -v python3 >/dev/null 2>&1; then
        if python3 -m json.tool "$LIBRARY_FILE" >/dev/null 2>&1; then
            log_success "Library file is valid JSON"
            echo "PASS: JSON validity check" >> "$TEST_OUTPUT_FILE"
        else
            log_error "Library file is not valid JSON"
            echo "FAIL: JSON validity check" >> "$TEST_OUTPUT_FILE"
            return 1
        fi
    else
        log_warn "No JSON validator available, skipping JSON check"
        echo "SKIP: JSON validity check (no validator)" >> "$TEST_OUTPUT_FILE"
    fi
    
    # Test required fields
    if command -v jq >/dev/null 2>&1; then
        local required_fields=(".version" ".dhash" ".games")
        local missing_fields=""
        
        for field in "${required_fields[@]}"; do
            if ! jq -e "$field" "$LIBRARY_FILE" >/dev/null 2>&1; then
                missing_fields="$missing_fields $field"
            fi
        done
        
        if [[ -z "$missing_fields" ]]; then
            log_success "All required fields present"
            echo "PASS: Required fields check" >> "$TEST_OUTPUT_FILE"
        else
            log_error "Missing required fields:$missing_fields"
            echo "FAIL: Required fields check - Missing:$missing_fields" >> "$TEST_OUTPUT_FILE"
            return 1
        fi
    fi
    
    return 0
}

# Test 2: Health endpoint availability
test_health_endpoint() {
    log_info "Test 2: Checking health endpoint"
    
    if ! command -v curl >/dev/null 2>&1; then
        log_warn "curl not available, skipping health endpoint test"
        echo "SKIP: Health endpoint test (no curl)" >> "$TEST_OUTPUT_FILE"
        return 0
    fi
    
    local response
    local http_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$HEALTH_ENDPOINT" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    response=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [[ "$http_code" == "200" ]]; then
        log_success "Health endpoint responding"
        echo "PASS: Health endpoint availability (HTTP $http_code)" >> "$TEST_OUTPUT_FILE"
        
        # Verify response structure if JSON
        if command -v jq >/dev/null 2>&1 && echo "$response" | jq . >/dev/null 2>&1; then
            local status=$(echo "$response" | jq -r '.status // empty')
            if [[ "$status" == "healthy" ]]; then
                log_success "Health status is healthy"
                echo "PASS: Health status check" >> "$TEST_OUTPUT_FILE"
            else
                log_warn "Health status is: $status"
                echo "WARN: Health status is '$status', not 'healthy'" >> "$TEST_OUTPUT_FILE"
            fi
        fi
        
        return 0
    else
        log_error "Health endpoint unavailable (HTTP $http_code)"
        echo "FAIL: Health endpoint availability (HTTP $http_code)" >> "$TEST_OUTPUT_FILE"
        return 1
    fi
}

# Test 3: Metrics endpoint
test_metrics_endpoint() {
    log_info "Test 3: Checking metrics endpoint"
    
    if ! command -v curl >/dev/null 2>&1; then
        log_warn "curl not available, skipping metrics endpoint test"
        echo "SKIP: Metrics endpoint test (no curl)" >> "$TEST_OUTPUT_FILE"
        return 0
    fi
    
    local response
    local http_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$METRICS_ENDPOINT" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    response=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [[ "$http_code" == "200" ]]; then
        log_success "Metrics endpoint responding"
        echo "PASS: Metrics endpoint availability (HTTP $http_code)" >> "$TEST_OUTPUT_FILE"
        
        # Test key metrics if JSON response
        if command -v jq >/dev/null 2>&1 && echo "$response" | jq . >/dev/null 2>&1; then
            local avg_time=$(echo "$response" | jq -r '.avg_hash_time // empty')
            local p95_time=$(echo "$response" | jq -r '.p95_hash_time // empty')
            local failure_rate=$(echo "$response" | jq -r '.extraction_failures_rate // empty')
            
            if [[ -n "$avg_time" && -n "$p95_time" ]]; then
                log_info "Performance metrics - Avg: ${avg_time}ms, P95: ${p95_time}ms"
                echo "INFO: Performance metrics - Avg: ${avg_time}ms, P95: ${p95_time}ms" >> "$TEST_OUTPUT_FILE"
                
                # Check if metrics are within expected ranges
                local avg_ok="true"
                local p95_ok="true"
                
                if command -v bc >/dev/null 2>&1; then
                    if (( $(echo "$avg_time > 50" | bc -l) )); then
                        avg_ok="false"
                        log_warn "Average hash time higher than expected: ${avg_time}ms > 50ms"
                    fi
                    if (( $(echo "$p95_time > 200" | bc -l) )); then
                        p95_ok="false"
                        log_warn "P95 hash time higher than expected: ${p95_time}ms > 200ms"
                    fi
                fi
                
                if [[ "$avg_ok" == "true" && "$p95_ok" == "true" ]]; then
                    echo "PASS: Performance metrics within expected ranges" >> "$TEST_OUTPUT_FILE"
                else
                    echo "WARN: Performance metrics outside expected ranges" >> "$TEST_OUTPUT_FILE"
                fi
            fi
            
            if [[ -n "$failure_rate" ]]; then
                log_info "Failure rate: ${failure_rate}%"
                echo "INFO: Extraction failure rate: ${failure_rate}%" >> "$TEST_OUTPUT_FILE"
                
                if command -v bc >/dev/null 2>&1 && (( $(echo "$failure_rate > 5" | bc -l) )); then
                    log_warn "Failure rate higher than expected: ${failure_rate}% > 5%"
                    echo "WARN: High failure rate: ${failure_rate}% > 5%" >> "$TEST_OUTPUT_FILE"
                fi
            fi
        fi
        
        return 0
    else
        log_error "Metrics endpoint unavailable (HTTP $http_code)"
        echo "FAIL: Metrics endpoint availability (HTTP $http_code)" >> "$TEST_OUTPUT_FILE"
        return 1
    fi
}

# Test 4: Basic dhash functionality (simulation)
test_dhash_functionality() {
    log_info "Test 4: Testing basic dhash functionality"
    
    # Simulate dhash generation test
    if command -v jq >/dev/null 2>&1; then
        local hash_count=$(jq -r '.dhash.hashmap | length' "$LIBRARY_FILE" 2>/dev/null || echo "0")
        
        if [[ "$hash_count" -gt 0 ]]; then
            log_success "Library contains $hash_count dhash entries"
            echo "PASS: Library contains dhash entries ($hash_count found)" >> "$TEST_OUTPUT_FILE"
        else
            log_warn "No dhash entries found in library"
            echo "WARN: No dhash entries in library" >> "$TEST_OUTPUT_FILE"
        fi
    fi
    
    # Test component matching (simulation)
    local test_components=("component_id_1" "component_id_2" "component_id_3")
    local matched_components=0
    
    for component in "${test_components[@]}"; do
        if command -v jq >/dev/null 2>&1; then
            if jq -e ".dhash.hashmap[\"$component\"]" "$LIBRARY_FILE" >/dev/null 2>&1; then
                ((matched_components++))
                log_info "Test component '$component' found in library"
            fi
        fi
    done
    
    if [[ $matched_components -gt 0 ]]; then
        log_success "Component matching test: $matched_components/${#test_components[@]} components matched"
        echo "PASS: Component matching test ($matched_components/${#test_components[@]} matched)" >> "$TEST_OUTPUT_FILE"
        return 0
    else
        log_warn "No test components matched"
        echo "WARN: Component matching test (0/${#test_components[@]} matched)" >> "$TEST_OUTPUT_FILE"
        return 0
    fi
}

# Test 5: Low-confidence queue check
test_low_confidence_queue() {
    log_info "Test 5: Checking low-confidence queue"
    
    if command -v jq >/dev/null 2>&1; then
        local queue_length=$(jq -r '.low_confidence_queue | length' "$LIBRARY_FILE" 2>/dev/null || echo "unknown")
        
        if [[ "$queue_length" == "unknown" ]]; then
            log_warn "Unable to read low-confidence queue"
            echo "WARN: Low-confidence queue check failed" >> "$TEST_OUTPUT_FILE"
        elif [[ "$queue_length" == "0" ]]; then
            log_success "Low-confidence queue is empty"
            echo "PASS: Low-confidence queue is empty" >> "$TEST_OUTPUT_FILE"
        else
            log_info "Low-confidence queue contains $queue_length items"
            echo "INFO: Low-confidence queue contains $queue_length items" >> "$TEST_OUTPUT_FILE"
            
            # Check if queue length is unexpectedly high
            if [[ "$queue_length" -gt 100 ]]; then
                log_warn "High number of low-confidence items: $queue_length"
                echo "WARN: High low-confidence queue length: $queue_length" >> "$TEST_OUTPUT_FILE"
            fi
        fi
    else
        log_warn "jq not available, skipping low-confidence queue test"
        echo "SKIP: Low-confidence queue test (no jq)" >> "$TEST_OUTPUT_FILE"
    fi
    
    return 0
}

# Generate JUnit XML report if requested
generate_junit_report() {
    if [[ -z "$JUNIT_OUTPUT" ]]; then
        return 0
    fi
    
    log_info "Generating JUnit report: $JUNIT_OUTPUT"
    
    local timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
    local test_results=$(grep -E "^(PASS|FAIL|SKIP|WARN):" "$TEST_OUTPUT_FILE" || true)
    local total_tests=$(echo "$test_results" | wc -l)
    local passed_tests=$(echo "$test_results" | grep -c "^PASS:" || echo "0")
    local failed_tests=$(echo "$test_results" | grep -c "^FAIL:" || echo "0")
    local skipped_tests=$(echo "$test_results" | grep -c "^SKIP:" || echo "0")
    
    cat > "$JUNIT_OUTPUT" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="DHashSmokeTest" tests="$total_tests" failures="$failed_tests" skipped="$skipped_tests" timestamp="$timestamp">
EOF
    
    # Add test cases
    local test_num=1
    while IFS= read -r result_line; do
        if [[ "$result_line" =~ ^(PASS|FAIL|SKIP|WARN): ]]; then
            local status="${result_line%%:*}"
            local test_name="SmokeTest${test_num}"
            local test_description="${result_line#*: }"
            
            case "$status" in
                PASS)
                    echo "  <testcase name=\"$test_name\" classname=\"DHashSmokeTest\">" >> "$JUNIT_OUTPUT"
                    echo "    <system-out>$test_description</system-out>" >> "$JUNIT_OUTPUT"
                    echo "  </testcase>" >> "$JUNIT_OUTPUT"
                    ;;
                FAIL)
                    echo "  <testcase name=\"$test_name\" classname=\"DHashSmokeTest\">" >> "$JUNIT_OUTPUT"
                    echo "    <failure message=\"$test_description\">$test_description</failure>" >> "$JUNIT_OUTPUT"
                    echo "  </testcase>" >> "$JUNIT_OUTPUT"
                    ;;
                SKIP)
                    echo "  <testcase name=\"$test_name\" classname=\"DHashSmokeTest\">" >> "$JUNIT_OUTPUT"
                    echo "    <skipped message=\"$test_description\">$test_description</skipped>" >> "$JUNIT_OUTPUT"
                    echo "  </testcase>" >> "$JUNIT_OUTPUT"
                    ;;
                WARN)
                    echo "  <testcase name=\"$test_name\" classname=\"DHashSmokeTest\">" >> "$JUNIT_OUTPUT"
                    echo "    <system-err>WARNING: $test_description</system-err>" >> "$JUNIT_OUTPUT"
                    echo "  </testcase>" >> "$JUNIT_OUTPUT"
                    ;;
            esac
            
            ((test_num++))
        fi
    done < "$TEST_OUTPUT_FILE"
    
    echo "</testsuite>" >> "$JUNIT_OUTPUT"
    log_success "JUnit report generated: $JUNIT_OUTPUT"
}

# Finalize results
finalize_results() {
    local timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
    
    echo "" >> "$TEST_OUTPUT_FILE"
    echo "Test Suite Completed: $timestamp" >> "$TEST_OUTPUT_FILE"
    echo "Results Summary:" >> "$TEST_OUTPUT_FILE"
    
    local test_results
    test_results=$(grep -E "^(PASS|FAIL|SKIP|WARN):" "$TEST_OUTPUT_FILE" || true)
    
    if [[ -n "$test_results" ]]; then
        local total_tests=$(echo "$test_results" | wc -l)
        local passed_tests=$(echo "$test_results" | grep -c "^PASS:" || echo "0")
        local failed_tests=$(echo "$test_results" | grep -c "^FAIL:" || echo "0")
        local skipped_tests=$(echo "$test_results" | grep -c "^SKIP:" || echo "0")
        local warned_tests=$(echo "$test_results" | grep -c "^WARN:" || echo "0")
        
        echo "  Total Tests: $total_tests" >> "$TEST_OUTPUT_FILE"
        echo "  Passed: $passed_tests" >> "$TEST_OUTPUT_FILE"
        echo "  Failed: $failed_tests" >> "$TEST_OUTPUT_FILE"
        echo "  Skipped: $skipped_tests" >> "$TEST_OUTPUT_FILE"
        echo "  Warnings: $warned_tests" >> "$TEST_OUTPUT_FILE"
        
        log_info "Test Summary - Total: $total_tests, Passed: $passed_tests, Failed: $failed_tests, Skipped: $skipped_tests, Warnings: $warned_tests"
        
        # Generate JUnit report if requested
        generate_junit_report
        
        # Upload to S3 or artifacts storage (placeholder)
        if command -v aws >/dev/null 2>&1 && [[ -n "${AWS_S3_BUCKET:-}" ]]; then
            log_info "Uploading results to S3..."
            aws s3 cp "$TEST_OUTPUT_FILE" "s3://${AWS_S3_BUCKET}/smoke-test-results/" || log_warn "S3 upload failed"
        fi
        
        # Return exit code based on test results
        if [[ $failed_tests -gt 0 ]]; then
            log_error "Smoke tests failed: $failed_tests test(s) failed"
            return 1
        else
            log_success "All smoke tests passed or skipped"
            return 0
        fi
    else
        log_warn "No test results found"
        echo "  No test results found" >> "$TEST_OUTPUT_FILE"
        return 1
    fi
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Post-deployment smoke test suite for dhash migration system.
Tests a small set of known matches and logs results.

OPTIONS:
    --quiet, -q         Suppress non-error output
    --junit FILE        Generate JUnit XML report
    --health-endpoint   Health endpoint URL (default: $HEALTH_ENDPOINT)
    --metrics-endpoint  Metrics endpoint URL (default: $METRICS_ENDPOINT)
    --help, -h          Show this help

EXAMPLES:
    $0                          # Run all smoke tests
    $0 --quiet                  # Run quietly
    $0 --junit results.xml      # Generate JUnit report
    
EXIT CODES:
    0 - All tests passed or skipped
    1 - One or more tests failed

TESTS PERFORMED:
    1. Library file integrity (JSON validity, required fields)
    2. Health endpoint availability and status
    3. Metrics endpoint and performance indicators  
    4. Basic dhash functionality (component matching)
    5. Low-confidence queue status

EOF
}

# Main function
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --quiet|-q)
                QUIET=true
                shift
                ;;
            --junit)
                JUNIT_OUTPUT="$2"
                shift 2
                ;;
            --health-endpoint)
                HEALTH_ENDPOINT="$2"
                shift 2
                ;;
            --metrics-endpoint)
                METRICS_ENDPOINT="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Initialize test environment
    init_smoke_test
    
    # Run all smoke tests
    local overall_result=0
    
    test_library_integrity || overall_result=1
    test_health_endpoint || overall_result=1
    test_metrics_endpoint || overall_result=1
    test_dhash_functionality || overall_result=1
    test_low_confidence_queue || overall_result=1
    
    # Finalize and report results
    finalize_results || overall_result=1
    
    if [[ $overall_result -eq 0 ]]; then
        log_success "=== ALL SMOKE TESTS COMPLETED SUCCESSFULLY ==="
    else
        log_error "=== SMOKE TESTS COMPLETED WITH FAILURES ==="
    fi
    
    exit $overall_result
}

# Trap for cleanup
cleanup_on_exit() {
    local exit_code=$?
    if [[ $exit_code -ne 0 && -n "$TEST_OUTPUT_FILE" ]]; then
        echo "" >> "$TEST_OUTPUT_FILE"
        echo "Test suite terminated with exit code $exit_code" >> "$TEST_OUTPUT_FILE"
    fi
}

trap cleanup_on_exit EXIT

# Run main function with all arguments
main "$@"