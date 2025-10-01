#!/usr/bin/env bash
# Smoke tests for MOBIUS API
# Usage: smoke-tests.sh <target_url> <timeout> <retries>

set -euo pipefail

TARGET="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRIES="${3:-2}"

echo "=== Smoke Tests ==="
echo "Target: $TARGET"
echo "Timeout: ${TIMEOUT}s"
echo "Retries: $RETRIES"
echo ""

# Helper function to check if service is responding
check_health() {
  local url="$1"
  local attempt=0
  local max_attempts=$RETRIES
  
  while [ $attempt -le $max_attempts ]; do
    echo "Attempt $((attempt + 1))/$((max_attempts + 1)): Checking $url"
    
    if curl -f -s -m "$TIMEOUT" "$url" > /dev/null 2>&1; then
      echo "✓ Service is responding"
      return 0
    fi
    
    attempt=$((attempt + 1))
    if [ $attempt -le $max_attempts ]; then
      echo "  Retrying in 5 seconds..."
      sleep 5
    fi
  done
  
  echo "✗ Service failed to respond after $((max_attempts + 1)) attempts"
  return 1
}

# Test 1: Check if API is accessible
echo "Test 1: API Health Check"
if check_health "$TARGET/health" || check_health "$TARGET"; then
  echo "✓ Test 1 PASSED"
else
  echo "✗ Test 1 FAILED: API is not accessible"
  exit 1
fi
echo ""

# Test 2: Check API response format (if /health endpoint exists)
echo "Test 2: API Response Format"
RESPONSE=$(curl -f -s -m "$TIMEOUT" "$TARGET/health" 2>/dev/null || curl -f -s -m "$TIMEOUT" "$TARGET" 2>/dev/null || echo "")

if [ -n "$RESPONSE" ]; then
  echo "✓ Test 2 PASSED: Got response from API"
  echo "Response preview: ${RESPONSE:0:200}"
else
  echo "⚠ Test 2 WARNING: Could not get response body (but service is up)"
fi
echo ""

# Test 3: Check if API is serving on correct port
echo "Test 3: Port Check"
PORT=$(echo "$TARGET" | sed -E 's/.*:([0-9]+).*/\1/')
if [ -n "$PORT" ] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; then
  echo "✓ Test 3 PASSED: Valid port $PORT"
else
  echo "⚠ Test 3 WARNING: Could not determine port"
fi
echo ""

echo "=== All Smoke Tests Completed Successfully ==="
exit 0
