#!/bin/bash
# Comprehensive Network Diagnostics Script for CI/Staging Environments
# Performs detailed network analysis to diagnose firewall and connectivity issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Critical endpoints
OPENAI_API="api.openai.com"
ELEVENLABS_API="api.elevenlabs.io"
TEST_ENDPOINTS=("httpbin.org" "jsonplaceholder.typicode.com" "google.com" "github.com")

# Timeout settings
TIMEOUT_SECONDS=30
DNS_TIMEOUT=15
TRACEROUTE_HOPS=20

# Log file
LOG_FILE="/tmp/network-diagnostics-$(date +%Y%m%d-%H%M%S).log"
REPORT_FILE="/tmp/network-report-$(date +%Y%m%d-%H%M%S).json"

echo -e "${BLUE}Network Diagnostics Script Started${NC}"
echo "Timestamp: $(date)"
echo "Hostname: $(hostname)"
echo "Log file: $LOG_FILE"
echo "Report file: $REPORT_FILE"
echo "============================================="

# Initialize report
cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "environment": "${CI:-local}",
  "tests": {
    "dns": {},
    "connectivity": {},
    "traceroute": {},
    "ssl": {},
    "api_endpoints": {}
  },
  "system_info": {},
  "recommendations": []
}
EOF

# Logging functions
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_json() {
    echo "$1" >> "$LOG_FILE"
}

update_report() {
    local key="$1"
    local value="$2"
    local temp_file="/tmp/report_temp.json"
    echo "$value" | jq --arg key "$key" '. as $value | input | setpath($key | split("."); $value)' "$REPORT_FILE" > "$temp_file" && mv "$temp_file" "$REPORT_FILE"
}

# System information gathering
gather_system_info() {
    log -e "${CYAN}=== System Information ===${NC}"
    
    local os_info=""
    if [ -f /etc/os-release ]; then
        os_info=$(cat /etc/os-release | grep "PRETTY_NAME" | cut -d'=' -f2 | tr -d '"')
    elif command -v uname >/dev/null 2>&1; then
        os_info=$(uname -a)
    fi
    log "OS: $os_info"
    
    log "User: $(whoami)"
    log "Shell: $SHELL"
    log "PATH: $PATH"
    
    # Network interfaces
    log -e "${BLUE}Network Interfaces:${NC}"
    if command -v ip >/dev/null 2>&1; then
        ip addr show | grep -E "(inet |inet6 )" | tee -a "$LOG_FILE"
    elif command -v ifconfig >/dev/null 2>&1; then
        ifconfig | grep -E "(inet |inet6 )" | tee -a "$LOG_FILE"
    fi
    
    # Routing table
    log -e "${BLUE}Default Routes:${NC}"
    if command -v ip >/dev/null 2>&1; then
        ip route show default | tee -a "$LOG_FILE"
    elif command -v route >/dev/null 2>&1; then
        route -n | grep "^0.0.0.0" | tee -a "$LOG_FILE"
    fi
    
    # DNS configuration
    log -e "${BLUE}DNS Configuration:${NC}"
    if [ -f /etc/resolv.conf ]; then
        cat /etc/resolv.conf | tee -a "$LOG_FILE"
    fi
    
    # Environment variables that might affect networking
    log -e "${BLUE}Relevant Environment Variables:${NC}"
    env | grep -E "(PROXY|proxy|HTTP|HTTPS|NO_PROXY)" | tee -a "$LOG_FILE" || log "No proxy-related environment variables found"
    
    log ""
}

