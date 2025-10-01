#!/usr/bin/env bash
# MOBIUS API Smoke Tests
# Performs health checks and basic API validation

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
API_URL="${1:-http://localhost:5001}"
MAX_RETRIES="${2:-30}"
RETRY_DELAY="${3:-2}"
LOG_FILE="${4:-smoke-tests.log}"

# Initialize log file
echo "MOBIUS API Smoke Tests - $(date)" > "$LOG_FILE"
echo "API URL: $API_URL" >> "$LOG_FILE"
echo "Max Retries: $MAX_RETRIES" >> "$LOG_FILE"
echo "Retry Delay: ${RETRY_DELAY}s" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "[INFO] $1" >> "$LOG_FILE"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "[SUCCESS] $1" >> "$LOG_FILE"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "[WARNING] $1" >> "$LOG_FILE"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[ERROR] $1" >> "$LOG_FILE"
}

# Function to check if a URL is reachable
check_url() {
    local url="$1"
    local expected_status="${2:-200}"
    local description="$3"
    
    print_info "Testing: $description"
    print_info "  URL: $url"
    
    response=$(curl -s -w "\n%{http_code}" "$url" 2>&1 || echo "CURL_ERROR")
    
    if [[ "$response" == *"CURL_ERROR"* ]]; then
        print_error "  Failed to connect to $url"
        return 1
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_status" ]; then
        print_success "  HTTP $http_code (Expected: $expected_status)"
        return 0
    else
        print_error "  HTTP $http_code (Expected: $expected_status)"
        print_error "  Response body: $body"
        return 1
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local url="$1"
    local retries=0
    
    print_info "Waiting for service at $url..."
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            print_success "Service is ready after $retries attempts"
            return 0
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            print_info "  Attempt $retries/$MAX_RETRIES failed, retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done
    
    print_error "Service did not become ready after $MAX_RETRIES attempts"
    return 1
}

# Main smoke tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}MOBIUS API Smoke Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Wait for service to be ready
print_info "Test 1: Service Availability"
if wait_for_service "$API_URL"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 2: Health check endpoint (if it exists)
print_info "Test 2: Health Check"
if check_url "$API_URL/health" "200" "Health endpoint" 2>/dev/null; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
elif check_url "$API_URL" "200" "Root endpoint" 2>/dev/null; then
    # If /health doesn't exist, try root
    print_info "  /health endpoint not available, using root endpoint"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    print_warning "  Neither /health nor root endpoint available"
    # Not counting this as a hard failure if service is up
fi
echo ""

# Test 3: API responds (basic connectivity)
print_info "Test 3: API Connectivity"
if curl -sf "$API_URL" >/dev/null 2>&1; then
    print_success "API is responding"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    print_error "API is not responding"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 4: Check for common endpoints (non-critical)
print_info "Test 4: Common Endpoints Check"
ENDPOINT_CHECKS=0
ENDPOINT_SUCCESS=0

for endpoint in "/api" "/static" "/uploads"; do
    ENDPOINT_CHECKS=$((ENDPOINT_CHECKS + 1))
    if curl -sf "$API_URL$endpoint" >/dev/null 2>&1; then
        print_info "  ✓ $endpoint is available"
        ENDPOINT_SUCCESS=$((ENDPOINT_SUCCESS + 1))
    else
        print_info "  ✗ $endpoint not available (may be expected)"
    fi
done

if [ $ENDPOINT_SUCCESS -gt 0 ]; then
    print_success "Found $ENDPOINT_SUCCESS/$ENDPOINT_CHECKS endpoints"
else
    print_info "No common endpoints found (may be expected)"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Tests Passed: $TESTS_PASSED" | tee -a "$LOG_FILE"
echo "Tests Failed: $TESTS_FAILED" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All critical tests passed! ✓${NC}"
    echo "All critical tests passed! ✓" >> "$LOG_FILE"
    
    # Success - remove log file unless debugging
    if [ "$KEEP_LOGS" != "1" ]; then
        rm -f "$LOG_FILE"
    fi
    
    exit 0
else
    echo -e "${RED}Some tests failed! ✗${NC}"
    echo "Some tests failed! ✗" >> "$LOG_FILE"
    echo ""
    echo "Log file saved to: $LOG_FILE"
    
    # Try to collect additional debugging info
    print_info "Collecting additional debugging information..."
    echo "" >> "$LOG_FILE"
    echo "=== Additional Debug Info ===" >> "$LOG_FILE"
    
    # Check if docker is running
    if command -v docker >/dev/null 2>&1; then
        echo "Docker containers:" >> "$LOG_FILE"
        docker ps -a >> "$LOG_FILE" 2>&1 || echo "Failed to get docker ps" >> "$LOG_FILE"
        echo "" >> "$LOG_FILE"
    fi
    
    # Check for compose logs
    if [ -f "docker-compose.staging.yml" ]; then
        print_info "Collecting Docker Compose logs..."
        docker compose -f docker-compose.staging.yml logs --no-color --tail=100 >> "$LOG_FILE" 2>&1 || true
    fi
    
    echo ""
    echo "Review $LOG_FILE for details"
    
    exit 1
fi
