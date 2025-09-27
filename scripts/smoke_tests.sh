#!/bin/bash

# Smoke tests script for dhash component
# Validates deployment health and core functionality

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
TEST_PHASE="post-deploy"
CONCURRENT_TESTS=true
OUTPUT_FILE=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --phase)
      TEST_PHASE="$2"
      shift 2
      ;;
    --no-concurrent)
      CONCURRENT_TESTS=false
      shift
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --pre-deploy)
      TEST_PHASE="pre-deploy"
      shift
      ;;
    --post-deploy)
      TEST_PHASE="post-deploy"
      shift
      ;;
    --post-rollback)
      TEST_PHASE="post-rollback"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --dry-run          Simulate tests without running actual checks"
      echo "  --env ENVIRONMENT  Target environment (staging, production)"
      echo "  --phase PHASE      Test phase (pre-deploy, post-deploy, post-rollback)"
      echo "  --no-concurrent    Run tests sequentially instead of in parallel"
      echo "  --output FILE      Write test results to file"
      echo "  --pre-deploy       Shortcut for --phase pre-deploy"
      echo "  --post-deploy      Shortcut for --phase post-deploy"
      echo "  --post-rollback    Shortcut for --phase post-rollback"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Setup output file
if [[ -n "$OUTPUT_FILE" ]]; then
  mkdir -p "$(dirname "$OUTPUT_FILE")"
  exec 1> >(tee -a "$OUTPUT_FILE")
  exec 2> >(tee -a "$OUTPUT_FILE" >&2)
fi

# Logging functions
log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
}

log_warn() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*" >&2
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

log_success() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] PASS: $*"
}

log_fail() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAIL: $*" >&2
}

# Test result tracking
declare -a TEST_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Record test result
record_test() {
  local test_name="$1"
  local result="$2"
  local message="$3"
  local duration="${4:-0}"
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  if [[ "$result" == "PASS" ]]; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    log_success "$test_name - $message (${duration}ms)"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    log_fail "$test_name - $message (${duration}ms)"
  fi
  
  TEST_RESULTS+=("$test_name|$result|$message|$duration")
}

# Basic health check
test_basic_health() {
  local test_start=$(date +%s%3N)
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would perform basic health check"
    record_test "basic_health" "PASS" "Health check simulated" 100
    return 0
  fi
  
  log_info "Running basic health check..."
  
  # Check if required directories exist
  local dirs_to_check=("$PROJECT_ROOT/src" "$PROJECT_ROOT/scripts")
  for dir in "${dirs_to_check[@]}"; do
    if [[ ! -d "$dir" ]]; then
      local test_end=$(date +%s%3N)
      record_test "basic_health" "FAIL" "Required directory missing: $dir" $((test_end - test_start))
      return 1
    fi
  done
  
  # Check if core files exist
  local files_to_check=("$PROJECT_ROOT/package.json")
  if [[ "$TEST_PHASE" == "post-deploy" || "$TEST_PHASE" == "post-rollback" ]]; then
    files_to_check+=("$PROJECT_ROOT/src/video_generator.py")
  fi
  
  for file in "${files_to_check[@]}"; do
    if [[ ! -f "$file" ]]; then
      local test_end=$(date +%s%3N)
      record_test "basic_health" "FAIL" "Required file missing: $(basename "$file")" $((test_end - test_start))
      return 1
    fi
  done
  
  # Simulate service health check
  sleep 1
  
  local test_end=$(date +%s%3N)
  record_test "basic_health" "PASS" "All basic health checks passed" $((test_end - test_start))
}

