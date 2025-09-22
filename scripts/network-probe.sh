#!/bin/bash

# Network connectivity probe script for Mobius Games Tutorial Generator
# Tests external API endpoints and generates structured diagnostics

set -euo pipefail

# Configuration
PROBE_TIMEOUT=10
OUTPUT_DIR="${1:-artifacts}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# External endpoints to test
declare -A ENDPOINTS
ENDPOINTS["OpenAI API"]="api.openai.com:443:https://api.openai.com/v1/models"
ENDPOINTS["ElevenLabs API"]="api.elevenlabs.io:443:https://api.elevenlabs.io"
ENDPOINTS["BoardGameGeek API"]="boardgamegeek.com:443:https://boardgamegeek.com/xmlapi2"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Output files
RAW_LOG="$OUTPUT_DIR/network-probe.log"
JSON_OUTPUT="$OUTPUT_DIR/network-diagnostics.json"

# Initialize result arrays
declare -a RESULTS_NAME=()
declare -a RESULTS_HOST=()
declare -a RESULTS_PORT=()
declare -a RESULTS_URL=()
declare -a RESULTS_STATUS=()
declare -a RESULTS_DNS_STATUS=()
declare -a RESULTS_DNS_IP=()
declare -a RESULTS_TCP_STATUS=()
declare -a RESULTS_HTTP_STATUS=()
declare -a RESULTS_HTTP_CODE=()
declare -a RESULTS_HTTP_TIME=()
declare -a RESULTS_ERRORS=()

# Initialize log
{
    echo "=== Network Connectivity Probe ==="
    echo "Timestamp: $TIMESTAMP"
    echo "Probe timeout: ${PROBE_TIMEOUT}s"
    echo "Testing ${#ENDPOINTS[@]} endpoints"
    echo ""
} > "$RAW_LOG"

log() {
    echo "$1" | tee -a "$RAW_LOG"
}

log_raw() {
    echo "$1" >> "$RAW_LOG"
}

