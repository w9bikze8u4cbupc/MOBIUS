#!/bin/bash

# dhash Smoke Tests
# Usage: ./scripts/smoke_tests.sh [--env production|staging|canary] [--timeout SECONDS]

set -euo pipefail

# Default values
ENVIRONMENT="staging"
TIMEOUT=30
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] SMOKE:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--env production|staging|canary] [--timeout SECONDS]"
            echo ""
            echo "Options:"
            echo "  --env ENV        Target environment (production, staging, canary)"
            echo "  --timeout SEC    Timeout for each test in seconds (default: 30)"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Load configuration
CONFIG_FILE="$ROOT_DIR/quality-gates-config.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Extract configuration using Node.js
BASE_URL=$(node -pe "require('$CONFIG_FILE').environments.$ENVIRONMENT.base_url")

if [[ "$BASE_URL" == "undefined" ]]; then
    error "Configuration for environment '$ENVIRONMENT' not found in $CONFIG_FILE"
    exit 1
fi

log "Starting dhash smoke tests for $ENVIRONMENT environment"
log "Target URL: $BASE_URL"
log "Test timeout: ${TIMEOUT}s"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    log "Running test: $test_name"
    
    if timeout "$TIMEOUT" bash -c "$test_command"; then
        success "✅ $test_name: PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        error "❌ $test_name: FAILED"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Test 1: Health Check
test_health_check() {
    local health_url="$BASE_URL/health"
    
    curl -s --max-time "$TIMEOUT" "$health_url" | grep -q "ok\|healthy\|UP" || {
        # If grep fails, check HTTP status code
        local status_code
        status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$health_url")
        [[ "$status_code" == "200" ]]
    }
}

# Test 2: API Availability
test_api_availability() {
    local api_url="$BASE_URL/api/v1"
    
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$api_url")
    [[ "$status_code" =~ ^[23][0-9][0-9]$ ]]
}

# Test 3: Hash Endpoint Basic Functionality
test_hash_endpoint() {
    local hash_url="$BASE_URL/api/v1/hash"
    local test_data='{"data":"test-data-for-smoke-test"}'
    
    local response
    response=$(curl -s --max-time "$TIMEOUT" -X POST \
        -H "Content-Type: application/json" \
        -d "$test_data" \
        "$hash_url")
    
    # Check if response contains hash field
    echo "$response" | grep -q '"hash":\s*"[a-fA-F0-9]'
}

# Test 4: Metrics Endpoint
test_metrics_endpoint() {
    local metrics_url="$BASE_URL/metrics"
    
    local response
    response=$(curl -s --max-time "$TIMEOUT" "$metrics_url")
    
    # Check if response contains typical metrics
    echo "$response" | grep -qE "(extraction_failures|hash_performance|queue_status|http_requests_total)"
}

# Test 5: Database Connectivity
test_database_connectivity() {
    local db_health_url="$BASE_URL/health/db"
    
    # Try database health endpoint, fall back to general health
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$db_health_url")
    
    if [[ "$status_code" == "404" ]]; then
        # Fallback: check if general health includes DB status
        local response
        response=$(curl -s --max-time "$TIMEOUT" "$BASE_URL/health")
        echo "$response" | grep -qiE "(database|db).*ok|ok.*database"
    else
        [[ "$status_code" == "200" ]]
    fi
}

# Test 6: Queue System Health
test_queue_health() {
    local queue_url="$BASE_URL/api/v1/queue/status"
    
    local response
    response=$(curl -s --max-time "$TIMEOUT" "$queue_url")
    
    # Check if queue is responding (any JSON response is good)
    echo "$response" | python -m json.tool >/dev/null 2>&1
}

# Test 7: Authentication/Authorization (if applicable)
test_auth_endpoints() {
    local auth_url="$BASE_URL/api/v1/auth"
    
    # This should return 401 or 403 for unauthenticated requests
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$auth_url")
    
    # Accept various auth-related status codes
    [[ "$status_code" =~ ^(200|401|403|404)$ ]]
}

# Test 8: Load Balancer/Reverse Proxy Health
test_load_balancer() {
    local lb_headers
    lb_headers=$(curl -s -I --max-time "$TIMEOUT" "$BASE_URL")
    
    # Check for common load balancer headers or successful response
    echo "$lb_headers" | grep -qiE "(HTTP/[12].[01] 200|server:|x-forwarded|x-real-ip)" || {
        # If no LB headers found, at least check we got a response
        echo "$lb_headers" | grep -q "HTTP"
    }
}

# Test 9: Static Assets (if applicable)
test_static_assets() {
    local static_url="$BASE_URL/static"
    
    # Check if static assets are accessible (200 or 404 is fine, 500 is not)
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$static_url")
    
    [[ ! "$status_code" =~ ^5[0-9][0-9]$ ]]
}

# Test 10: Basic Performance Check
test_basic_performance() {
    local start_time
    local end_time
    local duration
    
    start_time=$(date +%s%N)
    curl -s --max-time "$TIMEOUT" "$BASE_URL/health" >/dev/null
    end_time=$(date +%s%N)
    
    duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    # Response should be under 5 seconds (5000ms)
    [[ $duration -lt 5000 ]]
}

# Run all smoke tests
run_all_tests() {
    log "=== Starting Smoke Tests ==="
    
    # Core functionality tests
    run_test "Health Check" "test_health_check"
    run_test "API Availability" "test_api_availability"
    run_test "Hash Endpoint" "test_hash_endpoint"
    run_test "Metrics Endpoint" "test_metrics_endpoint"
    
    # Infrastructure tests
    run_test "Database Connectivity" "test_database_connectivity"
    run_test "Queue System Health" "test_queue_health"
    run_test "Load Balancer Health" "test_load_balancer"
    
    # Optional tests (may fail without affecting overall result)
    run_test "Authentication Endpoints" "test_auth_endpoints" || warn "Auth test failed (may be expected)"
    run_test "Static Assets" "test_static_assets" || warn "Static assets test failed (may not be configured)"
    
    # Performance test
    run_test "Basic Performance" "test_basic_performance"
}

# Main execution
main() {
    log "=== dhash Smoke Tests Start ==="
    log "Environment: $ENVIRONMENT"
    log "Target: $BASE_URL"
    log "Timestamp: $(date -Iseconds)"
    
    run_all_tests
    
    log "=== Smoke Tests Summary ==="
    log "Total tests: $TOTAL_TESTS"
    log "Passed: $PASSED_TESTS"
    log "Failed: $FAILED_TESTS"
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        success "=== All Smoke Tests Passed ==="
        success "dhash $ENVIRONMENT environment is healthy"
    else
        error "=== Smoke Tests Failed ==="
        error "$FAILED_TESTS out of $TOTAL_TESTS tests failed"
        
        if [[ $FAILED_TESTS -gt $((TOTAL_TESTS / 2)) ]]; then
            error "More than 50% of tests failed - system may be seriously degraded"
            exit 1
        else
            warn "Some tests failed but system appears partially functional"
            exit 1
        fi
    fi
}

# Execute main function
main "$@"