# Enhanced DNS testing with multiple resolvers
test_dns_detailed() {
    local domain=$1
    log -e "${CYAN}=== DNS Resolution Test for $domain ===${NC}"
    
    local dns_success=false
    
    # Test with system resolver
    log -e "${BLUE}Testing with system resolver:${NC}"
    if command -v nslookup >/dev/null 2>&1; then
        if timeout $DNS_TIMEOUT nslookup "$domain" 2>&1 | tee -a "$LOG_FILE"; then
            dns_success=true
            log -e "${GREEN}✓ System DNS resolution successful${NC}"
        else
            log -e "${RED}✗ System DNS resolution failed${NC}"
        fi
    fi
    
    # Test with specific DNS servers
    local dns_servers=("8.8.8.8" "1.1.1.1" "208.67.222.222")
    for dns_server in "${dns_servers[@]}"; do
        log -e "${BLUE}Testing with DNS server $dns_server:${NC}"
        if command -v nslookup >/dev/null 2>&1; then
            if timeout $DNS_TIMEOUT nslookup "$domain" "$dns_server" 2>&1 | tee -a "$LOG_FILE"; then
                log -e "${GREEN}✓ DNS resolution successful with $dns_server${NC}"
                dns_success=true
            else
                log -e "${RED}✗ DNS resolution failed with $dns_server${NC}"
            fi
        elif command -v dig >/dev/null 2>&1; then
            if timeout $DNS_TIMEOUT dig "@$dns_server" "$domain" 2>&1 | tee -a "$LOG_FILE"; then
                log -e "${GREEN}✓ DNS resolution successful with $dns_server${NC}"
                dns_success=true
            else
                log -e "${RED}✗ DNS resolution failed with $dns_server${NC}"
            fi
        fi
    done
    
    # Test different record types
    log -e "${BLUE}Testing different DNS record types:${NC}"
    for record_type in "A" "AAAA" "CNAME"; do
        if command -v dig >/dev/null 2>&1; then
            log "Testing $record_type record for $domain:"
            dig +short -t "$record_type" "$domain" 2>&1 | tee -a "$LOG_FILE" || true
        fi
    done
    
    log ""
    return $([ "$dns_success" = true ] && echo 0 || echo 1)
}

# Advanced connectivity testing
test_connectivity_detailed() {
    local endpoint=$1
    local port=${2:-443}
    log -e "${CYAN}=== Connectivity Test for $endpoint:$port ===${NC}"
    
    local conn_success=false
    
    # Test with curl (detailed)
    if command -v curl >/dev/null 2>&1; then
        log -e "${BLUE}Testing with curl (verbose):${NC}"
        local curl_output
        curl_output=$(curl -v -s --max-time $TIMEOUT_SECONDS \
            --connect-timeout 15 \
            --user-agent "NetworkDiagnostics/1.0 (CI)" \
            "https://$endpoint" 2>&1 | tee -a "$LOG_FILE")
        
        if echo "$curl_output" | grep -q "HTTP/[12].[01] [23][0-9][0-9]"; then
            conn_success=true
            log -e "${GREEN}✓ HTTPS connection successful${NC}"
        else
            log -e "${RED}✗ HTTPS connection failed${NC}"
        fi
    fi
    
    # Test raw socket connection
    if command -v nc >/dev/null 2>&1; then
        log -e "${BLUE}Testing raw socket connection with netcat:${NC}"
        if timeout 10 nc -z -v "$endpoint" "$port" 2>&1 | tee -a "$LOG_FILE"; then
            conn_success=true
            log -e "${GREEN}✓ Socket connection successful${NC}"
        else
            log -e "${RED}✗ Socket connection failed${NC}"
        fi
    elif command -v telnet >/dev/null 2>&1; then
        log -e "${BLUE}Testing with telnet:${NC}"
        if timeout 10 bash -c "echo '' | telnet $endpoint $port" 2>&1 | tee -a "$LOG_FILE"; then
            conn_success=true
            log -e "${GREEN}✓ Telnet connection successful${NC}"
        else
            log -e "${RED}✗ Telnet connection failed${NC}"
        fi
    fi
    
    log ""
    return $([ "$conn_success" = true ] && echo 0 || echo 1)
}

