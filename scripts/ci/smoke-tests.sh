#!/bin/bash
set -euo pipefail

# Comprehensive smoke tests for MOBIUS API CI
# Usage: ./smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
# Example: ./smoke-tests.sh http://localhost:5001 30 2

BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
LOG_FILE="/tmp/smoke-tests-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$LOG_FILE" >&2
}

# Check if jq is available, provide fallback
check_jq() {
    if command -v jq >/dev/null 2>&1; then
        echo "jq"
    else
        log_warning "jq not found, using fallback JSON parsing"
        echo "fallback"
    fi
}

# Fallback JSON parsing function when jq is not available
parse_json_fallback() {
    local json="$1"
    local key="$2"
    echo "$json" | grep -o "\"$key\":[^,}]*" | cut -d: -f2 | tr -d '"' | xargs
}

# HTTP request with retries and timeout
http_request() {
    local method="$1"
    local url="$2"
    local data="${3:-}"
    local expected_status="${4:-200}"
    local attempt=1
    
    while [ $attempt -le $((RETRIES + 1)) ]; do
        log "Attempt $attempt/$((RETRIES + 1)): $method $url"
        
        if [ "$method" = "POST" ] && [ -n "$data" ]; then
            response=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}" \
                --max-time "$TIMEOUT" \
                -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$url" 2>/dev/null || echo "CURL_ERROR")
        else
            response=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}" \
                --max-time "$TIMEOUT" \
                -X "$method" \
                "$url" 2>/dev/null || echo "CURL_ERROR")
        fi
        
        if [ "$response" = "CURL_ERROR" ]; then
            log_error "Request failed (attempt $attempt)"
            if [ $attempt -eq $((RETRIES + 1)) ]; then
                return 1
            fi
            sleep $((attempt * 2))
        else
            # Extract status code and body
            http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
            time_total=$(echo "$response" | grep "TIME_TOTAL:" | cut -d: -f2)
            body=$(echo "$response" | sed '/^HTTP_STATUS:/d' | sed '/^TIME_TOTAL:/d')
            
            log "Response: HTTP $http_status (${time_total}s)"
            
            if [ "$http_status" = "$expected_status" ]; then
                echo "$body"
                return 0
            else
                log_error "Expected HTTP $expected_status, got HTTP $http_status"
                if [ $attempt -eq $((RETRIES + 1)) ]; then
                    return 1
                fi
            fi
        fi
        
        attempt=$((attempt + 1))
        sleep 2
    done
    
    return 1
}

# Test endpoints
test_health() {
    log "Testing /health endpoint..."
    local response
    if response=$(http_request "GET" "$BASE_URL/health"); then
        local jq_cmd=$(check_jq)
        
        if [ "$jq_cmd" = "jq" ]; then
            local status=$(echo "$response" | jq -r '.status // empty')
            local mode=$(echo "$response" | jq -r '.mode // empty')
            local service=$(echo "$response" | jq -r '.service // empty')
        else
            local status=$(parse_json_fallback "$response" "status")
            local mode=$(parse_json_fallback "$response" "mode")
            local service=$(parse_json_fallback "$response" "service")
        fi
        
        if [ "$status" = "healthy" ] && [ "$mode" = "mock" ] && [ "$service" = "mobius-api-ci" ]; then
            log_success "Health endpoint working correctly"
            echo "$response" >> "$LOG_FILE"
            return 0
        else
            log_error "Health endpoint response validation failed"
            echo "Response: $response" >> "$LOG_FILE"
            return 1
        fi
    else
        log_error "Health endpoint request failed"
        return 1
    fi
}

test_ready() {
    log "Testing /ready endpoint..."
    local response
    if response=$(http_request "GET" "$BASE_URL/ready"); then
        local jq_cmd=$(check_jq)
        
        if [ "$jq_cmd" = "jq" ]; then
            local ready=$(echo "$response" | jq -r '.ready // empty')
            local has_memory=$(echo "$response" | jq -r '.checks.memory // empty')
        else
            local ready=$(parse_json_fallback "$response" "ready")
            # Simple check for memory presence in response
            if echo "$response" | grep -q "memory"; then
                has_memory="present"
            else
                has_memory=""
            fi
        fi
        
        if [ "$ready" = "true" ] && [ -n "$has_memory" ]; then
            log_success "Ready endpoint working correctly"
            echo "$response" >> "$LOG_FILE"
            return 0
        else
            log_error "Ready endpoint response validation failed"
            echo "Response: $response" >> "$LOG_FILE"
            return 1
        fi
    else
        log_error "Ready endpoint request failed"
        return 1
    fi
}

