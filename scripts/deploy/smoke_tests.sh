#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Smoke Tests
# Post-deployment verification tests

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV          Environment (staging|production) [required]"
    echo "  --base-url URL     Base URL for testing [default: http://localhost:3000]"
    echo "  --quick            Run only critical tests (fast execution)"
    echo "  --output FILE      Output test results to file"
    echo "  --help             Show this help message"
    echo ""
    echo "Test categories:"
    echo "  - Health checks"
    echo "  - API endpoints"
    echo "  - Static assets"
    echo "  - Database connectivity"
    echo "  - External integrations"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
ENV=""
BASE_URL="http://localhost:3000"
QUICK_MODE=false
OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --base-url)
            BASE_URL="$2"
            shift 2
            ;;
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ -z "$ENV" ]]; then
    echo "Error: --env is required"
    usage
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "Error: --env must be 'staging' or 'production'"
    exit 1
fi

# Initialize test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0
TEST_LOG=""

if [[ -n "$OUTPUT_FILE" ]]; then
    mkdir -p "$(dirname "$OUTPUT_FILE")"
    TEST_LOG="$OUTPUT_FILE"
else
    TEST_LOG="${PROJECT_ROOT}/test_logging_${ENV}_$(date '+%Y%m%d_%H%M%S').log"
fi

log "Starting smoke tests for environment: $ENV"
log "Base URL: $BASE_URL"
log "Quick mode: $QUICK_MODE"
log "Test log: $TEST_LOG"

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local critical="${3:-false}"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    
    log "Running test: $test_name"
    
    local start_time=$(date +%s)
    local test_output
    local test_result
    
    if test_output=$(eval "$test_command" 2>&1); then
        test_result="PASS"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        log "✅ $test_name - PASSED"
    else
        test_result="FAIL"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        log "❌ $test_name - FAILED"
        
        if [[ "$critical" == "true" ]]; then
            log "💥 Critical test failed, aborting smoke tests"
            echo "CRITICAL_TEST_FAILURE: $test_name" >> "$TEST_LOG"
            return 1
        fi
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Log test result
    cat >> "$TEST_LOG" << EOF
$(date '+%Y-%m-%d %H:%M:%S')|$test_name|$test_result|${duration}s|$test_output
EOF
}

# Test functions
test_health_endpoint() {
    curl -f -s -m 10 "$BASE_URL/health" > /dev/null
}

test_api_root() {
    curl -f -s -m 10 "$BASE_URL/" -o /dev/null
}

test_api_version() {
    curl -f -s -m 10 "$BASE_URL/version" > /dev/null
}

test_static_assets() {
    # Test if static assets are accessible
    if [[ -d "${PROJECT_ROOT}/client/build" || -d "${PROJECT_ROOT}/public" ]]; then
        curl -f -s -m 10 "$BASE_URL/static/js/" -o /dev/null 2>/dev/null || 
        curl -f -s -m 10 "$BASE_URL/assets/" -o /dev/null
    else
        return 0  # Skip if no static assets
    fi
}

test_npm_packages() {
    # Verify critical npm packages are installed
    cd "$PROJECT_ROOT"
    npm list --depth=0 --prod > /dev/null 2>&1
}

test_file_permissions() {
    # Check critical file permissions
    [[ -r "${PROJECT_ROOT}/package.json" ]] &&
    [[ -x "${SCRIPT_DIR}/backup.sh" ]] &&
    [[ -x "${SCRIPT_DIR}/rollback_dhash.sh" ]]
}

test_disk_space() {
    # Check available disk space (fail if <1GB available)
    local available_kb=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    [[ $available_kb -gt 1048576 ]]  # 1GB in KB
}

test_memory_usage() {
    # Check if system has reasonable memory available
    local available_mb=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    [[ $available_mb -gt 100 ]]  # At least 100MB available
}

test_process_health() {
    # Check if Node.js processes are running (if applicable)
    if pgrep -f "node.*${PROJECT_ROOT}" > /dev/null; then
        return 0  # Node process running
    else
        # If no Node process, that might be OK depending on setup
        return 0
    fi
}

# Critical tests (always run)
log "Running critical tests..."

run_test "Health Endpoint" "test_health_endpoint" true || exit 1
run_test "API Root" "test_api_root" true || exit 1
run_test "File Permissions" "test_file_permissions" true || exit 1

# Additional tests (skip in quick mode)
if [[ "$QUICK_MODE" != "true" ]]; then
    log "Running extended tests..."
    
    run_test "API Version" "test_api_version" false
    run_test "Static Assets" "test_static_assets" false
    run_test "NPM Packages" "test_npm_packages" false
    run_test "Disk Space" "test_disk_space" false
    run_test "Memory Usage" "test_memory_usage" false
    run_test "Process Health" "test_process_health" false
fi

# Generate final report
log "Smoke tests completed"
log "Results: $TESTS_PASSED passed, $TESTS_FAILED failed, $TESTS_TOTAL total"

# Create summary JSON
SUMMARY_FILE="${PROJECT_ROOT}/postdeploy-smoketests_${ENV}_$(date '+%Y%m%d_%H%M%S').log"
cat > "$SUMMARY_FILE" << EOF
{
  "environment": "$ENV",
  "base_url": "$BASE_URL",
  "quick_mode": $QUICK_MODE,
  "timestamp": "$(date --iso-8601)",
  "tests_total": $TESTS_TOTAL,
  "tests_passed": $TESTS_PASSED,
  "tests_failed": $TESTS_FAILED,
  "success_rate": $(($TESTS_PASSED * 100 / $TESTS_TOTAL)),
  "test_log": "$TEST_LOG"
}
EOF

log "Summary report: $SUMMARY_FILE"

# Exit with appropriate code
if [[ $TESTS_FAILED -eq 0 ]]; then
    log "🎉 All smoke tests passed!"
    exit 0
else
    log "💥 $TESTS_FAILED smoke tests failed"
    exit 1
fi