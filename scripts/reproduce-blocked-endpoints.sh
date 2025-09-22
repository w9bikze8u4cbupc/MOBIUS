#!/bin/bash

# Script to reproduce blocked endpoint issues for debugging
# Usage: ./scripts/reproduce-blocked-endpoints.sh [--output <dir>] [--parallel]

set -euo pipefail

# Configuration
OUTPUT_DIR="${OUTPUT_DIR:-blocked-endpoints-debug}"
PARALLEL_MODE="${PARALLEL_MODE:-false}"
TIMESTAMP=$(date +'%Y-%m-%d_%H-%M-%S')
MAX_WORKERS=5

# Critical endpoints for the application
declare -a CRITICAL_ENDPOINTS=(
    "https://api.openai.com/v1/models|OpenAI API Models|GET|{}"
    "https://api.openai.com/v1/chat/completions|OpenAI Chat API|POST|{\"model\":\"gpt-3.5-turbo\",\"messages\":[{\"role\":\"user\",\"content\":\"test\"}]}"
    "https://api.elevenlabs.io/v1/voices|ElevenLabs Voices|GET|{}"
    "https://api.elevenlabs.io/v1/text-to-speech/test|ElevenLabs TTS|POST|{\"text\":\"test\",\"voice_settings\":{\"speed\":1.0}}"
    "https://api.boardgamegeek.com/xmlapi2/thing?id=1|BoardGameGeek API|GET|{}"
)

# Function to log with timestamp
log() {
    local level="$1"
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*"
}

# Function to setup output directory
setup_output_dir() {
    mkdir -p "$OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR/traces"
    mkdir -p "$OUTPUT_DIR/responses"
    mkdir -p "$OUTPUT_DIR/errors"
    
    log "INFO" "Output directory created: $OUTPUT_DIR"
}

# Function to test endpoint with detailed logging
test_endpoint_detailed() {
    local endpoint_info="$1"
    local test_id="$2"
    
    local url=$(echo "$endpoint_info" | cut -d'|' -f1)
    local name=$(echo "$endpoint_info" | cut -d'|' -f2)
    local method=$(echo "$endpoint_info" | cut -d'|' -f3)
    local payload=$(echo "$endpoint_info" | cut -d'|' -f4)
    
    local clean_name=$(echo "$name" | tr ' ' '_' | tr '/' '_')
    local trace_file="$OUTPUT_DIR/traces/${test_id}_${clean_name}_trace.log"
    local response_file="$OUTPUT_DIR/responses/${test_id}_${clean_name}_response.txt"
    local error_file="$OUTPUT_DIR/errors/${test_id}_${clean_name}_error.log"
    
    log "INFO" "Testing $name ($method $url)"
    
    # Prepare curl command based on method
    local curl_cmd=("curl" "-v" "-s" "--max-time" "30" "--connect-timeout" "10")
    curl_cmd+=("-w" "\\nHTTP_CODE:%{http_code}\\nTIME_TOTAL:%{time_total}\\nTIME_NAMELOOKUP:%{time_namelookup}\\nTIME_CONNECT:%{time_connect}\\nTIME_STARTTRANSFER:%{time_starttransfer}\\nSIZE_DOWNLOAD:%{size_download}\\n")
    curl_cmd+=("-H" "User-Agent: MobiusGames-EndpointDebugger/1.0")
    curl_cmd+=("-H" "Accept: application/json")
    
    if [[ "$method" == "POST" ]]; then
        curl_cmd+=("-X" "POST")
        curl_cmd+=("-H" "Content-Type: application/json")
        if [[ "$payload" != "{}" ]]; then
            curl_cmd+=("-d" "$payload")
        fi
    fi
    
    curl_cmd+=("$url")
    
    # Execute with detailed tracing
    local start_time=$(date +%s)
    local exit_code=0
    
    log "INFO" "Executing: ${curl_cmd[*]}"
    
    if "${curl_cmd[@]}" >"$response_file" 2>"$trace_file"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        # Extract metrics from response
        local http_code=$(grep "HTTP_CODE:" "$response_file" | cut -d':' -f2)
        local time_total=$(grep "TIME_TOTAL:" "$response_file" | cut -d':' -f2)
        local time_connect=$(grep "TIME_CONNECT:" "$response_file" | cut -d':' -f2)
        
        if [[ "$http_code" =~ ^[23] ]]; then
            log "SUCCESS" "$name - HTTP $http_code in ${time_total}s (connect: ${time_connect}s)"
        else
            log "WARN" "$name - HTTP $http_code"
            cp "$response_file" "$error_file"
        fi
    else
        exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "ERROR" "$name - Failed after ${duration}s (exit code: $exit_code)"
        cp "$trace_file" "$error_file"
    fi
    
    # Analyze trace for common issues
    analyze_trace "$trace_file" "$name"
    
    return $exit_code
}

