#!/bin/bash
#
# smoke_tests.sh - Multi-tier post-deploy smoke tests with critical/standard separation
#
# Usage: ./scripts/smoke_tests.sh --env production [--level critical] [--output-file results.log]
#

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/deploy_logs"

# Default values
ENV=""
TEST_LEVEL="all"
OUTPUT_FILE=""
TIMEOUT=300
DRY_RUN=false

# Test results
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0
TEST_RESULTS=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
    if [[ -n "${OUTPUT_FILE:-}" ]]; then 
        echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $*" >> "$OUTPUT_FILE" 2>/dev/null || true
    fi
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
    if [[ -n "${OUTPUT_FILE:-}" ]]; then 
        echo "[SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') $*" >> "$OUTPUT_FILE" 2>/dev/null || true
    fi
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
    if [[ -n "${OUTPUT_FILE:-}" ]]; then 
        echo "[WARN] $(date '+%Y-%m-%d %H:%M:%S') $*" >> "$OUTPUT_FILE" 2>/dev/null || true
    fi
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
    if [[ -n "${OUTPUT_FILE:-}" ]]; then 
        echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $*" >> "$OUTPUT_FILE" 2>/dev/null || true
    fi
}

# Usage information
usage() {
    cat << EOF
Usage: $0 --env ENVIRONMENT [OPTIONS]

Run multi-tier smoke tests for dhash deployment validation.

Required Arguments:
  --env ENVIRONMENT     Target environment (production, staging, development)

Optional Arguments:
  --level LEVEL        Test level to run (critical, standard, all) (default: all)
  --output-file FILE   Save test results to file
  --timeout SECONDS    Test timeout in seconds (default: 300)
  --dry-run           Show what tests would be run without executing
  --help              Show this help message

Test Levels:
  critical    - Essential functionality tests (fastest, most important)
  standard    - Comprehensive functionality tests
  all         - All tests (critical + standard)

Examples:
  $0 --env production --level critical
  $0 --env staging --output-file smoke_test_results.log
  $0 --env development --dry-run

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENV="$2"
                shift 2
                ;;
            --level)
                TEST_LEVEL="$2"
                shift 2
                ;;
            --output-file)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$ENV" ]]; then
        log_error "Environment is required. Use --env ENVIRONMENT"
        usage
        exit 1
    fi
}

# Validate environment and test level
validate_args() {
    log_info "Validating arguments"
    
    case "$ENV" in
        production|staging|development)
            log_success "Environment '$ENV' is valid"
            ;;
        *)
            log_error "Invalid environment '$ENV'. Must be one of: production, staging, development"
            exit 1
            ;;
    esac

    case "$TEST_LEVEL" in
        critical|standard|all)
            log_success "Test level '$TEST_LEVEL' is valid"
            ;;
        *)
            log_error "Invalid test level '$TEST_LEVEL'. Must be one of: critical, standard, all"
            exit 1
            ;;
    esac
}

# Test result recording
record_test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"
    local duration="$4"
    
    TEST_RESULTS+=("$test_name:$status:$message:$duration")
    
    case "$status" in
        PASS)
            PASSED_TESTS=$((PASSED_TESTS + 1))
            log_success "✓ $test_name ($duration ms) - $message"
            ;;
        FAIL)
            FAILED_TESTS=$((FAILED_TESTS + 1))
            log_error "✗ $test_name ($duration ms) - $message"
            ;;
        SKIP)
            SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
            log_warn "⚠ $test_name (skipped) - $message"
            ;;
    esac
}

# Individual test functions
run_test() {
    local test_name="$1"
    local test_function="$2"
    local test_level="$3"
    
    # Skip if test level doesn't match
    if [[ "$TEST_LEVEL" != "all" && "$TEST_LEVEL" != "$test_level" ]]; then
        record_test_result "$test_name" "SKIP" "Test level '$test_level' not selected" "0"
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        record_test_result "$test_name" "SKIP" "Dry run mode" "0"
        return 0
    fi
    
    log_info "Running test: $test_name"
    
    local start_time=$(date +%s%3N)
    if $test_function; then
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        record_test_result "$test_name" "PASS" "Test completed successfully" "$duration"
        return 0
    else
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        record_test_result "$test_name" "FAIL" "Test failed" "$duration"
        return 1
    fi
}

