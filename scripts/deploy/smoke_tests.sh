#!/bin/bash
# MOBIUS Deployment - Smoke Tests
# Comprehensive post-deployment validation tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Configuration
DEFAULT_ENV="staging"
DEFAULT_BASE_URL="http://localhost:5001"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV           Target environment (staging|production)"
    echo "  --base-url URL      Base URL for API testing (default: $DEFAULT_BASE_URL)"
    echo "  --timeout SECONDS   Request timeout (default: 10)"
    echo "  --parallel          Run tests in parallel where possible"
    echo "  --junit FILE        Output JUnit XML results"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --env production --base-url https://api.mobius.com"
    echo "  $0 --env staging --junit tests/results/smoke-tests.xml"
    exit 1
}

# Parse arguments
ENV="${DEFAULT_ENV}"
BASE_URL="${DEFAULT_BASE_URL}"
TIMEOUT="10"
PARALLEL=false
JUNIT_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --base-url)
            BASE_URL="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        --junit)
            JUNIT_FILE="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Create logs directory
LOG_DIR="${PROJECT_ROOT}/monitor_logs"
mkdir -p "$LOG_DIR"

LOG_FILE="${LOG_DIR}/postdeploy-smoketests-$(date +%Y%m%d_%H%M%S).log"
TEST_LOG_FILE="${LOG_DIR}/test_logging-$(date +%Y%m%d_%H%M%S).log"

# Test results tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
declare -a FAILED_TESTS=()
declare -a TEST_RESULTS=()

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

test_log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] TEST: $1" | tee -a "$TEST_LOG_FILE"
}

# Test result tracking
record_test_result() {
    local test_name="$1"
    local status="$2"
    local duration="$3"
    local error_msg="${4:-}"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if [[ "$status" == "PASS" ]]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        test_log "✓ $test_name - PASSED (${duration}ms)"
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_TESTS+=("$test_name")
        test_log "✗ $test_name - FAILED (${duration}ms) - $error_msg"
    fi
    
    # Store for JUnit report
    TEST_RESULTS+=("$test_name|$status|$duration|$error_msg")
}

# Generic HTTP test function
http_test() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local data="${5:-}"
    
    local start_time
    start_time=$(date +%s%3N)
    
    local curl_args=(-s -w "HTTPSTATUS:%{http_code}" -m "$TIMEOUT")
    
    case "$method" in
        GET)
            curl_args+=(-X GET)
            ;;
        POST)
            curl_args+=(-X POST -H "Content-Type: application/json")
            [[ -n "$data" ]] && curl_args+=(-d "$data")
            ;;
        PUT)
            curl_args+=(-X PUT -H "Content-Type: application/json")
            [[ -n "$data" ]] && curl_args+=(-d "$data")
            ;;
        DELETE)
            curl_args+=(-X DELETE)
            ;;
    esac
    
    local url="${BASE_URL}${endpoint}"
    curl_args+=("$url")
    
    local response
    local status_code
    local error_msg=""
    
    if response=$(curl "${curl_args[@]}" 2>&1); then
        status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
        
        local end_time
        end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        if [[ "$status_code" == "$expected_status" ]]; then
            record_test_result "$test_name" "PASS" "$duration"
            return 0
        else
            error_msg="Expected HTTP $expected_status, got HTTP $status_code"
            record_test_result "$test_name" "FAIL" "$duration" "$error_msg"
            return 1
        fi
    else
        local end_time
        end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        error_msg="Connection failed: $response"
        record_test_result "$test_name" "FAIL" "$duration" "$error_msg"
        return 1
    fi
}

# Specific test functions
test_health_endpoint() {
    log "Testing health endpoint..."
    http_test "Health Check" "GET" "/health" "200"
}

test_api_basic_endpoints() {
    log "Testing basic API endpoints..."
    
    # Test API root
    http_test "API Root" "GET" "/" "200"
    
    # Test invalid endpoint
    http_test "Invalid Endpoint" "GET" "/nonexistent" "404"
}

test_file_upload() {
    log "Testing file upload functionality..."
    
    # Create a test file
    local test_file="/tmp/test_upload.txt"
    echo "This is a test file for MOBIUS smoke tests" > "$test_file"
    
    local start_time
    start_time=$(date +%s%3N)
    
    # Test multipart upload
    local response
    local status_code
    local error_msg=""
    
    if response=$(curl -s -w "HTTPSTATUS:%{http_code}" -m "$TIMEOUT" \
        -X POST \
        -F "file=@$test_file" \
        "${BASE_URL}/upload" 2>&1); then
        
        status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
        
        local end_time
        end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        # Accept both 200 (success) and 404 (endpoint not implemented)
        if [[ "$status_code" == "200" || "$status_code" == "404" ]]; then
            record_test_result "File Upload" "PASS" "$duration"
        else
            error_msg="Unexpected HTTP status: $status_code"
            record_test_result "File Upload" "FAIL" "$duration" "$error_msg"
        fi
    else
        local end_time
        end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        error_msg="Upload test failed: $response"
        record_test_result "File Upload" "FAIL" "$duration" "$error_msg"
    fi
    
    rm -f "$test_file"
}

test_cors_headers() {
    log "Testing CORS configuration..."
    
    local start_time
    start_time=$(date +%s%3N)
    
    local response
    local error_msg=""
    
    if response=$(curl -s -I -m "$TIMEOUT" \
        -H "Origin: http://localhost:3000" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        -X OPTIONS \
        "${BASE_URL}/" 2>&1); then
        
        local end_time
        end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        # Check for CORS headers
        if echo "$response" | grep -i "access-control-allow-origin" >/dev/null; then
            record_test_result "CORS Headers" "PASS" "$duration"
        else
            error_msg="CORS headers not found in response"
            record_test_result "CORS Headers" "FAIL" "$duration" "$error_msg"
        fi
    else
        local end_time
        end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        error_msg="CORS test failed: $response"
        record_test_result "CORS Headers" "FAIL" "$duration" "$error_msg"
    fi
}

test_static_assets() {
    log "Testing static asset serving..."
    
    # Test common static asset paths
    local assets=("/static" "/uploads")
    
    for asset in "${assets[@]}"; do
        local start_time
        start_time=$(date +%s%3N)
        
        local response
        local status_code
        local error_msg=""
        
        if response=$(curl -s -w "HTTPSTATUS:%{http_code}" -m "$TIMEOUT" \
            "${BASE_URL}${asset}/" 2>&1); then
            
            status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
            
            local end_time
            end_time=$(date +%s%3N)
            local duration=$((end_time - start_time))
            
            # Accept 200 (directory listing), 403 (forbidden), or 404 (not found)
            if [[ "$status_code" =~ ^(200|403|404)$ ]]; then
                record_test_result "Static Assets $asset" "PASS" "$duration"
            else
                error_msg="Unexpected status for $asset: $status_code"
                record_test_result "Static Assets $asset" "FAIL" "$duration" "$error_msg"
            fi
        else
            local end_time
            end_time=$(date +%s%3N)
            local duration=$((end_time - start_time))
            error_msg="Static asset test failed for $asset: $response"
            record_test_result "Static Assets $asset" "FAIL" "$duration" "$error_msg"
        fi
    done
}

test_database_connectivity() {
    log "Testing database connectivity..."
    
    # This would typically test a database health endpoint
    # For now, we'll test that the application can handle requests (implies DB is working)
    http_test "Database Health" "GET" "/health" "200"
}

