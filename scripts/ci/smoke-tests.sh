#!/usr/bin/env bash
#
# smoke-tests.sh - Comprehensive smoke tests for MOBIUS API
# Tests API endpoints with retries, timeouts, and detailed logging
#
# Usage: ./smoke-tests.sh [URL] [TIMEOUT] [RETRIES]
# Example: ./smoke-tests.sh http://localhost:5001 30 2

set -euo pipefail
IFS=$'\n\t'

# Configuration
API_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"
LOG_FILE="smoke-tests-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    local message="$*"
    local timestamp=$(date --iso-8601=seconds)
    echo -e "${BLUE}[${timestamp}]${NC} ${message}" | tee -a "$LOG_FILE"
}

log_success() {
    local message="$*"
    local timestamp=$(date --iso-8601=seconds)
    echo -e "${GREEN}[${timestamp}] ✓${NC} ${message}" | tee -a "$LOG_FILE"
}

log_error() {
    local message="$*"
    local timestamp=$(date --iso-8601=seconds)
    echo -e "${RED}[${timestamp}] ✗${NC} ${message}" | tee -a "$LOG_FILE"
}

log_warn() {
    local message="$*"
    local timestamp=$(date --iso-8601=seconds)
    echo -e "${YELLOW}[${timestamp}] ⚠${NC} ${message}" | tee -a "$LOG_FILE"
}

# Test function with retry logic
run_test() {
    local test_name="$1"
    local test_function="$2"
    local attempt=1
    local max_attempts=$((RETRIES + 1))
    
    log "Running test: $test_name"
    
    while [ $attempt -le $max_attempts ]; do
        if [ $attempt -gt 1 ]; then
            log_warn "Retry attempt $((attempt - 1))/$RETRIES for: $test_name"
            sleep 2
        fi
        
        if $test_function; then
            log_success "$test_name passed"
            return 0
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "$test_name failed after $RETRIES retries"
            return 1
        fi
        
        attempt=$((attempt + 1))
    done
}

# HTTP request helper with timeout
curl_with_timeout() {
    local url="$1"
    local method="${2:-GET}"
    local data="${3:-}"
    local expected_status="${4:-200}"
    
    local curl_opts=(
        --max-time "$TIMEOUT"
        --connect-timeout 10
        --silent
        --show-error
        --fail-with-body
        --write-out "HTTPSTATUS:%{http_code};SIZE:%{size_download};TIME:%{time_total}"
    )
    
    if [ "$method" = "POST" ]; then
        curl_opts+=(
            -X POST
            -H "Content-Type: application/json"
        )
        if [ -n "$data" ]; then
            curl_opts+=(-d "$data")
        fi
    fi
    
    local response
    if ! response=$(curl "${curl_opts[@]}" "$url" 2>&1); then
        log_error "Curl failed for $url: $response"
        return 1
    fi
    
    # Extract status code
    local status_code
    status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [ "$status_code" != "$expected_status" ]; then
        log_error "Expected status $expected_status, got $status_code for $url"
        return 1
    fi
    
    # Extract response body (everything before the status line)
    local body
    body=$(echo "$response" | sed 's/HTTPSTATUS:.*$//')
    
    # Validate JSON response
    if ! echo "$body" | jq . >/dev/null 2>&1; then
        log_error "Invalid JSON response from $url"
        return 1
    fi
    
    echo "$body"
    return 0
}

# Individual test functions
test_health_check() {
    local response
    if ! response=$(curl_with_timeout "$API_URL/health" "GET" "" "200"); then
        return 1
    fi
    
    # Validate health response structure
    if ! echo "$response" | jq -e '.status == "healthy"' >/dev/null; then
        log_error "Health check response missing 'status: healthy'"
        return 1
    fi
    
    log "Health check response: $(echo "$response" | jq -c '.')"
    return 0
}

test_process_pdf() {
    local test_data='{"file": "test.pdf", "text": "Sample rulebook text for testing"}'
    local response
    
    if ! response=$(curl_with_timeout "$API_URL/process-pdf" "POST" "$test_data" "200"); then
        return 1
    fi
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .data.text' >/dev/null; then
        log_error "PDF processing response invalid structure"
        return 1
    fi
    
    log "PDF processing test passed"
    return 0
}

test_analyze_text() {
    local test_data='{"text": "This is a sample game rule text for analysis", "language": "english"}'
    local response
    
    if ! response=$(curl_with_timeout "$API_URL/analyze-text" "POST" "$test_data" "200"); then
        return 1
    fi
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .data.components and .data.metadata' >/dev/null; then
        log_error "Text analysis response invalid structure"
        return 1
    fi
    
    log "Text analysis test passed"
    return 0
}