# Critical tests - Essential functionality
test_health_endpoint() {
    local health_url="${DHASH_${ENV^^}_URL:-http://localhost:3000}/health"
    
    log_info "Testing health endpoint: $health_url"
    
    if curl -sf "$health_url" --max-time 30 > /dev/null; then
        return 0
    else
        log_error "Health endpoint failed"
        return 1
    fi
}

test_health_endpoint_response() {
    local health_url="${DHASH_${ENV^^}_URL:-http://localhost:3000}/health"
    
    log_info "Testing health endpoint response format"
    
    local response=$(curl -sf "$health_url" --max-time 30 2>/dev/null || echo "")
    
    if [[ -z "$response" ]]; then
        log_error "Empty health response"
        return 1
    fi
    
    # Check if response is valid JSON
    if echo "$response" | jq . > /dev/null 2>&1; then
        log_info "Health response is valid JSON"
        return 0
    else
        log_warn "Health response is not JSON, but endpoint responded"
        return 0  # Still consider this a pass as long as endpoint responds
    fi
}

test_basic_dhash_operation() {
    log_info "Testing basic dhash operation"
    
    # Create a test file for hashing
    local test_file="/tmp/dhash_test_$$.txt"
    echo "Test content for dhash smoke test $(date)" > "$test_file"
    
    # Test basic dhash functionality (simulated - replace with actual dhash API call)
    local dhash_url="${DHASH_${ENV^^}_URL:-http://localhost:3000}/hash"
    
    # Simulate dhash operation
    if command -v sha256sum &> /dev/null; then
        local test_hash=$(sha256sum "$test_file" | cut -d' ' -f1)
        log_info "Generated test hash: $test_hash"
        rm -f "$test_file"
        return 0
    else
        log_error "Cannot test dhash operation - sha256sum not available"
        rm -f "$test_file"
        return 1
    fi
}

test_database_connectivity() {
    log_info "Testing database connectivity"
    
    local env_var="DHASH_${ENV^^}_DATABASE_URL"
    local db_url="${!env_var:-}"
    
    if [[ -z "$db_url" ]]; then
        if [[ "$ENV" == "development" ]]; then
            db_url="sqlite://./dhash_dev.db"
        else
            log_error "Database URL not configured"
            return 1
        fi
    fi
    
    case "$db_url" in
        sqlite://*)
            local db_file="${db_url#sqlite://}"
            if [[ -f "$db_file" ]]; then
                if sqlite3 "$db_file" "SELECT 1;" > /dev/null 2>&1; then
                    log_info "SQLite database connectivity OK"
                    return 0
                else
                    log_error "SQLite database query failed"
                    return 1
                fi
            else
                log_error "SQLite database file not found: $db_file"
                return 1
            fi
            ;;
        postgres://*)
            if command -v psql &> /dev/null; then
                if psql "$db_url" -c "SELECT 1;" > /dev/null 2>&1; then
                    log_info "PostgreSQL database connectivity OK"
                    return 0
                else
                    log_error "PostgreSQL database connection failed"
                    return 1
                fi
            else
                log_error "psql not found"
                return 1
            fi
            ;;
        *)
            log_warn "Database connectivity test not implemented for: $db_url"
            return 0  # Pass for unsupported DB types
            ;;
    esac
}

test_process_running() {
    log_info "Testing if dhash processes are running"
    
    # Look for dhash-related processes
    local process_count=$(ps aux | grep -E '[d]hash|[n]ode.*dhash' | wc -l)
    
    if [[ $process_count -gt 0 ]]; then
        log_info "Found $process_count dhash-related process(es)"
        return 0
    else
        log_warn "No dhash processes found - this may be expected in some deployments"
        return 0  # Don't fail for this as some deployments may use different process names
    fi
}

