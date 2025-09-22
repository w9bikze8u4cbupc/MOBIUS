#!/bin/bash

# Network diagnostics script with comprehensive testing and reporting
# Usage: ./scripts/network-diagnostics.sh [--format json|text] [--output <file>]

set -euo pipefail

# Configuration
OUTPUT_FORMAT="${OUTPUT_FORMAT:-text}"
OUTPUT_FILE="${OUTPUT_FILE:-network-diagnostics.log}"
TIMESTAMP=$(date +'%Y-%m-%d_%H-%M-%S')

# Function to output in specified format
output() {
    local level="$1"
    local component="$2"
    local message="$3"
    local details="${4:-}"
    
    case "$OUTPUT_FORMAT" in
        json)
            echo "{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"$level\",\"component\":\"$component\",\"message\":\"$message\",\"details\":\"$details\"}"
            ;;
        *)
            echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] [$component] $message${details:+ - $details}"
            ;;
    esac
}

# Function to test network interfaces
test_network_interfaces() {
    output "INFO" "NETWORK" "Testing network interfaces"
    
    if command -v ip >/dev/null 2>&1; then
        local interfaces=$(ip addr show | grep -E '^[0-9]+: [^:]+ ')
        while IFS= read -r interface; do
            local name=$(echo "$interface" | cut -d' ' -f2 | tr -d ':')
            local status="DOWN"
            if echo "$interface" | grep -q "UP"; then
                status="UP"
            fi
            output "INFO" "INTERFACE" "$name" "$status"
        done <<< "$interfaces"
    else
        output "WARN" "NETWORK" "ip command not available, skipping interface check"
    fi
}

# Function to test DNS configuration
test_dns_config() {
    output "INFO" "DNS" "Testing DNS configuration"
    
    # Check /etc/resolv.conf
    if [[ -f /etc/resolv.conf ]]; then
        local nameservers=$(grep '^nameserver' /etc/resolv.conf | awk '{print $2}' | head -3)
        if [[ -n "$nameservers" ]]; then
            while IFS= read -r ns; do
                output "INFO" "DNS" "Nameserver configured" "$ns"
            done <<< "$nameservers"
        else
            output "WARN" "DNS" "No nameservers found in /etc/resolv.conf"
        fi
    else
        output "WARN" "DNS" "/etc/resolv.conf not found"
    fi
    
    # Test DNS resolution
    local test_domains=("google.com" "github.com" "api.openai.com" "api.elevenlabs.io")
    for domain in "${test_domains[@]}"; do
        if nslookup "$domain" >/dev/null 2>&1; then
            local ip=$(nslookup "$domain" 2>/dev/null | grep -A1 "Name:" | tail -1 | awk '{print $2}' | head -1)
            output "SUCCESS" "DNS" "Resolution successful" "$domain -> ${ip:-unknown}"
        else
            output "ERROR" "DNS" "Resolution failed" "$domain"
        fi
    done
}

# Function to test HTTP/HTTPS connectivity
test_http_connectivity() {
    output "INFO" "HTTP" "Testing HTTP/HTTPS connectivity"
    
    local endpoints=(
        "https://api.openai.com/v1/models|OpenAI API"
        "https://api.elevenlabs.io/v1/voices|ElevenLabs API"
        "https://api.boardgamegeek.com/xmlapi2/thing?id=1|BoardGameGeek API"
        "https://httpbin.org/status/200|HTTPBin Test"
        "https://www.google.com|Google"
    )
    
    for endpoint_info in "${endpoints[@]}"; do
        local url=$(echo "$endpoint_info" | cut -d'|' -f1)
        local name=$(echo "$endpoint_info" | cut -d'|' -f2)
        
        local start_time=$(date +%s.%N)
        if response=$(curl -s -w "%{http_code},%{time_total},%{time_namelookup},%{time_connect}" \
                          --max-time 15 \
                          -H "User-Agent: MobiusGames-NetworkDiagnostic/1.0" \
                          "$url" 2>/dev/null); then
            
            local metrics=$(echo "$response" | tail -c 50)
            if [[ "$metrics" =~ ([0-9]{3}),([0-9.]+),([0-9.]+),([0-9.]+) ]]; then
                local status="${BASH_REMATCH[1]}"
                local total_time="${BASH_REMATCH[2]}"
                local dns_time="${BASH_REMATCH[3]}"
                local connect_time="${BASH_REMATCH[4]}"
                
                if [[ "$status" =~ ^[23] ]]; then
                    output "SUCCESS" "HTTP" "$name accessible" "Status: $status, Time: ${total_time}s, DNS: ${dns_time}s, Connect: ${connect_time}s"
                else
                    output "WARN" "HTTP" "$name returned non-2xx" "Status: $status"
                fi
            else
                output "ERROR" "HTTP" "$name - invalid response format" "$metrics"
            fi
        else
            output "ERROR" "HTTP" "$name unreachable" "Connection failed"
        fi
    done
}

