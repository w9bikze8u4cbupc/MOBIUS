#!/bin/bash
# Script to reproduce and test specific blocked endpoint scenarios
# Helps infrastructure teams validate firewall configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
OPENAI_API="api.openai.com"
ELEVENLABS_API="api.elevenlabs.io"
TIMEOUT_SECONDS=30

# Command to run by infrastructure team
INFRA_COMMANDS=(
    "nslookup $OPENAI_API"
    "dig +short $OPENAI_API"
    "traceroute -m 30 $OPENAI_API"
    "curl -v --max-time 15 https://$OPENAI_API/v1/models"
    "nslookup $ELEVENLABS_API"
    "dig +short $ELEVENLABS_API"
    "traceroute -m 30 $ELEVENLABS_API"
    "curl -v --max-time 15 https://$ELEVENLABS_API/"
)

# Log file
LOG_FILE="/tmp/blocked-endpoints-test-$(date +%Y%m%d-%H%M%S).log"

echo -e "${BLUE}Blocked Endpoints Reproduction Script${NC}"
echo "Timestamp: $(date)"
echo "Log file: $LOG_FILE"
echo "=========================================="

# Logging function
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Function to test a specific scenario
test_scenario() {
    local scenario_name="$1"
    local endpoint="$2"
    local test_path="$3"
    local expected_behavior="$4"
    
    log -e "${CYAN}=== Testing Scenario: $scenario_name ===${NC}"
    log "Endpoint: $endpoint"
    log "Test Path: $test_path"
    log "Expected: $expected_behavior"
    log ""
    
    local url="https://$endpoint$test_path"
    local success=false
    
    # Test 1: DNS Resolution
    log -e "${BLUE}1. Testing DNS resolution for $endpoint:${NC}"
    if command -v nslookup >/dev/null 2>&1; then
        if nslookup "$endpoint" 2>&1 | tee -a "$LOG_FILE"; then
            log -e "${GREEN}✓ DNS resolution successful${NC}"
        else
            log -e "${RED}✗ DNS resolution failed${NC}"
            log -e "${YELLOW}→ This indicates DNS blocking or DNS server issues${NC}"
        fi
    fi
    log ""
    
    # Test 2: Basic connectivity
    log -e "${BLUE}2. Testing basic HTTPS connectivity:${NC}"
    if command -v curl >/dev/null 2>&1; then
        local curl_output
        curl_output=$(curl -v -s --max-time $TIMEOUT_SECONDS \
            --connect-timeout 15 \
            --user-agent "BlockedEndpointTest/1.0" \
            "$url" 2>&1)
        
        echo "$curl_output" | tee -a "$LOG_FILE"
        
        # Analyze the response
        if echo "$curl_output" | grep -q "Connected to"; then
            log -e "${GREEN}✓ TCP connection established${NC}"
            success=true
        else
            log -e "${RED}✗ TCP connection failed${NC}"
        fi
        
        if echo "$curl_output" | grep -q "SSL connection"; then
            log -e "${GREEN}✓ SSL/TLS handshake successful${NC}"
        elif echo "$curl_output" | grep -q "SSL"; then
            log -e "${YELLOW}⚠ SSL/TLS issues detected${NC}"
        fi
        
        if echo "$curl_output" | grep -q "HTTP/[12].[01]"; then
            log -e "${GREEN}✓ HTTP response received${NC}"
            success=true
        else
            log -e "${RED}✗ No HTTP response${NC}"
        fi
    fi
    log ""
    
    # Test 3: Port-specific test
    log -e "${BLUE}3. Testing port 443 connectivity:${NC}"
    if command -v nc >/dev/null 2>&1; then
        if timeout 10 nc -z -v "$endpoint" 443 2>&1 | tee -a "$LOG_FILE"; then
            log -e "${GREEN}✓ Port 443 is accessible${NC}"
        else
            log -e "${RED}✗ Port 443 is not accessible${NC}"
            log -e "${YELLOW}→ This indicates firewall blocking of HTTPS traffic${NC}"
        fi
    elif command -v telnet >/dev/null 2>&1; then
        if timeout 10 bash -c "echo '' | telnet $endpoint 443" 2>&1 | tee -a "$LOG_FILE" | grep -q "Connected"; then
            log -e "${GREEN}✓ Port 443 is accessible via telnet${NC}"
        else
            log -e "${RED}✗ Port 443 is not accessible via telnet${NC}"
        fi
    fi
    log ""
    
    # Test 4: Alternative ports (if applicable)
    log -e "${BLUE}4. Testing alternative connectivity:${NC}"
    for port in 80 8080 8443; do
        if command -v nc >/dev/null 2>&1; then
            if timeout 5 nc -z "$endpoint" "$port" 2>/dev/null; then
                log -e "${GREEN}✓ Port $port is accessible${NC}"
            else
                log -e "${YELLOW}⚠ Port $port is not accessible${NC}"
            fi
        fi
    done
    log ""
    
    # Summary for this scenario
    log -e "${CYAN}Scenario Summary:${NC}"
    if [ "$success" = true ]; then
        log -e "${GREEN}✓ $scenario_name: Connectivity appears to be working${NC}"
    else
        log -e "${RED}✗ $scenario_name: Connectivity issues detected${NC}"
        log -e "${YELLOW}  Recommended actions for infrastructure team:${NC}"
        case "$endpoint" in
            "$OPENAI_API")
                log -e "${YELLOW}  - Add $OPENAI_API to firewall allowlist for HTTPS (port 443)${NC}"
                log -e "${YELLOW}  - Verify DNS resolution to OpenAI's IP addresses${NC}"
                log -e "${YELLOW}  - Check if corporate proxy allows access to OpenAI services${NC}"
                ;;
            "$ELEVENLABS_API")
                log -e "${YELLOW}  - Add $ELEVENLABS_API to firewall allowlist for HTTPS (port 443)${NC}"
                log -e "${YELLOW}  - Verify DNS resolution to ElevenLabs' IP addresses${NC}"
                log -e "${YELLOW}  - Check if corporate proxy allows access to ElevenLabs services${NC}"
                ;;
        esac
    fi
    log ""
    log "----------------------------------------"
    log ""
}

