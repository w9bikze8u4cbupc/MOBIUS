#!/bin/bash
# Comprehensive smoke test runner for MOBIUS CI API
# Usage: ./scripts/ci/smoke-tests.sh [BASE_URL] [TIMEOUT] [RETRIES]
# Example: ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

set -euo pipefail

# Default values
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if jq is available, fallback to basic JSON parsing
check_jq() {
    if command -v jq &> /dev/null; then
        echo "jq"
    else
        log_warning "jq not found, using fallback JSON parsing"
        echo "fallback"
    fi
}

# JSON parsing functions
parse_json() {
    local json="$1"
    local key="$2"
    local parser="$3"
    
    if [[ "$parser" == "jq" ]]; then
        echo "$json" | jq -r ".$key // \"null\"" 2>/dev/null || echo "null"
    else
        # Fallback: basic grep/sed parsing
        echo "$json" | grep -o "\"$key\":[^,}]*" | sed 's/.*://' | sed 's/[",]//g' | head -1
    fi
}

# HTTP request function with retries and timeout
make_request() {
    local method="$1"
    local url="$2"
    local data="${3:-}"
    local expected_status="${4:-200}"
    local retry_count=0
    
    while [[ $retry_count -le $RETRIES ]]; do
        local response
        local status_code
        
        if [[ "$method" == "GET" ]]; then
            response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo -e "\n000")
        elif [[ "$method" == "POST" ]]; then
            response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$url" 2>/dev/null || echo -e "\n000")
        fi
        
        status_code=$(echo "$response" | tail -n1)
        response_body=$(echo "$response" | sed '$d')
        
        if [[ "$status_code" == "$expected_status" ]]; then
            echo "$response_body"
            return 0
        else
            if [[ $retry_count -eq $RETRIES ]]; then
                log_error "All retries exhausted for $url (status: $status_code, expected: $expected_status)"
                return 1
            fi
            retry_count=$((retry_count + 1))
            sleep 2
        fi
    done
}

# Wait for service to be ready
wait_for_service() {
    log_info "Waiting for service at $BASE_URL to be ready..."
    local wait_count=0
    local max_wait=30
    
    while [[ $wait_count -lt $max_wait ]]; do
        if curl -s --max-time 5 "$BASE_URL/health" > /dev/null 2>&1; then
            log_success "Service is ready"
            return 0
        fi
        log_info "Waiting for service... ($((wait_count + 1))/$max_wait)"
        sleep 2
        wait_count=$((wait_count + 1))
    done
    
    log_error "Service did not become ready within $((max_wait * 2)) seconds"
    return 1
}

# Test functions
test_health_endpoint() {
    log_info "Testing /health endpoint..."
    
    local response
    response=$(make_request "GET" "$BASE_URL/health" "" "200")
    if [[ $? -ne 0 ]]; then
        log_error "Health check failed"
        return 1
    fi
    
    local parser
    parser=$(check_jq)
    
    local status
    local mode
    local service
    status=$(parse_json "$response" "status" "$parser")
    mode=$(parse_json "$response" "mode" "$parser")
    service=$(parse_json "$response" "service" "$parser")
    
    # Validate response structure
    if [[ "$status" != "healthy" ]]; then
        log_error "Expected status 'healthy', got '$status'"
        return 1
    fi
    
    if [[ "$mode" != "mock" ]]; then
        log_error "Expected mode 'mock', got '$mode'"
        return 1
    fi
    
    if [[ "$service" != "mobius-api-ci" ]]; then
        log_error "Expected service 'mobius-api-ci', got '$service'"
        return 1
    fi
    
    log_success "Health endpoint validation passed"
    return 0
}

test_ready_endpoint() {
    log_info "Testing /ready endpoint..."
    
    local response
    response=$(make_request "GET" "$BASE_URL/ready" "" "200")
    if [[ $? -ne 0 ]]; then
        log_error "Ready check failed"
        return 1
    fi
    
    local parser
    parser=$(check_jq)
    
    local status
    status=$(parse_json "$response" "status" "$parser")
    
    if [[ "$status" != "ready" ]]; then
        log_error "Expected status 'ready', got '$status'"
        return 1
    fi
    
    # Check if memory metrics are present
    if [[ "$response" != *"memory"* ]]; then
        log_error "Memory metrics not found in ready response"
        return 1
    fi
    
    log_success "Ready endpoint validation passed"
    return 0
}

