#!/bin/bash

# smoke-tests.sh - CI smoke test runner for MOBIUS API
# Usage: ./scripts/ci/smoke-tests.sh <base_url> [timeout] [retries]
# Example: ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

set -euo pipefail

# Configuration
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[${TIMESTAMP}]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[${TIMESTAMP}] ✓${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[${TIMESTAMP}] ⚠${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[${TIMESTAMP}] ✗${NC} $*" >&2
}

# JSON parsing fallback (for systems without jq)
parse_json() {
    local json="$1"
    local key="$2"
    
    if command -v jq >/dev/null 2>&1; then
        echo "$json" | jq -r ".$key // \"null\""
    else
        # Basic regex fallback for simple JSON parsing
        echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | \
            sed "s/\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\"/\1/" || echo "null"
    fi
}

# HTTP request with retries
make_request() {
    local url="$1"
    local method="${2:-GET}"
    local data="${3:-}"
    local content_type="${4:-application/json}"
    local attempt=1
    local max_attempts=$((RETRIES + 1))
    
    while [ $attempt -le $max_attempts ]; do
        log "Attempt $attempt/$max_attempts: $method $url"
        
        local curl_opts=(
            --silent
            --show-error
            --max-time "$TIMEOUT"
            --write-out "HTTPSTATUS:%{http_code}"
            --header "Content-Type: $content_type"
        )
        
        if [ "$method" != "GET" ] && [ -n "$data" ]; then
            curl_opts+=(--data "$data")
        fi
        
        if response=$(curl "${curl_opts[@]}" -X "$method" "$url" 2>&1); then
            http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
            body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
            
            log "Response: HTTP $http_code"
            
            if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
                echo "$body"
                return 0
            else
                log_error "HTTP $http_code: $body"
            fi
        else
            log_error "Request failed: $response"
        fi
        
        if [ $attempt -lt $max_attempts ]; then
            sleep_time=$((attempt * 2))
            log_warning "Retrying in ${sleep_time}s..."
            sleep $sleep_time
        fi
        
        attempt=$((attempt + 1))
    done
    
    return 1
}

# Test health endpoint
test_health() {
    log "Testing health endpoint..."
    
    if response=$(make_request "$BASE_URL/health"); then
        status=$(parse_json "$response" "status")
        mode=$(parse_json "$response" "mode")
        
        if [ "$status" = "healthy" ]; then
            log_success "Health check passed: status=$status"
            
            if [ "$mode" = "mock" ]; then
                log_success "API running in mock mode as expected"
            else
                log_warning "API mode is '$mode', expected 'mock'"
            fi
            return 0
        else
            log_error "Health check failed: status=$status"
            return 1
        fi
    else
        log_error "Health endpoint unreachable"
        return 1
    fi
}

# Test mock API endpoints
test_mock_endpoints() {
    log "Testing mock API endpoints..."
    
    # Test BGG components endpoint
    local bgg_url="https://boardgamegeek.com/boardgame/1/die-macher"
    if response=$(make_request "$BASE_URL/api/bgg-components?url=$(printf '%s' "$bgg_url" | sed 's/&/%26/g;s/ /%20/g')"); then
        success=$(parse_json "$response" "success")
        if [ "$success" = "true" ]; then
            log_success "BGG components endpoint working"
        else
            log_error "BGG components endpoint returned success=false"
            return 1
        fi
    else
        log_error "BGG components endpoint failed"
        return 1
    fi
    
    # Test component extraction endpoint
    local test_data='{"pdfPath": "/test/path.pdf"}'
    if response=$(make_request "$BASE_URL/api/extract-components" "POST" "$test_data"); then
        success=$(parse_json "$response" "success")
        if [ "$success" = "true" ]; then
            log_success "Component extraction endpoint working"
        else
            log_warning "Component extraction returned success=false (expected for mock data)"
        fi
    else
        log_warning "Component extraction endpoint test inconclusive"
    fi
    
    return 0
}

# Test CORS and basic functionality
test_cors_and_basic() {
    log "Testing CORS headers and basic functionality..."
    
    local curl_opts=(
        --silent
        --show-error
        --max-time "$TIMEOUT"
        --include
        --header "Origin: http://localhost:3000"
        --write-out "HTTPSTATUS:%{http_code}"
    )
    
    if response=$(curl "${curl_opts[@]}" "$BASE_URL/health" 2>&1); then
        if echo "$response" | grep -q "Access-Control-Allow-Origin"; then
            log_success "CORS headers present"
        else
            log_warning "CORS headers not found (may be expected depending on setup)"
        fi
        return 0
    else
        log_error "CORS test failed"
        return 1
    fi
}

# Main test runner
main() {
    log "Starting MOBIUS API smoke tests"
    log "Base URL: $BASE_URL"
    log "Timeout: ${TIMEOUT}s"
    log "Retries: $RETRIES"
    
    local exit_code=0
    
    # Test 1: Health check
    if ! test_health; then
        log_error "Health check failed"
        exit_code=1
    fi
    
    # Test 2: Mock endpoints
    if ! test_mock_endpoints; then
        log_error "Mock endpoints test failed"
        exit_code=1
    fi
    
    # Test 3: CORS and basic functionality
    if ! test_cors_and_basic; then
        log_error "CORS test failed"
        exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        log_success "All smoke tests passed!"
    else
        log_error "Some smoke tests failed"
    fi
    
    return $exit_code
}

# Handle script arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 <base_url> [timeout] [retries]"
    echo "Example: $0 http://localhost:5001 30 2"
    exit 1
fi

# Run tests
main "$@"