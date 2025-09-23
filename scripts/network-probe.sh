#!/bin/bash
# Network connectivity probe for external API dependencies
# Detects DNS, TCP, HTTP, and TLS issues with comprehensive diagnostics

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="${PROJECT_ROOT}/network-probe.log"
JSON_FILE="${PROJECT_ROOT}/network-diagnostics.json"
TRACEROUTE_LOG="${PROJECT_ROOT}/traceroute.log"
DIG_LOG="${PROJECT_ROOT}/dig.log"
OPENSSL_LOG="${PROJECT_ROOT}/openssl.log"

# API endpoints to test
declare -A ENDPOINTS=(
    ["api.openai.com"]="443"
    ["api.elevenlabs.io"]="443"
    ["boardgamegeek.com"]="443"
    ["extract.pics"]="443"
    ["media.boardgamegeek.com"]="443"
)

# Mock mode support
MOCK_OPENAI=${MOCK_OPENAI:-false}
MOCK_ELEVENLABS=${MOCK_ELEVENLABS:-false}
MOCK_BGG=${MOCK_BGG:-false}
MOCK_EXTRACT_PICS=${MOCK_EXTRACT_PICS:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize log files
echo "=== Network Connectivity Probe Started at $TIMESTAMP ===" > "$LOG_FILE"
echo "# DNS Resolution Log - $TIMESTAMP" > "$DIG_LOG"
echo "# Traceroute Log - $TIMESTAMP" > "$TRACEROUTE_LOG"
echo "# TLS Handshake Log - $TIMESTAMP" > "$OPENSSL_LOG"

# JSON structure initialization
JSON_RESULTS='{"timestamp":"'$TIMESTAMP'","results":[],"summary":{"passed":0,"failed":0,"warnings":0}}'

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}$1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}$1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}$1${NC}" | tee -a "$LOG_FILE"
}

# Test DNS resolution
test_dns() {
    local host="$1"
    local result_var="$2"
    
    log "  🔍 DNS: Testing resolution for $host"
    
    if command -v dig >/dev/null 2>&1; then
        {
            echo "=== $host ===" 
            if timeout 10 dig +short +time=5 "$host" 2>&1; then
                eval "$result_var='passed'"
                log_success "  ✅ DNS: $host resolved successfully"
                return 0
            else
                eval "$result_var='failed'"
                log_error "  ❌ DNS: $host resolution failed"
                return 1
            fi
        } >> "$DIG_LOG"
    elif command -v nslookup >/dev/null 2>&1; then
        {
            echo "=== $host ==="
            if timeout 10 nslookup "$host" 2>&1; then
                eval "$result_var='passed'"
                log_success "  ✅ DNS: $host resolved successfully (nslookup)"
                return 0
            else
                eval "$result_var='failed'"
                log_error "  ❌ DNS: $host resolution failed (nslookup)"
                return 1
            fi
        } >> "$DIG_LOG"
    else
        eval "$result_var='skipped'"
        log_warning "  ⚠️  DNS: dig/nslookup not available, skipping DNS test for $host"
        return 2
    fi
}

# Test TCP connectivity
test_tcp() {
    local host="$1"
    local port="$2"
    local result_var="$3"
    
    log "  🔌 TCP: Testing connection to $host:$port"
    
    if command -v nc >/dev/null 2>&1; then
        if timeout 10 nc -z "$host" "$port" 2>/dev/null; then
            eval "$result_var='passed'"
            log_success "  ✅ TCP: $host:$port connection successful"
            return 0
        else
            eval "$result_var='failed'"
            log_error "  ❌ TCP: $host:$port connection failed"
            return 1
        fi
    elif command -v telnet >/dev/null 2>&1; then
        if timeout 10 bash -c "echo '' | telnet $host $port" 2>/dev/null | grep -q "Connected"; then
            eval "$result_var='passed'"
            log_success "  ✅ TCP: $host:$port connection successful (telnet)"
            return 0
        else
            eval "$result_var='failed'"
            log_error "  ❌ TCP: $host:$port connection failed (telnet)"
            return 1
        fi
    else
        eval "$result_var='skipped'"
        log_warning "  ⚠️  TCP: nc/telnet not available, skipping TCP test for $host:$port"
        return 2
    fi
}

