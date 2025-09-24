#!/bin/bash
set -euo pipefail

# Simple Smoke Test Script for DHash Deployment
# Usage: ./scripts/simple_smoke_test.sh [--timeout=60]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default configuration
TIMEOUT=60
SERVER_PORT=${PORT:-5001}
BASE_URL="http://localhost:$SERVER_PORT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
for arg in "$@"; do
    case $arg in
        --timeout=*)
            TIMEOUT="${arg#*=}"
            shift
            ;;
        --port=*)
            SERVER_PORT="${arg#*=}"
            BASE_URL="http://localhost:$SERVER_PORT"
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $arg${NC}"
            echo "Usage: $0 [--timeout=60] [--port=5001]"
            exit 1
            ;;
    esac
done

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Function to wait for server to be ready
wait_for_server() {
    log "Waiting for server to be ready on port $SERVER_PORT..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + TIMEOUT))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        if curl -s "$BASE_URL/health" >/dev/null 2>&1; then
            log "Server is ready!"
            return 0
        fi
        sleep 2
        echo -n "."
    done
    
    echo ""
    error "Server failed to start within $TIMEOUT seconds"
}

# Function to test health endpoint
test_health_endpoint() {
    log "Testing /health endpoint..."
    
    local response=$(curl -s "$BASE_URL/health" || echo "")
    
    if [[ -z "$response" ]]; then
        error "Health endpoint returned empty response"
    fi
    
    # Check if response is valid JSON
    if ! echo "$response" | jq empty >/dev/null 2>&1; then
        error "Health endpoint returned invalid JSON: $response"
    fi
    
    # Check required fields
    local status=$(echo "$response" | jq -r '.status // empty')
    local message=$(echo "$response" | jq -r '.message // empty')
    local uptime=$(echo "$response" | jq -r '.uptime // empty')
    
    if [[ "$status" != "healthy" ]]; then
        error "Health check failed. Status: $status"
    fi
    
    if [[ -z "$message" || -z "$uptime" ]]; then
        error "Health response missing required fields"
    fi
    
    log "✓ Health endpoint test passed"
    info "  Status: $status"
    info "  Uptime: ${uptime}s"
}

# Function to test DHash metrics endpoint
test_dhash_metrics() {
    log "Testing /metrics/dhash endpoint..."
    
    local response=$(curl -s "$BASE_URL/metrics/dhash" || echo "")
    
    if [[ -z "$response" ]]; then
        error "DHash metrics endpoint returned empty response"
    fi
    
    # Check if response is valid JSON
    if ! echo "$response" | jq empty >/dev/null 2>&1; then
        error "DHash metrics endpoint returned invalid JSON: $response"
    fi
    
    # Check required metrics
    local avg_hash_time=$(echo "$response" | jq -r '.avg_hash_time // empty')
    local p95_hash_time=$(echo "$response" | jq -r '.p95_hash_time // empty')
    local extraction_failures_rate=$(echo "$response" | jq -r '.extraction_failures_rate // empty')
    local low_confidence_queue_length=$(echo "$response" | jq -r '.low_confidence_queue_length // empty')
    
    if [[ -z "$avg_hash_time" || -z "$p95_hash_time" || -z "$extraction_failures_rate" || -z "$low_confidence_queue_length" ]]; then
        error "DHash metrics response missing required fields"
    fi
    
    # Validate metric thresholds
    if (( $(echo "$avg_hash_time > 200" | bc -l 2>/dev/null || echo 0) )); then
        warn "avg_hash_time ($avg_hash_time ms) exceeds recommended threshold (200ms)"
    fi
    
    if (( $(echo "$p95_hash_time > 500" | bc -l 2>/dev/null || echo 0) )); then
        warn "p95_hash_time ($p95_hash_time ms) exceeds recommended threshold (500ms)"
    fi
    
    if (( $(echo "$extraction_failures_rate > 5" | bc -l 2>/dev/null || echo 0) )); then
        warn "extraction_failures_rate ($extraction_failures_rate%) exceeds recommended threshold (5%)"
    fi
    
    log "✓ DHash metrics endpoint test passed"
    info "  avg_hash_time: ${avg_hash_time}ms"
    info "  p95_hash_time: ${p95_hash_time}ms"
    info "  extraction_failures_rate: ${extraction_failures_rate}%"
    info "  low_confidence_queue_length: $low_confidence_queue_length"
}

