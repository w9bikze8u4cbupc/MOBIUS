#!/bin/bash
# Network Probe Script for CI/Staging Environments
# Performs basic connectivity checks for critical external services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Endpoints to probe
OPENAI_API="api.openai.com"
ELEVENLABS_API="api.elevenlabs.io"
BACKUP_ENDPOINTS=("httpbin.org" "jsonplaceholder.typicode.com")

# Timeout settings
TIMEOUT_SECONDS=15
DNS_TIMEOUT=10

# Log file
LOG_FILE="/tmp/network-probe-$(date +%Y%m%d-%H%M%S).log"

echo -e "${BLUE}Network Probe Script Started${NC}"
echo "Timestamp: $(date)"
echo "Hostname: $(hostname)"
echo "Log file: $LOG_FILE"
echo "====================================="

# Logging function
log() {
    echo "$1" | tee -a "$LOG_FILE"
}

# Test DNS resolution
test_dns() {
    local domain=$1
    log -e "${BLUE}Testing DNS resolution for $domain...${NC}"
    
    if command -v nslookup >/dev/null 2>&1; then
        if timeout $DNS_TIMEOUT nslookup "$domain" >/dev/null 2>&1; then
            log -e "${GREEN}✓ DNS resolution successful for $domain${NC}"
            # Get the resolved IPs
            nslookup "$domain" 2>/dev/null | grep -A 10 "Non-authoritative answer:" | grep "Address:" | head -3 | tee -a "$LOG_FILE"
            return 0
        else
            log -e "${RED}✗ DNS resolution failed for $domain${NC}"
            return 1
        fi
    elif command -v dig >/dev/null 2>&1; then
        if timeout $DNS_TIMEOUT dig +short "$domain" >/dev/null 2>&1; then
            log -e "${GREEN}✓ DNS resolution successful for $domain${NC}"
            dig +short "$domain" | head -3 | tee -a "$LOG_FILE"
            return 0
        else
            log -e "${RED}✗ DNS resolution failed for $domain${NC}"
            return 1
        fi
    else
        log -e "${YELLOW}⚠ Neither nslookup nor dig available${NC}"
        return 1
    fi
}

# Test HTTP connectivity
test_http() {
    local endpoint=$1
    local url="https://$endpoint"
    
    log -e "${BLUE}Testing HTTP connectivity to $url...${NC}"
    
    if command -v curl >/dev/null 2>&1; then
        local response
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\nTIME_CONNECT:%{time_connect}\n" \
            --max-time $TIMEOUT_SECONDS \
            --connect-timeout 10 \
            --user-agent "NetworkProbe/1.0 (CI)" \
            "$url" 2>&1)
        
        local exit_code=$?
        local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d':' -f2)
        local time_total=$(echo "$response" | grep "TIME_TOTAL:" | cut -d':' -f2)
        local time_connect=$(echo "$response" | grep "TIME_CONNECT:" | cut -d':' -f2)
        
        if [ $exit_code -eq 0 ]; then
            log -e "${GREEN}✓ HTTP connection successful to $endpoint${NC}"
            log "  HTTP Status: $http_code, Connect Time: ${time_connect}s, Total Time: ${time_total}s"
            return 0
        else
            log -e "${RED}✗ HTTP connection failed to $endpoint${NC}"
            log "  Error details: $response"
            return 1
        fi
    elif command -v wget >/dev/null 2>&1; then
        if timeout $TIMEOUT_SECONDS wget --spider --timeout=10 "$url" >/dev/null 2>&1; then
            log -e "${GREEN}✓ HTTP connection successful to $endpoint${NC}"
            return 0
        else
            log -e "${RED}✗ HTTP connection failed to $endpoint${NC}"
            return 1
        fi
    else
        log -e "${YELLOW}⚠ Neither curl nor wget available${NC}"
        return 1
    fi
}

# Test specific API endpoint with basic health check
test_api_endpoint() {
    local endpoint=$1
    local health_path=$2
    local url="https://$endpoint$health_path"
    
    log -e "${BLUE}Testing API endpoint: $url...${NC}"
    
    if command -v curl >/dev/null 2>&1; then
        local response
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" \
            --max-time $TIMEOUT_SECONDS \
            --user-agent "NetworkProbe/1.0 (CI)" \
            "$url" 2>&1)
        
        local exit_code=$?
        local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d':' -f2)
        
        if [ $exit_code -eq 0 ] && [ "$http_code" != "000" ]; then
            log -e "${GREEN}✓ API endpoint accessible: $endpoint${NC}"
            log "  HTTP Status: $http_code"
            return 0
        else
            log -e "${RED}✗ API endpoint not accessible: $endpoint${NC}"
            log "  HTTP Status: $http_code, Error: $response"
            return 1
        fi
    else
        # Fallback to basic connection test
        test_http "$endpoint"
        return $?
    fi
}

# Main test sequence
main() {
    local overall_success=true
    
    log "Starting network connectivity tests..."
    log ""
    
    # Test DNS resolution
    log "=== DNS Resolution Tests ==="
    for endpoint in "$OPENAI_API" "$ELEVENLABS_API" "${BACKUP_ENDPOINTS[@]}"; do
        if ! test_dns "$endpoint"; then
            overall_success=false
        fi
        log ""
    done
    
    # Test basic HTTP connectivity
    log "=== Basic HTTP Connectivity Tests ==="
    for endpoint in "$OPENAI_API" "$ELEVENLABS_API" "${BACKUP_ENDPOINTS[@]}"; do
        if ! test_http "$endpoint"; then
            overall_success=false
        fi
        log ""
    done
    
    # Test specific API endpoints
    log "=== API Endpoint Tests ==="
    if ! test_api_endpoint "$OPENAI_API" "/v1/models"; then
        overall_success=false
    fi
    log ""
    
    # ElevenLabs doesn't have a simple health endpoint, so we test the base URL
    if ! test_api_endpoint "$ELEVENLABS_API" ""; then
        overall_success=false
    fi
    log ""
    
    # Network configuration info
    log "=== Network Configuration Info ==="
    log "Public IP (if available):"
    if command -v curl >/dev/null 2>&1; then
        curl -s --max-time 5 "https://httpbin.org/ip" 2>/dev/null | tee -a "$LOG_FILE" || log "Unable to determine public IP"
    fi
    log ""
    
    log "DNS Servers:"
    if [ -f /etc/resolv.conf ]; then
        grep nameserver /etc/resolv.conf | tee -a "$LOG_FILE"
    fi
    log ""
    
    # Summary
    log "====================================="
    if [ "$overall_success" = true ]; then
        log -e "${GREEN}✓ All network connectivity tests PASSED${NC}"
        exit 0
    else
        log -e "${RED}✗ Some network connectivity tests FAILED${NC}"
        log -e "${YELLOW}Check the log file for details: $LOG_FILE${NC}"
        log -e "${YELLOW}Consider running network-diagnostics.sh for more detailed analysis${NC}"
        exit 1
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
}

# Set trap for cleanup
trap cleanup EXIT

# Run main function
main "$@"