# Function to run infrastructure diagnostic commands
run_infra_commands() {
    log -e "${CYAN}=== Commands for Infrastructure Team ===${NC}"
    log "Please run these commands on the affected CI/staging hosts:"
    log ""
    
    for cmd in "${INFRA_COMMANDS[@]}"; do
        log -e "${BLUE}Command: $cmd${NC}"
        log "# $cmd"
        
        # Actually run the command if possible
        if eval "$cmd" 2>&1 | tee -a "$LOG_FILE"; then
            log -e "${GREEN}✓ Command executed successfully${NC}"
        else
            log -e "${RED}✗ Command failed or endpoint not accessible${NC}"
        fi
        log ""
    done
}

# Function to generate a comprehensive report for infrastructure
generate_infra_report() {
    log -e "${CYAN}=== Infrastructure Report ===${NC}"
    
    local report_file="/tmp/infra-network-report-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$report_file" << EOF
NETWORK CONNECTIVITY ISSUE REPORT
Generated: $(date)
Host: $(hostname)
User: $(whoami)

ISSUE DESCRIPTION:
Applications in CI/staging environment cannot connect to required external APIs:
- OpenAI API (api.openai.com)
- ElevenLabs API (api.elevenlabs.io)

SYMPTOMS:
- DNS resolution may fail
- HTTPS connections timeout or are refused
- Applications report network/API connectivity errors

REQUIRED ACCESS:
The following domains need HTTPS (port 443) access:
- api.openai.com (OpenAI API)
- api.elevenlabs.io (ElevenLabs TTS API)

DIAGNOSTIC COMMANDS TO RUN:
Please execute these commands on the affected systems and provide the output:

$(printf '$ %s\n' "${INFRA_COMMANDS[@]}")

ADDITIONAL CHECKS:
1. Verify corporate firewall rules allow outbound HTTPS to these domains
2. Check if transparent proxy or TLS MITM is interfering
3. Confirm DNS servers can resolve these domains
4. Test from same network segment as CI runners

TEMPORARY WORKAROUND:
If these services cannot be allowed through corporate firewall:
- Use self-hosted GitHub Actions runners with known network access
- Set up VPN or proxy specifically for CI/staging environments
- Consider using API keys with IP restrictions if supported

For questions, please check the detailed log: $LOG_FILE
EOF
    
    log -e "${GREEN}Infrastructure report generated: $report_file${NC}"
    log ""
    log -e "${BLUE}Report contents:${NC}"
    cat "$report_file" | tee -a "$LOG_FILE"
}