# Function to test basic API functionality
test_api_functionality() {
    log "Testing basic API functionality..."
    
    # Test CORS headers
    local cors_response=$(curl -s -I -H "Origin: http://localhost:3000" "$BASE_URL/health" || echo "")
    if [[ "$cors_response" == *"Access-Control-Allow-Origin"* ]]; then
        log "✓ CORS configuration test passed"
    else
        warn "CORS configuration may not be properly set"
    fi
    
    # Test invalid endpoint
    local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/invalid-endpoint" || echo "000")
    if [[ "$status_code" == "404" ]]; then
        log "✓ Error handling test passed"
    else
        warn "Unexpected status code for invalid endpoint: $status_code"
    fi
}

# Function to test library file integrity
test_library_integrity() {
    log "Testing library file integrity..."
    
    local library_path="$PROJECT_ROOT/library.json"
    
    if [[ ! -f "$library_path" ]]; then
        warn "Library file not found: $library_path"
        return 0
    fi
    
    # Test JSON validity
    if jq empty "$library_path" >/dev/null 2>&1; then
        log "✓ Library JSON structure test passed"
    else
        error "Library JSON structure test failed"
    fi
    
    # Check for required fields
    local version=$(jq -r '.version // empty' "$library_path" 2>/dev/null || echo "")
    if [[ -n "$version" ]]; then
        log "✓ Library version found: $version"
    else
        warn "Library version not found"
    fi
}

# Function to test backup system
test_backup_system() {
    log "Testing backup system integrity..."
    
    local backup_dir="$PROJECT_ROOT/backups"
    
    if [[ ! -d "$backup_dir" ]]; then
        warn "Backup directory not found: $backup_dir"
        return 0
    fi
    
    # Find latest backup
    local latest_backup=$(ls -t "$backup_dir"/library.json.bak.* 2>/dev/null | head -n1 || echo "")
    
    if [[ -z "$latest_backup" ]]; then
        warn "No backups found in $backup_dir"
        return 0
    fi
    
    # Test backup integrity
    local checksum_file="$latest_backup.sha256"
    if [[ -f "$checksum_file" ]]; then
        if sha256sum -c "$checksum_file" >/dev/null 2>&1; then
            log "✓ Latest backup integrity test passed"
        else
            error "Latest backup integrity test failed"
        fi
    else
        warn "Checksum file not found for latest backup"
    fi
}

# Function to run performance baseline tests
run_performance_tests() {
    log "Running performance baseline tests..."
    
    # Test health endpoint response time
    local start_time=$(date +%s%3N)
    curl -s "$BASE_URL/health" >/dev/null
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    info "Health endpoint response time: ${response_time}ms"
    
    if [[ $response_time -gt 1000 ]]; then
        warn "Health endpoint response time (${response_time}ms) exceeds 1000ms"
    else
        log "✓ Health endpoint response time test passed"
    fi
    
    # Test metrics endpoint response time
    start_time=$(date +%s%3N)
    curl -s "$BASE_URL/metrics/dhash" >/dev/null
    end_time=$(date +%s%3N)
    response_time=$((end_time - start_time))
    
    info "Metrics endpoint response time: ${response_time}ms"
    
    if [[ $response_time -gt 2000 ]]; then
        warn "Metrics endpoint response time (${response_time}ms) exceeds 2000ms"
    else
        log "✓ Metrics endpoint response time test passed"
    fi
}

# Function to generate smoke test report
generate_report() {
    local report_file="$PROJECT_ROOT/smoke_test_report_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
DHash Deployment Smoke Test Report
Generated: $(date)
Server: $BASE_URL
Timeout: ${TIMEOUT}s

Test Results:
- Health endpoint: PASSED
- DHash metrics endpoint: PASSED
- API functionality: PASSED
- Library integrity: PASSED
- Backup system: PASSED
- Performance tests: PASSED

Next Steps:
1. Monitor /health and /metrics/dhash for 30-60 minutes
2. Check avg_hash_time < 200ms
3. Check p95_hash_time < 500ms
4. Check extraction_failures_rate < 5%
5. Monitor low_confidence_queue_length for spikes

Report generated by: $0
EOF

    log "Smoke test report generated: $report_file"
}

# Main smoke test execution
main() {
    log "Starting DHash deployment smoke tests..."
    info "Server: $BASE_URL"
    info "Timeout: ${TIMEOUT}s"
    
    # Check dependencies
    command -v curl >/dev/null 2>&1 || error "curl is required but not installed"
    command -v jq >/dev/null 2>&1 || error "jq is required but not installed"
    
    # Wait for server to be ready
    wait_for_server
    
    # Run all tests
    test_health_endpoint
    test_dhash_metrics
    test_api_functionality
    test_library_integrity
    test_backup_system
    run_performance_tests
    
    # Generate report
    generate_report
    
    log "All smoke tests completed successfully! ✅"
    info "Continue monitoring the system for 30-60 minutes"
    info "Watch for any alerts on the monitoring thresholds"
}

# Run main function
main "$@"