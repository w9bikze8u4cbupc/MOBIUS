#!/bin/bash
#
# Robust smoke tests for CI mock API
# Tests health, status, and mock endpoints with retries and timeouts
#
# Usage: ./scripts/ci/smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
# Example: ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

set -euo pipefail

# Configuration
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"
FAILED_TESTS=0
TOTAL_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

# Test helper function
test_endpoint() {
    local method="$1"
    local path="$2"
    local expected_status="$3"
    local description="$4"
    local data="${5:-}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_info "Test #$TOTAL_TESTS: $description"
    
    local attempt=1
    local success=false
    
    while [ $attempt -le $((RETRIES + 1)) ]; do
        if [ $attempt -gt 1 ]; then
            log_warn "Retry attempt $attempt/$((RETRIES + 1))"
            sleep 2
        fi
        
        local response
        local status_code
        
        if [ "$method" = "GET" ]; then
            response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}${path}" 2>&1) || true
        else
            if [ -n "$data" ]; then
                response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" -X "$method" \
                    -H "Content-Type: application/json" \
                    -d "$data" \
                    "${BASE_URL}${path}" 2>&1) || true
            else
                response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" -X "$method" \
                    -H "Content-Type: application/json" \
                    "${BASE_URL}${path}" 2>&1) || true
            fi
        fi
        
        status_code=$(echo "$response" | tail -n1)
        
        if [ "$status_code" = "$expected_status" ]; then
            log_success "✓ $description - Status: $status_code"
            success=true
            break
        fi
        
        attempt=$((attempt + 1))
    done
    
    if [ "$success" = false ]; then
        log_error "✗ $description - Expected: $expected_status, Got: $status_code"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
    
    return 0
}

# Main test suite
main() {
    log_info "========================================"
    log_info "Starting CI API Smoke Tests"
    log_info "========================================"
    log_info "Base URL: $BASE_URL"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Retries: $RETRIES"
    log_info "========================================"
    echo
    
    # Wait for service to be ready
    log_info "Waiting for service to be ready..."
    local ready_attempt=1
    local max_ready_attempts=30
    while [ $ready_attempt -le $max_ready_attempts ]; do
        if curl -sf --max-time 2 "${BASE_URL}/health" > /dev/null 2>&1; then
            log_success "Service is ready!"
            break
        fi
        
        if [ $ready_attempt -eq $max_ready_attempts ]; then
            log_error "Service not ready after ${max_ready_attempts} attempts"
            exit 1
        fi
        
        log_info "Waiting for service... ($ready_attempt/$max_ready_attempts)"
        sleep 2
        ready_attempt=$((ready_attempt + 1))
    done
    echo
    
    # Test 1: Health endpoint
    test_endpoint "GET" "/health" "200" "Health endpoint returns 200"
    
    # Test 2: API status endpoint
    test_endpoint "GET" "/api/status" "200" "API status endpoint returns 200"
    
    # Test 3: Explain chunk endpoint with valid data
    test_endpoint "POST" "/api/explain-chunk" "200" "Explain chunk with valid data" \
        '{"chunk":"Test game rule","language":"en"}'
    
    # Test 4: Explain chunk endpoint without chunk (should fail)
    test_endpoint "POST" "/api/explain-chunk" "400" "Explain chunk without data returns 400" \
        '{}'
    
    # Test 5: Extract BGG HTML with valid URL
    test_endpoint "POST" "/api/extract-bgg-html" "200" "Extract BGG HTML with valid URL" \
        '{"url":"https://boardgamegeek.com/boardgame/12345/test-game"}'
    
    # Test 6: Extract BGG HTML with invalid URL (should fail)
    test_endpoint "POST" "/api/extract-bgg-html" "400" "Extract BGG HTML with invalid URL returns 400" \
        '{"url":"https://example.com/not-bgg"}'
    
    # Test 7: Extract components endpoint
    test_endpoint "POST" "/api/extract-components" "200" "Extract components endpoint"
    
    # Test 8: Summarize endpoint
    test_endpoint "POST" "/summarize" "200" "Summarize endpoint" \
        '{"language":"english"}'
    
    # Test 9: Upload PDF endpoint
    test_endpoint "POST" "/upload-pdf" "200" "Upload PDF endpoint"
    
    # Test 10: Load project endpoint
    test_endpoint "GET" "/load-project/test-123" "200" "Load project endpoint"
    
    # Test 11: 404 for non-existent endpoint
    test_endpoint "GET" "/nonexistent" "404" "Non-existent endpoint returns 404"
    
    echo
    log_info "========================================"
    log_info "Test Summary"
    log_info "========================================"
    log_info "Total tests: $TOTAL_TESTS"
    log_info "Passed: $((TOTAL_TESTS - FAILED_TESTS))"
    log_info "Failed: $FAILED_TESTS"
    log_info "========================================"
    
    if [ $FAILED_TESTS -eq 0 ]; then
        log_success "All tests passed! ✓"
        exit 0
    else
        log_error "Some tests failed! ✗"
        exit 1
    fi
}

# Run main function
main "$@"
