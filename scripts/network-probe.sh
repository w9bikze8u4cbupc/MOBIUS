#!/bin/bash

# Network Connectivity Probe for CI/CD Pipelines
# Performs multi-layer diagnostics for external APIs

set -uo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
readonly LOG_FILE="${SCRIPT_DIR}/network-probe.log"
readonly JSON_FILE="${SCRIPT_DIR}/network-diagnostics.json"
readonly TRACEROUTE_LOG="${SCRIPT_DIR}/traceroute.log"
readonly DIG_LOG="${SCRIPT_DIR}/dig.log"
readonly OPENSSL_LOG="${SCRIPT_DIR}/openssl.log"

# Target endpoints configuration
declare -A ENDPOINTS=(
    ["api.openai.com"]="443"
    ["api.elevenlabs.io"]="443"
    ["boardgamegeek.com"]="443"
    ["extract.pics"]="443"
)

# Mock mode configuration
readonly MOCK_OPENAI="${MOCK_OPENAI:-false}"
readonly MOCK_ELEVENLABS="${MOCK_ELEVENLABS:-false}"
readonly MOCK_BGG="${MOCK_BGG:-false}"
readonly MOCK_EXTRACT_PICS="${MOCK_EXTRACT_PICS:-false}"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date -u +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR $(date -u +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING $(date -u +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS $(date -u +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"
}

# Utility functions
detect_platform() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        CYGWIN*|MINGW32*|MSYS*|MINGW*) echo "windows";;
        *)          echo "unknown";;
    esac
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Test functions
test_dns() {
    local host="$1"
    local result=""
    local status="failed"
    
    log "Testing DNS resolution for $host..."
    
    if command_exists dig; then
        if result=$(dig +short "$host" 2>>"$DIG_LOG"); then
            if [[ -n "$result" ]]; then
                status="passed"
                log_success "DNS resolution successful: $result"
            else
                log_error "DNS resolution returned empty result"
            fi
        else
            log_error "DNS resolution failed"
        fi
    elif command_exists nslookup; then
        if result=$(nslookup "$host" 2>>"$DIG_LOG" | grep -A1 "Name:" | tail -1 | awk '{print $2}'); then
            if [[ -n "$result" ]]; then
                status="passed"
                log_success "DNS resolution successful: $result"
            else
                log_error "DNS resolution returned empty result"
            fi
        else
            log_error "DNS resolution failed"
        fi
    else
        log_warning "No DNS resolution tools available (dig/nslookup)"
        status="skipped"
    fi
    
    echo "$status"
}

test_tcp() {
    local host="$1"
    local port="$2"
    local status="failed"
    local platform
    platform=$(detect_platform)
    
    log "Testing TCP connectivity to $host:$port..."
    
    if command_exists nc; then
        if timeout 10 nc -z "$host" "$port" 2>/dev/null; then
            status="passed"
            log_success "TCP connection successful"
        else
            log_error "TCP connection failed"
        fi
    elif command_exists telnet && [[ "$platform" == "windows" ]]; then
        # Windows telnet approach
        if echo "quit" | timeout 10 telnet "$host" "$port" 2>/dev/null | grep -q "Connected"; then
            status="passed"
            log_success "TCP connection successful"
        else
            log_error "TCP connection failed"
        fi
    elif command_exists timeout && command_exists bash; then
        # Pure bash approach
        if timeout 10 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
            status="passed"
            log_success "TCP connection successful"
        else
            log_error "TCP connection failed"
        fi
    else
        log_warning "No TCP testing tools available (nc/telnet/bash)"
        status="skipped"
    fi
    
    echo "$status"
}