# Function to analyze curl trace for common issues
analyze_trace() {
    local trace_file="$1"
    local endpoint_name="$2"
    
    if [[ ! -f "$trace_file" ]]; then
        return 0
    fi
    
    local issues=()
    
    # Check for DNS resolution issues
    if grep -q "Could not resolve host" "$trace_file"; then
        issues+=("DNS_RESOLUTION_FAILED")
    fi
    
    # Check for connection timeouts
    if grep -q "Connection timed out" "$trace_file"; then
        issues+=("CONNECTION_TIMEOUT")
    fi
    
    # Check for SSL/TLS issues
    if grep -q -E "(SSL|TLS)" "$trace_file" && grep -q -E "(error|failed)" "$trace_file"; then
        issues+=("SSL_TLS_ERROR")
    fi
    
    # Check for proxy issues
    if grep -q -E "proxy.*error" "$trace_file"; then
        issues+=("PROXY_ERROR")
    fi
    
    # Check for firewall/blocking
    if grep -q -E "(Connection refused|No route to host)" "$trace_file"; then
        issues+=("BLOCKED_OR_FIREWALL")
    fi
    
    # Check for authentication issues
    if grep -q -E "401|403" "$trace_file"; then
        issues+=("AUTH_ERROR")
    fi
    
    # Report issues found
    if [[ ${#issues[@]} -gt 0 ]]; then
        log "ANALYSIS" "$endpoint_name issues: ${issues[*]}"
    fi
}

# Function to test endpoint in parallel
test_endpoint_parallel() {
    local endpoint_info="$1"
    local test_id="$2"
    
    # Run in background
    test_endpoint_detailed "$endpoint_info" "$test_id" &
}

# Function to wait for parallel jobs
wait_for_parallel_jobs() {
    local job_count=0
    
    while read -r job; do
        if [[ -n "$job" ]]; then
            job_count=$((job_count + 1))
        fi
    done < <(jobs -r)
    
    if [[ $job_count -gt 0 ]]; then
        log "INFO" "Waiting for $job_count parallel jobs to complete..."
        wait
    fi
}

# Function to generate comprehensive report
generate_report() {
    local report_file="$OUTPUT_DIR/reproduction-report.md"
    
    log "INFO" "Generating comprehensive report: $report_file"
    
    cat > "$report_file" << EOF
# Blocked Endpoints Reproduction Report

Generated: $TIMESTAMP
Test Mode: $(if [[ "$PARALLEL_MODE" == "true" ]]; then echo "Parallel"; else echo "Sequential"; fi)

## Executive Summary

This report contains detailed information about connectivity tests performed on critical API endpoints.

## Test Results

EOF
    
    # Add results for each endpoint
    local test_id=1
    for endpoint_info in "${CRITICAL_ENDPOINTS[@]}"; do
        local name=$(echo "$endpoint_info" | cut -d'|' -f2)
        local url=$(echo "$endpoint_info" | cut -d'|' -f1)
        local clean_name=$(echo "$name" | tr ' ' '_' | tr '/' '_')
        
        echo "### $name" >> "$report_file"
        echo "- **URL**: $url" >> "$report_file"
        echo "- **Test ID**: $test_id" >> "$report_file"
        
        # Check if we have results
        local trace_file="$OUTPUT_DIR/traces/${test_id}_${clean_name}_trace.log"
        local response_file="$OUTPUT_DIR/responses/${test_id}_${clean_name}_response.txt"
        local error_file="$OUTPUT_DIR/errors/${test_id}_${clean_name}_error.log"
        
        if [[ -f "$response_file" ]]; then
            local http_code=$(grep "HTTP_CODE:" "$response_file" 2>/dev/null | cut -d':' -f2 || echo "Unknown")
            echo "- **Status**: HTTP $http_code" >> "$report_file"
        fi
        
        if [[ -f "$trace_file" ]]; then
            echo "- **Trace File**: \`traces/${test_id}_${clean_name}_trace.log\`" >> "$report_file"
        fi
        
        if [[ -f "$error_file" ]]; then
            echo "- **Error File**: \`errors/${test_id}_${clean_name}_error.log\`" >> "$report_file"
        fi
        
        echo "" >> "$report_file"
        test_id=$((test_id + 1))
    done
    
    cat >> "$report_file" << EOF

## Common Issues and Solutions

### DNS Resolution Failures
- **Symptoms**: "Could not resolve host" errors
- **Solutions**: Check DNS settings, try public DNS servers (8.8.8.8, 1.1.1.1)

### Connection Timeouts
- **Symptoms**: "Connection timed out" errors  
- **Solutions**: Check network connectivity, firewall rules, proxy settings

### SSL/TLS Errors
- **Symptoms**: SSL handshake failures
- **Solutions**: Update certificates, check system clock, verify TLS version

### Authentication Errors
- **Symptoms**: HTTP 401/403 responses
- **Solutions**: Verify API keys, check permissions, review authentication headers

### Proxy Issues
- **Symptoms**: Proxy-related errors in traces
- **Solutions**: Configure proxy settings, check proxy credentials

## File Locations

- **Traces**: \`$OUTPUT_DIR/traces/\`
- **Responses**: \`$OUTPUT_DIR/responses/\`
- **Errors**: \`$OUTPUT_DIR/errors/\`

## Next Steps

1. Review individual trace files for specific error messages
2. Check response files for API-specific error codes
3. Use network diagnostic tools: \`./scripts/network-diagnostics.sh\`
4. Test with different network configurations if issues persist

EOF

    log "INFO" "Report generated successfully"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --parallel)
            PARALLEL_MODE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--output <dir>] [--parallel]"
            echo "  --output     Output directory (default: blocked-endpoints-debug)"
            echo "  --parallel   Run tests in parallel mode"
            echo ""
            echo "This script reproduces endpoint connectivity issues for debugging."
            echo "It tests critical API endpoints and generates detailed trace logs."
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Main execution
main() {
    log "INFO" "Starting blocked endpoints reproduction test"
    log "INFO" "Mode: $(if [[ "$PARALLEL_MODE" == "true" ]]; then echo "Parallel"; else echo "Sequential"; fi)"
    log "INFO" "Output directory: $OUTPUT_DIR"
    
    setup_output_dir
    
    local test_id=1
    local failed_count=0
    
    if [[ "$PARALLEL_MODE" == "true" ]]; then
        # Parallel execution
        for endpoint_info in "${CRITICAL_ENDPOINTS[@]}"; do
            test_endpoint_parallel "$endpoint_info" "$test_id"
            test_id=$((test_id + 1))
            
            # Limit parallel jobs
            local current_jobs=$(jobs -r | wc -l)
            if [[ $current_jobs -ge $MAX_WORKERS ]]; then
                wait_for_parallel_jobs
            fi
        done
        
        # Wait for any remaining jobs
        wait_for_parallel_jobs
    else
        # Sequential execution
        for endpoint_info in "${CRITICAL_ENDPOINTS[@]}"; do
            if ! test_endpoint_detailed "$endpoint_info" "$test_id"; then
                failed_count=$((failed_count + 1))
            fi
            test_id=$((test_id + 1))
        done
    fi
    
    generate_report
    
    log "INFO" "Test completed. Failed endpoints: $failed_count"
    log "INFO" "Detailed results available in: $OUTPUT_DIR"
    
    return $failed_count
}

# Check dependencies
for cmd in curl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: $cmd is required but not installed" >&2
        exit 1
    fi
done

# Run main function
main "$@"