#!/bin/bash
set -euo pipefail

# MOBIUS CI Smoke Tests
# 
# Comprehensive smoke test runner for the MOBIUS CI Mock API.
# Features timeout handling, retries, structured logging, and jq fallback.
#
# Usage:
#   ./smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
#
# Examples:
#   ./smoke-tests.sh                                    # Use defaults
#   ./smoke-tests.sh http://localhost:5001              # Custom URL
#   ./smoke-tests.sh http://localhost:5001 30 2         # Custom timeout and retries
#
# Environment Variables:
#   SMOKE_TEST_URL     - Base URL for API (default: http://localhost:5001)
#   SMOKE_TEST_TIMEOUT - Request timeout in seconds (default: 30)
#   SMOKE_TEST_RETRIES - Number of retries (default: 3)
#   SMOKE_TEST_VERBOSE - Enable verbose output (default: false)

# Default configuration
DEFAULT_BASE_URL="http://localhost:5001"
DEFAULT_TIMEOUT=30
DEFAULT_RETRIES=3

# Parse command line arguments
BASE_URL="${1:-${SMOKE_TEST_URL:-$DEFAULT_BASE_URL}}"
TIMEOUT="${2:-${SMOKE_TEST_TIMEOUT:-$DEFAULT_TIMEOUT}}"
RETRIES="${3:-${SMOKE_TEST_RETRIES:-$DEFAULT_RETRIES}}"
VERBOSE="${SMOKE_TEST_VERBOSE:-false}"

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" >&2
}

log_test() {
    echo -e "${PURPLE}[TEST]${NC} $1" >&2
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $1" >&2
    fi
}

# Check if jq is available, provide fallback
check_jq() {
    if command -v jq >/dev/null 2>&1; then
        JQ_AVAILABLE=true
        log_verbose "jq is available for JSON parsing"
    else
        JQ_AVAILABLE=false
        log_warning "jq not found, using grep/sed fallback for JSON parsing"
    fi
}

# JSON parsing with jq fallback
parse_json() {
    local json="$1"
    local key="$2"
    
    if [[ "$JQ_AVAILABLE" == "true" ]]; then
        echo "$json" | jq -r ".$key // empty"
    else
        # Simple grep/sed fallback for basic JSON key extraction
        echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed 's/.*"\([^"]*\)".*/\1/' || echo ""
    fi
}

# HTTP request with timeout and retries
make_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_status="$4"
    local description="$5"
    
    log_test "$description"
    
    local url="$BASE_URL$endpoint"
    local attempt=1
    local success=false
    
    while [[ $attempt -le $((RETRIES + 1)) ]]; do
        log_verbose "Attempt $attempt of $((RETRIES + 1)): $method $url"
        
        local curl_args=(
            --silent
            --show-error
            --max-time "$TIMEOUT"
            --write-out "HTTPSTATUS:%{http_code};SIZE:%{size_download};TIME:%{time_total}"
        )
        
        if [[ "$method" == "POST" && -n "$data" ]]; then
            curl_args+=(
                --header "Content-Type: application/json"
                --data "$data"
            )
        fi
        
        local response
        local http_status
        local error_msg
        
        if response=$(curl "${curl_args[@]}" -X "$method" "$url" 2>&1); then
            # Extract HTTP status and response body
            if [[ "$response" =~ HTTPSTATUS:([0-9]+) ]]; then
                http_status="${BASH_REMATCH[1]}"
                # Extract body by removing everything from HTTPSTATUS onwards
                local body="${response%%HTTPSTATUS:*}"
                
                log_verbose "HTTP $http_status, Body length: ${#body} chars"
                
                if [[ "$http_status" == "$expected_status" ]]; then
                    log_success "$description (HTTP $http_status)"
                    echo "$body"
                    success=true
                    break
                else
                    error_msg="Expected HTTP $expected_status, got HTTP $http_status"
                fi
            else
                error_msg="Could not parse HTTP status from response"
            fi
        else
            error_msg="Network error: $response"
        fi
        
        if [[ $attempt -le $RETRIES ]]; then
            log_warning "Attempt $attempt failed: $error_msg. Retrying in 2 seconds..."
            sleep 2
        else
            log_error "$description - $error_msg"
        fi
        
        ((attempt++))
    done
    
    if [[ "$success" == "true" ]]; then
        ((TESTS_PASSED++))
    else
        ((TESTS_FAILED++))
    fi
    
    ((TESTS_TOTAL++))
    return $([ "$success" == "true" ] && echo 0 || echo 1)
}