# Test a single endpoint
test_endpoint() {
    local name="$1"
    local host="$2"
    local port="$3" 
    local url="$4"
    
    log ""
    log "=== Testing $name ($host) ==="
    
    local dns_status="unknown"
    local dns_ip=""
    local tcp_status="unknown"
    local http_status="unknown"
    local http_code="000"
    local response_time="0"
    local overall_status="failed"
    local -a errors=()
    
    # DNS Test
    log "DNS resolution test..."
    if command -v dig >/dev/null 2>&1; then
        local dig_result
        dig_result=$(timeout 5 dig +short "$host" 2>&1) || dig_result=""
        
        if [[ -n "$dig_result" ]] && echo "$dig_result" | head -1 | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
            dns_status="success"
            dns_ip=$(echo "$dig_result" | head -1)
            log_raw "DNS: Resolved to $dns_ip"
        else
            dns_status="failed"
            dns_ip="unresolved"
            errors+=("DNS_FAILED")
            log_raw "DNS: Failed to resolve"
        fi
    else
        dns_status="failed"
        dns_ip="no_tools"
        errors+=("DNS_NO_TOOLS")
        log_raw "DNS: No tools available"
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
                errors+=("TCP_FAILED")
                log_raw "TCP: Connection failed"
            fi
        else
            tcp_status="skipped"
            log_raw "TCP: netcat not available"
        fi
    else
        tcp_status="skipped"
        log_raw "TCP: Skipped due to DNS failure"
    fi
    
    # HTTP Test
    log "HTTP connectivity test..."
    if command -v curl >/dev/null 2>&1; then
        local curl_output
        curl_output=$(timeout $PROBE_TIMEOUT curl -s -w "HTTP_CODE:%{http_code}\nTIME:%{time_total}\n" -o /dev/null "$url" 2>&1) || curl_output="CURL_FAILED"
        
        log_raw "HTTP response: $curl_output"
        
        if echo "$curl_output" | grep -q "HTTP_CODE:"; then
            http_code=$(echo "$curl_output" | grep "HTTP_CODE:" | cut -d: -f2)
            response_time=$(echo "$curl_output" | grep "TIME:" | cut -d: -f2)
            
            if [[ "$http_code" -ge 200 ]] && [[ "$http_code" -lt 400 ]]; then
                http_status="success"
            elif [[ "$http_code" -ge 400 ]]; then
                http_status="warning"
                errors+=("HTTP_${http_code}")
            else
                http_status="failed"
                errors+=("HTTP_NO_RESPONSE")
            fi
        else
            http_status="failed"
            errors+=("HTTP_FAILED")
        fi
    else
        http_status="skipped"
        log_raw "HTTP: curl not available"
    fi
    
    # Determine overall status
    if [[ "$dns_status" == "success" ]] && [[ "$tcp_status" == "success" ]] && [[ "$http_status" == "success" ]]; then
        overall_status="success"
    elif [[ "$http_status" == "warning" ]] && [[ "$dns_status" == "success" ]] && [[ "$tcp_status" == "success" ]]; then
        overall_status="warning"
    else
        overall_status="failed"
    fi
    
    log "Result: $overall_status"
    if [[ ${#errors[@]} -gt 0 ]]; then
        log "Issues: ${errors[*]}"
    fi
    
    # Store results in global arrays for later JSON generation
    RESULTS_NAME+=("$name")
    RESULTS_HOST+=("$host")
    RESULTS_PORT+=("$port")
    RESULTS_URL+=("$url")
    RESULTS_STATUS+=("$overall_status")
    RESULTS_DNS_STATUS+=("$dns_status")
    RESULTS_DNS_IP+=("$dns_ip")
    RESULTS_TCP_STATUS+=("$tcp_status")
    RESULTS_HTTP_STATUS+=("$http_status")
    RESULTS_HTTP_CODE+=("$http_code")
    RESULTS_HTTP_TIME+=("$response_time")
    RESULTS_ERRORS+=("$(printf '%s,' "${errors[@]}" | sed 's/,$//')")
}

# Main execution
main() {
    log "Starting network connectivity probe..."
    log "Output directory: $OUTPUT_DIR"
    
    local passed=0 failed=0 warnings=0
    
    # Test each endpoint
    for name in "${!ENDPOINTS[@]}"; do
        local endpoint_def="${ENDPOINTS[$name]}"
        IFS=':' read -r host port url <<< "$endpoint_def"
        
        test_endpoint "$name" "$host" "$port" "$url"
        
        # Check the last added status
        local status="${RESULTS_STATUS[-1]}"
        case "$status" in
            "success") ((passed++)) ;;
            "warning") ((warnings++)) ;;
            "failed") ((failed++)) ;;
        esac
    done
    
    # Build JSON output
    {
        echo "{"
        echo "  \"timestamp\": \"$TIMESTAMP\","
        echo "  \"probe_config\": {"
        echo "    \"timeout\": $PROBE_TIMEOUT,"
        echo "    \"total_endpoints\": ${#ENDPOINTS[@]}"
        echo "  },"
        echo "  \"results\": ["
        
        for i in "${!RESULTS_NAME[@]}"; do
            if [[ $i -gt 0 ]]; then
                echo ","
            fi
            
            local error_array="[]"
            if [[ -n "${RESULTS_ERRORS[$i]}" ]]; then
                error_array="[\"$(echo "${RESULTS_ERRORS[$i]}" | sed 's/,/", "/g')\"]"
            fi
            
            cat <<EOF
    {
      "name": "${RESULTS_NAME[$i]}",
      "endpoint": {
        "host": "${RESULTS_HOST[$i]}",
        "port": ${RESULTS_PORT[$i]},
        "url": "${RESULTS_URL[$i]}"
      },
      "overall_status": "${RESULTS_STATUS[$i]}",
      "tests": {
        "dns": {
          "status": "${RESULTS_DNS_STATUS[$i]}",
          "resolved_ip": "${RESULTS_DNS_IP[$i]}"
        },
        "tcp": {
          "status": "${RESULTS_TCP_STATUS[$i]}"
        },
        "http": {
          "status": "${RESULTS_HTTP_STATUS[$i]}",
          "code": "${RESULTS_HTTP_CODE[$i]}",
          "response_time": "${RESULTS_HTTP_TIME[$i]}"
        }
      },
      "errors": $error_array
    }
EOF
        done
        
        echo "  ],"
        echo "  \"summary\": {"
        echo "    \"passed\": $passed,"
        echo "    \"failed\": $failed,"
        echo "    \"warnings\": $warnings,"
        echo "    \"total_tested\": $((passed + failed + warnings))"
        echo "  }"
        echo "}"
    } > "$JSON_OUTPUT"
    
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