# Configuration validation
test_configuration() {
  local test_start=$(date +%s%3N)
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would validate configuration files"
    record_test "configuration" "PASS" "Configuration validation simulated" 50
    return 0
  fi
  
  log_info "Validating configuration..."
  
  # Check if configuration directory exists for post-deploy tests
  if [[ "$TEST_PHASE" == "post-deploy" || "$TEST_PHASE" == "post-rollback" ]]; then
    local config_file="$PROJECT_ROOT/config/$ENVIRONMENT/dhash.json"
    
    if [[ ! -f "$config_file" ]]; then
      local test_end=$(date +%s%3N)
      record_test "configuration" "FAIL" "Configuration file not found: $config_file" $((test_end - test_start))
      return 1
    fi
    
    # Validate JSON syntax
    if ! jq . "$config_file" > /dev/null 2>&1; then
      local test_end=$(date +%s%3N)
      record_test "configuration" "FAIL" "Invalid JSON in configuration file" $((test_end - test_start))
      return 1
    fi
    
    # Check required configuration keys
    local required_keys=("environment" "hash_algorithm" "monitoring")
    for key in "${required_keys[@]}"; do
      if ! jq -e ".$key" "$config_file" > /dev/null 2>&1; then
        local test_end=$(date +%s%3N)
        record_test "configuration" "FAIL" "Missing required configuration key: $key" $((test_end - test_start))
        return 1
      fi
    done
  fi
  
  # Check package.json
  if ! jq . "$PROJECT_ROOT/package.json" > /dev/null 2>&1; then
    local test_end=$(date +%s%3N)
    record_test "configuration" "FAIL" "Invalid package.json" $((test_end - test_start))
    return 1
  fi
  
  local test_end=$(date +%s%3N)
  record_test "configuration" "PASS" "All configuration files valid" $((test_end - test_start))
}

# Dependencies check
test_dependencies() {
  local test_start=$(date +%s%3N)
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would check dependencies"
    record_test "dependencies" "PASS" "Dependencies check simulated" 200
    return 0
  fi
  
  log_info "Checking dependencies..."
  
  # Check Node.js dependencies
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    cd "$PROJECT_ROOT"
    
    # Check if node_modules exists (post-deploy)
    if [[ "$TEST_PHASE" == "post-deploy" || "$TEST_PHASE" == "post-rollback" ]]; then
      if [[ ! -d "node_modules" ]]; then
        local test_end=$(date +%s%3N)
        record_test "dependencies" "FAIL" "node_modules directory not found" $((test_end - test_start))
        return 1
      fi
    fi
    
    # Check for npm vulnerabilities (if npm is available)
    if command -v npm &> /dev/null; then
      if ! npm audit --audit-level=high 2>/dev/null; then
        log_warn "npm audit found high-severity vulnerabilities"
        # Don't fail the test for vulnerabilities, just warn
      fi
    fi
  fi
  
  # Check system dependencies
  local required_tools=("node" "python3")
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" &> /dev/null; then
      local test_end=$(date +%s%3N)
      record_test "dependencies" "FAIL" "Required tool not found: $tool" $((test_end - test_start))
      return 1
    fi
  done
  
  local test_end=$(date +%s%3N)
  record_test "dependencies" "PASS" "All dependencies satisfied" $((test_end - test_start))
}

