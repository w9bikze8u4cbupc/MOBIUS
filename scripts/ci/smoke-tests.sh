#!/bin/bash
# smoke-tests.sh - Robust smoke test runner for MOBIUS API CI
# 
# Features:
# - Configurable timeouts and retries
# - Structured logging with timestamps
# - jq fallback for JSON parsing
# - Exit codes for CI integration
# - Comprehensive endpoint testing

set -euo pipefail

# Configuration
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# JSON parsing with jq fallback
parse_json() {
    local json="$1"
    local key="$2"
    
    # Always use grep-based parsing for better compatibility
    echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | cut -d'"' -f4 || \
    echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*[^,}]*" | head -1 | sed 's/.*:[[:space:]]*//' | sed 's/[,}].*//' || \
    echo "N/A"
}

# HTTP request function with retries
make_request() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    local url="$BASE_URL$endpoint"
    local attempt=1
    
    while [ $attempt -le $((RETRIES + 1)) ]; do
        log_info "Attempt $attempt/$((RETRIES + 1)): $method $endpoint"
        
        local response
        local http_code
        
        if [ "$method" = "GET" ]; then
            # Use separate calls for response and status code
            response=$(curl -s --max-time $TIMEOUT "$url" 2>/dev/null || echo "")
            http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")
        elif [ "$method" = "POST" ]; then
            response=$(curl -s --max-time $TIMEOUT -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null || echo "")
            http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null || echo "000")
        fi
        
        if [[ "$http_code" =~ ^[2][0-9][0-9]$ ]]; then
            log_success "$method $endpoint - HTTP $http_code"
            echo "$response"
            return 0
        else
            log_warning "$method $endpoint - HTTP $http_code (attempt $attempt/$((RETRIES + 1)))"
            if [ $attempt -gt $RETRIES ]; then
                log_error "$method $endpoint - Failed after $((RETRIES + 1)) attempts"
                return 1
            fi
            sleep 2
        fi
        
        ((attempt++))
    done
}

# Wait for service to be ready
wait_for_service() {
    log_info "Waiting for service at $BASE_URL to be ready..."
    local attempt=1
    local max_attempts=30
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s --max-time 5 "$BASE_URL/health" >/dev/null 2>&1; then
            log_success "Service is ready"
            return 0
        fi
        
        log_info "Waiting... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "Service failed to become ready after $((max_attempts * 2)) seconds"
    return 1
}

# Test functions
test_health_endpoint() {
    log_info "Testing /health endpoint..."
    local response
    
    if response=$(make_request "GET" "/health"); then
        local status=$(parse_json "$response" "status")
        local mode=$(parse_json "$response" "mode")
        local version=$(parse_json "$response" "version")
        
        log_info "Health check - Status: $status, Mode: $mode, Version: $version"
        
        if [ "$status" = "healthy" ] && [ "$mode" = "mock" ]; then
            log_success "Health endpoint test passed"
            return 0
        else
            log_error "Health endpoint test failed - unexpected response"
            return 1
        fi
    else
        log_error "Health endpoint test failed - request failed"
        return 1
    fi
}

test_ready_endpoint() {
    log_info "Testing /ready endpoint..."
    local response
    
    if response=$(make_request "GET" "/ready"); then
        local ready=$(parse_json "$response" "ready")
        local uptime=$(parse_json "$response" "uptime")
        
        log_info "Ready check - Ready: $ready, Uptime: ${uptime}s"
        
        if [ "$ready" = "true" ]; then
            log_success "Ready endpoint test passed"
            return 0
        else
            log_error "Ready endpoint test failed - service not ready"
            return 1
        fi
    else
        log_error "Ready endpoint test failed - request failed"
        return 1
    fi
}

test_info_endpoint() {
    log_info "Testing /api/info endpoint..."
    local response
    
    if response=$(make_request "GET" "/api/info"); then
        local name=$(parse_json "$response" "name")
        local mode=$(parse_json "$response" "mode")
        
        log_info "Info check - Name: $name, Mode: $mode"
        
        if [ "$mode" = "mock" ]; then
            log_success "Info endpoint test passed"
            return 0
        else
            log_error "Info endpoint test failed - unexpected mode: $mode"
            return 1
        fi
    else
        log_error "Info endpoint test failed - request failed"
        return 1
    fi
}

test_echo_endpoint() {
    log_info "Testing /api/echo endpoint..."
    local test_data='{"message":"smoke test","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
    local response
    
    if response=$(make_request "POST" "/api/echo" "$test_data"); then
        local echo=$(parse_json "$response" "echo")
        # For nested JSON, extract with simple grep
        local received_message=$(echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
        
        log_info "Echo check - Echo: $echo, Message: $received_message"
        
        if [ "$echo" = "true" ] && [ "$received_message" = "smoke test" ]; then
            log_success "Echo endpoint test passed"
            return 0
        else
            log_error "Echo endpoint test failed - unexpected response (echo: $echo, message: $received_message)"
            return 1
        fi
    else
        log_error "Echo endpoint test failed - request failed"
        return 1
    fi
}

# Main test execution
main() {
    log_info "=== MOBIUS API Smoke Tests ==="
    log_info "Base URL: $BASE_URL"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Retries: $RETRIES"
    log_info "Started at: $(date)"
    
    local test_results=()
    local start_time=$(date +%s)
    
    # Wait for service
    if ! wait_for_service; then
        log_error "Service readiness check failed"
        exit 1
    fi
    
    # Run tests
    log_info "Running smoke tests..."
    
    if test_health_endpoint; then
        test_results+=("PASS")
    else
        test_results+=("FAIL")
    fi
    
    if test_ready_endpoint; then
        test_results+=("PASS")
    else
        test_results+=("FAIL")
    fi
    
    if test_info_endpoint; then
        test_results+=("PASS")
    else
        test_results+=("FAIL")
    fi
    
    if test_echo_endpoint; then
        test_results+=("PASS")
    else
        test_results+=("FAIL")
    fi
    
    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local passed=0
    local failed=0
    
    for result in "${test_results[@]}"; do
        if [ "$result" = "PASS" ]; then
            ((passed++))
        else
            ((failed++))
        fi
    done
    
    log_info "=== Test Summary ==="
    log_info "Total tests: ${#test_results[@]}"
    log_success "Passed: $passed"
    if [ $failed -gt 0 ]; then
        log_error "Failed: $failed"
    else
        log_info "Failed: $failed"
    fi
    log_info "Duration: ${duration}s"
    log_info "Completed at: $(date)"
    
    if [ $failed -eq 0 ]; then
        log_success "All smoke tests passed!"
        exit 0
    else
        log_error "Some smoke tests failed!"
        exit 1
    fi
}

# Install jq if available and not installed (for better JSON parsing)
if ! command -v jq >/dev/null 2>&1; then
    log_warning "jq not found - using grep fallback for JSON parsing"
    if command -v apk >/dev/null 2>&1; then
        log_info "Attempting to install jq..."
        apk add --no-cache jq >/dev/null 2>&1 || log_warning "Could not install jq"
    fi
fi

# Run main function
main "$@"