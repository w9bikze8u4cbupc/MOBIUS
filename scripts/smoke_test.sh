#!/bin/bash
set -euo pipefail

# DHash Smoke Test Script
# Performs comprehensive post-deployment validation

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TIMEOUT_SECONDS=60
DEFAULT_BASE_URL="http://localhost:3000"

# Default values
BASE_URL=""
DHASH_FILE=""
VERBOSE=false
JUNIT_OUTPUT=""
SKIP_HEALTH=false
SKIP_METRICS=false
SKIP_DHASH=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Run comprehensive smoke tests after DHash deployment.

Options:
  -u, --url URL             Base URL of the service (default: $DEFAULT_BASE_URL)
  -d, --dhash FILE          Path to DHash file for validation
  --skip-health             Skip health endpoint tests
  --skip-metrics            Skip metrics endpoint tests  
  --skip-dhash              Skip DHash-specific tests
  -v, --verbose             Enable verbose logging
  --junit FILE              Write JUnit XML results to file
  -h, --help                Show this help message

Examples:
  $0                                    # Test localhost with default settings
  $0 -u http://staging.example.com     # Test staging environment
  $0 -d library.dhash.json -v          # Test with DHash file validation
  $0 --junit smoke-test-results.xml    # Generate JUnit report

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -u|--url)
                BASE_URL="$2"
                shift 2
                ;;
            -d|--dhash)
                DHASH_FILE="$2"
                shift 2
                ;;
            --skip-health)
                SKIP_HEALTH=true
                shift
                ;;
            --skip-metrics)
                SKIP_METRICS=true
                shift
                ;;
            --skip-dhash)
                SKIP_DHASH=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --junit)
                JUNIT_OUTPUT="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Set default base URL if not provided
    if [[ -z "$BASE_URL" ]]; then
        BASE_URL="$DEFAULT_BASE_URL"
    fi
}

# Record test result
record_test() {
    local test_name="$1"
    local status="$2"  # "PASS" or "FAIL"
    local message="$3"
    local duration="${4:-0}"
    
    ((TESTS_RUN++))
    
    if [[ "$status" == "PASS" ]]; then
        ((TESTS_PASSED++))
        log_success "✅ $test_name: $message"
    else
        ((TESTS_FAILED++))
        log_error "❌ $test_name: $message"
    fi
    
    TEST_RESULTS+=("$test_name|$status|$message|$duration")
    
    [[ "$VERBOSE" == "true" ]] && log_info "Test completed in ${duration}s"
}

# Make HTTP request with timeout
http_request() {
    local url="$1"
    local method="${2:-GET}"
    local timeout="${3:-$TIMEOUT_SECONDS}"
    local expected_status="${4:-200}"
    
    local start_time
    start_time=$(date +%s)
    
    local response
    local status_code
    local curl_exit_code=0
    
    # Use curl with timeout and capture both response and status code
    if response=$(curl -s -m "$timeout" -w "%{http_code}" "$url" 2>/dev/null); then
        status_code="${response: -3}"
        response="${response%???}"
    else
        curl_exit_code=$?
        status_code="000"
        response=""
    fi
    
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $curl_exit_code -ne 0 ]]; then
        echo "CURL_ERROR:$curl_exit_code:$duration:"
        return 1
    fi
    
    echo "$status_code:$duration:$response"
    return 0
}

# Test health endpoint
test_health_endpoint() {
    [[ "$SKIP_HEALTH" == "true" ]] && return 0
    
    log_info "Testing health endpoint..."
    
    local url="${BASE_URL}/health"
    local result
    
    if result=$(http_request "$url"); then
        IFS=':' read -r status_code duration response <<< "$result"
        
        if [[ "$status_code" == "200" ]]; then
            # Try to parse as JSON and check for expected structure
            if echo "$response" | jq -e '.status' >/dev/null 2>&1; then
                local health_status
                health_status=$(echo "$response" | jq -r '.status // "unknown"')
                
                if [[ "$health_status" == "healthy" || "$health_status" == "ok" ]]; then
                    record_test "Health Endpoint" "PASS" "Service is healthy (status: $health_status)" "$duration"
                else
                    record_test "Health Endpoint" "FAIL" "Service reports unhealthy status: $health_status" "$duration"
                fi
            else
                record_test "Health Endpoint" "PASS" "Endpoint responded with 200 OK" "$duration"
            fi
        else
            record_test "Health Endpoint" "FAIL" "HTTP $status_code received, expected 200" "$duration"
        fi
    else
        IFS=':' read -r error_type error_code duration _ <<< "$result"
        if [[ "$error_type" == "CURL_ERROR" ]]; then
            record_test "Health Endpoint" "FAIL" "Connection failed (curl error $error_code)" "$duration"
        else
            record_test "Health Endpoint" "FAIL" "Request failed" "$duration"
        fi
    fi
}

