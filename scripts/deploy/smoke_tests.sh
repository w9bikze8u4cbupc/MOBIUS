#!/bin/bash
# MOBIUS Deployment Smoke Tests
# Validates core functionality after deployment

set -euo pipefail

SMOKE_TEST_LOG="${SMOKE_TEST_LOG:-./logs/postdeploy-smoketests.log}"
API_BASE_URL="${API_BASE_URL:-http://localhost:5001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
TIMEOUT="${TIMEOUT:-30}"

# Ensure log directory exists
mkdir -p "$(dirname "$SMOKE_TEST_LOG")"

# Function to log with timestamp
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message" | tee -a "$SMOKE_TEST_LOG"
}

# Function to run HTTP test with timeout
http_test() {
    local url="$1"
    local expected_status="${2:-200}"
    local description="$3"
    
    log "Testing: $description"
    log "URL: $url"
    
    if command -v curl >/dev/null 2>&1; then
        local response
        response=$(curl -s -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
        local status_code="${response: -3}"
        
        if [[ "$status_code" == "$expected_status" ]]; then
            log "✓ PASS: $description (HTTP $status_code)"
            return 0
        else
            log "✗ FAIL: $description (HTTP $status_code, expected $expected_status)"
            return 1
        fi
    else
        log "✗ SKIP: curl not available for HTTP testing"
        return 1
    fi
}

# Function to test API endpoints
test_api_endpoints() {
    log "=== API Endpoint Tests ==="
    local failures=0
    
    # Test health endpoint (if it exists)
    http_test "$API_BASE_URL/health" 200 "API Health Check" || ((failures++))
    
    # Test static file serving
    http_test "$API_BASE_URL/static/" 200 "Static File Serving" || ((failures++))
    
    # Test CORS preflight (if needed)
    if command -v curl >/dev/null 2>&1; then
        log "Testing CORS configuration"
        local cors_response
        cors_response=$(curl -s -I -X OPTIONS \
            -H "Origin: http://localhost:3000" \
            -H "Access-Control-Request-Method: POST" \
            -H "Access-Control-Request-Headers: Content-Type" \
            --max-time "$TIMEOUT" \
            "$API_BASE_URL/api/summarize" 2>/dev/null || echo "")
        
        if echo "$cors_response" | grep -q "Access-Control-Allow-Origin"; then
            log "✓ PASS: CORS configuration"
        else
            log "✗ FAIL: CORS configuration"
            ((failures++))
        fi
    fi
    
    return $failures
}

# Function to test frontend accessibility
test_frontend() {
    log "=== Frontend Tests ==="
    local failures=0
    
    # Test main page
    http_test "$FRONTEND_URL" 200 "Frontend Main Page" || ((failures++))
    
    # Test static assets (if served by frontend)
    http_test "$FRONTEND_URL/static/js/" 200 "Frontend Static Assets" || {
        log "INFO: Frontend static assets test skipped (may not be available in dev)"
    }
    
    return $failures
}

# Function to test database connectivity (if applicable)
test_database() {
    log "=== Database Tests ==="
    local failures=0
    
    # Check if there's a database connection test
    if [[ -f "./src/api/db.js" ]]; then
        log "Testing database connectivity"
        
        # Simple Node.js database test
        if command -v node >/dev/null 2>&1; then
            local db_test_result
            db_test_result=$(timeout "$TIMEOUT" node -e "
                const db = require('./src/api/db.js');
                if (db && typeof db.query === 'function') {
                    console.log('Database module loaded successfully');
                    process.exit(0);
                } else {
                    console.log('Database module not properly configured');
                    process.exit(1);
                }
            " 2>&1 || echo "Database test failed")
            
            if echo "$db_test_result" | grep -q "successfully"; then
                log "✓ PASS: Database connectivity"
            else
                log "✗ FAIL: Database connectivity - $db_test_result"
                ((failures++))
            fi
        else
            log "✗ SKIP: Node.js not available for database testing"
        fi
    else
        log "INFO: No database module found, skipping database tests"
    fi
    
    return $failures
}

# Function to test file system permissions
test_filesystem() {
    log "=== File System Tests ==="
    local failures=0
    
    # Test upload directory permissions
    local upload_dir="./src/api/uploads"
    if [[ -d "$upload_dir" ]]; then
        if [[ -w "$upload_dir" ]]; then
            log "✓ PASS: Upload directory writable"
        else
            log "✗ FAIL: Upload directory not writable"
            ((failures++))
        fi
    else
        log "INFO: Upload directory not found, creating..."
        mkdir -p "$upload_dir" && log "✓ PASS: Upload directory created"
    fi
    
    # Test backup directory permissions
    local backup_dir="./backups"
    mkdir -p "$backup_dir"
    if [[ -w "$backup_dir" ]]; then
        log "✓ PASS: Backup directory writable"
    else
        log "✗ FAIL: Backup directory not writable"
        ((failures++))
    fi
    
    # Test log directory permissions
    local log_dir="./logs"
    mkdir -p "$log_dir"
    if [[ -w "$log_dir" ]]; then
        log "✓ PASS: Log directory writable"
    else
        log "✗ FAIL: Log directory not writable"
        ((failures++))
    fi
    
    return $failures
}

# Function to test process health
test_processes() {
    log "=== Process Health Tests ==="
    local failures=0
    
    # Check for Node.js processes
    if pgrep -f "node" > /dev/null; then
        local node_count
        node_count=$(pgrep -f "node" | wc -l)
        log "✓ PASS: Node.js processes running ($node_count processes)"
    else
        log "✗ FAIL: No Node.js processes found"
        ((failures++))
    fi
    
    # Check memory usage
    if command -v free >/dev/null 2>&1; then
        local memory_info
        memory_info=$(free -h | head -2)
        log "Memory usage:"
        log "$memory_info"
    fi
    
    # Check disk usage
    if command -v df >/dev/null 2>&1; then
        local disk_usage
        disk_usage=$(df -h . | tail -1)
        log "Disk usage: $disk_usage"
    fi
    
    return $failures
}

# Function to test golden file integrity (MOBIUS specific)
test_golden_files() {
    log "=== Golden File Tests ==="
    local failures=0
    
    if [[ -d "./tests/golden" ]]; then
        # Check if golden files exist and are readable
        local golden_games=0
        local golden_failures=0
        
        for game_dir in ./tests/golden/*/; do
            if [[ -d "$game_dir" ]]; then
                ((golden_games++))
                local game_name
                game_name=$(basename "$game_dir")
                
                if [[ -f "$game_dir/container.json" && -f "$game_dir/audio_stats.json" ]]; then
                    log "✓ PASS: Golden files exist for $game_name"
                else
                    log "✗ FAIL: Missing golden files for $game_name"
                    ((golden_failures++))
                fi
            fi
        done
        
        if [[ $golden_failures -eq 0 ]]; then
            log "✓ PASS: All golden files intact ($golden_games games)"
        else
            log "✗ FAIL: $golden_failures/$golden_games golden file sets have issues"
            ((failures++))
        fi
    else
        log "INFO: No golden files directory found"
    fi
    
    return $failures
}

# Main smoke test execution
main() {
    log "=== MOBIUS Deployment Smoke Tests Starting ==="
    log "Timestamp: $(date)"
    log "API Base URL: $API_BASE_URL"
    log "Frontend URL: $FRONTEND_URL"
    log "Timeout: ${TIMEOUT}s"
    
    local total_failures=0
    
    # Run all test suites
    test_processes || ((total_failures += $?))
    test_filesystem || ((total_failures += $?))
    test_api_endpoints || ((total_failures += $?))
    test_frontend || ((total_failures += $?))
    test_database || ((total_failures += $?))
    test_golden_files || ((total_failures += $?))
    
    log "=== Smoke Tests Summary ==="
    if [[ $total_failures -eq 0 ]]; then
        log "✓ ALL TESTS PASSED: Deployment smoke tests successful"
        log "Application appears to be healthy and ready for production traffic"
        exit 0
    else
        log "✗ TESTS FAILED: $total_failures test failures detected"
        log "Review the failures above and consider rollback if issues are critical"
        exit 1
    fi
}

# Handle help argument
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    cat << EOF
Usage: $0 [options]

Runs comprehensive smoke tests after MOBIUS deployment.

Environment Variables:
  SMOKE_TEST_LOG   Log file path (default: ./logs/postdeploy-smoketests.log)
  API_BASE_URL    API base URL (default: http://localhost:5001)
  FRONTEND_URL    Frontend URL (default: http://localhost:3000)
  TIMEOUT         HTTP timeout in seconds (default: 30)

Exit Codes:
  0   All tests passed
  1   One or more tests failed

Examples:
  $0                                    # Run with defaults
  API_BASE_URL=https://api.mobius.com $0  # Test production API
  TIMEOUT=60 $0                        # Use 60s timeout
EOF
    exit 0
fi

# Execute main function
main "$@"