#!/bin/bash

# MOBIUS API CI Smoke Tests
# Usage: ./scripts/ci/smoke-tests.sh <base_url> [timeout] [retry_interval]
# Example: ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

set -euo pipefail

# Configuration
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRY_INTERVAL="${3:-2}"
LOG_FILE="scripts/ci/smoke-tests.log"
FAILED_TESTS=0
TOTAL_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

# Initialize log file
echo "=== MOBIUS API CI Smoke Tests ===" > "$LOG_FILE"
echo "Started: $(date)" >> "$LOG_FILE"
echo "Base URL: $BASE_URL" >> "$LOG_FILE"
echo "Timeout: ${TIMEOUT}s" >> "$LOG_FILE"
echo "Retry Interval: ${RETRY_INTERVAL}s" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

log "${BLUE}Starting MOBIUS API CI Smoke Tests${NC}"
log "Base URL: $BASE_URL"
log "Timeout: ${TIMEOUT}s, Retry Interval: ${RETRY_INTERVAL}s"
log ""

# Wait for service to be ready
wait_for_service() {
    local url="$1"
    local timeout="$2"
    local interval="$3"
    local elapsed=0
    
    log "Waiting for service at $url to become ready..."
    
    while [ $elapsed -lt $timeout ]; do
        if curl -s -f "$url/health" > /dev/null 2>&1; then
            log_success "Service is ready after ${elapsed}s"
            return 0
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
        
        if [ $((elapsed % 10)) -eq 0 ]; then
            log_warning "Still waiting for service... (${elapsed}s elapsed)"
        fi
    done
    
    log_error "Service did not become ready within ${timeout}s"
    return 1
}

# Test helper function
run_test() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local post_data="$5"
    local validate_json="${6:-true}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_test "$test_name"
    
    local url="$BASE_URL$endpoint"
    local curl_opts=(-s -w "STATUS:%{http_code}\nTIME:%{time_total}\n")
    
    if [ "$method" = "POST" ] && [ -n "$post_data" ]; then
        curl_opts+=(-X POST -H "Content-Type: application/json" -d "$post_data")
    fi
    
    local response
    if ! response=$(curl "${curl_opts[@]}" "$url" 2>&1); then
        log_error "  Failed to connect to $url"
        log "  Error: $response" >> "$LOG_FILE"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
    
    # Extract status code and response time using more robust parsing
    local status_code=$(echo "$response" | grep -o 'STATUS:[0-9]*' | cut -d: -f2)
    local response_time=$(echo "$response" | grep -o 'TIME:[0-9.]*' | cut -d: -f2)
    local body=$(echo "$response" | sed 's/STATUS:[0-9]*//g' | sed 's/TIME:[0-9.]*//g')
    
    # Check status code
    if [ "$status_code" != "$expected_status" ]; then
        log_error "  Expected status $expected_status, got $status_code"
        log "  Response: $body" >> "$LOG_FILE"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
    
    # Validate JSON if requested
    if [ "$validate_json" = "true" ]; then
        if ! echo "$body" | jq . > /dev/null 2>&1; then
            log_error "  Response is not valid JSON"
            log "  Response: $body" >> "$LOG_FILE"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            return 1
        fi
    fi
    
    log_success "  Status: $status_code, Time: ${response_time}s"
    
    # Log response details for debugging
    echo "  Response body: $body" >> "$LOG_FILE"
    
    return 0
}

# Main test execution
main() {
    # Wait for service to be ready
    if ! wait_for_service "$BASE_URL" "$TIMEOUT" "$RETRY_INTERVAL"; then
        log_error "Service readiness check failed"
        exit 1
    fi
    
    log ""
    log "Running smoke tests..."
    log ""
    
    # Test 1: Health check endpoint
    run_test "Health check endpoint" "GET" "/health" "200" "" "true"
    
    # Test 2: Readiness check endpoint  
    run_test "Readiness check endpoint" "GET" "/ready" "200" "" "true"
    
    # Test 3: API info endpoint
    run_test "API info endpoint" "GET" "/api/info" "200" "" "true"
    
    # Test 4: Echo endpoint with POST data
    local echo_data='{"message": "Hello from smoke tests", "data": {"test": true, "timestamp": "'$(date -Iseconds)'"}}'
    run_test "Echo endpoint with POST data" "POST" "/api/echo" "200" "$echo_data" "true"
    
    # Test 5: Echo endpoint without POST data
    run_test "Echo endpoint without POST data" "POST" "/api/echo" "200" "{}" "true"
    
    # Test 6: 404 endpoint (should return 404)
    run_test "404 error handling" "GET" "/nonexistent-endpoint" "404" "" "true"
    
    # Test 7: Invalid JSON POST (should handle gracefully)
    run_test "Invalid JSON handling" "POST" "/api/echo" "500" "invalid-json" "true"
    
    log ""
    log "=== Test Results ==="
    log "Total tests: $TOTAL_TESTS"
    log "Passed: $((TOTAL_TESTS - FAILED_TESTS))"
    log "Failed: $FAILED_TESTS"
    
    # Final summary
    if [ $FAILED_TESTS -eq 0 ]; then
        log_success "All smoke tests passed! ✅"
        echo "Completed: $(date)" >> "$LOG_FILE"
        exit 0
    else
        log_error "Some smoke tests failed! ❌"
        log "Check $LOG_FILE for detailed results"
        echo "Completed with failures: $(date)" >> "$LOG_FILE"
        exit 1
    fi
}

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    if ! command -v curl > /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq > /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log "Please install the missing dependencies and try again"
        exit 1
    fi
}

# Show usage if no arguments provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <base_url> [timeout] [retry_interval]"
    echo ""
    echo "Parameters:"
    echo "  base_url        Base URL of the API (e.g., http://localhost:5001)"
    echo "  timeout         Timeout in seconds for service readiness (default: 30)"
    echo "  retry_interval  Retry interval in seconds (default: 2)"
    echo ""
    echo "Example:"
    echo "  $0 http://localhost:5001 30 2"
    exit 1
fi

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Run the tests
check_dependencies
main