# Function to test proxy configuration
test_proxy_config() {
    output "INFO" "PROXY" "Testing proxy configuration"
    
    local proxy_vars=("HTTP_PROXY" "HTTPS_PROXY" "NO_PROXY" "http_proxy" "https_proxy" "no_proxy")
    for var in "${proxy_vars[@]}"; do
        if [[ -n "${!var:-}" ]]; then
            output "INFO" "PROXY" "$var configured" "${!var}"
        fi
    done
    
    # Test proxy connectivity if configured
    if [[ -n "${HTTP_PROXY:-}" ]] || [[ -n "${HTTPS_PROXY:-}" ]]; then
        output "INFO" "PROXY" "Testing proxy connectivity"
        if curl -s --proxy "${HTTP_PROXY:-${HTTPS_PROXY}}" --max-time 10 "https://httpbin.org/ip" >/dev/null 2>&1; then
            output "SUCCESS" "PROXY" "Proxy connection successful"
        else
            output "ERROR" "PROXY" "Proxy connection failed"
        fi
    fi
}

# Function to test port connectivity
test_port_connectivity() {
    output "INFO" "PORTS" "Testing critical port connectivity"
    
    local ports=(
        "80:HTTP"
        "443:HTTPS"
        "53:DNS"
        "22:SSH"
    )
    
    for port_info in "${ports[@]}"; do
        local port=$(echo "$port_info" | cut -d':' -f1)
        local service=$(echo "$port_info" | cut -d':' -f2)
        
        # Test outbound connectivity on this port using nc or telnet
        if command -v nc >/dev/null 2>&1; then
            if timeout 5 nc -z google.com "$port" 2>/dev/null; then
                output "SUCCESS" "PORTS" "$service port $port accessible"
            else
                output "WARN" "PORTS" "$service port $port not accessible" "May be blocked by firewall"
            fi
        elif command -v telnet >/dev/null 2>&1; then
            if timeout 5 telnet google.com "$port" </dev/null >/dev/null 2>&1; then
                output "SUCCESS" "PORTS" "$service port $port accessible"
            else
                output "WARN" "PORTS" "$service port $port not accessible" "May be blocked by firewall"
            fi
        else
            output "WARN" "PORTS" "Cannot test ports - nc/telnet not available"
            break
        fi
    done
}

# Function to collect system information
collect_system_info() {
    output "INFO" "SYSTEM" "Collecting system information"
    
    # OS Information
    if [[ -f /etc/os-release ]]; then
        local os_name=$(grep '^NAME=' /etc/os-release | cut -d'"' -f2)
        local os_version=$(grep '^VERSION=' /etc/os-release | cut -d'"' -f2)
        output "INFO" "SYSTEM" "Operating System" "$os_name $os_version"
    else
        output "INFO" "SYSTEM" "Operating System" "$(uname -s) $(uname -r)"
    fi
    
    # Network tools availability
    local tools=("curl" "wget" "nc" "nslookup" "dig" "ping" "traceroute")
    for tool in "${tools[@]}"; do
        if command -v "$tool" >/dev/null 2>&1; then
            local version=$(timeout 2 "$tool" --version 2>/dev/null | head -1 || echo "available")
            output "INFO" "TOOLS" "$tool available" "$version"
        else
            output "WARN" "TOOLS" "$tool not available"
        fi
    done
}

# Function to generate summary report
generate_summary() {
    output "INFO" "SUMMARY" "Network diagnostic summary completed"
    output "INFO" "SUMMARY" "Report timestamp" "$TIMESTAMP"
    output "INFO" "SUMMARY" "Full report available" "$OUTPUT_FILE"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--format json|text] [--output <file>]"
            echo "  --format    Output format: json or text (default: text)"
            echo "  --output    Output file (default: network-diagnostics.log)"
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
    # Initialize output file
    if [[ "$OUTPUT_FORMAT" == "json" ]]; then
        echo '{"diagnostics":[' > "$OUTPUT_FILE"
    else
        echo "# Network Diagnostics Report - $TIMESTAMP" > "$OUTPUT_FILE"
        echo "# Generated by: $(basename "$0")" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
    
    # Execute all diagnostic tests
    {
        collect_system_info
        test_network_interfaces
        test_dns_config
        test_proxy_config
        test_port_connectivity
        test_http_connectivity
        generate_summary
    } | tee -a "$OUTPUT_FILE"
    
    # Close JSON array if needed
    if [[ "$OUTPUT_FORMAT" == "json" ]]; then
        # Remove trailing comma and close array
        sed -i '$ s/,$//' "$OUTPUT_FILE"
        echo ']}' >> "$OUTPUT_FILE"
    fi
    
    echo ""
    echo "Network diagnostics completed. Report saved to: $OUTPUT_FILE"
}

# Run main function
main "$@"