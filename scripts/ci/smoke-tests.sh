#!/bin/bash
# Smoke tests for MOBIUS CI environment
# Usage: ./smoke-tests.sh [container_name] [timeout_seconds] [max_retries]
# Example: ./smoke-tests.sh mobius-ci-staging 30 2

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Arguments
CONTAINER_NAME="${1:-mobius-ci-staging}"
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

# Start tests
echo "========================================"
echo "MOBIUS CI Smoke Tests"
echo "========================================"
echo ""
echo "Container: $CONTAINER_NAME"
echo "Timeout: ${TIMEOUT}s"
echo "Max retries: $MAX_RETRIES"
echo ""
echo "Running tests..."
echo ""

# Test 1: Docker is available
print_info "Testing Docker availability..."
if command -v docker &> /dev/null; then
  print_test "PASS" "Docker command available" "docker $(docker --version)"
else
  print_test "FAIL" "Docker command available" "Docker not found in PATH"
fi

# Test 2: Check if container exists
print_info "Testing container existence..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  print_test "PASS" "Container exists" "Container $CONTAINER_NAME found"
else
  print_test "FAIL" "Container exists" "Container $CONTAINER_NAME not found"
  echo ""
  echo "Available containers:"
  docker ps -a --format "table {{.Names}}\t{{.Status}}"
fi

# Test 3: Check container status
print_info "Testing container status..."
container_status=$(docker inspect --format='{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not_found")
if [ "$container_status" = "running" ] || [ "$container_status" = "exited" ]; then
  print_test "PASS" "Container status" "Status: $container_status"
else
  print_test "FAIL" "Container status" "Unexpected status: $container_status"
fi

# Test 4: Check container exit code (if exited)
if [ "$container_status" = "exited" ]; then
  print_info "Testing container exit code..."
  exit_code=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_NAME" 2>/dev/null || echo "-1")
  if [ "$exit_code" = "0" ]; then
    print_test "PASS" "Container exit code" "Exited successfully (code 0)"
  else
    print_test "FAIL" "Container exit code" "Exited with code $exit_code"
  fi
fi

# Test 5: Check container logs for errors
print_info "Testing container logs..."
logs=$(docker logs "$CONTAINER_NAME" 2>&1 | tail -20)
if echo "$logs" | grep -qi "error\|fail\|exception"; then
  print_test "FAIL" "Container logs" "Errors found in logs"
  echo ""
  echo "Last 20 lines of logs:"
  echo "$logs"
else
  print_test "PASS" "Container logs" "No obvious errors in logs"
fi

# Test 6: Check if verification reports were created
print_info "Testing verification artifacts..."
if [ -d "./verification-reports" ] && [ "$(ls -A ./verification-reports 2>/dev/null)" ]; then
  report_count=$(ls -1 ./verification-reports/*.json 2>/dev/null | wc -l)
  print_test "PASS" "Verification reports" "$report_count report(s) created"
else
  print_test "FAIL" "Verification reports" "No reports found in ./verification-reports/"
fi

# Test 7: Check Node.js availability in container
print_info "Testing Node.js in container..."
if docker exec "$CONTAINER_NAME" node --version &>/dev/null; then
  node_version=$(docker exec "$CONTAINER_NAME" node --version 2>&1)
  print_test "PASS" "Node.js in container" "Version: $node_version"
else
  print_test "FAIL" "Node.js in container" "Could not execute node command"
fi

# Test 8: Check ffmpeg availability in container
print_info "Testing ffmpeg in container..."
if docker exec "$CONTAINER_NAME" ffmpeg -version &>/dev/null; then
  ffmpeg_version=$(docker exec "$CONTAINER_NAME" ffmpeg -version 2>&1 | head -n1)
  print_test "PASS" "ffmpeg in container" "Version: $ffmpeg_version"
else
  print_test "FAIL" "ffmpeg in container" "Could not execute ffmpeg command"
fi

# Test 9: Check image size
print_info "Testing Docker image size..."
image_name="mobius-api-ci:staging"
if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "$image_name"; then
  image_size=$(docker images --format "{{.Size}}" "$image_name")
  print_test "PASS" "Docker image" "Size: $image_size"
else
  print_test "FAIL" "Docker image" "Image $image_name not found"
fi

# Test 10: Check non-root user
print_info "Testing non-root user..."
if docker inspect --format='{{.Config.User}}' "$CONTAINER_NAME" 2>/dev/null | grep -q "mobius\|1001"; then
  print_test "PASS" "Non-root user" "Container runs as non-root user"
else
  print_test "FAIL" "Non-root user" "Container may be running as root"
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
  echo "  1. Check container logs: docker logs $CONTAINER_NAME"
  echo "  2. Check container status: docker ps -a"
  echo "  3. Check verification reports: ls -la verification-reports/"
  echo "  4. Rebuild image: docker build -f Dockerfile.ci -t mobius-api-ci:staging ."
  exit 1
fi
