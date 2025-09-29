#!/bin/bash
set -euo pipefail

# Simple smoke tests for MOBIUS API CI - optimized for fast CI execution
# Usage: ./simple-smoke-test.sh [BASE_URL] [TIMEOUT]
# Example: ./simple-smoke-test.sh http://localhost:5001 10

BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-10}"

# Simple HTTP check function
check_endpoint() {
    local url="$1"
    local expected_status="${2:-200}"
    local method="${3:-GET}"
    
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -X "$method" "$url" || echo "000")
    
    if [ "$status" = "$expected_status" ]; then
        echo "✓ $method $url (HTTP $status)"
        return 0
    else
        echo "✗ $method $url (HTTP $status, expected $expected_status)"
        return 1
    fi
}

# Check health endpoint for specific content
check_health_content() {
    local response
    response=$(curl -s --max-time "$TIMEOUT" "$BASE_URL/health" || echo "")
    
    if echo "$response" | grep -q '"mode":"mock"' && echo "$response" | grep -q '"status":"healthy"'; then
        echo "✓ Health endpoint contains expected mock mode and healthy status"
        return 0
    else
        echo "✗ Health endpoint missing expected content"
        return 1
    fi
}

# Main execution
echo "MOBIUS API Simple Smoke Tests"
echo "Base URL: $BASE_URL"
echo "Timeout: ${TIMEOUT}s"
echo ""

failed=0

# Test core endpoints
check_endpoint "$BASE_URL/health" 200 "GET" || ((failed++))
check_endpoint "$BASE_URL/ready" 200 "GET" || ((failed++))
check_endpoint "$BASE_URL/api/info" 200 "GET" || ((failed++))
check_endpoint "$BASE_URL/nonexistent" 404 "GET" || ((failed++))

# Check health content
check_health_content || ((failed++))

echo ""
if [ $failed -eq 0 ]; then
    echo "✓ All simple smoke tests passed!"
    exit 0
else
    echo "✗ $failed test(s) failed"
    exit 1
fi