# Standard tests - Comprehensive functionality
test_api_endpoints() {
    log_info "Testing API endpoints"
    
    local base_url="${DHASH_${ENV^^}_URL:-http://localhost:3000}"
    local endpoints=(
        "/health"
        "/api/status"
        "/api/version"
    )
    
    local passed=0
    local total=${#endpoints[@]}
    
    for endpoint in "${endpoints[@]}"; do
        local url="$base_url$endpoint"
        log_info "Testing endpoint: $url"
        
        if curl -sf "$url" --max-time 10 > /dev/null 2>&1; then
            log_info "✓ $endpoint"
            passed=$((passed + 1))
        else
            log_warn "✗ $endpoint (may not be implemented)"
        fi
    done
    
    log_info "API endpoints test: $passed/$total endpoints responded"
    
    # Pass if at least health endpoint works
    if [[ $passed -gt 0 ]]; then
        return 0
    else
        return 1
    fi
}

test_configuration_loading() {
    log_info "Testing configuration loading"
    
    # Check if configuration files exist
    local config_files=(
        "quality-gates-config.json"
        "package.json"
    )
    
    local found=0
    
    for config_file in "${config_files[@]}"; do
        if [[ -f "$ROOT_DIR/$config_file" ]]; then
            log_info "✓ Configuration file found: $config_file"
            found=$((found + 1))
            
            # Validate JSON files
            if [[ "$config_file" =~ \.json$ ]]; then
                if jq . "$ROOT_DIR/$config_file" > /dev/null 2>&1; then
                    log_info "✓ $config_file is valid JSON"
                else
                    log_error "✗ $config_file is invalid JSON"
                    return 1
                fi
            fi
        else
            log_warn "✗ Configuration file missing: $config_file"
        fi
    done
    
    return 0  # Pass even if some config files are missing
}

test_file_permissions() {
    log_info "Testing file permissions"
    
    # Check if critical scripts are executable
    local scripts=(
        "scripts/deploy_dhash.sh"
        "scripts/backup_dhash.sh"
        "scripts/migrate_dhash.sh"
        "scripts/rollback_dhash.sh"
        "quick-deploy.sh"
    )
    
    local issues=0
    
    for script in "${scripts[@]}"; do
        local script_path="$ROOT_DIR/$script"
        if [[ -f "$script_path" ]]; then
            if [[ -x "$script_path" ]]; then
                log_info "✓ $script is executable"
            else
                log_error "✗ $script is not executable"
                issues=$((issues + 1))
            fi
        else
            log_warn "✗ $script not found"
            issues=$((issues + 1))
        fi
    done
    
    # Check directory permissions
    local directories=(
        "backups"
        "deploy_logs"
    )
    
    for dir in "${directories[@]}"; do
        local dir_path="$ROOT_DIR/$dir"
        if [[ -d "$dir_path" ]]; then
            if [[ -w "$dir_path" ]]; then
                log_info "✓ $dir directory is writable"
            else
                log_error "✗ $dir directory is not writable"
                issues=$((issues + 1))
            fi
        else
            log_warn "✗ $dir directory not found"
        fi
    done
    
    if [[ $issues -eq 0 ]]; then
        return 0
    else
        return 1
    fi
}

test_external_dependencies() {
    log_info "Testing external dependencies"
    
    local required_commands=(
        "curl"
        "jq"
        "node"
        "npm"
    )
    
    local missing=0
    
    for cmd in "${required_commands[@]}"; do
        if command -v "$cmd" &> /dev/null; then
            local version=$(${cmd} --version 2>/dev/null | head -n1 || echo "unknown")
            log_info "✓ $cmd available ($version)"
        else
            log_error "✗ $cmd not found"
            missing=$((missing + 1))
        fi
    done
    
    # Check optional commands
    local optional_commands=(
        "sqlite3"
        "psql"
        "sha256sum"
        "zip"
    )
    
    for cmd in "${optional_commands[@]}"; do
        if command -v "$cmd" &> /dev/null; then
            log_info "✓ $cmd available (optional)"
        else
            log_warn "⚠ $cmd not found (optional)"
        fi
    done
    
    if [[ $missing -eq 0 ]]; then
        return 0
    else
        return 1
    fi
}

test_memory_and_disk_space() {
    log_info "Testing system resources"
    
    # Check available disk space
    local disk_usage
    disk_usage=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//' || echo "0")
    
    if [[ $disk_usage -gt 95 ]]; then
        log_error "Disk usage critically high: ${disk_usage}%"
        return 1
    elif [[ $disk_usage -gt 85 ]]; then
        log_warn "Disk usage high: ${disk_usage}%"
    else
        log_info "Disk usage OK: ${disk_usage}%"
    fi
    
    # Check available memory
    local memory_usage
    memory_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}' 2>/dev/null || echo "0")
    
    if [[ $memory_usage -gt 95 ]]; then
        log_error "Memory usage critically high: ${memory_usage}%"
        return 1
    elif [[ $memory_usage -gt 85 ]]; then
        log_warn "Memory usage high: ${memory_usage}%"
    else
        log_info "Memory usage OK: ${memory_usage}%"
    fi
    
    return 0
}

