#!/bin/bash
set -euo pipefail

# MOBIUS API Smoke Tests
# Comprehensive API testing with retries, timeouts, and detailed logging
#
# Usage: ./scripts/ci/smoke-tests.sh [URL] [TIMEOUT] [RETRIES]
#
# Environment variables:
#   SMOKE_URL      - Base URL for API testing (default: http://localhost:5001)
#   SMOKE_TIMEOUT  - Timeout per request in seconds (default: 30)
#   SMOKE_RETRIES  - Number of retry attempts (default: 2)
#   SMOKE_VERBOSE  - Enable verbose output (default: false)

# === Configuration ===
SMOKE_URL="${1:-${SMOKE_URL:-http://localhost:5001}}"
SMOKE_TIMEOUT="${2:-${SMOKE_TIMEOUT:-30}}"
SMOKE_RETRIES="${3:-${SMOKE_RETRIES:-2}}"
SMOKE_VERBOSE="${SMOKE_VERBOSE:-false}"

# === Global Variables ===
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
START_TIME=$(date +%s)
LOG_FILE=""

# === Logging Functions ===
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date --iso-8601=seconds)
    
    echo "[$timestamp] [$level] $message"
    
    if [[ -n "$LOG_FILE" ]]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    fi
}

info() { log "INFO" "$@"; }
warn() { log "WARN" "$@"; }
error() { log "ERROR" "$@"; }
debug() { 
    if [[ "$SMOKE_VERBOSE" == "true" ]]; then
        log "DEBUG" "$@"; 
    fi
}

# === Utility Functions ===
check_dependencies() {
    local deps=("curl" "jq")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing[*]}"
        error "Please install: curl, jq"
        return 1
    fi
    
    debug "All dependencies satisfied: ${deps[*]}"
    return 0
}

wait_for_service() {
    local url="$1"
    local max_attempts=30
    local attempt=1
    
    info "Waiting for service at $url..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s --max-time 5 "$url/health" > /dev/null 2>&1; then
            info "Service is ready (attempt $attempt/$max_attempts)"
            return 0
        fi
        
        debug "Service not ready, attempt $attempt/$max_attempts"
        sleep 2
        ((attempt++))
    done
    
    error "Service failed to become ready after $max_attempts attempts"
    return 1
}

make_request() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    local expected_status="${4:-200}"
    local attempt=1
    
    while [[ $attempt -le $((SMOKE_RETRIES + 1)) ]]; do
        local curl_args=(
            -X "$method"
            -s
            --max-time "$SMOKE_TIMEOUT"
            -w "%{http_code}"
            -H "Content-Type: application/json"
            -H "Accept: application/json"
        )
        
        if [[ -n "$data" ]]; then
            curl_args+=(-d "$data")
        fi
        
        local url="$SMOKE_URL$endpoint"
        debug "Request attempt $attempt: $method $url" >&2
        
        local response
        if response=$(curl "${curl_args[@]}" "$url" 2>/dev/null); then
            # Extract HTTP status code (last 3 digits)
            local http_code="${response: -3}"
            local body="${response:0:-3}"
            
            debug "Response: HTTP $http_code, Body length: ${#body}" >&2
            
            if [[ "$http_code" == "$expected_status" ]]; then
                echo "$body"
                return 0
            else
                warn "Unexpected status code: $http_code (expected $expected_status)" >&2
                if [[ $attempt -le $SMOKE_RETRIES ]]; then
                    warn "Retrying in 1 second... (attempt $((attempt + 1)))" >&2
                    sleep 1
                fi
            fi
        else
            warn "Request failed: $response" >&2
            if [[ $attempt -le $SMOKE_RETRIES ]]; then
                warn "Retrying in 1 second... (attempt $((attempt + 1)))" >&2
                sleep 1
            fi
        fi
        
        ((attempt++))
    done
    
    error "Request failed after $((SMOKE_RETRIES + 1)) attempts" >&2
    return 1
}

run_test() {
    local test_name="$1"
    local test_function="$2"
    
    ((TEST_COUNT++))
    info "Running test: $test_name"
    debug "Executing function: $test_function"
    
    if $test_function; then
        ((PASS_COUNT++))
        info "✅ PASS: $test_name"
        return 0
    else
        ((FAIL_COUNT++))
        error "❌ FAIL: $test_name"
        return 1
    fi
}

# === Test Functions ===
test_health_check() {
    local response
    response=$(make_request "GET" "/health" "" "200") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        error "Health check response invalid: $response"
        return 1
    fi
    
    debug "Health check response valid"
    return 0
}

test_api_root() {
    local response
    response=$(make_request "GET" "/" "" "200") || return 1
    
    # Validate response has required fields
    if ! echo "$response" | jq -e '.message and .version and .status == "running"' > /dev/null 2>&1; then
        error "API root response invalid: $response"
        return 1
    fi
    
    debug "API root response valid"
    return 0
}

test_projects_list() {
    local response
    response=$(make_request "GET" "/api/projects" "" "200") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .projects and .count' > /dev/null 2>&1; then
        error "Projects list response invalid: $response"
        return 1
    fi
    
    debug "Projects list response valid"
    return 0
}

test_project_create() {
    local test_data='{"name":"Test Project","metadata":{"title":"Test Game"}}'
    local response
    response=$(make_request "POST" "/api/projects" "$test_data" "201") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .project.id and .project.name == "Test Project"' > /dev/null 2>&1; then
        error "Project create response invalid: $response"
        return 1
    fi
    
    debug "Project create response valid"
    return 0
}

