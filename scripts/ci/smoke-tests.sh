#!/bin/bash
# smoke-tests.sh - API smoke tests with retries, health checks, and logging
#
# Usage: ./smoke-tests.sh <base_url> <max_wait_seconds> <max_retries>
# Example: ./smoke-tests.sh http://localhost:5001 30 2

set -e

BASE_URL="${1:-http://localhost:5001}"
MAX_WAIT="${2:-30}"
MAX_RETRIES="${3:-2}"
LOG_FILE="smoke-tests.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize log file
echo "=== MOBIUS API Smoke Tests ===" > "$LOG_FILE"
echo "Start time: $(date -Iseconds)" >> "$LOG_FILE"
echo "Base URL: $BASE_URL" >> "$LOG_FILE"
echo "Max wait: ${MAX_WAIT}s" >> "$LOG_FILE"
echo "Max retries: $MAX_RETRIES" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

log() {
    echo "$1" | tee -a "$LOG_FILE"
}

log_debug() {
    echo "$1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

# Wait for service to be healthy
wait_for_healthy() {
    local endpoint="$1"
    local timeout="$2"
    local elapsed=0
    local interval=2
    
    log "Waiting for service at $endpoint (timeout: ${timeout}s)..."
    
    while [ $elapsed -lt "$timeout" ]; do
        if curl -sf "$endpoint" > /dev/null 2>&1; then
            success "Service is responding at $endpoint"
            return 0
        fi
        
        log_debug "Waiting... (${elapsed}s/${timeout}s)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    error "Service did not respond within ${timeout}s"
    return 1
}

# Perform HTTP request with retries
http_test() {
    local method="$1"
    local endpoint="$2"
    local expected_status="$3"
    local description="$4"
    local data="$5"
    local retry=0
    
    log ""
    log "Test: $description"
    log_debug "  Method: $method"
    log_debug "  Endpoint: $endpoint"
    log_debug "  Expected status: $expected_status"
    
    while [ $retry -le "$MAX_RETRIES" ]; do
        if [ $retry -gt 0 ]; then
            warn "Retry attempt $retry/$MAX_RETRIES"
            sleep 2
        fi
        
        # Perform request
        if [ -n "$data" ]; then
            response=$(curl -w "\n%{http_code}" -s -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$endpoint" 2>&1) || true
        else
            response=$(curl -w "\n%{http_code}" -s -X "$method" "$endpoint" 2>&1) || true
        fi
        
        # Extract status code (last line)
        status=$(echo "$response" | tail -n 1)
        body=$(echo "$response" | sed '$d')
        
        log_debug "  Response status: $status"
        log_debug "  Response body: $body"
        
        # Check if status matches expected
        if [ "$status" = "$expected_status" ]; then
            success "✓ $description (status: $status)"
            return 0
        else
            if [ $retry -eq "$MAX_RETRIES" ]; then
                error "✗ $description (expected: $expected_status, got: $status)"
                log_debug "Response body: $body"
                return 1
            fi
            retry=$((retry + 1))
        fi
    done
    
    return 1
}

# Main test execution
main() {
    local failed=0
    
    log "Starting smoke tests..."
    log ""
    
    # Wait for service to be ready
    if ! wait_for_healthy "$BASE_URL/health" "$MAX_WAIT"; then
        error "Service health check failed - aborting tests"
        exit 1
    fi
    
    log ""
    log "=== Running API Tests ==="
    
    # Test 1: Health check
    http_test "GET" "$BASE_URL/health" "200" "Health check endpoint" || failed=$((failed + 1))
    
    # Test 2: Root endpoint
    http_test "GET" "$BASE_URL/" "200" "Root endpoint" || failed=$((failed + 1))
    
    # Test 3: API info/status endpoint (if exists)
    http_test "GET" "$BASE_URL/api/status" "200" "API status endpoint" || {
        warn "API status endpoint not found (this may be expected)"
    }
    
    # Test 4: 404 handling
    http_test "GET" "$BASE_URL/nonexistent-endpoint-12345" "404" "404 error handling" || failed=$((failed + 1))
    
    log ""
    log "=== Test Summary ==="
    
    if [ $failed -eq 0 ]; then
        success "All smoke tests passed!"
        log ""
        log "End time: $(date -Iseconds)"
        exit 0
    else
        error "$failed test(s) failed"
        log ""
        log "End time: $(date -Iseconds)"
        log ""
        error "Check $LOG_FILE for detailed output"
        exit 1
    fi
}

# Run main function
main