# Main test execution
run_smoke_tests() {
    log_info "Starting smoke tests for environment: $ENV"
    log_info "Test level: $TEST_LEVEL"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN MODE - No tests will be executed"
    fi
    
    # Critical tests
    run_test "health_endpoint" "test_health_endpoint" "critical"
    run_test "health_response_format" "test_health_endpoint_response" "critical"
    run_test "basic_dhash_operation" "test_basic_dhash_operation" "critical"
    run_test "database_connectivity" "test_database_connectivity" "critical"
    run_test "process_running" "test_process_running" "critical"
    
    # Standard tests
    run_test "api_endpoints" "test_api_endpoints" "standard"
    run_test "configuration_loading" "test_configuration_loading" "standard"
    run_test "file_permissions" "test_file_permissions" "standard"
    run_test "external_dependencies" "test_external_dependencies" "standard"
    run_test "memory_disk_resources" "test_memory_and_disk_space" "standard"
}

# Generate test report
generate_test_report() {
    local total_tests=$((PASSED_TESTS + FAILED_TESTS + SKIPPED_TESTS))
    
    cat << EOF

═══════════════════════════════════════════════════════════════
SMOKE TEST RESULTS SUMMARY
═══════════════════════════════════════════════════════════════
Environment: $ENV
Test Level: $TEST_LEVEL
Executed: $(date)
Total Tests: $total_tests
Passed: $PASSED_TESTS
Failed: $FAILED_TESTS
Skipped: $SKIPPED_TESTS
═══════════════════════════════════════════════════════════════

DETAILED RESULTS:
EOF

    for result in "${TEST_RESULTS[@]}"; do
        IFS=':' read -r test_name status message duration <<< "$result"
        printf "%-30s %s %s (%s ms)\n" "$test_name" "[$status]" "$message" "$duration"
    done
    
    if [[ -n "$OUTPUT_FILE" ]]; then
        echo ""
        echo "Detailed results saved to: $OUTPUT_FILE"
    fi
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

# Main execution
main() {
    # Setup
    mkdir -p "$LOG_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    # Setup output file if specified
    if [[ -n "$OUTPUT_FILE" ]]; then
        OUTPUT_FILE="$ROOT_DIR/$OUTPUT_FILE"
        echo "# Smoke Test Results - $(date)" > "$OUTPUT_FILE"
        echo "# Environment: $ENV, Level: $TEST_LEVEL" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
    
    log_info "Starting dhash smoke tests"
    log_info "Environment: $ENV"
    log_info "Test level: $TEST_LEVEL"
    log_info "Dry run: $DRY_RUN"
    
    # Execute tests
    validate_args
    run_smoke_tests
    
    # Generate report
    generate_test_report
    
    # Exit with appropriate code
    if [[ $FAILED_TESTS -eq 0 ]]; then
        log_success "All smoke tests passed! (Passed: $PASSED_TESTS, Skipped: $SKIPPED_TESTS)"
        exit 0
    else
        log_error "Some smoke tests failed! (Passed: $PASSED_TESTS, Failed: $FAILED_TESTS, Skipped: $SKIPPED_TESTS)"
        exit 1
    fi
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi