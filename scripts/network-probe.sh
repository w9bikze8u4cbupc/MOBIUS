#!/bin/bash

# Network probe script for testing connectivity to external APIs
# Usage: ./scripts/network-probe.sh [--output <file>] [--verbose]

set -euo pipefail

# Configuration
PROBE_OUTPUT_FILE="${PROBE_OUTPUT_FILE:-probe-results.log}"
VERBOSE="${VERBOSE:-false}"
TIMEOUT=10

# API endpoints to test
declare -a ENDPOINTS=(
    "https://api.openai.com/v1/models"
    "https://api.elevenlabs.io/v1/voices"
    "https://api.boardgamegeek.com/xmlapi2/thing?id=1"
    "https://httpbin.org/get"
)

# Function to log with timestamp
log() {
    local level="$1"
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$PROBE_OUTPUT_FILE"
}

# Function to test HTTP endpoint
test_endpoint() {
    local url="$1"
    local name="${2:-$url}"
    
    log "INFO" "Testing $name..."
    
    local start_time=$(date +%s.%N)
    local status_code=0
    local response_time=0
    local error_msg=""
    
    if response=$(curl -s -w "%{http_code},%{time_total}" --max-time $TIMEOUT -H "User-Agent: Mozilla/5.0" "$url" 2>&1); then
        if [[ "$response" =~ ,([0-9.]+)$ ]]; then
            # Extract status code and response time from curl output
            status_code=$(echo "$response" | tail -c 20 | grep -o '[0-9][0-9][0-9],[0-9.]*' | cut -d',' -f1)
            response_time=$(echo "$response" | tail -c 20 | grep -o '[0-9][0-9][0-9],[0-9.]*' | cut -d',' -f2)
        else
            status_code=0
            error_msg="Invalid response format"
        fi
    else
        status_code=0
        error_msg="Connection failed: $response"
    fi
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "0")
    
    # Determine result
    if [[ "$status_code" =~ ^[23] ]]; then
        log "SUCCESS" "$name - Status: $status_code, Time: ${response_time}s"
        return 0
    else
        log "ERROR" "$name - Status: $status_code, Error: $error_msg"
        return 1
    fi
}

# Function to test DNS resolution
test_dns() {
    local hostname="$1"
    
    log "INFO" "Testing DNS resolution for $hostname..."
    
    if nslookup "$hostname" >/dev/null 2>&1; then
        log "SUCCESS" "DNS resolution for $hostname successful"
        return 0
    else
        log "ERROR" "DNS resolution for $hostname failed"
        return 1
    fi
}

# Function to test network connectivity
test_connectivity() {
    log "INFO" "Testing basic network connectivity..."
    
    # Test DNS servers
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        log "SUCCESS" "Can reach Google DNS (8.8.8.8)"
    else
        log "ERROR" "Cannot reach Google DNS (8.8.8.8)"
    fi
    
    # Test common websites
    if ping -c 1 google.com >/dev/null 2>&1; then
        log "SUCCESS" "Can reach google.com"
    else
        log "ERROR" "Cannot reach google.com"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --output)
            PROBE_OUTPUT_FILE="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--output <file>] [--verbose] [--timeout <seconds>]"
            echo "  --output    Output file for results (default: probe-results.log)"
            echo "  --verbose   Enable verbose output"
            echo "  --timeout   HTTP timeout in seconds (default: 10)"
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
    local exit_code=0
    
    # Initialize log file
    echo "# Network Probe Results - $(date)" > "$PROBE_OUTPUT_FILE"
    
    log "INFO" "Starting network probe..."
    log "INFO" "Output file: $PROBE_OUTPUT_FILE"
    log "INFO" "Timeout: ${TIMEOUT}s"
    
    # System information
    log "INFO" "System: $(uname -a)"
    log "INFO" "Network interfaces:"
    if command -v ip >/dev/null 2>&1; then
        ip addr show | grep -E '^\d+: ' | tee -a "$PROBE_OUTPUT_FILE" || echo "No interfaces found" | tee -a "$PROBE_OUTPUT_FILE"
    elif command -v ifconfig >/dev/null 2>&1; then
        ifconfig | grep -E '^[a-zA-Z0-9]+:' | tee -a "$PROBE_OUTPUT_FILE" || echo "No interfaces found" | tee -a "$PROBE_OUTPUT_FILE"
    else
        echo "No network tools available" | tee -a "$PROBE_OUTPUT_FILE"
    fi
    
    # Test basic connectivity
    test_connectivity || exit_code=1
    
    # Test DNS resolution for API hosts
    for endpoint in "${ENDPOINTS[@]}"; do
        hostname=$(echo "$endpoint" | sed 's|https\?://||' | cut -d'/' -f1)
        test_dns "$hostname" || exit_code=1
    done
    
    # Test HTTP endpoints
    log "INFO" "Testing HTTP endpoints..."
    for endpoint in "${ENDPOINTS[@]}"; do
        test_endpoint "$endpoint" || exit_code=1
    done
    
    # Environment checks
    log "INFO" "Environment checks..."
    if [[ -n "${HTTP_PROXY:-}" ]]; then
        log "INFO" "HTTP_PROXY: $HTTP_PROXY"
    fi
    if [[ -n "${HTTPS_PROXY:-}" ]]; then
        log "INFO" "HTTPS_PROXY: $HTTPS_PROXY"
    fi
    if [[ -n "${NO_PROXY:-}" ]]; then
        log "INFO" "NO_PROXY: $NO_PROXY"
    fi
    
    log "INFO" "Network probe completed. Exit code: $exit_code"
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo "=== Probe Results ==="
        cat "$PROBE_OUTPUT_FILE"
    fi
    
    return $exit_code
}

# Check dependencies
if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required but not installed" >&2
    exit 1
fi

if ! command -v nslookup >/dev/null 2>&1; then
    echo "Warning: nslookup not found, skipping DNS tests" >&2
fi

# Run main function
main "$@"