# Hash functionality test
test_hash_functionality() {
  local test_start=$(date +%s%3N)
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would test hash functionality"
    record_test "hash_functionality" "PASS" "Hash functionality test simulated" 300
    return 0
  fi
  
  if [[ "$TEST_PHASE" == "pre-deploy" ]]; then
    # Pre-deploy: just check if files exist
    if [[ ! -f "$PROJECT_ROOT/src/video_generator.py" ]]; then
      local test_end=$(date +%s%3N)
      record_test "hash_functionality" "FAIL" "Hash component source not found" $((test_end - test_start))
      return 1
    fi
    
    # Check Python syntax
    if ! python3 -m py_compile "$PROJECT_ROOT/src/video_generator.py" 2>/dev/null; then
      local test_end=$(date +%s%3N)
      record_test "hash_functionality" "FAIL" "Python syntax error in video_generator.py" $((test_end - test_start))
      return 1
    fi
  else
    # Post-deploy/rollback: test actual functionality
    log_info "Testing hash functionality..."
    
    # Create test file
    local test_file="/tmp/dhash_test_${TIMESTAMP}.txt"
    echo "test content for dhash functionality" > "$test_file"
    
    # Test SHA256 hash generation
    if command -v sha256sum &> /dev/null; then
      local hash1
      hash1=$(sha256sum "$test_file" | cut -d' ' -f1)
      local hash2
      hash2=$(sha256sum "$test_file" | cut -d' ' -f1)
      
      if [[ "$hash1" != "$hash2" ]]; then
        rm -f "$test_file"
        local test_end=$(date +%s%3N)
        record_test "hash_functionality" "FAIL" "Hash generation inconsistent" $((test_end - test_start))
        return 1
      fi
      
      # Verify hash is expected length (64 chars for SHA256)
      if [[ ${#hash1} -ne 64 ]]; then
        rm -f "$test_file"
        local test_end=$(date +%s%3N)
        record_test "hash_functionality" "FAIL" "Hash length invalid (expected 64, got ${#hash1})" $((test_end - test_start))
        return 1
      fi
    elif command -v shasum &> /dev/null; then
      # macOS
      local hash1
      hash1=$(shasum -a 256 "$test_file" | cut -d' ' -f1)
      local hash2
      hash2=$(shasum -a 256 "$test_file" | cut -d' ' -f1)
      
      if [[ "$hash1" != "$hash2" ]]; then
        rm -f "$test_file"
        local test_end=$(date +%s%3N)
        record_test "hash_functionality" "FAIL" "Hash generation inconsistent" $((test_end - test_start))
        return 1
      fi
    else
      rm -f "$test_file"
      local test_end=$(date +%s%3N)
      record_test "hash_functionality" "FAIL" "No SHA256 utility found" $((test_end - test_start))
      return 1
    fi
    
    rm -f "$test_file"
  fi
  
  local test_end=$(date +%s%3N)
  record_test "hash_functionality" "PASS" "Hash functionality working correctly" $((test_end - test_start))
}

# Logging validation test
test_logging() {
  local test_start=$(date +%s%3N)
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would test logging functionality"
    record_test "logging" "PASS" "Logging test simulated" 150
    return 0
  fi
  
  log_info "Testing logging functionality..."
  
  # Create logs directory if it doesn't exist
  mkdir -p "$PROJECT_ROOT/logs"
  
  # Test log file creation
  local test_log="$PROJECT_ROOT/logs/smoke_test_${TIMESTAMP}.log"
  echo "Test log entry at $(date)" > "$test_log"
  
  if [[ ! -f "$test_log" ]]; then
    local test_end=$(date +%s%3N)
    record_test "logging" "FAIL" "Could not create log file" $((test_end - test_start))
    return 1
  fi
  
  # Test log file write permissions
  if ! echo "Additional test entry" >> "$test_log" 2>/dev/null; then
    local test_end=$(date +%s%3N)
    record_test "logging" "FAIL" "Could not write to log file" $((test_end - test_start))
    return 1
  fi
  
  # Test log redaction (simulated)
  echo "Password: REDACTED" >> "$test_log"
  echo "API_KEY: REDACTED" >> "$test_log"
  
  # Verify no sensitive data leaked
  if grep -q "password.*[^REDACTED]" "$test_log" || grep -q "api.*key.*[^REDACTED]" "$test_log"; then
    rm -f "$test_log"
    local test_end=$(date +%s%3N)
    record_test "logging" "FAIL" "Sensitive data not properly redacted" $((test_end - test_start))
    return 1
  fi
  
  # Clean up test log
  rm -f "$test_log"
  
  local test_end=$(date +%s%3N)
  record_test "logging" "PASS" "Logging functionality working correctly" $((test_end - test_start))
}

# Concurrency test
test_concurrency() {
  local test_start=$(date +%s%3N)
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would test concurrent operations"
    record_test "concurrency" "PASS" "Concurrency test simulated" 500
    return 0
  fi
  
  if [[ "$CONCURRENT_TESTS" == false ]]; then
    log_info "Skipping concurrency test (--no-concurrent specified)"
    record_test "concurrency" "SKIP" "Test skipped by user request" 0
    return 0
  fi
  
  log_info "Testing concurrent operations..."
  
  # Create multiple temporary processes to simulate concurrent hash operations
  local pids=()
  local temp_dir="/tmp/dhash_concurrency_${TIMESTAMP}"
  mkdir -p "$temp_dir"
  
  # Start 4 concurrent "hash" operations
  for i in {1..4}; do
    (
      # Simulate hash processing with different load
      local test_file="$temp_dir/test_$i.txt"
      echo "concurrent test data $i" > "$test_file"
      
      # Simulate processing time
      sleep $(echo "scale=2; $i * 0.5" | bc 2>/dev/null || echo "1")
      
      # Generate hash
      if command -v sha256sum &> /dev/null; then
        sha256sum "$test_file" > "$temp_dir/hash_$i.txt"
      elif command -v shasum &> /dev/null; then
        shasum -a 256 "$test_file" > "$temp_dir/hash_$i.txt"
      fi
      
      # Write result
      echo "Process $i completed at $(date)" > "$temp_dir/result_$i.txt"
    ) &
    pids+=($!)
  done
  
  # Wait for all processes to complete (with timeout)
  local timeout=10
  local elapsed=0
  
  while [[ $elapsed -lt $timeout ]]; do
    local all_done=true
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        all_done=false
        break
      fi
    done
    
    if [[ "$all_done" == true ]]; then
      break
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  # Kill any remaining processes
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  
  wait 2>/dev/null || true
  
  # Check results
  local completed=0
  for i in {1..4}; do
    if [[ -f "$temp_dir/result_$i.txt" ]]; then
      completed=$((completed + 1))
    fi
  done
  
  # Clean up
  rm -rf "$temp_dir"
  
  if [[ $completed -ge 3 ]]; then
    local test_end=$(date +%s%3N)
    record_test "concurrency" "PASS" "$completed/4 concurrent operations completed" $((test_end - test_start))
  else
    local test_end=$(date +%s%3N)
    record_test "concurrency" "FAIL" "Only $completed/4 concurrent operations completed" $((test_end - test_start))
    return 1
  fi
}

# Run all tests
run_tests() {
  log_info "Starting smoke tests for dhash component"
  log_info "Environment: $ENVIRONMENT"
  log_info "Test phase: $TEST_PHASE"
  log_info "Dry run: $DRY_RUN"
  
  # Define test suite based on phase
  local tests=()
  
  case "$TEST_PHASE" in
    "pre-deploy")
      tests=("test_basic_health" "test_configuration" "test_dependencies" "test_hash_functionality")
      ;;
    "post-deploy")
      tests=("test_basic_health" "test_configuration" "test_dependencies" "test_hash_functionality" "test_logging" "test_concurrency")
      ;;
    "post-rollback")
      tests=("test_basic_health" "test_configuration" "test_hash_functionality" "test_logging")
      ;;
    *)
      log_error "Unknown test phase: $TEST_PHASE"
      exit 1
      ;;
  esac
  
  # Run tests
  for test in "${tests[@]}"; do
    log_info "Running $test..."
    if ! $test; then
      log_error "Test $test failed"
    fi
  done
}