test_process_images() {
    local test_data='{"images": [{"url": "http://example.com/test.jpg"}]}'
    local response
    
    if ! response=$(curl_with_timeout "$API_URL/process-images" "POST" "$test_data" "200"); then
        return 1
    fi
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .data.processedImages' >/dev/null; then
        log_error "Image processing response invalid structure"
        return 1
    fi
    
    log "Image processing test passed"
    return 0
}

test_generate_tts() {
    local test_data='{"text": "Welcome to the game tutorial", "voice": "test-voice", "language": "english"}'
    local response
    
    if ! response=$(curl_with_timeout "$API_URL/generate-tts" "POST" "$test_data" "200"); then
        return 1
    fi
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .data.audioUrl' >/dev/null; then
        log_error "TTS generation response invalid structure"
        return 1
    fi
    
    log "TTS generation test passed"
    return 0
}

test_save_project() {
    local test_data='{"name": "Test Project", "metadata": {"publisher": "Test"}, "components": [], "images": [], "script": "Test script", "audio": ""}'
    local response
    
    if ! response=$(curl_with_timeout "$API_URL/save-project" "POST" "$test_data" "200"); then
        return 1
    fi
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .data.projectId' >/dev/null; then
        log_error "Save project response invalid structure"
        return 1
    fi
    
    log "Save project test passed"
    return 0
}

test_list_projects() {
    local response
    
    if ! response=$(curl_with_timeout "$API_URL/projects" "GET" "" "200"); then
        return 1
    fi
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and (.data | type == "array")' >/dev/null; then
        log_error "List projects response invalid structure"
        return 1
    fi
    
    log "List projects test passed"
    return 0
}

test_invalid_endpoint() {
    local response
    
    # Test 404 handling - remove fail-with-body for this test
    local curl_opts=(
        --max-time "$TIMEOUT"
        --connect-timeout 10
        --silent
        --show-error
        --write-out "HTTPSTATUS:%{http_code};SIZE:%{size_download};TIME:%{time_total}"
    )
    
    if ! response=$(curl "${curl_opts[@]}" "http://localhost:5001/invalid-endpoint" 2>&1); then
        return 1
    fi
    
    # Extract status code
    local status_code
    status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [ "$status_code" != "404" ]; then
        log_error "Expected status 404, got $status_code for invalid endpoint"
        return 1
    fi
    
    # Extract response body (everything before the status line)
    local body
    body=$(echo "$response" | sed 's/HTTPSTATUS:.*$//')
    
    # Validate error response structure
    if ! echo "$body" | jq -e '.success == false and .error' >/dev/null; then
        log_error "404 response invalid structure"
        return 1
    fi
    
    log "404 handling test passed"
    return 0
}

# Main test execution
main() {
    log "=== MOBIUS API Smoke Tests ==="
    log "API URL: $API_URL"
    log "Timeout: ${TIMEOUT}s"
    log "Retries: $RETRIES"
    log "Log file: $LOG_FILE"
    log ""
    
    # Check if curl and jq are available
    if ! command -v curl >/dev/null 2>&1; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    # Test cases
    local tests=(
        "Health Check:test_health_check"
        "Process PDF:test_process_pdf"
        "Analyze Text:test_analyze_text"
        "Process Images:test_process_images"
        "Generate TTS:test_generate_tts"
        "Save Project:test_save_project"
        "List Projects:test_list_projects"
        "Invalid Endpoint (404):test_invalid_endpoint"
    )
    
    local failed_tests=()
    local passed_tests=()
    
    # Run all tests
    for test_spec in "${tests[@]}"; do
        local test_name="${test_spec%:*}"
        local test_function="${test_spec#*:}"
        
        if run_test "$test_name" "$test_function"; then
            passed_tests+=("$test_name")
        else
            failed_tests+=("$test_name")
        fi
        
        log ""
    done
    
    # Summary
    log "=== Test Summary ==="
    log "Total tests: ${#tests[@]}"
    log "Passed: ${#passed_tests[@]}"
    log "Failed: ${#failed_tests[@]}"
    
    if [ ${#passed_tests[@]} -gt 0 ]; then
        log_success "Passed tests:"
        for test in "${passed_tests[@]}"; do
            log_success "  - $test"
        done
    fi
    
    if [ ${#failed_tests[@]} -gt 0 ]; then
        log_error "Failed tests:"
        for test in "${failed_tests[@]}"; do
            log_error "  - $test"
        done
        log_error "Check log file for details: $LOG_FILE"
        exit 1
    else
        log_success "All smoke tests passed!"
        exit 0
    fi
}

# Run main function
main "$@"