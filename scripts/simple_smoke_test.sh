#!/bin/bash
set -uo pipefail

# Simplified DHash Smoke Test Script

# Configuration
DEFAULT_BASE_URL="http://localhost:3000"
BASE_URL=""
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }

# Usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Simple smoke tests for DHash deployment.

Options:
  -u, --url URL     Base URL (default: $DEFAULT_BASE_URL)
  -v, --verbose     Verbose output
  -h, --help        Show help

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url) BASE_URL="$2"; shift 2 ;;
        -v|--verbose) VERBOSE=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
done

# Set default URL
BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"

log_info "Starting simple DHash smoke tests"
log_info "Target URL: $BASE_URL"

# Test variables
tests_passed=0
tests_failed=0

# Test health endpoint
log_info "Testing health endpoint..."
if curl -sf "$BASE_URL/health" >/dev/null; then
    response=$(curl -s "$BASE_URL/health")
    if echo "$response" | jq -e '.status' >/dev/null 2>&1; then
        status=$(echo "$response" | jq -r '.status')
        if [[ "$status" == "healthy" ]]; then
            log_success "✅ Health endpoint: Service is healthy"
            ((tests_passed++))
        else
            log_error "❌ Health endpoint: Service status is $status"
            ((tests_failed++))
        fi
    else
        log_success "✅ Health endpoint: Responded with 200 OK"
        ((tests_passed++))
    fi
else
    log_error "❌ Health endpoint: Failed to connect"
    ((tests_failed++))
fi

# Test metrics endpoint
log_info "Testing metrics endpoint..."
if response=$(curl -s "$BASE_URL/metrics/dhash" 2>/dev/null) && [[ -n "$response" ]]; then
    if echo "$response" | jq -e '.dhash' >/dev/null 2>&1; then
        log_success "✅ Metrics endpoint: DHash metrics available"
        ((tests_passed++))
    else
        log_success "✅ Metrics endpoint: Responded with data"
        ((tests_passed++))
    fi
else
    log_error "❌ Metrics endpoint: Failed to connect or get response"
    ((tests_failed++))
fi

# Test DHash file if it exists
if [[ -f "test-library.dhash.json" ]]; then
    log_info "Testing DHash file validation..."
    if jq empty "test-library.dhash.json" 2>/dev/null; then
        if jq -e '.metadata and .library and .checksums' "test-library.dhash.json" >/dev/null 2>&1; then
            log_success "✅ DHash file: Structure is valid"
            ((tests_passed++))
        else
            log_error "❌ DHash file: Missing required fields"
            ((tests_failed++))
        fi
    else
        log_error "❌ DHash file: Invalid JSON"
        ((tests_failed++))
    fi
else
    log_info "No DHash file found, skipping validation"
fi

# Summary
echo
log_info "=== SMOKE TEST SUMMARY ==="
log_info "Tests run: $((tests_passed + tests_failed))"
log_success "Passed: $tests_passed"
if [[ $tests_failed -gt 0 ]]; then
    log_error "Failed: $tests_failed"
    echo
    log_error "Some smoke tests failed! ❌"
    exit 1
else
    log_info "Failed: $tests_failed"
    echo
    log_success "All smoke tests passed! ✅"
    exit 0
fi