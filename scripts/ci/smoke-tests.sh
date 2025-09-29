#!/bin/bash
# MOBIUS CI API Smoke Tests - Simplified Version
BASE_URL=${1:-"http://localhost:5001"}
LOG_FILE=${LOG_FILE:-"smoke-tests.log"}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 🚀 Starting MOBIUS CI API smoke tests" | tee "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: Base URL: $BASE_URL" | tee -a "$LOG_FILE"

failed_tests=0
total_tests=0

# Test 1: Health check
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 🧪 Testing health endpoint" | tee -a "$LOG_FILE"
total_tests=$((total_tests + 1))
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/health" 2>/dev/null || echo -e "\n000")
status=$(echo "$response" | tail -n1)
if [ "$status" = "200" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: ✅ Health check PASSED" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ❌ Health check FAILED (status: $status)" | tee -a "$LOG_FILE"
    failed_tests=$((failed_tests + 1))
fi

# Test 2: Ready check
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 🧪 Testing ready endpoint" | tee -a "$LOG_FILE"
((total_tests++))
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/ready" 2>/dev/null || echo -e "\n000")
status=$(echo "$response" | tail -n1)
if [ "$status" = "200" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: ✅ Ready check PASSED" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ❌ Ready check FAILED (status: $status)" | tee -a "$LOG_FILE"
    ((failed_tests++))
fi

# Test 3: API info
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 🧪 Testing API info endpoint" | tee -a "$LOG_FILE"
((total_tests++))
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/info" 2>/dev/null || echo -e "\n000")
status=$(echo "$response" | tail -n1)
if [ "$status" = "200" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: ✅ API info PASSED" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ❌ API info FAILED (status: $status)" | tee -a "$LOG_FILE"
    ((failed_tests++))
fi

# Test 4: Echo endpoint
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 🧪 Testing echo endpoint" | tee -a "$LOG_FILE"
((total_tests++))
response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d '{"test": true}' "$BASE_URL/api/echo" 2>/dev/null || echo -e "\n000")
status=$(echo "$response" | tail -n1)
if [ "$status" = "200" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: ✅ Echo endpoint PASSED" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ❌ Echo endpoint FAILED (status: $status)" | tee -a "$LOG_FILE"
    ((failed_tests++))
fi

# Test 5: 404 behavior
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 🧪 Testing 404 behavior" | tee -a "$LOG_FILE"
((total_tests++))
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/nonexistent" 2>/dev/null || echo -e "\n000")
status=$(echo "$response" | tail -n1)
if [ "$status" = "404" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: ✅ 404 behavior PASSED" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ❌ 404 behavior FAILED (status: $status)" | tee -a "$LOG_FILE"
    ((failed_tests++))
fi

# Results
passed_tests=$((total_tests - failed_tests))
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 📊 Test Results Summary:" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: Total tests: $total_tests" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: Passed: $passed_tests" | tee -a "$LOG_FILE"

if [ $failed_tests -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Failed: $failed_tests" | tee -a "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ❌ Smoke tests FAILED" | tee -a "$LOG_FILE"
    exit 1
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: ✅ All smoke tests PASSED" | tee -a "$LOG_FILE"
    exit 0
fi