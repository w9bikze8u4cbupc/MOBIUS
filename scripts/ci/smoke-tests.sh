#!/bin/bash
# scripts/ci/smoke-tests.sh - Robust smoke test runner with timeouts, retries, and structured logs

set -euo pipefail

# Default values
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [BASE_URL] [TIMEOUT] [RETRIES]

Arguments:
  BASE_URL   Base URL for the API (default: http://localhost:5001)
  TIMEOUT    Request timeout in seconds (default: 30)
  RETRIES    Number of retry attempts (default: 2)

Environment variables:
  VERBOSE    Set to 'true' for verbose output (default: false)

Examples:
  $0                                    # Test localhost with defaults
  $0 http://localhost:5001 30 2        # Explicit parameters
  VERBOSE=true $0                       # Verbose output

EOF
}

# Check if help is requested
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
fi

# Detect jq availability and set parser
if command -v jq >/dev/null 2>&1; then
    JSON_PARSER="jq"
    log_info "Using jq for JSON parsing"
else
    JSON_PARSER="fallback"
    log_warn "jq not available, using fallback JSON parsing"
fi

# JSON parser function with fallback
parse_json() {
    local response="$1"
    local key="$2"
    
    if [[ "$JSON_PARSER" == "jq" ]]; then
        echo "$response" | jq -r ".$key // \"null\""
    else
        # Fallback parsing for basic keys
        case "$key" in
            "status")
                echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "null"
                ;;
            "ready")
                echo "$response" | grep -o '"ready"[[:space:]]*:[[:space:]]*[^,}]*' | sed 's/.*"ready"[[:space:]]*:[[:space:]]*\([^,}]*\).*/\1/' || echo "null"
                ;;
            "echo")
                echo "$response" | grep -o '"echo"[[:space:]]*:[[:space:]]*[^,}]*' | sed 's/.*"echo"[[:space:]]*:[[:space:]]*\([^,}]*\).*/\1/' || echo "null"
                ;;
            *)
                echo "null"
                ;;
        esac
    fi
}

# HTTP request function with retries
make_request() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    local attempt=1
    
    while [[ $attempt -le $((RETRIES + 1)) ]]; do
        if [[ "$VERBOSE" == "true" ]]; then
            log_info "Attempt $attempt/$((RETRIES + 1)): $method $endpoint"
        fi
        
        local curl_cmd="curl -s --max-time $TIMEOUT --connect-timeout 10"
        
        if [[ "$method" == "POST" ]]; then
            curl_cmd="$curl_cmd -X POST -H 'Content-Type: application/json'"
            if [[ -n "$data" ]]; then
                curl_cmd="$curl_cmd -d '$data'"
            fi
        fi
        
        curl_cmd="$curl_cmd '$BASE_URL$endpoint'"
        
        if [[ "$VERBOSE" == "true" ]]; then
            log_info "Executing: $curl_cmd"
        fi
        
        local response
        local http_code
        
        # Execute curl and capture response and HTTP code
        if response=$(eval "$curl_cmd" 2>/dev/null); then
            # Check if response is valid JSON-like
            if echo "$response" | grep -q '^\s*{.*}\s*$'; then
                echo "$response"
                return 0
            else
                log_warn "Invalid JSON response on attempt $attempt: $response"
            fi
        else
            log_warn "Request failed on attempt $attempt"
        fi
        
        if [[ $attempt -le $RETRIES ]]; then
            local wait_time=$((attempt * 2))
            log_info "Retrying in $wait_time seconds..."
            sleep $wait_time
        fi
        
        ((attempt++))
    done
    
    log_error "Request failed after $((RETRIES + 1)) attempts"
    return 1
}

# Test functions
test_health() {
    log_info "Testing /health endpoint..."
    
    local response
    if response=$(make_request "GET" "/health"); then
        local status
        status=$(parse_json "$response" "status")
        
        if [[ "$status" == "healthy" ]]; then
            log_success "Health check passed: status=$status"
            
            if [[ "$VERBOSE" == "true" ]]; then
                local mode
                mode=$(parse_json "$response" "mode")
                log_info "Mode: $mode"
            fi
            
            return 0
        else
            log_error "Health check failed: expected status=healthy, got status=$status"
            return 1
        fi
    else
        log_error "Health endpoint unreachable"
        return 1
    fi
}

test_ready() {
    log_info "Testing /ready endpoint..."
    
    local response
    if response=$(make_request "GET" "/ready"); then
        local ready
        ready=$(parse_json "$response" "ready")
        
        if [[ "$ready" == "true" ]]; then
            log_success "Ready check passed: ready=$ready"
            return 0
        else
            log_error "Ready check failed: expected ready=true, got ready=$ready"
            return 1
        fi
    else
        log_error "Ready endpoint unreachable"
        return 1
    fi
}

test_api_info() {
    log_info "Testing /api/info endpoint..."
    
    local response
    if response=$(make_request "GET" "/api/info"); then
        # Check if response contains expected fields
        if echo "$response" | grep -q '"name"' && echo "$response" | grep -q '"endpoints"'; then
            log_success "API info check passed"
            return 0
        else
            log_error "API info check failed: missing expected fields"
            return 1
        fi
    else
        log_error "API info endpoint unreachable"
        return 1
    fi
}

test_echo() {
    log_info "Testing /api/echo endpoint..."
    
    local test_data='{"test": "smoke-test", "timestamp": "'$(date -Iseconds)'"}'
    local response
    
    if response=$(make_request "POST" "/api/echo" "$test_data"); then
        local echo_status
        echo_status=$(parse_json "$response" "echo")
        
        if [[ "$echo_status" == "true" ]]; then
            log_success "Echo check passed: echo=$echo_status"
            return 0
        else
            log_error "Echo check failed: expected echo=true, got echo=$echo_status"
            return 1
        fi
    else
        log_error "Echo endpoint unreachable"
        return 1
    fi
}

# Main execution
main() {
    local start_time
    start_time=$(date +%s)
    
    log_info "Starting MOBIUS API smoke tests"
    log_info "Base URL: $BASE_URL"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Retries: $RETRIES"
    log_info "JSON Parser: $JSON_PARSER"
    echo
    
    local failed_tests=0
    local total_tests=4
    
    # Run tests
    test_health || ((failed_tests++))
    echo
    
    test_ready || ((failed_tests++))
    echo
    
    test_api_info || ((failed_tests++))
    echo
    
    test_echo || ((failed_tests++))
    echo
    
    # Summary
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    local passed_tests=$((total_tests - failed_tests))
    
    log_info "Smoke tests completed in ${duration}s"
    log_info "Results: $passed_tests/$total_tests tests passed"
    
    if [[ $failed_tests -eq 0 ]]; then
        log_success "All smoke tests passed! 🎉"
        exit 0
    else
        log_error "$failed_tests test(s) failed ❌"
        exit 1
    fi
}

# Trap to handle interruption
trap 'log_warn "Smoke tests interrupted"; exit 130' INT TERM

# Run main function
main "$@"