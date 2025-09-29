#!/bin/bash
set -e

echo "🧪 Starting API smoke tests for MOBIUS CI API..."

# Default values
API_URL="http://localhost:5001"
TIMEOUT=30
RETRY_COUNT=5

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --retry-count)
      RETRY_COUNT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--api-url URL] [--timeout SECONDS] [--retry-count COUNT]"
      echo "  --api-url: API base URL (default: http://localhost:5001)"
      echo "  --timeout: Request timeout in seconds (default: 30)"
      echo "  --retry-count: Number of retries for readiness check (default: 5)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "📋 Configuration:"
echo "   API URL: $API_URL"
echo "   Timeout: ${TIMEOUT}s"
echo "   Retry count: $RETRY_COUNT"
echo ""

# Function to make HTTP request with timeout
make_request() {
    local method="$1"
    local url="$2"
    local data="$3"
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        curl -s -f --max-time "$TIMEOUT" -X "$method" \
             -H "Content-Type: application/json" \
             -d "$data" "$url"
    else
        curl -s -f --max-time "$TIMEOUT" -X "$method" "$url"
    fi
}

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
for i in $(seq 1 "$RETRY_COUNT"); do
    if make_request GET "$API_URL/health" > /dev/null 2>&1; then
        echo "✅ API is responding (attempt $i)"
        break
    else
        echo "⏳ API not ready, attempt $i/$RETRY_COUNT..."
        if [ $i -eq "$RETRY_COUNT" ]; then
            echo "❌ API failed to respond after $RETRY_COUNT attempts"
            exit 1
        fi
        sleep 5
    fi
done

# Test 1: Health check
echo ""
echo "🧪 Test 1: Health check endpoint"
HEALTH_RESPONSE=$(make_request GET "$API_URL/health")
echo "Response: $HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed - invalid response"
    exit 1
fi

# Test 2: Readiness check
echo ""
echo "🧪 Test 2: Readiness check endpoint"
READY_RESPONSE=$(make_request GET "$API_URL/ready")
echo "Response: $READY_RESPONSE"

if echo "$READY_RESPONSE" | jq -e '.status == "ready"' > /dev/null 2>&1; then
    echo "✅ Readiness check passed"
else
    echo "❌ Readiness check failed - invalid response"
    exit 1
fi

# Test 3: API info
echo ""
echo "🧪 Test 3: API info endpoint"
INFO_RESPONSE=$(make_request GET "$API_URL/api/info")
echo "Response: $INFO_RESPONSE"

if echo "$INFO_RESPONSE" | jq -e '.name == "MOBIUS Games CI API"' > /dev/null 2>&1; then
    echo "✅ API info check passed"
else
    echo "❌ API info check failed - invalid response"
    exit 1
fi

# Test 4: Echo endpoint (POST)
echo ""
echo "🧪 Test 4: Echo endpoint (POST)"
ECHO_DATA='{"test": "smoke-test", "timestamp": "'$(date -Iseconds)'"}'
ECHO_RESPONSE=$(make_request POST "$API_URL/api/echo" "$ECHO_DATA")
echo "Sent: $ECHO_DATA"
echo "Response: $ECHO_RESPONSE"

if echo "$ECHO_RESPONSE" | jq -e '.message == "Echo successful"' > /dev/null 2>&1; then
    echo "✅ Echo test passed"
else
    echo "❌ Echo test failed - invalid response"
    exit 1
fi

# Test 5: 404 handling
echo ""
echo "🧪 Test 5: 404 error handling"
if make_request GET "$API_URL/nonexistent-endpoint" > /dev/null 2>&1; then
    echo "❌ 404 test failed - should have returned error"
    exit 1
else
    echo "✅ 404 handling works correctly"
fi

echo ""
echo "🎉 All smoke tests passed successfully!"
echo "✅ API is healthy and responding correctly"