# Traceroute analysis
test_traceroute() {
    local endpoint=$1
    log -e "${CYAN}=== Traceroute Analysis for $endpoint ===${NC}"
    
    local traceroute_cmd=""
    if command -v traceroute >/dev/null 2>&1; then
        traceroute_cmd="traceroute"
    elif command -v tracert >/dev/null 2>&1; then
        traceroute_cmd="tracert"
    else
        log -e "${YELLOW}⚠ No traceroute command available${NC}"
        log ""
        return 1
    fi
    
    log -e "${BLUE}Running traceroute to $endpoint:${NC}"
    timeout 60 $traceroute_cmd -m $TRACEROUTE_HOPS "$endpoint" 2>&1 | tee -a "$LOG_FILE" || log "Traceroute timed out or failed"
    
    log ""
}

# SSL/TLS certificate analysis
test_ssl_certificate() {
    local endpoint=$1
    log -e "${CYAN}=== SSL/TLS Certificate Analysis for $endpoint ===${NC}"
    
    if command -v openssl >/dev/null 2>&1; then
        log -e "${BLUE}Certificate information:${NC}"
        timeout 15 openssl s_client -connect "$endpoint:443" -servername "$endpoint" \
            -showcerts < /dev/null 2>&1 | tee -a "$LOG_FILE" | \
            openssl x509 -noout -text 2>/dev/null | grep -E "(Subject:|Issuer:|Not Before:|Not After:|Subject Alternative Name:)" | tee -a "$LOG_FILE" || log "SSL certificate check failed"
    else
        log -e "${YELLOW}⚠ OpenSSL not available for certificate analysis${NC}"
    fi
    
    log ""
}

# Test API endpoints with authentication simulation
test_api_endpoints() {
    log -e "${CYAN}=== API Endpoint Testing ===${NC}"
    
    # OpenAI API
    log -e "${BLUE}Testing OpenAI API:${NC}"
    local openai_test=false
    if command -v curl >/dev/null 2>&1; then
        local response
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n" \
            --max-time 20 \
            --user-agent "NetworkDiagnostics/1.0 (CI)" \
            -H "Content-Type: application/json" \
            "https://$OPENAI_API/v1/models" 2>&1)
        
        local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d':' -f2)
        local time_total=$(echo "$response" | grep "TIME_TOTAL:" | cut -d':' -f2)
        
        log "Response: $response"
        log "HTTP Status: $http_code, Time: ${time_total}s"
        
        if [ "$http_code" = "401" ] || [ "$http_code" = "403" ] || [ "$http_code" = "200" ]; then
            openai_test=true
            log -e "${GREEN}✓ OpenAI API is accessible (expected auth error is OK)${NC}"
        else
            log -e "${RED}✗ OpenAI API is not accessible${NC}"
        fi
    fi
    
    # ElevenLabs API
    log -e "${BLUE}Testing ElevenLabs API:${NC}"
    local elevenlabs_test=false
    if command -v curl >/dev/null 2>&1; then
        local response
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n" \
            --max-time 20 \
            --user-agent "NetworkDiagnostics/1.0 (CI)" \
            "https://$ELEVENLABS_API/" 2>&1)
        
        local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d':' -f2)
        local time_total=$(echo "$response" | grep "TIME_TOTAL:" | cut -d':' -f2)
        
        log "Response: $response"
        log "HTTP Status: $http_code, Time: ${time_total}s"
        
        if [[ "$http_code" =~ ^[2-4][0-9][0-9]$ ]] && [ "$http_code" != "000" ]; then
            elevenlabs_test=true
            log -e "${GREEN}✓ ElevenLabs API is accessible${NC}"
        else
            log -e "${RED}✗ ElevenLabs API is not accessible${NC}"
        fi
    fi
    
    log ""
    return $([ "$openai_test" = true ] && [ "$elevenlabs_test" = true ] && echo 0 || echo 1)
}

