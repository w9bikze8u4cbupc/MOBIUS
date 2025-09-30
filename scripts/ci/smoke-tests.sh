#!/usr/bin/env bash
#
# Smoke Tests for MOBIUS CI API
# 
# Tests basic API health and availability with retries and timeouts.
# Designed to validate containerized deployments in CI/CD pipelines.
#
# Usage: ./smoke-tests.sh [URL] [TIMEOUT] [RETRIES]
#   URL      - API base URL (default: http://localhost:5001)
#   TIMEOUT  - Request timeout in seconds (default: 30)
#   RETRIES  - Number of retry attempts (default: 2)
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -euo pipefail

# Configuration
API_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

error() {
    echo -e "${RED}✗${NC} $*"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $*"
}

# Test helper with retries
test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local expected_status="${3:-200}"
    local method="${4:-GET}"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    log "Test ${TESTS_RUN}: ${name}"
    
    local attempt=0
    local max_attempts=$((RETRIES + 1))
    local success=false
    
    while [ $attempt -lt $max_attempts ]; do
        attempt=$((attempt + 1))
        
        if [ $attempt -gt 1 ]; then
            warn "Retry attempt ${attempt}/${max_attempts}"
            sleep 2
        fi
        
        local response
        local http_code
        
        if response=$(curl -s -w "\n%{http_code}" \
            --max-time "$TIMEOUT" \
            -X "$method" \
            "${API_URL}${endpoint}" 2>&1); then
            
            http_code=$(echo "$response" | tail -n1)
            local body=$(echo "$response" | head -n-1)
            
            if [ "$http_code" = "$expected_status" ]; then
                success "HTTP ${http_code} - ${name}"
                echo "  Response: ${body}" | head -c 200
                echo ""
                TESTS_PASSED=$((TESTS_PASSED + 1))
                success=true
                break
            else
                error "Expected HTTP ${expected_status}, got ${http_code}"
                echo "  Response: ${body}" | head -c 200
                echo ""
            fi
        else
            error "Request failed: $response"
        fi
    done
    
    if [ "$success" = false ]; then
        TESTS_FAILED=$((TESTS_FAILED + 1))
        error "Failed after ${max_attempts} attempts: ${name}"
        return 1
    fi
    
    return 0
}

# Main test suite
main() {
    echo ""
    echo "=================================================================="
    echo "  MOBIUS API Smoke Tests"
    echo "=================================================================="
    echo "  Target: ${API_URL}"
    echo "  Timeout: ${TIMEOUT}s"
    echo "  Retries: ${RETRIES}"
    echo "=================================================================="
    echo ""
    
    # Wait for service to be ready
    log "Waiting for API to be ready..."
    local ready=false
    local wait_attempts=0
    local max_wait=30
    
    while [ $wait_attempts -lt $max_wait ]; do
        if curl -s --max-time 2 "${API_URL}/health" > /dev/null 2>&1; then
            ready=true
            success "API is ready"
            break
        fi
        wait_attempts=$((wait_attempts + 1))
        echo -n "."
        sleep 1
    done
    echo ""
    
    if [ "$ready" = false ]; then
        error "API failed to become ready after ${max_wait} seconds"
        exit 1
    fi
    
    echo ""
    log "Running smoke tests..."
    echo ""
    
    # Test suite
    test_endpoint "Health check" "/health" 200
    test_endpoint "API status" "/api/status" 200
    test_endpoint "Ping endpoint" "/api/ping" 200
    test_endpoint "Games list" "/api/games" 200
    test_endpoint "404 handling" "/api/nonexistent" 404
    
    # Summary
    echo ""
    echo "=================================================================="
    echo "  Test Summary"
    echo "=================================================================="
    echo "  Total:  ${TESTS_RUN}"
    echo "  Passed: ${TESTS_PASSED}"
    echo "  Failed: ${TESTS_FAILED}"
    echo "=================================================================="
    echo ""
    
    if [ $TESTS_FAILED -gt 0 ]; then
        error "Smoke tests FAILED"
        exit 1
    else
        success "All smoke tests PASSED"
        exit 0
    fi
}

# Run tests
main "$@"
