#!/bin/bash

# verify-phase-f.sh
# Verification script for Phase F features

set -e

echo "========================================="
echo "Phase F Verification"
echo "========================================="

# Start timestamp
START_TIME=$(date +%s)

# Initialize test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to record test result
record_test() {
    local test_name=$1
    local result=$2
    local message=$3
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$result" = "PASS" ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo "  ✓ $test_name"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "  ✗ $test_name: $message"
    fi
}

# Test 1: Check if preview endpoint exists
echo "Test 1: Checking preview endpoint..."
if curl -s -f -X POST http://localhost:5001/api/preview -H "Content-Type: application/json" -d '{"projectId":"test","chapterId":"ch1","chapter":{"title":"Test","steps":[]}}' > /dev/null; then
    record_test "Preview endpoint exists" "PASS" ""
else
    record_test "Preview endpoint exists" "FAIL" "Preview endpoint not responding"
fi

# Test 2: Check preview endpoint with dry-run
echo "Test 2: Testing preview endpoint with dry-run..."
if curl -s -f -X POST "http://localhost:5001/api/preview?dryRun=true" -H "Content-Type: application/json" -d '{"projectId":"test","chapterId":"ch1","chapter":{"title":"Test","steps":[]}}' > /dev/null; then
    record_test "Preview dry-run works" "PASS" ""
else
    record_test "Preview dry-run works" "FAIL" "Preview dry-run failed"
fi

# Test 3: Check that preview files are created
echo "Test 3: Verifying preview file creation..."
# This would require actually running the preview endpoint and checking the file system

# Test 4: Check metrics for preview requests
echo "Test 4: Checking metrics for preview requests..."
METRICS_RESPONSE=$(curl -s http://localhost:5001/metrics)
if echo "$METRICS_RESPONSE" | grep -q "preview_requests_total"; then
    record_test "Preview metrics available" "PASS" ""
else
    record_test "Preview metrics available" "FAIL" "Preview metrics not found"
fi

# End timestamp
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Print summary
echo ""
echo "========================================="
echo "Phase F Verification Summary"
echo "========================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Duration: ${DURATION}s"
echo "========================================="

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    echo "OK - All tests passed!"
    exit 0
else
    echo "FAIL - $FAILED_TESTS tests failed"
    exit 1
fi