# Test HTTP(S) connectivity
test_http() {
    local host="$1"
    local port="$2"
    local result_var="$3"
    
    local url="https://$host"
    if [ "$port" != "443" ]; then
        url="https://$host:$port"
    fi
    
    log "  🌐 HTTP: Testing HTTPS connection to $url"
    
    if command -v curl >/dev/null 2>&1; then
        if timeout 15 curl -v --max-time 10 --connect-timeout 5 -s -o /dev/null "$url" 2>&1; then
            eval "$result_var='passed'"
            log_success "  ✅ HTTP: $url connection successful"
            return 0
        else
            eval "$result_var='failed'"
            log_error "  ❌ HTTP: $url connection failed"
            return 1
        fi
    elif command -v wget >/dev/null 2>&1; then
        if timeout 15 wget --timeout=10 --tries=1 -q -O /dev/null "$url" 2>/dev/null; then
            eval "$result_var='passed'"
            log_success "  ✅ HTTP: $url connection successful (wget)"
            return 0
        else
            eval "$result_var='failed'"
            log_error "  ❌ HTTP: $url connection failed (wget)"
            return 1
        fi
    else
        eval "$result_var='skipped'"
        log_warning "  ⚠️  HTTP: curl/wget not available, skipping HTTP test for $url"
        return 2
    fi
}

# Test TLS handshake
test_tls() {
    local host="$1"
    local port="$2"
    local result_var="$3"
    
    log "  🔐 TLS: Testing handshake with $host:$port"
    
    if command -v openssl >/dev/null 2>&1; then
        {
            echo "=== $host:$port ==="
            if timeout 15 openssl s_client -connect "$host:$port" -servername "$host" -verify_return_error < /dev/null 2>&1; then
                eval "$result_var='passed'"
                log_success "  ✅ TLS: $host:$port handshake successful"
                return 0
            else
                eval "$result_var='failed'"
                log_error "  ❌ TLS: $host:$port handshake failed"
                return 1
            fi
        } >> "$OPENSSL_LOG"
    else
        eval "$result_var='skipped'"
        log_warning "  ⚠️  TLS: openssl not available, skipping TLS test for $host:$port"
        return 2
    fi
}

# Run traceroute
run_traceroute() {
    local host="$1"
    
    log "  🗺️  Traceroute: Tracing path to $host"
    
    {
        echo "=== $host ==="
        if command -v traceroute >/dev/null 2>&1; then
            timeout 60 traceroute -n "$host" 2>&1 || log_warning "  ⚠️  Traceroute: $host may have timed out"
        elif command -v tracert >/dev/null 2>&1; then
            timeout 60 tracert "$host" 2>&1 || log_warning "  ⚠️  Tracert: $host may have timed out"
        else
            echo "traceroute/tracert not available"
            log_warning "  ⚠️  Traceroute: command not available for $host"
        fi
        echo ""
    } >> "$TRACEROUTE_LOG"
}

# Check if endpoint should be mocked
should_mock() {
    local endpoint="$1"
    case "$endpoint" in
        "api.openai.com")
            [ "$MOCK_OPENAI" = "true" ]
            ;;
        "api.elevenlabs.io")
            [ "$MOCK_ELEVENLABS" = "true" ]
            ;;
        "boardgamegeek.com"|"media.boardgamegeek.com")
            [ "$MOCK_BGG" = "true" ]
            ;;
        "extract.pics")
            [ "$MOCK_EXTRACT_PICS" = "true" ]
            ;;
        *)
            false
            ;;
    esac
}

