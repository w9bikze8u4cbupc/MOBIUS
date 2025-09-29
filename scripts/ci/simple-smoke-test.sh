#!/bin/bash
# Simple CI-optimized smoke tests for fast execution
# Usage: ./scripts/ci/simple-smoke-test.sh [BASE_URL]

set -euo pipefail

BASE_URL="${1:-http://localhost:5001}"
TIMEOUT=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Quick health check
health_check() {
    log_info "Quick health check..."
    
    local response
    local status_code
    
    response=$(curl -s -w "%{http_code}" --max-time "$TIMEOUT" "$BASE_URL/health" 2>/dev/null || echo "000")
    status_code="${response: -3}"
    
    if [[ "$status_code" == "200" ]]; then
        local body="${response%???}"
        if [[ "$body" == *"healthy"* ]] && [[ "$body" == *"mock"* ]]; then
            log_success "Health check passed"
            return 0
        else
            log_error "Health check response invalid: $body"
            return 1
        fi
    else
        log_error "Health check failed with status: $status_code"
        return 1
    fi
}

# Quick ready check
ready_check() {
    log_info "Quick ready check..."
    
    local response
    local status_code
    
    response=$(curl -s -w "%{http_code}" --max-time "$TIMEOUT" "$BASE_URL/ready" 2>/dev/null || echo "000")
    status_code="${response: -3}"
    
    if [[ "$status_code" == "200" ]]; then
        local body="${response%???}"
        if [[ "$body" == *"ready"* ]] && [[ "$body" == *"memory"* ]]; then
            log_success "Ready check passed"
            return 0
        else
            log_error "Ready check response invalid"
            return 1
        fi
    else
        log_error "Ready check failed with status: $status_code"
        return 1
    fi
}

# Quick echo test
echo_test() {
    log_info "Quick echo test..."
    
    local response
    local status_code
    
    response=$(curl -s -w "%{http_code}" --max-time "$TIMEOUT" \
        -H "Content-Type: application/json" \
        -d '{"test":"simple"}' \
        "$BASE_URL/api/echo" 2>/dev/null || echo "000")
    status_code="${response: -3}"
    
    if [[ "$status_code" == "200" ]]; then
        local body="${response%???}"
        if [[ "$body" == *"test"* ]] && [[ "$body" == *"simple"* ]]; then
            log_success "Echo test passed"
            return 0
        else
            log_error "Echo test response invalid"
            return 1
        fi
    else
        log_error "Echo test failed with status: $status_code"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting simple smoke tests for $BASE_URL"
    
    local failed=0
    
    health_check || failed=1
    ready_check || failed=1
    echo_test || failed=1
    
    if [[ $failed -eq 0 ]]; then
        log_success "All simple smoke tests passed!"
        exit 0
    else
        log_error "Some tests failed"
        exit 1
    fi
}

main "$@"