test_project_get() {
    local response
    response=$(make_request "GET" "/api/projects/1" "" "200") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .project.id == 1' > /dev/null 2>&1; then
        error "Project get response invalid: $response"
        return 1
    fi
    
    debug "Project get response valid"
    return 0
}

test_bgg_metadata() {
    local test_data='{"url":"https://boardgamegeek.com/boardgame/12345/test-game"}'
    local response
    response=$(make_request "POST" "/api/extract-bgg-metadata" "$test_data" "200") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .metadata.title' > /dev/null 2>&1; then
        error "BGG metadata response invalid: $response"
        return 1
    fi
    
    debug "BGG metadata response valid"
    return 0
}

test_components_extraction() {
    local test_data='{"text":"The game includes 1 game board, 4 player pieces, and 52 cards."}'
    local response
    response=$(make_request "POST" "/api/extract-components" "$test_data" "200") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .components and (.components | length > 0)' > /dev/null 2>&1; then
        error "Components extraction response invalid: $response"
        return 1
    fi
    
    debug "Components extraction response valid"
    return 0
}

test_explain_chunk() {
    local test_data='{"text":"Each player draws 7 cards from the deck."}'
    local response
    response=$(make_request "POST" "/api/explain-chunk" "$test_data" "200") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .explanation.summary' > /dev/null 2>&1; then
        error "Explain chunk response invalid: $response"
        return 1
    fi
    
    debug "Explain chunk response valid"
    return 0
}

test_upload_simulation() {
    local response
    response=$(make_request "POST" "/api/upload-pdf" "" "200") || return 1
    
    # Validate response structure
    if ! echo "$response" | jq -e '.success == true and .file.filename' > /dev/null 2>&1; then
        error "Upload simulation response invalid: $response"
        return 1
    fi
    
    debug "Upload simulation response valid"
    return 0
}

test_error_handling() {
    local response
    response=$(make_request "GET" "/api/nonexistent" "" "404") || return 1
    
    # Validate error response structure
    if ! echo "$response" | jq -e '.error == "Not found"' > /dev/null 2>&1; then
        error "Error handling response invalid: $response"
        return 1
    fi
    
    debug "Error handling response valid"
    return 0
}

# === Performance Tests ===
test_response_times() {
    local endpoints=("/health" "/" "/api/projects")
    local max_response_time=5.0
    
    for endpoint in "${endpoints[@]}"; do
        local start_time=$(date +%s.%N)
        make_request "GET" "$endpoint" "" "200" > /dev/null || return 1
        local end_time=$(date +%s.%N)
        local response_time=$(echo "$end_time - $start_time" | bc -l)
        
        debug "Response time for $endpoint: ${response_time}s"
        
        if (( $(echo "$response_time > $max_response_time" | bc -l) )); then
            error "Response time too slow for $endpoint: ${response_time}s > ${max_response_time}s"
            return 1
        fi
    done
    
    debug "All response times within acceptable limits"
    return 0
}

# === Load Tests ===
test_concurrent_requests() {
    local concurrent_requests=5
    local pids=()
    
    info "Running $concurrent_requests concurrent requests..."
    
    for i in $(seq 1 $concurrent_requests); do
        (make_request "GET" "/health" "" "200" > /dev/null) &
        pids+=($!)
    done
    
    # Wait for all requests to complete
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            ((failed++))
        fi
    done
    
    if [[ $failed -gt 0 ]]; then
        error "$failed/$concurrent_requests concurrent requests failed"
        return 1
    fi
    
    debug "All $concurrent_requests concurrent requests succeeded"
    return 0
}

# === Main Test Runner ===
run_all_tests() {
    info "Starting MOBIUS API smoke tests"
    info "Target URL: $SMOKE_URL"
    info "Timeout: ${SMOKE_TIMEOUT}s"
    info "Retries: $SMOKE_RETRIES"
    
    # Basic functionality tests
    run_test "Health Check" test_health_check || true
    run_test "API Root" test_api_root || true
    run_test "Projects List" test_projects_list || true
    run_test "Project Create" test_project_create || true
    run_test "Project Get" test_project_get || true
    run_test "BGG Metadata" test_bgg_metadata || true
    run_test "Components Extraction" test_components_extraction || true
    run_test "Explain Chunk" test_explain_chunk || true
    run_test "Upload Simulation" test_upload_simulation || true
    run_test "Error Handling" test_error_handling || true
}

generate_report() {
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    
    info "========================="
    info "SMOKE TEST RESULTS"
    info "========================="
    info "Total Tests: $TEST_COUNT"
    info "Passed: $PASS_COUNT"
    info "Failed: $FAIL_COUNT"
    info "Skipped: $SKIP_COUNT"
    info "Duration: ${duration}s"
    info "Success Rate: $(( PASS_COUNT * 100 / TEST_COUNT ))%"
    
    if [[ $FAIL_COUNT -eq 0 ]]; then
        info "✅ All tests passed!"
        return 0
    else
        error "❌ Some tests failed!"
        return 1
    fi
}

# === Main Execution ===
main() {
    # Setup logging
    LOG_FILE="ci-run-logs/smoke-tests-$(date +%Y%m%d-%H%M%S).log"
    mkdir -p "$(dirname "$LOG_FILE")"
    
    info "MOBIUS API Smoke Tests starting..."
    info "Log file: $LOG_FILE"
    
    # Check dependencies
    if ! check_dependencies; then
        exit 2
    fi
    
    # Wait for service to be ready
    if ! wait_for_service "$SMOKE_URL"; then
        error "Service not available at $SMOKE_URL"
        exit 3
    fi
    
    # Run tests
    run_all_tests
    
    # Generate report
    if generate_report; then
        exit 0
    else
        exit 1
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi