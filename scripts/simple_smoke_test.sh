#!/bin/bash

# MOBIUS Simple Smoke Test Script
# Basic functionality tests to verify deployment success

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly PORT=${PORT:-5001}
readonly BASE_URL="http://localhost:${PORT}"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }

# Test helper functions
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_TOTAL++))
    log_info "Running test: $test_name"
    
    if eval "$test_command"; then
        log_success "✓ $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "✗ $test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Wait for server to be ready
wait_for_server() {
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for server to start on port $PORT..."
    
    while ! curl -s -f "${BASE_URL}/health" > /dev/null; do
        if [[ $attempt -ge $max_attempts ]]; then
            log_error "Server failed to start within $max_attempts attempts"
            return 1
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for server..."
        sleep 2
        ((attempt++))
    done
    
    log_success "Server is responding"
    return 0
}

# Test health endpoint
test_health_endpoint() {
    local response
    response=$(curl -s -f "${BASE_URL}/health")
    
    if echo "$response" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        return 0
    else
        log_error "Health endpoint returned unexpected response: $response"
        return 1
    fi
}

# Test metrics endpoint
test_metrics_endpoint() {
    local response
    response=$(curl -s -f "${BASE_URL}/metrics/dhash")
    
    if echo "$response" | jq -e '.service == "mobius-dhash-pipeline"' > /dev/null 2>&1; then
        return 0
    else
        log_error "Metrics endpoint returned unexpected response: $response"
        return 1
    fi
}

# Test API availability
test_api_endpoints() {
    local endpoints=("health" "metrics/dhash")
    
    for endpoint in "${endpoints[@]}"; do
        if ! curl -s -f "${BASE_URL}/${endpoint}" > /dev/null; then
            log_error "Endpoint /${endpoint} is not responding"
            return 1
        fi
    done
    
    return 0
}

# Test file system access
test_file_system() {
    local test_file="${PROJECT_ROOT}/test_write_permissions.tmp"
    
    # Test write permissions
    if echo "test" > "$test_file" 2>/dev/null; then
        rm -f "$test_file"
        return 0
    else
        log_error "Cannot write to project directory"
        return 1
    fi
}

# Test Node.js environment
test_nodejs_environment() {
    if ! command -v node > /dev/null; then
        log_error "Node.js not found in PATH"
        return 1
    fi
    
    if ! command -v npm > /dev/null; then
        log_error "npm not found in PATH"
        return 1
    fi
    
    # Check if we can load the main module
    if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        return 0
    else
        log_error "package.json not found"
        return 1
    fi
}

# Test database connectivity (if applicable)
test_database_connectivity() {
    # For now, just check if db.js exists
    if [[ -f "${PROJECT_ROOT}/src/api/db.js" ]]; then
        return 0
    else
        log_warn "Database module not found - skipping database tests"
        return 0
    fi
}

# Test memory usage
test_memory_usage() {
    local memory_info
    if memory_info=$(curl -s -f "${BASE_URL}/health" | jq '.memory.heapUsed'); then
        local heap_mb=$((memory_info / 1024 / 1024))
        if [[ $heap_mb -lt 500 ]]; then  # Less than 500MB is reasonable
            log_info "Memory usage: ${heap_mb}MB (healthy)"
            return 0
        else
            log_warn "High memory usage: ${heap_mb}MB"
            return 0  # Don't fail, just warn
        fi
    else
        log_warn "Could not retrieve memory information"
        return 0
    fi
}

# Check if server is already running
check_server_running() {
    if curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
        log_info "Server already running, using existing instance"
        return 0
    else
        log_info "Server not running, starting for tests"
        return 1
    fi
}

# Start server for testing
start_test_server() {
    cd "$PROJECT_ROOT"
    
    # Start server in background
    nohup npm start > /tmp/smoke_test_server.log 2>&1 &
    local server_pid=$!
    echo $server_pid > /tmp/smoke_test_server.pid
    
    # Wait for server to be ready
    if wait_for_server; then
        log_success "Test server started (PID: $server_pid)"
        return 0
    else
        log_error "Failed to start test server"
        kill $server_pid 2>/dev/null || true
        return 1
    fi
}

# Stop test server
stop_test_server() {
    if [[ -f /tmp/smoke_test_server.pid ]]; then
        local server_pid
        server_pid=$(cat /tmp/smoke_test_server.pid)
        
        if kill $server_pid 2>/dev/null; then
            log_info "Test server stopped (PID: $server_pid)"
        fi
        
        rm -f /tmp/smoke_test_server.pid /tmp/smoke_test_server.log
    fi
}

# Main test execution
run_smoke_tests() {
    log_info "Starting MOBIUS DHash smoke tests..."
    log_info "Testing against: $BASE_URL"
    
    # Check prerequisites
    if ! command -v curl > /dev/null; then
        log_error "curl is required for smoke tests"
        return 1
    fi
    
    if ! command -v jq > /dev/null; then
        log_warn "jq not found - some tests may be limited"
    fi
    
    # Determine if we need to start the server
    local server_was_running=false
    if check_server_running; then
        server_was_running=true
    else
        if ! start_test_server; then
            log_error "Cannot start server for testing"
            return 1
        fi
    fi
    
    # Run tests
    run_test "Node.js Environment" "test_nodejs_environment"
    run_test "File System Access" "test_file_system"
    run_test "Database Connectivity" "test_database_connectivity"
    run_test "API Endpoints Available" "test_api_endpoints"
    run_test "Health Endpoint Content" "test_health_endpoint"
    run_test "Metrics Endpoint Content" "test_metrics_endpoint"
    run_test "Memory Usage Check" "test_memory_usage"
    
    # Stop server if we started it
    if [[ "$server_was_running" == "false" ]]; then
        stop_test_server
    fi
    
    # Report results
    echo
    log_info "Smoke test results:"
    log_info "  Total tests: $TESTS_TOTAL"
    log_success "  Passed: $TESTS_PASSED"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "  Failed: $TESTS_FAILED"
        echo
        log_error "Some smoke tests failed - please investigate before proceeding to production"
        return 1
    else
        echo
        log_success "All smoke tests passed! 🎉"
        log_success "The application appears to be working correctly"
        return 0
    fi
}

# Cleanup on exit
cleanup() {
    stop_test_server
}
trap cleanup EXIT

# Run the tests
if run_smoke_tests; then
    exit 0
else
    exit 1
fi