test_http() {
    local host="$1"
    local port="$2"
    local status="failed"
    local url="https://$host"
    
    # Use HTTP for non-443 ports
    if [[ "$port" != "443" ]]; then
        url="http://$host:$port"
    fi
    
    log "Testing HTTP/HTTPS connectivity to $url..."
    
    if command_exists curl; then
        if curl -v --max-time 10 --connect-timeout 5 -o /dev/null -s -w "%{http_code}" "$url" 2>/dev/null | grep -q "^[2-5][0-9][0-9]$"; then
            status="passed"
            log_success "HTTP/HTTPS request successful"
        else
            log_error "HTTP/HTTPS request failed"
        fi
    elif command_exists wget; then
        if wget --timeout=10 --tries=1 -q -O /dev/null "$url" 2>/dev/null; then
            status="passed"
            log_success "HTTP/HTTPS request successful"
        else
            log_error "HTTP/HTTPS request failed"
        fi
    else
        log_warning "No HTTP testing tools available (curl/wget)"
        status="skipped"
    fi
    
    echo "$status"
}

test_tls() {
    local host="$1"
    local port="$2"
    local status="failed"
    
    # Skip TLS test for non-443 ports
    if [[ "$port" != "443" ]]; then
        echo "skipped"
        return
    fi
    
    log "Testing TLS handshake to $host:$port..."
    
    if command_exists openssl; then
        if echo "Q" | timeout 10 openssl s_client -connect "$host:$port" -servername "$host" 2>>"$OPENSSL_LOG" | grep -q "Verify return code: 0"; then
            status="passed"
            log_success "TLS handshake successful"
        else
            log_error "TLS handshake failed"
        fi
    else
        log_warning "OpenSSL not available for TLS testing"
        status="skipped"
    fi
    
    echo "$status"
}

test_traceroute() {
    local host="$1"
    local platform
    platform=$(detect_platform)
    
    log "Running traceroute to $host..."
    
    if [[ "$platform" == "windows" ]] && command_exists tracert; then
        timeout 30 tracert "$host" 2>&1 | head -20 >> "$TRACEROUTE_LOG" || true
    elif command_exists traceroute; then
        timeout 30 traceroute -n "$host" 2>&1 | head -20 >> "$TRACEROUTE_LOG" || true
    else
        log_warning "No traceroute tools available"
    fi
}

# Mock mode checks
is_mocked() {
    local host="$1"
    case "$host" in
        "api.openai.com")     [[ "$MOCK_OPENAI" == "true" ]];;
        "api.elevenlabs.io")  [[ "$MOCK_ELEVENLABS" == "true" ]];;
        "boardgamegeek.com")  [[ "$MOCK_BGG" == "true" ]];;
        "extract.pics")       [[ "$MOCK_EXTRACT_PICS" == "true" ]];;
        *)                    false;;
    esac
}

# Test a single endpoint
test_endpoint() {
    local host="$1"
    local port="$2"
    local overall_status="passed"
    
    log "=================== Testing $host:$port ==================="
    
    # Check if this endpoint is mocked
    if is_mocked "$host"; then
        log_warning "Endpoint $host is in MOCK mode - skipping real network tests"
        echo "{\"name\":\"$host\",\"endpoint\":{\"host\":\"$host\",\"port\":$port},\"overall_status\":\"mocked\",\"tests\":{\"dns\":{\"status\":\"mocked\"},\"tcp\":{\"status\":\"mocked\"},\"http\":{\"status\":\"mocked\"},\"tls\":{\"status\":\"mocked\"}},\"mock_mode\":true}"
        return
    fi
    
    # Run diagnostic tests
    local dns_status tcp_status http_status tls_status
    dns_status=$(test_dns "$host")
    tcp_status=$(test_tcp "$host" "$port")
    http_status=$(test_http "$host" "$port")
    tls_status=$(test_tls "$host" "$port")
    
    # Run traceroute in background
    test_traceroute "$host" &
    
    # Determine overall status
    if [[ "$dns_status" == "failed" || "$tcp_status" == "failed" ]]; then
        overall_status="failed"
    elif [[ "$http_status" == "failed" ]]; then
        overall_status="failed"
    elif [[ "$tls_status" == "failed" && "$port" == "443" ]]; then
        overall_status="failed"
    fi
    
    # Output JSON for this endpoint
    echo "{\"name\":\"$host\",\"endpoint\":{\"host\":\"$host\",\"port\":$port},\"overall_status\":\"$overall_status\",\"tests\":{\"dns\":{\"status\":\"$dns_status\"},\"tcp\":{\"status\":\"$tcp_status\"},\"http\":{\"status\":\"$http_status\"},\"tls\":{\"status\":\"$tls_status\"}}}"
}

