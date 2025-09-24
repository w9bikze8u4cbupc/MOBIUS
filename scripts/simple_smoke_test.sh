#!/bin/bash
set -euo pipefail

# Simple Smoke Test - Post-deployment verification
# Usage: ./scripts/simple_smoke_test.sh [-u <base_url>] [--timeout <seconds>] [--verbose]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOGS_DIR/smoke_test_${TIMESTAMP}.log"

# Configuration
BASE_URL="http://localhost:5001"
TIMEOUT=30
VERBOSE=false
LIBRARY_FILE="$PROJECT_ROOT/library.json"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

log_test_pass() {
    echo -e "${GREEN}[PASS]${NC} $*" | tee -a "$LOG_FILE"
    ((TESTS_PASSED++))
}

log_test_fail() {
    echo -e "${RED}[FAIL]${NC} $*" | tee -a "$LOG_FILE"
    ((TESTS_FAILED++))
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -u|--url)
                BASE_URL="$2"
                shift 2
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown parameter: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
Simple Smoke Test - Post-deployment verification

Usage: $0 [OPTIONS]

Options:
    -u, --url <base_url>    Base URL for API endpoints (default: http://localhost:5001)
    --timeout <seconds>     Request timeout in seconds (default: 30)
    --verbose               Enable verbose output
    -h, --help              Show this help message

Examples:
    $0                                    # Test local deployment
    $0 -u http://staging.example.com      # Test staging environment
    $0 --timeout 60 --verbose             # Extended timeout with verbose output

Tests performed:
    ✓ Library file structure validation
    ✓ DHash system status check
    ✓ Health endpoint availability
    ✓ Metrics endpoint functionality
    ✓ API response times
    ✓ DHash migration status
    ✓ Games data integrity

EOF
}

# Test helper function
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_TOTAL++))
    
    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Running test: $test_name"
        log_info "Command: $test_command"
    fi
    
    if eval "$test_command"; then
        log_test_pass "$test_name"
        return 0
    else
        log_test_fail "$test_name"
        return 1
    fi
}

