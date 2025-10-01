#!/bin/bash
# Smoke tests for MOBIUS API
# Usage: ./smoke-tests.sh <base_url> <timeout_seconds> <max_retries>
# Example: ./smoke-tests.sh http://localhost:5001 30 2

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Arguments
BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
MAX_RETRIES="${3:-2}"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Function to print test results
print_test() {
  local status=$1
  local name=$2
  local message=$3
  
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  
  if [ "$status" = "PASS" ]; then
    echo -e "${GREEN}✓${NC} $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    [ -n "$message" ] && echo "  $message"
  else
    echo -e "${RED}✗${NC} $name"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    [ -n "$message" ] && echo "  Error: $message"
  fi
}

print_info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

# Function to make HTTP request with retries
http_request() {
  local url=$1
  local method=${2:-GET}
  local retry=0
  local response
  local http_code
  
  while [ $retry -le $MAX_RETRIES ]; do
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" -m "$TIMEOUT" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ -n "$http_code" ] && [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
      echo "$body"
      return 0
    fi
    
    retry=$((retry + 1))
    if [ $retry -le $MAX_RETRIES ]; then
      sleep 2
    fi
  done
  
  echo "HTTP_ERROR:$http_code:$body"
  return 1
}

# Start tests
echo "========================================"
echo "MOBIUS API Smoke Tests"
echo "========================================"
echo ""
echo "Base URL: $BASE_URL"
echo "Timeout: ${TIMEOUT}s per request"
echo "Max retries: $MAX_RETRIES"
echo ""
echo "Running tests..."
echo ""

# Test 1: Health check endpoint
print_info "Testing health check endpoint..."
response=$(http_request "$BASE_URL/health" GET)
if [ $? -eq 0 ]; then
  print_test "PASS" "GET /health" "Service is healthy"
else
  print_test "FAIL" "GET /health" "$response"
fi

# Test 2: Root endpoint
print_info "Testing root endpoint..."
response=$(http_request "$BASE_URL/" GET)
if [ $? -eq 0 ]; then
  print_test "PASS" "GET /" "Root endpoint accessible"
else
  print_test "FAIL" "GET /" "$response"
fi

# Test 3: API info endpoint
print_info "Testing API info endpoint..."
response=$(http_request "$BASE_URL/api/info" GET)
if [ $? -eq 0 ]; then
  # Check if response contains expected JSON structure
  if echo "$response" | grep -q "version\|name\|api"; then
    print_test "PASS" "GET /api/info" "API info returned"
  else
    print_test "FAIL" "GET /api/info" "Invalid response format"
  fi
else
  print_test "FAIL" "GET /api/info" "$response"
fi

# Test 4: 404 handling
print_info "Testing 404 error handling..."
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/nonexistent-endpoint" -m "$TIMEOUT" 2>&1)
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "404" ]; then
  print_test "PASS" "GET /nonexistent-endpoint" "404 handled correctly"
else
  print_test "FAIL" "GET /nonexistent-endpoint" "Expected 404, got $http_code"
fi

# Test 5: CORS headers (if applicable)
print_info "Testing CORS headers..."
response=$(curl -s -I "$BASE_URL/health" -H "Origin: http://localhost:3000" -m "$TIMEOUT" 2>&1)
if echo "$response" | grep -qi "access-control-allow"; then
  print_test "PASS" "CORS headers" "CORS headers present"
else
  print_test "FAIL" "CORS headers" "CORS headers missing"
fi

# Test 6: Response time check
print_info "Testing response time..."
start_time=$(date +%s%N)
response=$(curl -s "$BASE_URL/health" -m "$TIMEOUT" 2>&1)
end_time=$(date +%s%N)
elapsed=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

if [ $elapsed -lt 5000 ]; then
  print_test "PASS" "Response time" "Health check completed in ${elapsed}ms"
else
  print_test "FAIL" "Response time" "Health check took ${elapsed}ms (>5000ms)"
fi

# Summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Total tests: $TESTS_TOTAL"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed!${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check if services are running: docker compose ps"
  echo "  2. Check container logs: docker compose logs"
  echo "  3. Check service health: curl $BASE_URL/health"
  echo "  4. Verify port $( echo $BASE_URL | sed 's/.*://') is not in use"
  exit 1
fi