# Main function
main() {
    local results=()
    local passed=0 failed=0 warnings=0
    local platform
    platform=$(detect_platform)
    
    # Initialize log files
    : > "$LOG_FILE"
    : > "$TRACEROUTE_LOG"
    : > "$DIG_LOG"
    : > "$OPENSSL_LOG"
    
    log "Network Connectivity Probe starting..."
    log "Platform: $platform"
    log "Timestamp: $TIMESTAMP"
    
    # Check mock mode status
    if [[ "$MOCK_OPENAI" == "true" || "$MOCK_ELEVENLABS" == "true" || "$MOCK_BGG" == "true" || "$MOCK_EXTRACT_PICS" == "true" ]]; then
        log_warning "Running in MOCK mode for some endpoints"
    fi
    
    # Test each endpoint
    for host in "${!ENDPOINTS[@]}"; do
        local port="${ENDPOINTS[$host]}"
        log "About to test endpoint $host:$port"
        local result_json
        # Capture just the JSON output, all other output goes to log
        if result_json=$(test_endpoint "$host" "$port" 2>>"$LOG_FILE" | grep "^{.*}$" | tail -1); then
            : # Success case
        else
            log_error "Failed to get result from test_endpoint for $host:$port"
            continue
        fi
        log "Endpoint test completed for $host:$port"
        results+=("$result_json")
        
        # Count results
        local status="unknown"
        if echo "$result_json" | grep -q '"overall_status":"mocked"'; then
            status="mocked"
        elif echo "$result_json" | grep -q '"overall_status":"passed"'; then
            status="passed"
        elif echo "$result_json" | grep -q '"overall_status":"failed"'; then
            status="failed"
        fi
        case "$status" in
            "passed") ((passed++));;
            "failed") ((failed++));;
            "mocked") ((warnings++));;
        esac
    done
    
    # Wait for background traceroute processes
    wait
    
    # Generate final JSON report
    {
        echo "{"
        echo "  \"timestamp\": \"$TIMESTAMP\","
        echo "  \"platform\": \"$platform\","
        echo "  \"results\": ["
        
        local first=true
        for result in "${results[@]}"; do
            if [[ "$first" == "true" ]]; then
                first=false
            else
                echo ","
            fi
            echo "    $result"
        done
        
        echo "  ],"
        echo "  \"summary\": {"
        echo "    \"passed\": $passed,"
        echo "    \"failed\": $failed,"
        echo "    \"warnings\": $warnings"
        echo "  }"
        echo "}"
    } > "$JSON_FILE"
    
    # Summary output
    log "=================== SUMMARY ==================="
    log "Total endpoints tested: ${#ENDPOINTS[@]}"
    log "Passed: $passed"
    log "Failed: $failed"
    log "Warnings/Mocked: $warnings"
    
    if [[ $failed -gt 0 ]]; then
        log_error "Network connectivity issues detected!"
        log_error "Check artifacts: $JSON_FILE, $LOG_FILE"
    else
        log_success "All network connectivity tests passed!"
    fi
    
    log "JSON report: $JSON_FILE"
    log "Detailed log: $LOG_FILE"
    log "Traceroute log: $TRACEROUTE_LOG"
    log "DNS log: $DIG_LOG"
    log "OpenSSL log: $OPENSSL_LOG"
    
    # Exit with error code if any tests failed (but not if just warnings/mocked)
    if [[ $failed -gt 0 ]]; then
        exit 1
    fi
}

# Run main function
main "$@"