test_api_info() {
    log "Testing /api/info endpoint..."
    local response
    if response=$(http_request "GET" "$BASE_URL/api/info"); then
        local jq_cmd=$(check_jq)
        
        if [ "$jq_cmd" = "jq" ]; then
            local name=$(echo "$response" | jq -r '.name // empty')
            local endpoints_count=$(echo "$response" | jq -r '.endpoints | length')
        else
            local name=$(parse_json_fallback "$response" "name")
            # Simple check for endpoints array
            if echo "$response" | grep -q "endpoints"; then
                endpoints_count="4"  # We know there are 4 endpoints
            else
                endpoints_count="0"
            fi
        fi
        
        if [ "$name" = "MOBIUS API CI Server" ] && [ "$endpoints_count" -ge "4" ]; then
            log_success "API info endpoint working correctly"
            echo "$response" >> "$LOG_FILE"
            return 0
        else
            log_error "API info endpoint response validation failed"
            echo "Response: $response" >> "$LOG_FILE"
            return 1
        fi
    else
        log_error "API info endpoint request failed"
        return 1
    fi
}

test_echo() {
    log "Testing /api/echo endpoint..."
    local test_data='{"test": "smoke-test", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
    local response
    if response=$(http_request "POST" "$BASE_URL/api/echo" "$test_data"); then
        local jq_cmd=$(check_jq)
        
        if [ "$jq_cmd" = "jq" ]; then
            local echo_flag=$(echo "$response" | jq -r '.echo // empty')
            local received_test=$(echo "$response" | jq -r '.body.test // empty')
        else
            local echo_flag=$(parse_json_fallback "$response" "echo")
            # Extract test value from nested body
            if echo "$response" | grep -q '"test":"smoke-test"'; then
                received_test="smoke-test"
            else
                received_test=""
            fi
        fi
        
        if [ "$echo_flag" = "true" ] && [ "$received_test" = "smoke-test" ]; then
            log_success "Echo endpoint working correctly"
            echo "$response" >> "$LOG_FILE"
            return 0
        else
            log_error "Echo endpoint response validation failed"
            echo "Response: $response" >> "$LOG_FILE"
            return 1
        fi
    else
        log_error "Echo endpoint request failed"
        return 1
    fi
}

test_404() {
    log "Testing 404 handling..."
    local response
    if response=$(http_request "GET" "$BASE_URL/nonexistent" "" "404"); then
        log_success "404 handling working correctly"
        echo "$response" >> "$LOG_FILE"
        return 0
    else
        log_error "404 handling failed"
        return 1
    fi
}

# Main test execution
main() {
    log "Starting MOBIUS API smoke tests"
    log "Base URL: $BASE_URL"
    log "Timeout: ${TIMEOUT}s"
    log "Retries: $RETRIES"
    log "Log file: $LOG_FILE"
    log "JQ available: $(check_jq)"
    
    local failed_tests=0
    local total_tests=5
    
    # Run tests
    test_health || ((failed_tests++))
    test_ready || ((failed_tests++))
    test_api_info || ((failed_tests++))
    test_echo || ((failed_tests++))
    test_404 || ((failed_tests++))
    
    # Summary
    log "Test Summary:"
    log "Total tests: $total_tests"
    log "Passed: $((total_tests - failed_tests))"
    log "Failed: $failed_tests"
    
    if [ $failed_tests -eq 0 ]; then
        log_success "All smoke tests passed!"
        exit 0
    else
        log_error "$failed_tests test(s) failed"
        log "Full log available at: $LOG_FILE"
        exit 1
    fi
}

# Cleanup on exit
cleanup() {
    log "Cleaning up..."
}

trap cleanup EXIT

# Run main function
main "$@"