# Function to simulate common blocking scenarios
simulate_blocking_scenarios() {
    log -e "${CYAN}=== Simulating Common Blocking Scenarios ===${NC}"
    
    # Scenario 1: Complete domain blocking
    log -e "${BLUE}Scenario 1: Testing if domains are completely blocked${NC}"
    for endpoint in "$OPENAI_API" "$ELEVENLABS_API"; do
        if ! ping -c 1 -W 5 "$endpoint" >/dev/null 2>&1; then
            log -e "${RED}✗ $endpoint is not reachable via ping${NC}"
        else
            log -e "${GREEN}✓ $endpoint responds to ping${NC}"
        fi
    done
    log ""
    
    # Scenario 2: Port-specific blocking
    log -e "${BLUE}Scenario 2: Testing port-specific blocking${NC}"
    for endpoint in "$OPENAI_API" "$ELEVENLABS_API"; do
        for port in 80 443 8080 8443; do
            if command -v nc >/dev/null 2>&1; then
                if timeout 3 nc -z "$endpoint" "$port" 2>/dev/null; then
                    log -e "${GREEN}✓ $endpoint:$port is accessible${NC}"
                else
                    log -e "${RED}✗ $endpoint:$port is blocked${NC}"
                fi
            fi
        done
    done
    log ""
    
    # Scenario 3: DNS blocking
    log -e "${BLUE}Scenario 3: Testing DNS resolution with different servers${NC}"
    local dns_servers=("8.8.8.8" "1.1.1.1" "208.67.222.222")
    for endpoint in "$OPENAI_API" "$ELEVENLABS_API"; do
        for dns_server in "${dns_servers[@]}"; do
            if command -v dig >/dev/null 2>&1; then
                if dig "@$dns_server" +short "$endpoint" >/dev/null 2>&1; then
                    log -e "${GREEN}✓ $endpoint resolves via $dns_server${NC}"
                else
                    log -e "${RED}✗ $endpoint does not resolve via $dns_server${NC}"
                fi
            fi
        done
    done
    log ""
}

# Main execution
main() {
    log "Starting blocked endpoints reproduction tests..."
    log ""
    
    # Test each critical endpoint
    test_scenario "OpenAI API Access" "$OPENAI_API" "/v1/models" "401 Unauthorized (API key required) or 200 OK"
    test_scenario "ElevenLabs API Access" "$ELEVENLABS_API" "" "200 OK or 404 Not Found"
    
    # Run infrastructure diagnostic commands
    run_infra_commands
    
    # Simulate common blocking scenarios
    simulate_blocking_scenarios
    
    # Generate report for infrastructure team
    generate_infra_report
    
    # Final summary
    log "=========================================="
    log -e "${YELLOW}NEXT STEPS:${NC}"
    log "1. Share the infrastructure report with your network/security team"
    log "2. Ask them to run the diagnostic commands on affected systems"
    log "3. Verify firewall rules allow HTTPS access to required APIs"
    log "4. Test again after infrastructure changes are made"
    log ""
    log -e "${GREEN}Log file saved: $LOG_FILE${NC}"
}

# Show usage if requested
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat << EOF
Blocked Endpoints Reproduction Script

This script tests connectivity to required APIs and generates a report for 
infrastructure teams to diagnose firewall/network issues.

Usage: $0 [options]

Options:
  -h, --help    Show this help message
  
The script will:
1. Test connectivity to OpenAI and ElevenLabs APIs
2. Run diagnostic commands that infrastructure can use
3. Generate a detailed report for the infrastructure team
4. Provide specific recommendations for firewall configuration

Output files:
- Log file: /tmp/blocked-endpoints-test-TIMESTAMP.log
- Infrastructure report: /tmp/infra-network-report-TIMESTAMP.txt
EOF
    exit 0
fi

# Check dependencies
check_dependencies() {
    local missing_tools=()
    
    for tool in "curl" "nslookup"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_tools+=("$tool")
        fi
    done
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        log -e "${YELLOW}⚠ Missing tools: ${missing_tools[*]}${NC}"
        log "Some tests may be limited. Consider installing: curl, dnsutils, netcat"
        log ""
    fi
}

# Run dependency check and main function
check_dependencies
main "$@"