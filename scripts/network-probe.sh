#!/bin/bash

# Network probe script for detecting firewall/egress failures
# This script tests connectivity to external APIs used by the mobius-games-tutorial-generator

set -uo pipefail

# Configuration
PROBE_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
OUTPUT_DIR="${1:-artifacts}"
HUMAN_LOG="${OUTPUT_DIR}/network-probe.log"
JSON_LOG="${OUTPUT_DIR}/network-diagnostics.json"
TRACEROUTE_LOG="${OUTPUT_DIR}/traceroute.log"
DIG_LOG="${OUTPUT_DIR}/dig.log"
OPENSSL_LOG="${OUTPUT_DIR}/openssl.log"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Initialize logs
echo "Network probe started at $PROBE_TIMESTAMP" > "$HUMAN_LOG"
echo "Network probe started at $PROBE_TIMESTAMP" > "$TRACEROUTE_LOG"
echo "Network probe started at $PROBE_TIMESTAMP" > "$DIG_LOG"
echo "Network probe started at $PROBE_TIMESTAMP" > "$OPENSSL_LOG"

# External APIs to test
declare -A ENDPOINTS=(
    ["OpenAI API"]="api.openai.com:443"
    ["ElevenLabs API"]="api.elevenlabs.io:443"
    ["BoardGameGeek"]="boardgamegeek.com:443"
    ["BoardGameGeek XML API"]="boardgamegeek.com:443"
    ["Extract Pics API"]="api.extract.pics:443"
)

# Test results
declare -A RESULTS
PASSED=0
FAILED=0
WARNINGS=0

# Helper function to log both human-readable and structured output
log_both() {
    echo "$1" >> "$HUMAN_LOG"
    echo "$1" >&2
}

# Test DNS resolution
test_dns() {
    local host="$1"
    local name="$2"
    
    log_both "Testing DNS resolution for $host ($name)..."
    
    echo "=== DNS test for $host ===" >> "$DIG_LOG"
    if timeout 10 dig +short "$host" >> "$DIG_LOG" 2>&1; then
        local ip=$(dig +short "$host" | head -1)
        if [[ -n "$ip" && "$ip" != *"connection timed out"* ]]; then
            log_both "  ✓ DNS resolution successful: $ip"
            echo "DNS success for $host: $ip" >> "$DIG_LOG"
            return 0
        else
            log_both "  ✗ DNS resolution failed: no response"
            echo "DNS failed for $host: no response" >> "$DIG_LOG"
            return 1
        fi
    else
        log_both "  ✗ DNS resolution failed: timeout or error"
        echo "DNS failed for $host: timeout/error" >> "$DIG_LOG"
        return 1
    fi
}

# Test TCP connectivity
test_tcp() {
    local host="$1"
    local port="$2"
    local name="$3"
    
    log_both "Testing TCP connectivity to $host:$port ($name)..."
    
    if command -v nc >/dev/null 2>&1; then
        if timeout 10 nc -zv "$host" "$port" 2>&1 | tee -a "$HUMAN_LOG"; then
            log_both "  ✓ TCP connection successful"
            return 0
        else
            log_both "  ✗ TCP connection failed"
            return 1
        fi
    else
        # Fallback using curl for basic connectivity test
        if timeout 10 curl -s --connect-timeout 5 "https://$host:$port" >/dev/null 2>&1; then
            log_both "  ✓ TCP connection successful (via curl)"
            return 0
        else
            log_both "  ✗ TCP connection failed (via curl)"
            return 1
        fi
    fi
}

# Test HTTP/HTTPS connectivity
test_http() {
    local host="$1"
    local port="$2"
    local name="$3"
    
    log_both "Testing HTTP/HTTPS connectivity to $host:$port ($name)..."
    
    local url="https://$host"
    if timeout 10 curl -v --max-time 10 --connect-timeout 5 -s "$url" >/dev/null 2>&1; then
        log_both "  ✓ HTTP/HTTPS connection successful"
        return 0
    else
        local exit_code=$?
        case $exit_code in
            28) log_both "  ✗ HTTP/HTTPS connection failed: operation timed out" ;;
            7) log_both "  ✗ HTTP/HTTPS connection failed: couldn't connect to host" ;;
            6) log_both "  ✗ HTTP/HTTPS connection failed: couldn't resolve host" ;;
            *) log_both "  ✗ HTTP/HTTPS connection failed: exit code $exit_code" ;;
        esac
        return 1
    fi
}

# Test TLS handshake
test_tls() {
    local host="$1"
    local port="$2"
    local name="$3"
    
    log_both "Testing TLS handshake to $host:$port ($name)..."
    
    echo "=== TLS test for $host:$port ===" >> "$OPENSSL_LOG"
    if timeout 10 openssl s_client -connect "$host:$port" -servername "$host" -verify_return_error </dev/null >> "$OPENSSL_LOG" 2>&1; then
        log_both "  ✓ TLS handshake successful"
        return 0
    else
        log_both "  ✗ TLS handshake failed"
        echo "TLS handshake failed for $host:$port" >> "$OPENSSL_LOG"
        return 1
    fi
}

# Test traceroute (informational)
test_traceroute() {
    local host="$1"
    local name="$2"
    
    log_both "Running traceroute to $host ($name)..."
    
    echo "=== Traceroute to $host ===" >> "$TRACEROUTE_LOG"
    if command -v traceroute >/dev/null 2>&1; then
        timeout 30 traceroute -n "$host" >> "$TRACEROUTE_LOG" 2>&1 || true
    elif command -v tracert >/dev/null 2>&1; then
        timeout 30 tracert "$host" >> "$TRACEROUTE_LOG" 2>&1 || true
    else
        echo "No traceroute command available" >> "$TRACEROUTE_LOG"
    fi
}

# Test endpoint connectivity
test_endpoint() {
    local name="$1"
    local endpoint="$2"
    
    # Parse host and port
    local host="${endpoint%:*}"
    local port="${endpoint#*:}"
    
    log_both ""
    log_both "========================================="
    log_both "Testing $name ($endpoint)"
    log_both "========================================="
    
    # Initialize test results for this endpoint
    RESULTS["${name}_dns"]="unknown"
    RESULTS["${name}_tcp"]="unknown"
    RESULTS["${name}_http"]="unknown"
    RESULTS["${name}_tls"]="unknown"
    
    local overall_status="unknown"
    
    # DNS test
    if test_dns "$host" "$name"; then
        RESULTS["${name}_dns"]="passed"
    else
        RESULTS["${name}_dns"]="failed"
        overall_status="failed"
    fi
    
    # Only proceed with other tests if DNS succeeded
    if [[ "${RESULTS["${name}_dns"]}" == "passed" ]]; then
        # TCP test
        if test_tcp "$host" "$port" "$name"; then
            RESULTS["${name}_tcp"]="passed"
        else
            RESULTS["${name}_tcp"]="failed"
            overall_status="failed"
        fi
        
        # HTTP test
        if test_http "$host" "$port" "$name"; then
            RESULTS["${name}_http"]="passed"
        else
            RESULTS["${name}_http"]="failed"
            overall_status="failed"
        fi
        
        # TLS test (informational, may have false positives)
        if test_tls "$host" "$port" "$name"; then
            RESULTS["${name}_tls"]="passed"
        else
            RESULTS["${name}_tls"]="warning"
            if [[ "$overall_status" == "unknown" ]]; then
                overall_status="warning"
            fi
        fi
    else
        # Skip TCP, HTTP, TLS if DNS failed
        RESULTS["${name}_tcp"]="skipped"
        RESULTS["${name}_http"]="skipped"  
        RESULTS["${name}_tls"]="skipped"
        overall_status="failed"
    fi
    
    # Set overall status if still unknown
    if [[ "$overall_status" == "unknown" ]]; then
        overall_status="passed"
    fi
    
    RESULTS["${name}_overall"]="$overall_status"
    
    # Update counters
    case "$overall_status" in
        passed) ((PASSED++)) ;;
        failed) ((FAILED++)) ;;
        warning) ((WARNINGS++)) ;;
    esac
    
    # Run traceroute (informational)
    test_traceroute "$host" "$name"
    
    log_both "Result: $overall_status"
}

# Main execution
main() {
    log_both "Starting network connectivity probe..."
    log_both "Timestamp: $PROBE_TIMESTAMP"
    log_both "Output directory: $OUTPUT_DIR"
    
    # Test each endpoint
    for name in "${!ENDPOINTS[@]}"; do
        test_endpoint "$name" "${ENDPOINTS[$name]}"
    done
    
    # Summary
    log_both ""
    log_both "========================================="
    log_both "SUMMARY"
    log_both "========================================="
    log_both "Passed: $PASSED"
    log_both "Failed: $FAILED"
    log_both "Warnings: $WARNINGS"
    
    # Generate structured JSON output
    generate_json_report
    
    # Set exit code based on failures
    if [[ $FAILED -gt 0 ]]; then
        log_both ""
        log_both "⚠️  Network connectivity issues detected!"
        log_both "Check the logs in $OUTPUT_DIR for detailed diagnostics."
        exit 1
    else
        log_both ""
        log_both "✅ All network connectivity tests passed!"
        exit 0
    fi
}

# Generate structured JSON report
generate_json_report() {
    cat > "$JSON_LOG" << EOF
{
  "timestamp": "$PROBE_TIMESTAMP",
  "results": [
EOF

    local first=true
    for name in "${!ENDPOINTS[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo "," >> "$JSON_LOG"
        fi
        
        local endpoint="${ENDPOINTS[$name]}"
        local host="${endpoint%:*}"
        local port="${endpoint#*:}"
        
        cat >> "$JSON_LOG" << EOF
    {
      "name": "$name",
      "endpoint": {
        "host": "$host",
        "port": $port
      },
      "overall_status": "${RESULTS["${name}_overall"]}",
      "tests": {
        "dns": {"status": "${RESULTS["${name}_dns"]}"},
        "tcp": {"status": "${RESULTS["${name}_tcp"]}"},
        "http": {"status": "${RESULTS["${name}_http"]}"},
        "tls": {"status": "${RESULTS["${name}_tls"]}"} 
      }
    }
EOF
    done

    cat >> "$JSON_LOG" << EOF

  ],
  "summary": {
    "passed": $PASSED,
    "failed": $FAILED, 
    "warnings": $WARNINGS
  }
}
EOF
}

# Run the main function
main "$@"