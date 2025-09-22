#!/bin/bash
# scripts/network-probe.sh - Quick network connectivity tests for CI/development
# Usage: ./scripts/network-probe.sh [--extra-hosts "host1,host2"]
#
# Features:
# - Quick connectivity tests with colorized output
# - Timestamped logs to /tmp/
# - Environment variable support for extra hosts
# - Cross-platform friendly (Linux, macOS, WSL)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default target hosts
DEFAULT_HOSTS=(
    "api.openai.com"
    "api.elevenlabs.io"
)

# Function to log with timestamp
log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Function to test connectivity to a host
test_connectivity() {
    local host=$1
    local port=${2:-443}
    
    log "${CYAN}Testing connectivity to ${host}:${port}${NC}"
    
    # Test DNS resolution
    if command -v nslookup >/dev/null 2>&1; then
        if nslookup "$host" >/dev/null 2>&1; then
            log "  ${GREEN}✓${NC} DNS resolution: OK"
        else
            log "  ${RED}✗${NC} DNS resolution: FAILED"
            return 1
        fi
    else
        log "  ${YELLOW}⚠${NC} DNS test skipped (nslookup not available)"
    fi
    
    # Test TCP connectivity
    if command -v nc >/dev/null 2>&1; then
        if timeout 10 nc -z "$host" "$port" 2>/dev/null; then
            log "  ${GREEN}✓${NC} TCP connection: OK"
        else
            log "  ${RED}✗${NC} TCP connection: FAILED"
            return 1
        fi
    elif command -v telnet >/dev/null 2>&1; then
        if timeout 10 bash -c "echo '' | telnet $host $port" >/dev/null 2>&1; then
            log "  ${GREEN}✓${NC} TCP connection: OK"  
        else
            log "  ${RED}✗${NC} TCP connection: FAILED"
            return 1
        fi
    else
        log "  ${YELLOW}⚠${NC} TCP test skipped (nc/telnet not available)"
    fi
    
    # Test HTTPS if port 443
    if [ "$port" = "443" ] && command -v curl >/dev/null 2>&1; then
        if curl -s --max-time 15 --head "https://$host" >/dev/null 2>&1; then
            log "  ${GREEN}✓${NC} HTTPS connection: OK"
        else
            log "  ${RED}✗${NC} HTTPS connection: FAILED"
            return 1
        fi
    fi
    
    return 0
}

# Main function
main() {
    local extra_hosts=""
    local hosts=()
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --extra-hosts)
                extra_hosts="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $0 [--extra-hosts \"host1,host2\"]"
                echo ""
                echo "Options:"
                echo "  --extra-hosts    Comma-separated list of additional hosts to test"
                echo "  -h, --help      Show this help message"
                echo ""
                echo "Environment variables:"
                echo "  EXTRA_NETWORK_HOSTS  Additional hosts to test (comma-separated)"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Setup log file
    local timestamp=$(date '+%Y%m%dT%H%M%S')
    LOG_FILE="/tmp/network-probe-${timestamp}.log"
    
    # Build host list
    hosts=("${DEFAULT_HOSTS[@]}")
    
    # Add extra hosts from argument
    if [[ -n "$extra_hosts" ]]; then
        IFS=',' read -ra EXTRA_HOSTS <<< "$extra_hosts"
        for host in "${EXTRA_HOSTS[@]}"; do
            hosts+=("$(echo "$host" | xargs)") # trim whitespace
        done
    fi
    
    # Add extra hosts from environment variable
    if [[ -n "${EXTRA_NETWORK_HOSTS:-}" ]]; then
        IFS=',' read -ra ENV_HOSTS <<< "$EXTRA_NETWORK_HOSTS"
        for host in "${ENV_HOSTS[@]}"; do
            hosts+=("$(echo "$host" | xargs)") # trim whitespace
        done
    fi
    
    log "${BLUE}=== Network Connectivity Probe ===${NC}"
    log "Timestamp: $(date)"
    log "Hosts to test: ${hosts[*]}"
    log "Log file: $LOG_FILE"
    log ""
    
    local failed_hosts=()
    local passed_count=0
    
    # Test each host
    for host in "${hosts[@]}"; do
        if [[ -n "$host" ]]; then
            if test_connectivity "$host"; then
                ((passed_count++))
                log "${GREEN}✓ $host: ALL TESTS PASSED${NC}"
            else
                failed_hosts+=("$host")
                log "${RED}✗ $host: TESTS FAILED${NC}"
            fi
            log ""
        fi
    done
    
    # Summary
    local total_hosts=${#hosts[@]}
    log "${BLUE}=== Summary ===${NC}"
    log "Total hosts tested: $total_hosts"
    log "Passed: $passed_count"
    log "Failed: ${#failed_hosts[@]}"
    
    if [[ ${#failed_hosts[@]} -gt 0 ]]; then
        log "${RED}Failed hosts: ${failed_hosts[*]}${NC}"
        log ""
        log "${YELLOW}Next steps for failed hosts:${NC}"
        log "1. Run full diagnostics: ./scripts/network-diagnostics.sh"
        log "2. Check firewall/proxy settings"
        log "3. Contact infrastructure team with this log file: $LOG_FILE"
        exit 1
    else
        log "${GREEN}All hosts passed connectivity tests!${NC}"
        exit 0
    fi
}

# Handle script being sourced vs executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi