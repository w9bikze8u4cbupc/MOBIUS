#!/usr/bin/env bash
#
# smoke-tests.sh - Basic API smoke tests for MOBIUS
#
# Usage: ./smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
#
# Arguments:
#   BASE_URL  - API base URL (default: http://localhost:5001)
#   TIMEOUT   - Max wait time in seconds (default: 30)
#   RETRIES   - Number of retry attempts (default: 3)
#
# Example:
#   ./smoke-tests.sh http://localhost:5001 30 2

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-3}"
LOGFILE="smoke-tests.log"

# Initialize log file
echo "=== MOBIUS Smoke Tests - $(date) ===" > "$LOGFILE"
echo "Base URL: $BASE_URL" >> "$LOGFILE"
echo "Timeout: ${TIMEOUT}s" >> "$LOGFILE"
echo "Retries: $RETRIES" >> "$LOGFILE"
echo "" >> "$LOGFILE"

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to print with color
print_status() {
    local status="$1"
    local message="$2"
    
    case "$status" in
        "PASS")
            echo -e "${GREEN}✓ PASS${NC} - $message"
            echo "✓ PASS - $message" >> "$LOGFILE"
            ((TESTS_PASSED++))
            ;;
        "FAIL")
            echo -e "${RED}✗ FAIL${NC} - $message"
            echo "✗ FAIL - $message" >> "$LOGFILE"
            ((TESTS_FAILED++))
            ;;
        "INFO")
            echo -e "${YELLOW}ℹ INFO${NC} - $message"
            echo "ℹ INFO - $message" >> "$LOGFILE"
            ;;
    esac
    ((TESTS_RUN++))
}

# Wait for service to be ready
wait_for_service() {
    local url="$1"
    local timeout="$2"
    local elapsed=0
    
    print_status "INFO" "Waiting for service at $url (timeout: ${timeout}s)..."
    
    while [ $elapsed -lt "$timeout" ]; do
        if curl -sf "$url/health" > /dev/null 2>&1 || curl -sf "$url" > /dev/null 2>&1; then
            print_status "INFO" "Service is ready after ${elapsed}s"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    
    print_status "FAIL" "Service did not become ready within ${timeout}s"
    return 1
}

# Test: Health check endpoint
test_health_check() {
    print_status "INFO" "Testing health check endpoint..."
    
    local response
    response=$(curl -sf "$BASE_URL/health" 2>&1) || {
        # Try root endpoint if /health doesn't exist
        response=$(curl -sf "$BASE_URL/" 2>&1) || {
            print_status "FAIL" "Health check endpoint not responding"
            echo "Response: $response" >> "$LOGFILE"
            return 1
        }
    }
    
    print_status "PASS" "Health check endpoint responding"
    echo "Response: $response" >> "$LOGFILE"
    return 0
}

# Test: API responds to requests
test_api_response() {
    print_status "INFO" "Testing API basic response..."
    
    local status_code
    status_code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>&1) || {
        print_status "FAIL" "API not responding"
        echo "Status code: $status_code" >> "$LOGFILE"
        return 1
    }
    
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 500 ]; then
        print_status "PASS" "API responding (status: $status_code)"
        return 0
    else
        print_status "FAIL" "API returned unexpected status: $status_code"
        return 1
    fi
}

# Test: Check if static files endpoint exists
test_static_endpoint() {
    print_status "INFO" "Testing static files endpoint..."
    
    local status_code
    status_code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/static/" 2>&1) || status_code=0
    
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 500 ]; then
        print_status "PASS" "Static endpoint responding (status: $status_code)"
        return 0
    else
        print_status "INFO" "Static endpoint returned status: $status_code (may not exist yet)"
        return 0
    fi
}

# Test: Check if uploads endpoint exists
test_uploads_endpoint() {
    print_status "INFO" "Testing uploads endpoint..."
    
    local status_code
    status_code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/uploads/" 2>&1) || status_code=0
    
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 500 ]; then
        print_status "PASS" "Uploads endpoint responding (status: $status_code)"
        return 0
    else
        print_status "INFO" "Uploads endpoint returned status: $status_code (may not exist yet)"
        return 0
    fi
}

# Test: CORS headers
test_cors_headers() {
    print_status "INFO" "Testing CORS headers..."
    
    local cors_header
    cors_header=$(curl -sf -I -H "Origin: http://localhost:3000" "$BASE_URL/" 2>&1 | grep -i "access-control-allow-origin" || echo "")
    
    if [ -n "$cors_header" ]; then
        print_status "PASS" "CORS headers present"
        echo "CORS header: $cors_header" >> "$LOGFILE"
        return 0
    else
        print_status "INFO" "CORS headers not found (may not be critical)"
        return 0
    fi
}

# Main execution
main() {
    echo "============================================"
    echo "   MOBIUS API Smoke Tests"
    echo "============================================"
    echo ""
    
    # Wait for service to be ready
    if ! wait_for_service "$BASE_URL" "$TIMEOUT"; then
        echo ""
        echo "============================================"
        echo -e "${RED}Service failed to start${NC}"
        echo "============================================"
        exit 1
    fi
    
    echo ""
    echo "Running smoke tests..."
    echo ""
    
    # Run all tests
    test_health_check || true
    test_api_response || true
    test_static_endpoint || true
    test_uploads_endpoint || true
    test_cors_headers || true
    
    echo ""
    echo "============================================"
    echo "   Test Results"
    echo "============================================"
    echo "Total tests run: $TESTS_RUN"
    echo -e "${GREEN}Tests passed: $TESTS_PASSED${NC}"
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "${RED}Tests failed: $TESTS_FAILED${NC}"
    else
        echo "Tests failed: $TESTS_FAILED"
    fi
    echo ""
    echo "Full log saved to: $LOGFILE"
    echo "============================================"
    echo ""
    
    # Exit with appropriate code
    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Run main function
main "$@"
