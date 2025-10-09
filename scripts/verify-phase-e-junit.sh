#!/bin/bash

# verify-phase-e-junit.sh
# JUnit wrapper for Phase E verification script

set -e

# Create output directory for JUnit reports
mkdir -p test-reports

# Run the verification script and capture output
echo "Running Phase E verification with JUnit output..."

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

# Test 1: Prerequisites check
echo "Test 1: Checking prerequisites..."
if command -v curl &> /dev/null && command -v node &> /dev/null; then
    record_test "Prerequisites Check" "PASS" ""
else
    record_test "Prerequisites Check" "FAIL" "Required tools not found"
fi

# Set environment variables
export DATA_DIR="./data"
export PORT="5001"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Test 2: Migration script
echo "Test 2: Running migration script..."
if npm run migrate:data &> /dev/null; then
    record_test "Migration Script" "PASS" ""
else
    record_test "Migration Script" "FAIL" "Migration script failed"
fi

# Start server in background
echo "Test 3: Starting server..."
node src/api/index.js &
SERVER_PID=$!

# Give server time to start
sleep 3

# Test 4: Health endpoint
echo "Test 4: Verifying health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:$PORT/health)
if [[ $HEALTH_RESPONSE == *"\"status\":\"ok\""* ]]; then
    record_test "Health Endpoint" "PASS" ""
else
    record_test "Health Endpoint" "FAIL" "Health endpoint not responding correctly"
fi

# Test 5: Metrics endpoint
echo "Test 5: Verifying metrics endpoint..."
METRICS_RESPONSE=$(curl -s http://localhost:$PORT/metrics)
if [[ $METRICS_RESPONSE == *"\"counters\""* ]]; then
    record_test "Metrics Endpoint" "PASS" ""
else
    record_test "Metrics Endpoint" "FAIL" "Metrics endpoint not responding correctly"
fi

# Test 6: File upload
echo "Test 6: Testing file upload..."
echo "This is a test file for Phase E verification" > test-upload.txt
UPLOAD_RESPONSE=$(curl -s -F "file=@test-upload.txt" http://localhost:$PORT/api/ingest)
if [[ $UPLOAD_RESPONSE == *"\"ok\":true"* ]]; then
    record_test "File Upload" "PASS" ""
else
    record_test "File Upload" "FAIL" "File upload failed"
fi

# Clean up test file
rm -f test-upload.txt

# Test 7: File storage location
echo "Test 7: Verifying file storage location..."
if ls $DATA_DIR/uploads/* 1> /dev/null 2>&1; then
    record_test "File Storage" "PASS" ""
else
    record_test "File Storage" "FAIL" "Files not found in DATA_DIR/uploads/"
fi

# Stop server
echo "Stopping server..."
kill $SERVER_PID 2> /dev/null || true

# End timestamp
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Create JUnit XML report
cat > test-reports/phase-e-results.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Phase E Verification" tests="$TOTAL_TESTS" failures="$FAILED_TESTS" errors="0" time="$DURATION">
    <testcase name="Overall Verification" time="$DURATION">
EOF

if [ $FAILED_TESTS -gt 0 ]; then
    echo '      <failure message="Some tests failed"></failure>' >> test-reports/phase-e-results.xml
fi

cat >> test-reports/phase-e-results.xml << EOF
    </testcase>
  </testsuite>
</testsuites>
EOF

# Print summary
echo ""
echo "========================================="
echo "Phase E Verification Summary"
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