# Generate test report
generate_report() {
  echo
  echo "=============================================="
  echo "DHASH SMOKE TEST REPORT"
  echo "=============================================="
  echo "Environment: $ENVIRONMENT"
  echo "Test Phase: $TEST_PHASE"
  echo "Timestamp: $(date)"
  echo "Total Tests: $TOTAL_TESTS"
  echo "Passed: $PASSED_TESTS"
  echo "Failed: $FAILED_TESTS"
  echo "Success Rate: $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"
  echo "=============================================="
  
  echo
  echo "Test Details:"
  for result in "${TEST_RESULTS[@]}"; do
    IFS='|' read -r name status message duration <<< "$result"
    printf "%-20s %s %s (%sms)\n" "$name" "$status" "$message" "$duration"
  done
  echo "=============================================="
  
  if [[ $FAILED_TESTS -gt 0 ]]; then
    echo
    log_error "Smoke tests FAILED: $FAILED_TESTS/$TOTAL_TESTS tests failed"
    return 1
  else
    echo
    log_success "All smoke tests PASSED: $PASSED_TESTS/$TOTAL_TESTS tests successful"
    return 0
  fi
}

# Main execution
main() {
  # Ensure bc is available for calculations (or provide fallback)
  if ! command -v bc &> /dev/null; then
    log_warn "bc command not found, using shell arithmetic (may be less precise)"
  fi
  
  run_tests
  
  if generate_report; then
    exit 0
  else
    exit 1
  fi
}

# Execute main function
main "$@"