# Test a single endpoint
test_endpoint() {
    local host="$1"
    local port="$2"
    
    log "🚀 Testing connectivity to $host:$port"
    
    if should_mock "$host"; then
        log_warning "  ⚠️  MOCK MODE: Simulating successful connectivity for $host"
        local result='{
            "name":"'$host'",
            "endpoint":{"host":"'$host'","port":'$port'},
            "overall_status":"mocked",
            "tests":{
                "dns":{"status":"mocked"},
                "tcp":{"status":"mocked"},
                "http":{"status":"mocked"},
                "tls":{"status":"mocked"}
            }
        }'
        JSON_RESULTS=$(echo "$JSON_RESULTS" | jq --argjson result "$result" '.results += [$result] | .summary.warnings += 1')
        return 0
    fi
    
    local dns_status tcp_status http_status tls_status
    local overall_status="passed"
    
    # Run tests
    test_dns "$host" dns_status || true
    test_tcp "$host" "$port" tcp_status || true
    
    # Only test HTTP/TLS if TCP passes
    if [ "$tcp_status" = "passed" ]; then
        test_http "$host" "$port" http_status || true
        test_tls "$host" "$port" tls_status || true
    else
        http_status="skipped"
        tls_status="skipped"
    fi
    
    # Run traceroute regardless of other test results
    run_traceroute "$host"
    
    # Determine overall status
    if [ "$dns_status" = "failed" ] || [ "$tcp_status" = "failed" ] || [ "$http_status" = "failed" ] || [ "$tls_status" = "failed" ]; then
        overall_status="failed"
    elif [ "$dns_status" = "skipped" ] && [ "$tcp_status" = "skipped" ] && [ "$http_status" = "skipped" ] && [ "$tls_status" = "skipped" ]; then
        overall_status="skipped"
    fi
    
    # Build JSON result
    local result='{
        "name":"'$host'",
        "endpoint":{"host":"'$host'","port":'$port'},
        "overall_status":"'$overall_status'",
        "tests":{
            "dns":{"status":"'$dns_status'"},
            "tcp":{"status":"'$tcp_status'"},
            "http":{"status":"'$http_status'"},
            "tls":{"status":"'$tls_status'"}
        }
    }'
    
    # Update summary counters
    case "$overall_status" in
        "passed")
            JSON_RESULTS=$(echo "$JSON_RESULTS" | jq --argjson result "$result" '.results += [$result] | .summary.passed += 1')
            log_success "✅ $host:$port - Overall: PASSED"
            ;;
        "failed")
            JSON_RESULTS=$(echo "$JSON_RESULTS" | jq --argjson result "$result" '.results += [$result] | .summary.failed += 1')
            log_error "❌ $host:$port - Overall: FAILED"
            ;;
        "skipped")
            JSON_RESULTS=$(echo "$JSON_RESULTS" | jq --argjson result "$result" '.results += [$result] | .summary.warnings += 1')
            log_warning "⚠️  $host:$port - Overall: SKIPPED"
            ;;
        "mocked")
            # Already handled above
            ;;
    esac
    
    log ""
}

# Main execution
main() {
    log "🔍 Network Connectivity Probe - $TIMESTAMP"
    log "📋 Testing external API endpoints..."
    log ""
    
    # Check for required tools
    if ! command -v jq >/dev/null 2>&1; then
        log_error "❌ jq is required for JSON processing. Please install jq."
        exit 1
    fi
    
    # Test all endpoints
    for host in "${!ENDPOINTS[@]}"; do
        port="${ENDPOINTS[$host]}"
        test_endpoint "$host" "$port"
    done
    
    # Write JSON results
    echo "$JSON_RESULTS" | jq '.' > "$JSON_FILE"
    
    # Summary
    local passed=$(echo "$JSON_RESULTS" | jq '.summary.passed')
    local failed=$(echo "$JSON_RESULTS" | jq '.summary.failed')
    local warnings=$(echo "$JSON_RESULTS" | jq '.summary.warnings')
    
    log "📊 Summary:"
    log "  ✅ Passed: $passed"
    log "  ❌ Failed: $failed"
    log "  ⚠️  Warnings: $warnings"
    log ""
    log "📄 Artifacts generated:"
    log "  - Human-readable log: $LOG_FILE"
    log "  - Machine-readable results: $JSON_FILE"
    log "  - DNS resolution details: $DIG_LOG"
    log "  - Traceroute paths: $TRACEROUTE_LOG"
    log "  - TLS handshake details: $OPENSSL_LOG"
    
    if [ "$failed" -gt 0 ]; then
        log_error "⚠️  Network connectivity issues detected. Check logs for details."
        exit 1
    else
        log_success "🎉 All network connectivity tests passed!"
        exit 0
    fi
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi