#!/bin/bash

# Network connectivity probe script for Mobius Games Tutorial Generator
# Tests external API endpoints and generates structured diagnostics

set -uo pipefail

# Configuration
PROBE_TIMEOUT=10
OUTPUT_DIR="${1:-artifacts}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# External endpoints to test (simple array format)
ENDPOINTS=(
    "OpenAI API|api.openai.com|443|https://api.openai.com/v1/models"
    "ElevenLabs API|api.elevenlabs.io|443|https://api.elevenlabs.io"
    "BoardGameGeek API|boardgamegeek.com|443|https://boardgamegeek.com/xmlapi2"
)

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Output files
RAW_LOG="$OUTPUT_DIR/network-probe.log"
JSON_OUTPUT="$OUTPUT_DIR/network-diagnostics.json"

# Initialize log
{
    echo "=== Network Connectivity Probe ==="
    echo "Timestamp: $TIMESTAMP"
    echo "Probe timeout: ${PROBE_TIMEOUT}s"
    echo "Testing ${#ENDPOINTS[@]} endpoints"
    echo ""
} > "$RAW_LOG"

log() {
    echo "$1" >&2
    echo "$1" >> "$RAW_LOG"
}

log_raw() {
    echo "$1" >> "$RAW_LOG"
}

# Test a single endpoint and return status
test_endpoint() {
    local name="$1"
    local host="$2"
    local port="$3" 
    local url="$4"
    
    log ""
    log "=== Testing $name ($host) ==="
    
    local dns_status="failed"
    local tcp_status="skipped"
    local http_status="failed"
    local overall_status="failed"
    
    # DNS Test
    log "DNS resolution test..."
    if command -v dig >/dev/null 2>&1; then
        if timeout 5 dig +short "$host" 2>/dev/null | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
            dns_status="success"
            log_raw "DNS: Resolution successful"
        else
            dns_status="failed"
            log_raw "DNS: Failed to resolve"
        fi
    else
        dns_status="failed"
        log_raw "DNS: dig not available"
    fi
    
    # TCP Test (only if DNS succeeded)  
    if [[ "$dns_status" == "success" ]]; then
        log "TCP connectivity test..."
        if command -v nc >/dev/null 2>&1; then
            if timeout $PROBE_TIMEOUT nc -z "$host" "$port" >/dev/null 2>&1; then
                tcp_status="success"
                log_raw "TCP: Connection successful"
            else
                tcp_status="failed"
                log_raw "TCP: Connection failed"
            fi
        else
            log_raw "TCP: netcat not available"
        fi
    else
        log_raw "TCP: Skipped due to DNS failure"
    fi
    
    # HTTP Test
    log "HTTP connectivity test..."
    if command -v curl >/dev/null 2>&1; then
        if timeout $PROBE_TIMEOUT curl -s --max-time 10 -o /dev/null "$url" 2>/dev/null; then
            http_status="success"
            log_raw "HTTP: Request successful"
        else
            http_status="failed"
            log_raw "HTTP: Request failed"
        fi
    else
        http_status="failed"
        log_raw "HTTP: curl not available"
    fi
    
    # Determine overall status
    if [[ "$dns_status" == "success" ]] && [[ "$tcp_status" == "success" ]] && [[ "$http_status" == "success" ]]; then
        overall_status="success"
    elif [[ "$dns_status" == "success" ]] && [[ "$tcp_status" == "success" ]]; then
        overall_status="warning"
    else
        overall_status="failed"
    fi
    
    log "Result: $overall_status"
    
    # Write result to temp file for JSON generation
    cat >> "$OUTPUT_DIR/.results" <<EOF
$name|$host|$port|$url|$overall_status|$dns_status|$tcp_status|$http_status
EOF
    
    echo "$overall_status"
}

# Main execution
main() {
    log "Starting network connectivity probe..."
    log "Output directory: $OUTPUT_DIR"
    
    # Clear results file
    > "$OUTPUT_DIR/.results"
    
    local passed=0 failed=0 warnings=0
    
    # Test each endpoint
    for endpoint_def in "${ENDPOINTS[@]}"; do
        IFS='|' read -r name host port url <<< "$endpoint_def"
        
        result=$(test_endpoint "$name" "$host" "$port" "$url" || echo "failed")
        
        case "$result" in
            "success") ((passed++)) ;;
            "warning") ((warnings++)) ;;
            "failed") ((failed++)) ;;
        esac
    done
    
    # Generate JSON output
    {
        echo "{"
        echo "  \"timestamp\": \"$TIMESTAMP\","
        echo "  \"probe_config\": {"
        echo "    \"timeout\": $PROBE_TIMEOUT,"
        echo "    \"total_endpoints\": ${#ENDPOINTS[@]}"
        echo "  },"
        echo "  \"results\": ["
        
        local first=true
        while IFS='|' read -r name host port url overall dns tcp http; do
            if [[ "$first" == "false" ]]; then
                echo ","
            fi
            first=false
            
            cat <<EOF
    {
      "name": "$name",
      "endpoint": {
        "host": "$host",
        "port": $port,
        "url": "$url"
      },
      "overall_status": "$overall",
      "tests": {
        "dns": {"status": "$dns"},
        "tcp": {"status": "$tcp"},
        "http": {"status": "$http"}
      }
    }
EOF
        done < "$OUTPUT_DIR/.results"
        
        echo "  ],"
        echo "  \"summary\": {"
        echo "    \"passed\": $passed,"
        echo "    \"failed\": $failed,"
        echo "    \"warnings\": $warnings,"
        echo "    \"total_tested\": $((passed + failed + warnings))"
        echo "  }"
        echo "}"
    } > "$JSON_OUTPUT"
    
    # Clean up temp files
    rm -f "$OUTPUT_DIR/.results"
    
    log ""
    log "=== PROBE SUMMARY ==="
    log "Total endpoints: ${#ENDPOINTS[@]}"
    log "Passed: $passed"
    log "Failed: $failed"
    log "Warnings: $warnings"
    log ""
    log "Raw log: $RAW_LOG"
    log "JSON results: $JSON_OUTPUT"
    
    # Exit with appropriate code
    if [[ $failed -gt 0 ]]; then
        log "⚠️  Network connectivity issues detected!"
        exit 1
    elif [[ $warnings -gt 0 ]]; then
        log "⚠️  Some warnings detected, but connectivity is functional"
        exit 0
    else
        log "✅ All network connectivity tests passed"
        exit 0
    fi
}

# Run the main function
main "$@"