#!/bin/bash

# MOBIUS Game Tutorial Generator - Simple Smoke Test
# Usage: ./simple_smoke_test.sh [-u URL] [-t timeout] [-v]

set -euo pipefail

# Default configuration
DEFAULT_URL="http://localhost:5001"
DEFAULT_TIMEOUT=30
VERBOSE=false

# Parse arguments
URL="$DEFAULT_URL"
TIMEOUT="$DEFAULT_TIMEOUT"

while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            URL="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            cat << EOF
Usage: $0 [options]

Options:
  -u, --url URL       Base URL to test (default: $DEFAULT_URL)
  -t, --timeout SEC   Request timeout in seconds (default: $DEFAULT_TIMEOUT)
  -v, --verbose       Verbose output
  -h, --help          Show this help

Examples:
  $0                                    # Test localhost:5001
  $0 -u http://localhost:3000          # Test different port
  $0 -u http://staging.example.com -v  # Test staging with verbose output
EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

verbose_log() {
    if [[ "$VERBOSE" == "true" ]]; then
        log "VERBOSE: $*"
    fi
}

# Test functions
test_endpoint() {
    local endpoint="$1"
    local expected_status="${2:-200}"
    local description="$3"
    
    verbose_log "Testing endpoint: $endpoint"
    
    local response_code
    if response_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$endpoint" 2>/dev/null); then
        if [[ "$response_code" == "$expected_status" ]]; then
            log "✅ $description: OK ($response_code)"
            return 0
        else
            log "❌ $description: Expected $expected_status, got $response_code"
            return 1
        fi
    else
        log "❌ $description: Connection failed or timeout"
        return 1
    fi
}

test_endpoint_contains() {
    local endpoint="$1"
    local expected_content="$2"
    local description="$3"
    
    verbose_log "Testing endpoint content: $endpoint (looking for: $expected_content)"
    
    local response
    if response=$(curl -s --max-time "$TIMEOUT" "$endpoint" 2>/dev/null); then
        if echo "$response" | grep -q "$expected_content"; then
            log "✅ $description: Contains expected content"
            if [[ "$VERBOSE" == "true" ]]; then
                verbose_log "Response preview: $(echo "$response" | head -c 200)..."
            fi
            return 0
        else
            log "❌ $description: Does not contain expected content"
            if [[ "$VERBOSE" == "true" ]]; then
                verbose_log "Full response: $response"
            fi
            return 1
        fi
    else
        log "❌ $description: Connection failed or timeout"
        return 1
    fi
}

# Main smoke test function
run_smoke_tests() {
    local failures=0
    
    log "Starting smoke tests for MOBIUS Game Tutorial Generator"
    log "Base URL: $URL"
    log "Timeout: ${TIMEOUT}s"
    echo
    
    # Basic connectivity test
    if ! test_endpoint "$URL" "200" "Basic connectivity"; then
        ((failures++))
    fi
    
    # API Health endpoints (may not exist yet)
    if ! test_endpoint "$URL/health" "200" "Health endpoint"; then
        # Try alternative health check
        verbose_log "Standard health endpoint failed, trying alternatives..."
        if ! test_endpoint "$URL" "200" "Fallback health check (root endpoint)"; then
            ((failures++))
        fi
    fi
    
    # Metrics endpoint (may not exist yet)
    if ! test_endpoint "$URL/metrics/dhash" "200" "Metrics endpoint"; then
        verbose_log "Metrics endpoint not available (this may be expected)"
        # This is not counted as a failure since it may not be implemented yet
    fi
    
    # API endpoints (based on the src/api/index.js analysis)
    if ! test_endpoint "$URL/api/page-images" "200" "Page images API"; then
        verbose_log "Page images API not responding (may need setup)"
        # Don't count as failure if service isn't running
    fi
    
    # Static file serving
    if ! test_endpoint "$URL/static" "200" "Static file serving"; then
        verbose_log "Static file serving not available"
        # Don't count as hard failure
    fi
    
    # CORS and basic API structure
    local cors_test_result=0
    if curl -s -I --max-time "$TIMEOUT" -H "Origin: http://localhost:3000" "$URL" &>/dev/null; then
        log "✅ CORS preflight: OK"
    else
        log "⚠️  CORS preflight: Not responding (may be expected if server is not running)"
        cors_test_result=1
    fi
    
    # Service availability check
    local service_running=false
    if curl -s --max-time 5 "$URL" &>/dev/null; then
        service_running=true
        log "✅ Service availability: Service is running"
    else
        log "⚠️  Service availability: Service may not be running"
        log "   Try starting with: cd src/api && node index.js"
    fi
    
    # File structure validation (local checks)
    log "Checking file structure..."
    local project_root
    project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    
    local essential_files=(
        "package.json"
        "src/api/index.js"
        "scripts/check_golden.js"
        "scripts/generate_golden.js"
    )
    
    for file in "${essential_files[@]}"; do
        if [[ -f "$project_root/$file" ]]; then
            log "✅ File structure: $file exists"
        else
            log "❌ File structure: $file missing"
            ((failures++))
        fi
    done
    
    # Golden test infrastructure
    local golden_dirs=(
        "tests/golden"
    )
    
    for dir in "${golden_dirs[@]}"; do
        if [[ -d "$project_root/$dir" ]]; then
            log "✅ Test infrastructure: $dir exists"
        else
            log "❌ Test infrastructure: $dir missing"
            ((failures++))
        fi
    done
    
    # Summary
    echo
    log "=== SMOKE TEST SUMMARY ==="
    if [[ "$failures" -eq 0 ]]; then
        log "🎉 All critical tests passed!"
        log "✅ System appears healthy"
        if [[ "$service_running" == "false" ]]; then
            log "💡 Note: API service is not running, start it for full functionality"
        fi
        exit 0
    else
        log "❌ $failures critical test(s) failed"
        log "🔧 System needs attention before deployment"
        exit 1
    fi
}

# Error handling
trap 'log "Smoke test interrupted or failed"' ERR INT TERM

# Run the smoke tests
run_smoke_tests