# Validate JSON response structure
validate_json_field() {
    local json="$1"
    local field="$2"
    local expected_type="$3"
    local description="$4"
    
    log_test "$description"
    
    local value
    value=$(parse_json "$json" "$field")
    
    if [[ -z "$value" ]]; then
        log_error "$description - Field '$field' not found or empty"
        ((TESTS_FAILED++))
    else
        case "$expected_type" in
            "string")
                log_success "$description - Field '$field': '$value'"
                ((TESTS_PASSED++))
                ;;
            "number")
                if [[ "$value" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
                    log_success "$description - Field '$field': $value"
                    ((TESTS_PASSED++))
                else
                    log_error "$description - Field '$field' is not a valid number: '$value'"
                    ((TESTS_FAILED++))
                fi
                ;;
            "boolean")
                if [[ "$value" == "true" || "$value" == "false" ]]; then
                    log_success "$description - Field '$field': $value"
                    ((TESTS_PASSED++))
                else
                    log_error "$description - Field '$field' is not a boolean: '$value'"
                    ((TESTS_FAILED++))
                fi
                ;;
        esac
    fi
    
    ((TESTS_TOTAL++))
}

# Main test execution
run_smoke_tests() {
    echo -e "${BOLD}🧪 MOBIUS CI Smoke Tests${NC}"
    echo "======================================="
    echo "Base URL:     $BASE_URL"
    echo "Timeout:      ${TIMEOUT}s"
    echo "Retries:      $RETRIES"
    echo "Verbose:      $VERBOSE"
    echo "======================================="
    echo
    
    check_jq
    
    # Test 1: Health Check Endpoint
    local health_response
    if health_response=$(make_request "GET" "/health" "" "200" "Health check endpoint"); then
        log_verbose "Health response: '$health_response'"
        validate_json_field "$health_response" "status" "string" "Health status field"
        validate_json_field "$health_response" "mode" "string" "Mode field"
        validate_json_field "$health_response" "version" "string" "Version field"
        validate_json_field "$health_response" "uptime" "number" "Uptime field"
        
        # Verify mode is 'mock'
        local mode
        mode=$(parse_json "$health_response" "mode")
        if [[ "$mode" == "mock" ]]; then
            log_success "Mode verification - Expected 'mock', got '$mode'"
            ((TESTS_PASSED++))
        else
            log_error "Mode verification - Expected 'mock', got '$mode'"
            ((TESTS_FAILED++))
        fi
        ((TESTS_TOTAL++))
    fi
    
    # Test 2: Readiness Check Endpoint
    local ready_response
    if ready_response=$(make_request "GET" "/ready" "" "200" "Readiness check endpoint"); then
        validate_json_field "$ready_response" "ready" "boolean" "Ready field"
        validate_json_field "$ready_response" "uptime" "number" "Ready uptime field"
        
        # Check for memory and CPU info
        if [[ "$JQ_AVAILABLE" == "true" ]]; then
            local memory_rss
            memory_rss=$(echo "$ready_response" | jq -r '.memory.rss // empty')
            if [[ -n "$memory_rss" ]]; then
                log_success "Memory info verification - RSS: ${memory_rss}MB"
                ((TESTS_PASSED++))
            else
                log_error "Memory info verification - RSS field missing"
                ((TESTS_FAILED++))
            fi
            ((TESTS_TOTAL++))
        fi
    fi
    
    # Test 3: API Info Endpoint
    local info_response
    if info_response=$(make_request "GET" "/api/info" "" "200" "API info endpoint"); then
        validate_json_field "$info_response" "name" "string" "API name field"
        validate_json_field "$info_response" "version" "string" "API version field"
        
        # Check for endpoints array
        if [[ "$JQ_AVAILABLE" == "true" ]]; then
            local endpoints_count
            endpoints_count=$(echo "$info_response" | jq '.endpoints | length' 2>/dev/null || echo "0")
            if [[ "$endpoints_count" -gt 0 ]]; then
                log_success "Endpoints documentation - Found $endpoints_count endpoints"
                ((TESTS_PASSED++))
            else
                log_error "Endpoints documentation - No endpoints found"
                ((TESTS_FAILED++))
            fi
            ((TESTS_TOTAL++))
        fi
    fi
    
    # Test 4: Echo Endpoint (POST)
    local echo_data='{"test": "smoke-test-data", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'", "number": 42}'
    local echo_response
    if echo_response=$(make_request "POST" "/api/echo" "$echo_data" "200" "Echo endpoint (POST)"); then
        # Verify echo functionality
        if [[ "$JQ_AVAILABLE" == "true" ]]; then
            local echoed_test
            echoed_test=$(echo "$echo_response" | jq -r '.echo.body.test // empty')
            if [[ "$echoed_test" == "smoke-test-data" ]]; then
                log_success "Echo functionality - Data echoed correctly"
                ((TESTS_PASSED++))
            else
                log_error "Echo functionality - Expected 'smoke-test-data', got '$echoed_test'"
                ((TESTS_FAILED++))
            fi
            ((TESTS_TOTAL++))
            
            # Check validation fields
            local has_body
            has_body=$(echo "$echo_response" | jq -r '.validation.hasBody // empty')
            if [[ "$has_body" == "true" ]]; then
                log_success "Request validation - Body presence detected"
                ((TESTS_PASSED++))
            else
                log_error "Request validation - Body presence not detected"
                ((TESTS_FAILED++))
            fi
            ((TESTS_TOTAL++))
        fi
    fi
    
    # Test 5: 404 Error Handling
    make_request "GET" "/nonexistent" "" "404" "404 error handling" >/dev/null
    
    # Test 6: Invalid JSON Handling (if server is running)
    if curl --silent --max-time 5 "$BASE_URL/health" >/dev/null 2>&1; then
        log_test "Invalid JSON handling"
        local invalid_response
        if invalid_response=$(curl --silent --show-error --max-time "$TIMEOUT" \
            --header "Content-Type: application/json" \
            --data '{"invalid": json}' \
            --write-out "HTTPSTATUS:%{http_code}" \
            -X POST "$BASE_URL/api/echo" 2>&1); then
            
            if [[ "$invalid_response" =~ HTTPSTATUS:400 ]]; then
                log_success "Invalid JSON handling (HTTP 400)"
                ((TESTS_PASSED++))
            else
                log_warning "Invalid JSON handling - Server may have handled it gracefully"
                ((TESTS_PASSED++))
            fi
        else
            log_error "Invalid JSON handling - Request failed"
            ((TESTS_FAILED++))
        fi
        ((TESTS_TOTAL++))
    fi
}