# Test metrics endpoint
test_metrics_endpoint() {
    [[ "$SKIP_METRICS" == "true" ]] && return 0
    
    log_info "Testing metrics endpoint..."
    
    local url="${BASE_URL}/metrics/dhash"
    local result
    
    if result=$(http_request "$url"); then
        IFS=':' read -r status_code duration response <<< "$result"
        
        if [[ "$status_code" == "200" ]]; then
            # Check if response contains expected metrics
            local has_metrics=false
            
            if echo "$response" | jq -e '.' >/dev/null 2>&1; then
                # JSON response - check for metric fields
                if echo "$response" | jq -e '.dhash' >/dev/null 2>&1 || \
                   echo "$response" | jq -e '.metrics' >/dev/null 2>&1 || \
                   echo "$response" | jq -e '.performance' >/dev/null 2>&1; then
                    has_metrics=true
                fi
            elif [[ -n "$response" ]]; then
                # Non-JSON response (e.g., Prometheus format) - check for content
                has_metrics=true
            fi
            
            if [[ "$has_metrics" == "true" ]]; then
                record_test "Metrics Endpoint" "PASS" "Metrics data available" "$duration"
            else
                record_test "Metrics Endpoint" "FAIL" "No metrics data found in response" "$duration"
            fi
        else
            record_test "Metrics Endpoint" "FAIL" "HTTP $status_code received, expected 200" "$duration"
        fi
    else
        IFS=':' read -r error_type error_code duration _ <<< "$result"
        if [[ "$error_type" == "CURL_ERROR" ]]; then
            record_test "Metrics Endpoint" "FAIL" "Connection failed (curl error $error_code)" "$duration"
        else
            record_test "Metrics Endpoint" "FAIL" "Request failed" "$duration"
        fi
    fi
}

# Test DHash file validation
test_dhash_validation() {
    [[ "$SKIP_DHASH" == "true" ]] && return 0
    [[ -z "$DHASH_FILE" ]] && return 0
    
    log_info "Testing DHash file validation..."
    
    local start_time
    start_time=$(date +%s)
    
    if [[ ! -f "$DHASH_FILE" ]]; then
        record_test "DHash File Exists" "FAIL" "File not found: $DHASH_FILE" "0"
        return
    fi
    
    # Test file exists
    local duration=$(($(date +%s) - start_time))
    record_test "DHash File Exists" "PASS" "File found: $DHASH_FILE" "$duration"
    
    # Test JSON validity
    start_time=$(date +%s)
    if jq empty "$DHASH_FILE" 2>/dev/null; then
        duration=$(($(date +%s) - start_time))
        record_test "DHash JSON Valid" "PASS" "Valid JSON format" "$duration"
    else
        duration=$(($(date +%s) - start_time))
        record_test "DHash JSON Valid" "FAIL" "Invalid JSON format" "$duration"
        return
    fi
    
    # Test DHash structure
    start_time=$(date +%s)
    local has_required_fields=true
    local missing_fields=()
    
    # Check required fields
    jq -e '.metadata' "$DHASH_FILE" >/dev/null 2>&1 || { has_required_fields=false; missing_fields+=("metadata"); }
    jq -e '.library' "$DHASH_FILE" >/dev/null 2>&1 || { has_required_fields=false; missing_fields+=("library"); }
    jq -e '.checksums' "$DHASH_FILE" >/dev/null 2>&1 || { has_required_fields=false; missing_fields+=("checksums"); }
    
    duration=$(($(date +%s) - start_time))
    if [[ "$has_required_fields" == "true" ]]; then
        record_test "DHash Structure" "PASS" "All required fields present" "$duration"
    else
        record_test "DHash Structure" "FAIL" "Missing fields: ${missing_fields[*]}" "$duration"
        return
    fi
    
    # Test checksum verification
    start_time=$(date +%s)
    local library_content
    if library_content=$(jq -c '.library' "$DHASH_FILE" 2>/dev/null); then
        local computed_hash
        computed_hash=$(echo "$library_content" | sha256sum | cut -d' ' -f1)
        
        local stored_hash
        stored_hash=$(jq -r '.checksums.content_sha256 // ""' "$DHASH_FILE")
        
        duration=$(($(date +%s) - start_time))
        if [[ -n "$stored_hash" && "$computed_hash" == "$stored_hash" ]]; then
            record_test "DHash Checksum" "PASS" "Content checksum verified" "$duration"
        elif [[ -z "$stored_hash" ]]; then
            record_test "DHash Checksum" "FAIL" "No content checksum found" "$duration"
        else
            record_test "DHash Checksum" "FAIL" "Checksum mismatch (computed: ${computed_hash:0:8}..., stored: ${stored_hash:0:8}...)" "$duration"
        fi
    else
        duration=$(($(date +%s) - start_time))
        record_test "DHash Checksum" "FAIL" "Cannot extract library content for verification" "$duration"
    fi
}