test_api_info_endpoint() {
    log_info "Testing /api/info endpoint..."
    
    local response
    response=$(make_request "GET" "$BASE_URL/api/info" "" "200")
    if [[ $? -ne 0 ]]; then
        log_error "API info check failed"
        return 1
    fi
    
    # Check for expected keys in response
    if [[ "$response" != *"endpoints"* ]]; then
        log_error "Endpoints information not found in API info response"
        return 1
    fi
    
    if [[ "$response" != *"version"* ]]; then
        log_error "Version information not found in API info response"
        return 1
    fi
    
    log_success "API info endpoint validation passed"
    return 0
}

test_echo_endpoint() {
    log_info "Testing /api/echo endpoint..."
    
    local test_data='{"test": "data", "timestamp": "2024-01-01T00:00:00Z", "number": 42}'
    
    local response
    response=$(make_request "POST" "$BASE_URL/api/echo" "$test_data" "200")
    if [[ $? -ne 0 ]]; then
        log_error "Echo endpoint check failed"
        return 1
    fi
    
    # Check if request body was echoed back
    if [[ "$response" != *"\"test\""* ]] || [[ "$response" != *"\"data\""* ]]; then
        log_error "Request body not properly echoed back"
        return 1
    fi
    
    # Check for echo metadata
    if [[ "$response" != *"echo"* ]]; then
        log_error "Echo metadata not found in response"
        return 1
    fi
    
    log_success "Echo endpoint validation passed"
    return 0
}

test_404_handling() {
    log_info "Testing 404 error handling..."
    
    local response
    response=$(make_request "GET" "$BASE_URL/nonexistent" "" "404")
    if [[ $? -ne 0 ]]; then
        log_error "404 handling test failed"
        return 1
    fi
    
    if [[ "$response" != *"Not Found"* ]]; then
        log_error "Expected 'Not Found' in 404 response"
        return 1
    fi
    
    log_success "404 handling validation passed"
    return 0
}

# Performance test
test_performance() {
    log_info "Running basic performance test..."
    
    local start_time
    start_time=$(date +%s%N)
    
    for i in {1..10}; do
        make_request "GET" "$BASE_URL/health" "" "200" > /dev/null
        if [[ $? -ne 0 ]]; then
            log_error "Performance test failed on request $i"
            return 1
        fi
    done
    
    local end_time
    end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    log_success "Performance test completed: 10 requests in ${duration}ms"
    
    if [[ $duration -gt 5000 ]]; then # 5 seconds threshold
        log_warning "Performance test took longer than expected: ${duration}ms"
    fi
    
    return 0
}

# Main execution
main() {
    log_info "Starting MOBIUS CI API smoke tests"
    log_info "Base URL: $BASE_URL"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Retries: $RETRIES"
    
    local test_results=()
    local failed_tests=0
    
    # Wait for service
    wait_for_service
    if [[ $? -ne 0 ]]; then
        log_error "Service readiness check failed"
        exit 1
    fi
    
    # Run tests
    declare -a tests=(
        "test_health_endpoint"
        "test_ready_endpoint"
        "test_api_info_endpoint"
        "test_echo_endpoint"
        "test_404_handling"
        "test_performance"
    )
    
    for test in "${tests[@]}"; do
        if $test; then
            test_results+=("✅ $test")
        else
            test_results+=("❌ $test")
            failed_tests=$((failed_tests + 1))
        fi
    done
    
    # Print results summary
    echo
    log_info "Test Results Summary:"
    for result in "${test_results[@]}"; do
        echo "  $result"
    done
    
    echo
    if [[ $failed_tests -eq 0 ]]; then
        log_success "All smoke tests passed! ✨"
        exit 0
    else
        log_error "$failed_tests test(s) failed"
        exit 1
    fi
}

# Run main function
main "$@"