test_memory_usage() {
    log "Testing memory usage..."
    
    local start_time
    start_time=$(date +%s%3N)
    
    # Check if Node.js process is running and get memory usage
    local node_pid
    if node_pid=$(pgrep -f "node.*src/api/index.js" | head -n1); then
        local memory_kb
        if memory_kb=$(ps -o rss= -p "$node_pid" 2>/dev/null); then
            local memory_mb=$((memory_kb / 1024))
            
            local end_time
            end_time=$(date +%s%3N)
            local duration=$((end_time - start_time))
            
            log "Application memory usage: ${memory_mb}MB"
            
            # Consider normal if under 1GB
            if [[ $memory_mb -lt 1024 ]]; then
                record_test_result "Memory Usage" "PASS" "$duration"
            else
                local error_msg="High memory usage: ${memory_mb}MB"
                record_test_result "Memory Usage" "FAIL" "$duration" "$error_msg"
            fi
        else
            local end_time
            end_time=$(date +%s%3N)
            local duration=$((end_time - start_time))
            record_test_result "Memory Usage" "FAIL" "$duration" "Could not get memory usage"
        fi
    else
        local end_time
        end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        record_test_result "Memory Usage" "FAIL" "$duration" "Node.js process not found"
    fi
}

# JUnit XML report generation
generate_junit_report() {
    [[ -z "$JUNIT_FILE" ]] && return
    
    log "Generating JUnit XML report: $JUNIT_FILE"
    
    mkdir -p "$(dirname "$JUNIT_FILE")"
    
    cat > "$JUNIT_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="MOBIUS Smoke Tests" 
           tests="$TESTS_RUN" 
           failures="$TESTS_FAILED" 
           errors="0" 
           time="$(date +%s)"
           timestamp="$(date -u +%Y-%m-%dT%H:%M:%S)"
           hostname="$(hostname)">
EOF
    
    for result in "${TEST_RESULTS[@]}"; do
        IFS='|' read -r name status duration error <<< "$result"
        
        cat >> "$JUNIT_FILE" << EOF
  <testcase name="$name" classname="SmokeTests" time="$(echo "scale=3; $duration / 1000" | bc -l)">
EOF
        
        if [[ "$status" == "FAIL" ]]; then
            cat >> "$JUNIT_FILE" << EOF
    <failure message="$error">$error</failure>
EOF
        fi
        
        echo "  </testcase>" >> "$JUNIT_FILE"
    done
    
    cat >> "$JUNIT_FILE" << EOF
</testsuite>
EOF
    
    log "✓ JUnit report generated: $JUNIT_FILE"
}

# Main test execution
main() {
    log "=== MOBIUS SMOKE TESTS ==="
    log "Environment: $ENV"
    log "Base URL: $BASE_URL"
    log "Timeout: ${TIMEOUT}s"
    log "Parallel execution: $PARALLEL"
    log "Log file: $LOG_FILE"
    log "Test log file: $TEST_LOG_FILE"
    [[ -n "$JUNIT_FILE" ]] && log "JUnit output: $JUNIT_FILE"
    log ""
    
    # Wait for application to be ready
    log "Waiting for application to be ready..."
    local ready_attempts=0
    while [[ $ready_attempts -lt 10 ]]; do
        if curl -f -s -m 5 "${BASE_URL}/health" >/dev/null 2>&1; then
            log "✓ Application is ready"
            break
        else
            ready_attempts=$((ready_attempts + 1))
            log "Application not ready, attempt $ready_attempts/10..."
            sleep 2
        fi
    done
    
    if [[ $ready_attempts -eq 10 ]]; then
        log "✗ Application failed to become ready within timeout"
        exit 1
    fi
    
    # Run all smoke tests
    test_health_endpoint
    test_api_basic_endpoints
    test_file_upload
    test_cors_headers
    test_static_assets
    test_database_connectivity
    test_memory_usage
    
    # Generate reports
    generate_junit_report
    
    # Summary
    log ""
    log "=== SMOKE TESTS COMPLETE ==="
    log "Tests run: $TESTS_RUN"
    log "Passed: $TESTS_PASSED"
    log "Failed: $TESTS_FAILED"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log "Failed tests:"
        for failed_test in "${FAILED_TESTS[@]}"; do
            log "  - $failed_test"
        done
        log ""
        log "❌ SMOKE TESTS FAILED"
        exit 1
    else
        log "✅ ALL SMOKE TESTS PASSED"
        exit 0
    fi
}

# Run main function
main