# Test service responsiveness
test_service_responsiveness() {
    log_info "Testing service responsiveness..."
    
    local total_duration=0
    local request_count=5
    local success_count=0
    
    for i in $(seq 1 $request_count); do
        local result
        if result=$(http_request "${BASE_URL}/health" "GET" 10); then
            IFS=':' read -r status_code duration response <<< "$result"
            total_duration=$((total_duration + duration))
            
            if [[ "$status_code" == "200" ]]; then
                ((success_count++))
            fi
        fi
        
        [[ "$VERBOSE" == "true" ]] && log_info "Request $i/$request_count completed"
        sleep 1
    done
    
    local avg_duration=$((total_duration / request_count))
    local success_rate=$((success_count * 100 / request_count))
    
    if [[ $success_rate -ge 80 && $avg_duration -le 5 ]]; then
        record_test "Service Responsiveness" "PASS" "$success_rate% success rate, ${avg_duration}s avg response time" "$total_duration"
    elif [[ $success_rate -ge 80 ]]; then
        record_test "Service Responsiveness" "FAIL" "Slow response time: ${avg_duration}s average (expected ≤5s)" "$total_duration"
    else
        record_test "Service Responsiveness" "FAIL" "Low success rate: $success_rate% (expected ≥80%)" "$total_duration"
    fi
}

# Write JUnit XML report
write_junit_report() {
    [[ -z "$JUNIT_OUTPUT" ]] && return 0
    
    log_info "Writing JUnit report to: $JUNIT_OUTPUT"
    
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S")
    
    local total_time=0
    for result in "${TEST_RESULTS[@]}"; do
        IFS='|' read -r _ _ _ duration <<< "$result"
        total_time=$((total_time + duration))
    done
    
    # Create directory if needed
    mkdir -p "$(dirname "$JUNIT_OUTPUT")"
    
    cat > "$JUNIT_OUTPUT" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="DHash Smoke Tests" tests="$TESTS_RUN" failures="$TESTS_FAILED" errors="0" time="$total_time" timestamp="$timestamp">
  <testsuite name="dhash.smoke" tests="$TESTS_RUN" failures="$TESTS_FAILED" errors="0" time="$total_time" timestamp="$timestamp">
EOF

    for result in "${TEST_RESULTS[@]}"; do
        IFS='|' read -r test_name status message duration <<< "$result"
        
        # Escape XML
        test_name=$(echo "$test_name" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g; s/'"'"'/\&apos;/g')
        message=$(echo "$message" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g; s/'"'"'/\&apos;/g')
        
        echo "    <testcase name=\"$test_name\" time=\"$duration\">" >> "$JUNIT_OUTPUT"
        
        if [[ "$status" == "FAIL" ]]; then
            echo "      <failure message=\"$message\">$message</failure>" >> "$JUNIT_OUTPUT"
        fi
        
        echo "    </testcase>" >> "$JUNIT_OUTPUT"
    done
    
    cat >> "$JUNIT_OUTPUT" << EOF
  </testsuite>
</testsuites>
EOF
    
    log_success "JUnit report written: $JUNIT_OUTPUT"
}

# Main smoke test function
main() {
    parse_args "$@"
    
    log_info "Starting DHash smoke tests"
    log_info "Target URL: $BASE_URL"
    [[ -n "$DHASH_FILE" ]] && log_info "DHash file: $DHASH_FILE"
    
    local start_time
    start_time=$(date +%s)
    
    # Run all tests
    test_health_endpoint
    test_metrics_endpoint  
    test_dhash_validation
    test_service_responsiveness
    
    local total_duration=$(($(date +%s) - start_time))
    
    # Write JUnit report
    write_junit_report
    
    # Summary
    echo
    log_info "=== SMOKE TEST SUMMARY ==="
    log_info "Tests run: $TESTS_RUN"
    log_success "Passed: $TESTS_PASSED"
    [[ $TESTS_FAILED -gt 0 ]] && log_error "Failed: $TESTS_FAILED" || log_info "Failed: $TESTS_FAILED"
    log_info "Total time: ${total_duration}s"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All smoke tests passed! ✅"
        exit 0
    else
        log_error "Some smoke tests failed! ❌"
        exit 1
    fi
}

# Check for required dependencies
check_dependencies() {
    local missing_deps=()
    
    command -v curl >/dev/null 2>&1 || missing_deps+=("curl")
    command -v jq >/dev/null 2>&1 || missing_deps+=("jq")
    
    if [[ ${#missing_deps[@]} -ne 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install the missing dependencies and try again"
        exit 1
    fi
}

# Error handling
trap 'log_error "Script interrupted"; exit 130' INT

# Dependency check
check_dependencies

# Run main function
main "$@"