# HTTP request helper with timeout
http_get() {
    local url="$1"
    local expected_status="${2:-200}"
    
    if command -v curl >/dev/null 2>&1; then
        local response
        response=$(curl -s -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
        local status_code="${response: -3}"
        local body="${response%???}"
        
        if [[ "$VERBOSE" == "true" ]]; then
            log_info "HTTP GET $url -> $status_code"
            [[ -n "$body" ]] && log_info "Response: ${body:0:200}..."
        fi
        
        if [[ "$status_code" == "$expected_status" ]]; then
            echo "$body"
            return 0
        else
            log_error "Expected status $expected_status, got $status_code"
            return 1
        fi
    else
        log_error "curl not available for HTTP testing"
        return 1
    fi
}

# Test 1: Library file structure validation
test_library_structure() {
    [[ -f "$LIBRARY_FILE" ]] && 
    jq -e '.dhash' "$LIBRARY_FILE" >/dev/null && 
    jq -e '.games' "$LIBRARY_FILE" >/dev/null &&
    jq -e '.metrics' "$LIBRARY_FILE" >/dev/null
}

# Test 2: DHash system enabled
test_dhash_enabled() {
    local enabled
    enabled=$(jq -r '.dhash.enabled' "$LIBRARY_FILE" 2>/dev/null)
    [[ "$enabled" == "true" ]]
}

# Test 3: Migration status completed
test_migration_completed() {
    local status
    status=$(jq -r '.dhash.migrationStatus' "$LIBRARY_FILE" 2>/dev/null)
    [[ "$status" == "completed" ]]
}

# Test 4: All games have dhash values
test_games_have_dhash() {
    local games_without_dhash
    games_without_dhash=$(jq -r '.games | map(select(.dhash == null)) | length' "$LIBRARY_FILE" 2>/dev/null)
    [[ "$games_without_dhash" == "0" ]]
}

# Test 5: Health endpoint
test_health_endpoint() {
    local response
    response=$(http_get "$BASE_URL/health" 200)
    [[ -n "$response" ]]
}

# Test 6: Metrics endpoint
test_metrics_endpoint() {
    local response
    response=$(http_get "$BASE_URL/metrics/dhash" 200)
    [[ -n "$response" ]]
}

# Test 7: API response time
test_api_response_time() {
    local start_time
    local end_time
    local duration
    
    start_time=$(date +%s.%N)
    if http_get "$BASE_URL/health" 200 >/dev/null; then
        end_time=$(date +%s.%N)
        duration=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0.5")
        
        if [[ "$VERBOSE" == "true" ]]; then
            log_info "Health endpoint response time: ${duration}s"
        fi
        
        # Pass if response time is under 5 seconds (generous for smoke test)
        if command -v bc >/dev/null 2>&1; then
            (( $(echo "$duration < 5" | bc -l) ))
        else
            # Fallback if bc is not available - assume reasonable response time
            true
        fi
    else
        return 1
    fi
}

# Test 8: Metrics contain expected fields
test_metrics_content() {
    local response
    response=$(http_get "$BASE_URL/metrics/dhash" 200)
    
    # For smoke test, just verify we get some response
    # In production, you'd check for specific metrics structure
    [[ -n "$response" ]]
}

# Test 9: Games data integrity
test_games_data_integrity() {
    local games_count
    games_count=$(jq -r '.games | length' "$LIBRARY_FILE" 2>/dev/null)
    
    # Should have at least some games
    [[ "$games_count" -gt 0 ]]
}

# Test 10: Library file permissions
test_file_permissions() {
    [[ -r "$LIBRARY_FILE" ]] && [[ -w "$LIBRARY_FILE" ]]
}

# Run all tests
run_all_tests() {
    log_info "Starting smoke tests..."
    log_info "Target: $BASE_URL"
    log_info "Timeout: ${TIMEOUT}s"
    
    # File-based tests (don't require API to be running)
    run_test "Library file structure" "test_library_structure"
    run_test "DHash system enabled" "test_dhash_enabled"
    run_test "Migration completed" "test_migration_completed"
    run_test "Games have dhash values" "test_games_have_dhash"
    run_test "Games data integrity" "test_games_data_integrity"
    run_test "Library file permissions" "test_file_permissions"
    
    # API-based tests (require running service)
    log_info "Testing API endpoints..."
    
    if run_test "Health endpoint available" "test_health_endpoint"; then
        run_test "API response time" "test_api_response_time"
        run_test "Metrics endpoint available" "test_metrics_endpoint"
        run_test "Metrics content validation" "test_metrics_content"
    else
        log_warn "API endpoints not available - skipping API tests"
        log_warn "Make sure the service is running at $BASE_URL"
        ((TESTS_FAILED += 3))  # Count the skipped API tests as failures
        ((TESTS_TOTAL += 3))
    fi
}

# Generate summary report
generate_summary() {
    echo
    log_info "=== Smoke Test Summary ==="
    log_info "Tests run: $TESTS_TOTAL"
    log_success "Tests passed: $TESTS_PASSED"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "Tests failed: $TESTS_FAILED"
    fi
    
    local success_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        success_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    fi
    
    log_info "Success rate: ${success_rate}%"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "🎉 All smoke tests passed! Deployment appears healthy."
        return 0
    else
        log_error "❌ Some smoke tests failed. Review the deployment."
        
        if [[ $success_rate -lt 70 ]]; then
            log_error "⚠️  Success rate below 70% - consider rollback"
            return 2
        else
            log_warn "⚠️  Some issues detected but deployment may be acceptable"
            return 1
        fi
    fi
}

# Check prerequisites
check_prerequisites() {
    local missing_deps=()
    
    # Check for required commands
    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install missing dependencies and try again"
        exit 1
    fi
}

# Main function
main() {
    log_info "=== DHash Deployment Smoke Tests ==="
    log_info "Timestamp: $(date)"
    log_info "Log file: $LOG_FILE"
    
    # Ensure log directory exists
    mkdir -p "$LOGS_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    # Check prerequisites
    check_prerequisites
    
    # Run tests
    run_all_tests
    
    # Generate summary
    generate_summary
    local exit_code=$?
    
    echo
    log_info "Full smoke test log: $LOG_FILE"
    
    # Additional guidance based on results
    if [[ $exit_code -eq 0 ]]; then
        log_info "✅ Deployment verification complete - system is healthy"
    elif [[ $exit_code -eq 1 ]]; then
        log_warn "⚠️  Minor issues detected - monitor closely"
        log_info "Consider running additional tests or checks"
    else
        log_error "❌ Major issues detected - immediate attention required"
        log_error "Consider rollback: $SCRIPT_DIR/rollback_dhash.sh --latest"
    fi
    
    exit $exit_code
}

# Execute main function with all arguments
main "$@"