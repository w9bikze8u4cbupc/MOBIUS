#!/bin/bash
set -euo pipefail

# Simple smoke test for MOBIUS CI Mock API
# This is a minimal version that focuses on essential validation

BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-10}"

echo "🧪 MOBIUS CI Simple Smoke Test"
echo "Base URL: $BASE_URL"
echo "Timeout: ${TIMEOUT}s"
echo "================================"

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local expected_status="$3"
    local description="$4"
    local data="${5:-}"
    
    echo -n "Testing $description... "
    
    local curl_args=(
        --silent
        --max-time "$TIMEOUT"
        --write-out "%{http_code}"
        --output /tmp/response.json
    )
    
    if [[ "$method" == "POST" && -n "$data" ]]; then
        curl_args+=(
            --header "Content-Type: application/json"
            --data "$data"
        )
    fi
    
    local status_code
    if status_code=$(curl "${curl_args[@]}" -X "$method" "$BASE_URL$endpoint" 2>/dev/null); then
        if [[ "$status_code" == "$expected_status" ]]; then
            echo "✅ PASS (HTTP $status_code)"
            ((PASSED++))
            return 0
        else
            echo "❌ FAIL (Expected HTTP $expected_status, got HTTP $status_code)"
            ((FAILED++))
            return 1
        fi
    else
        echo "❌ FAIL (Network error)"
        ((FAILED++))
        return 1
    fi
}

# Validate JSON response field
validate_field() {
    local field="$1"
    local expected_value="$2"
    local description="$3"
    
    echo -n "Validating $description... "
    
    if command -v jq >/dev/null 2>&1; then
        local actual_value
        actual_value=$(jq -r ".$field // empty" /tmp/response.json 2>/dev/null)
        if [[ "$actual_value" == "$expected_value" ]]; then
            echo "✅ PASS ($field = '$actual_value')"
            ((PASSED++))
        else
            echo "❌ FAIL (Expected '$expected_value', got '$actual_value')"
            ((FAILED++))
        fi
    else
        # Simple grep fallback
        if grep -q "\"$field\"[[:space:]]*:[[:space:]]*\"$expected_value\"" /tmp/response.json 2>/dev/null; then
            echo "✅ PASS ($field contains '$expected_value')"
            ((PASSED++))
        else
            echo "❌ FAIL (Could not verify $field)"
            ((FAILED++))
        fi
    fi
}

# Run tests
echo "Running tests..."

# Test 1: Health endpoint
if test_endpoint "GET" "/health" "200" "health endpoint"; then
    validate_field "status" "healthy" "health status"
    validate_field "mode" "mock" "mock mode"
fi

# Test 2: Ready endpoint
test_endpoint "GET" "/ready" "200" "ready endpoint"

# Test 3: API info endpoint  
test_endpoint "GET" "/api/info" "200" "API info endpoint"

# Test 4: Echo endpoint
test_endpoint "POST" "/api/echo" "200" "echo endpoint" '{"test": "hello"}'

# Test 5: 404 handling
test_endpoint "GET" "/nonexistent" "404" "404 handling"

# Summary
echo "================================"
echo "📊 Test Summary:"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Total:  $((PASSED + FAILED))"

if [[ $FAILED -eq 0 ]]; then
    echo "🎉 All tests passed!"
    exit 0
else
    echo "💥 Some tests failed!"
    exit 1
fi