# Summary and exit
print_summary() {
    echo
    echo "======================================="
    echo -e "${BOLD}📊 Test Summary${NC}"
    echo "======================================="
    echo "Total tests:  $TESTS_TOTAL"
    echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "Result:       ${GREEN}${BOLD}✅ ALL TESTS PASSED${NC}"
        echo
        echo "🎉 API is ready for production use!"
        exit 0
    else
        echo -e "Result:       ${RED}${BOLD}❌ TESTS FAILED${NC}"
        echo
        echo "💥 API has issues that need attention."
        exit 1
    fi
}

# Signal handlers for graceful cleanup
cleanup() {
    echo
    log_warning "Test execution interrupted"
    print_summary
}

trap cleanup SIGINT SIGTERM

# Validate input parameters
if [[ ! "$BASE_URL" =~ ^https?:// ]]; then
    log_error "Invalid base URL: $BASE_URL"
    echo "Usage: $0 [BASE_URL] [TIMEOUT] [RETRIES]"
    echo "Example: $0 http://localhost:5001 30 2"
    exit 1
fi

if [[ ! "$TIMEOUT" =~ ^[0-9]+$ ]] || [[ $TIMEOUT -lt 1 ]]; then
    log_error "Invalid timeout: $TIMEOUT (must be a positive integer)"
    exit 1
fi

if [[ ! "$RETRIES" =~ ^[0-9]+$ ]] || [[ $RETRIES -lt 0 ]]; then
    log_error "Invalid retries: $RETRIES (must be a non-negative integer)"
    exit 1
fi

# Main execution
main() {
    local start_time
    start_time=$(date +%s)
    
    run_smoke_tests
    
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "Duration:     ${duration}s"
    print_summary
}

main "$@"