# Generate recommendations
generate_recommendations() {
    log -e "${CYAN}=== Recommendations ===${NC}"
    
    local recommendations=()
    
    # Check for common issues and provide recommendations
    if grep -q "Name or service not known" "$LOG_FILE" 2>/dev/null; then
        recommendations+=("DNS resolution is failing. Check DNS servers and network connectivity.")
        recommendations+=("Try using alternative DNS servers (8.8.8.8, 1.1.1.1) in /etc/resolv.conf")
    fi
    
    if grep -q "Connection refused" "$LOG_FILE" 2>/dev/null; then
        recommendations+=("Connection is being refused. This may indicate a firewall blocking outbound connections.")
        recommendations+=("Check if corporate firewall allows HTTPS (port 443) to api.openai.com and api.elevenlabs.io")
    fi
    
    if grep -q "Connection timed out" "$LOG_FILE" 2>/dev/null; then
        recommendations+=("Connection timeouts suggest network or firewall issues.")
        recommendations+=("Ask infrastructure team to verify outbound HTTPS access to required APIs")
    fi
    
    if grep -q "certificate" "$LOG_FILE" 2>/dev/null; then
        recommendations+=("SSL/TLS certificate issues detected.")
        recommendations+=("Check if corporate proxy is performing TLS MITM that breaks certificate validation")
    fi
    
    # Always include these general recommendations
    recommendations+=("For CI environments, ensure runners have outbound internet access")
    recommendations+=("Consider using self-hosted runners if GitHub-hosted runners are restricted")
    recommendations+=("Add api.openai.com and api.elevenlabs.io to firewall allowlist")
    recommendations+=("Test network connectivity from the same network segment as CI/staging")
    
    for rec in "${recommendations[@]}"; do
        log -e "${YELLOW}• $rec${NC}"
    done
    
    log ""
}

# Main execution
main() {
    local overall_success=true
    
    # Initialize
    log "Starting comprehensive network diagnostics..."
    log ""
    
    # System information
    gather_system_info
    
    # Test critical endpoints
    local endpoints=("$OPENAI_API" "$ELEVENLABS_API")
    
    for endpoint in "${endpoints[@]}"; do
        # DNS testing
        if ! test_dns_detailed "$endpoint"; then
            overall_success=false
        fi
        
        # Connectivity testing
        if ! test_connectivity_detailed "$endpoint"; then
            overall_success=false
        fi
        
        # Traceroute
        test_traceroute "$endpoint"
        
        # SSL certificate
        test_ssl_certificate "$endpoint"
    done
    
    # API endpoint testing
    if ! test_api_endpoints; then
        overall_success=false
    fi
    
    # Test reference endpoints for comparison
    log -e "${CYAN}=== Reference Endpoint Tests ===${NC}"
    for endpoint in "${TEST_ENDPOINTS[@]}"; do
        test_connectivity_detailed "$endpoint" 443
    done
    
    # Generate recommendations
    generate_recommendations
    
    # Summary
    log "============================================="
    log "Diagnostics completed. Files generated:"
    log "• Log file: $LOG_FILE"
    log "• Report file: $REPORT_FILE"
    log ""
    
    if [ "$overall_success" = true ]; then
        log -e "${GREEN}✓ Network diagnostics completed - No critical issues detected${NC}"
        exit 0
    else
        log -e "${RED}✗ Network diagnostics completed - Issues detected${NC}"
        log -e "${YELLOW}Review the recommendations above and share logs with infrastructure team${NC}"
        exit 1
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
}

# Set trap for cleanup
trap cleanup EXIT

# Check dependencies
check_dependencies() {
    local missing_tools=()
    
    for tool in "curl" "nslookup" "dig"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_tools+=("$tool")
        fi
    done
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        log -e "${YELLOW}⚠ Missing recommended tools: ${missing_tools[*]}${NC}"
        log "Consider installing: curl, dnsutils (or bind-utils), netcat, openssl"
        log ""
    fi
}

# Check if jq is available for JSON report
if ! command -v jq >/dev/null 2>&1; then
    log -e "${YELLOW}⚠ jq not available - JSON report will be basic${NC}"
fi

# Run dependency check and main function
check_dependencies
main "$@"