#!/usr/bin/env bash
#
# smoke-tests.sh — Container smoke tests with retries, health checks, and detailed logs
#
# Usage:
#   ./scripts/ci/smoke-tests.sh <BASE_URL> <TIMEOUT_SEC> <RETRIES>
#
# Example:
#   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
#
# This script:
# - Checks if the service is reachable
# - Validates health endpoint responds correctly
# - Tests basic API functionality
# - Retries on failure with exponential backoff
# - Outputs detailed logs and proper exit codes

set -euo pipefail

# Configuration
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
}

# Wait for service to be ready
wait_for_service() {
    local url="$1"
    local timeout="$2"
    local elapsed=0
    local sleep_interval=2
    
    log_info "Waiting for service at $url (timeout: ${timeout}s)..."
    
    while [ $elapsed -lt "$timeout" ]; do
        if curl -sf -o /dev/null "$url" 2>/dev/null; then
            log_success "Service is reachable"
            return 0
        fi
        
        sleep $sleep_interval
        elapsed=$((elapsed + sleep_interval))
        
        if [ $((elapsed % 10)) -eq 0 ]; then
            log_info "Still waiting... (${elapsed}s elapsed)"
        fi
    done
    
    log_error "Service not reachable after ${timeout}s"
    return 1
}

# Test health endpoint
test_health() {
    local url="${BASE_URL}/health"
    local attempt=1
    local max_attempts=$((RETRIES + 1))
    
    log_info "Testing health endpoint: $url"
    
    while [ $attempt -le $max_attempts ]; do
        if [ $attempt -gt 1 ]; then
            local backoff=$((2 ** (attempt - 1)))
            log_warn "Retry $((attempt - 1))/$RETRIES after ${backoff}s..."
            sleep $backoff
        fi
        
        # Try to fetch health endpoint
        if response=$(curl -sf "$url" 2>&1); then
            log_success "Health check passed"
            log_info "Response: $response"
            return 0
        else
            log_warn "Health check failed (attempt $attempt/$max_attempts)"
        fi
        
        attempt=$((attempt + 1))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Test basic API endpoint
test_api_basic() {
    local url="${BASE_URL}/"
    local attempt=1
    local max_attempts=$((RETRIES + 1))
    
    log_info "Testing basic API endpoint: $url"
    
    while [ $attempt -le $max_attempts ]; do
        if [ $attempt -gt 1 ]; then
            local backoff=$((2 ** (attempt - 1)))
            log_warn "Retry $((attempt - 1))/$RETRIES after ${backoff}s..."
            sleep $backoff
        fi
        
        # Get HTTP status code
        if status_code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>&1); then
            if [ "$status_code" = "200" ] || [ "$status_code" = "404" ]; then
                log_success "API responded with status $status_code"
                return 0
            else
                log_warn "API returned status $status_code (attempt $attempt/$max_attempts)"
            fi
        else
            log_warn "API request failed (attempt $attempt/$max_attempts)"
        fi
        
        attempt=$((attempt + 1))
    done
    
    log_error "API test failed after $max_attempts attempts"
    return 1
}

# Test container is running (if docker is available)
test_container_status() {
    if ! command -v docker &> /dev/null; then
        log_warn "Docker not available, skipping container status check"
        return 0
    fi
    
    log_info "Checking container status..."
    
    # Check if any containers are running
    if running_containers=$(docker ps --format "{{.Names}}" 2>/dev/null); then
        if [ -n "$running_containers" ]; then
            log_success "Found running containers:"
            echo "$running_containers" | while read -r container; do
                log_info "  - $container"
            done
            return 0
        else
            log_warn "No running containers found"
            return 0
        fi
    else
        log_warn "Could not check container status"
        return 0
    fi
}

# Main test execution
main() {
    local failed=0
    
    echo "========================================"
    echo "  MOBIUS Smoke Tests"
    echo "========================================"
    echo
    log_info "Configuration:"
    log_info "  Base URL: $BASE_URL"
    log_info "  Timeout: ${TIMEOUT}s"
    log_info "  Retries: $RETRIES"
    echo
    
    # Test 1: Wait for service
    if ! wait_for_service "$BASE_URL" "$TIMEOUT"; then
        failed=$((failed + 1))
        log_error "Service not available"
    fi
    
    echo
    
    # Test 2: Health check
    if ! test_health; then
        failed=$((failed + 1))
    fi
    
    echo
    
    # Test 3: Basic API
    if ! test_api_basic; then
        failed=$((failed + 1))
    fi
    
    echo
    
    # Test 4: Container status
    if ! test_container_status; then
        # Non-critical, don't increment failed
        log_warn "Container status check was inconclusive"
    fi
    
    echo
    echo "========================================"
    
    if [ $failed -eq 0 ]; then
        log_success "All smoke tests passed!"
        echo "========================================"
        return 0
    else
        log_error "$failed test(s) failed"
        echo "========================================"
        echo
        log_error "Troubleshooting:"
        log_error "  1. Check if containers are running: docker ps"
        log_error "  2. Check container logs: docker compose -f docker-compose.staging.yml logs"
        log_error "  3. Check if ports are available: netstat -an | grep 5001"
        log_error "  4. Increase timeout or adjust health check settings"
        echo
        return 1
    fi
}

# Run main and capture exit code
if main; then
    exit 0
else
    exit 1
fi
