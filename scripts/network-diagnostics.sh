#!/bin/bash
# scripts/network-diagnostics.sh - Comprehensive network diagnostics for infrastructure teams
# Usage: ./scripts/network-diagnostics.sh [--output file] [--extra-hosts "host1,host2"]
#
# Features:
# - Complete network diagnostics including DNS, TLS, routing, proxy detection
# - Structured output for infrastructure team analysis
# - System information collection
# - Safe execution with graceful handling of missing utilities

set -euo pipefail

# Default target hosts
DEFAULT_HOSTS=(
    "api.openai.com"
    "api.elevenlabs.io"
)

# Function to safely run a command and capture output
safe_run() {
    local cmd="$1"
    local description="$2"
    
    echo "=== $description ==="
    echo "Command: $cmd"
    echo
    
    if eval "$cmd" 2>&1; then
        echo "Status: SUCCESS"
    else
        echo "Status: FAILED (exit code: $?)"
    fi
    echo
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to diagnose a single host
diagnose_host() {
    local host=$1
    
    echo "################################################################################"
    echo "# DIAGNOSTICS FOR: $host"
    echo "################################################################################"
    echo
    
    # Basic DNS resolution
    if command_exists nslookup; then
        safe_run "nslookup $host" "DNS Resolution (system resolver)"
    fi
    
    if command_exists dig; then
        safe_run "dig +short $host" "DNS Resolution (dig short)"
        safe_run "dig $host" "DNS Resolution (dig detailed)"
        
        # Test with public DNS resolvers
        safe_run "dig @8.8.8.8 $host" "DNS Resolution (Google DNS)"
        safe_run "dig @1.1.1.1 $host" "DNS Resolution (Cloudflare DNS)"
    fi
    
    # Get IP addresses for routing tests
    local ips
    if command_exists dig; then
        ips=$(dig +short "$host" 2>/dev/null || echo "")
    elif command_exists nslookup; then
        ips=$(nslookup "$host" 2>/dev/null | awk '/^Address: / { print $2 }' | grep -v '#' || echo "")
    fi
    
    # Traceroute
    if command_exists traceroute && [[ -n "$ips" ]]; then
        local ip=$(echo "$ips" | head -n1)
        if [[ -n "$ip" ]]; then
            safe_run "traceroute -m 30 $ip" "Traceroute to $host ($ip)"
        fi
    elif command_exists tracert && [[ -n "$ips" ]]; then
        local ip=$(echo "$ips" | head -n1)
        if [[ -n "$ip" ]]; then
            safe_run "tracert -h 30 $ip" "Traceroute to $host ($ip) [Windows]"
        fi
    fi
    
    # TCP connectivity test
    if command_exists nc; then
        safe_run "timeout 15 nc -v -z $host 443" "TCP Connectivity Test (port 443)"
    elif command_exists telnet; then
        safe_run "timeout 15 telnet $host 443" "TCP Connectivity Test via telnet (port 443)"
    fi
    
    # HTTPS/TLS testing
    if command_exists curl; then
        safe_run "curl -v --max-time 15 --head https://$host" "HTTPS Connectivity Test"
        safe_run "curl -v --max-time 15 -I https://$host" "HTTPS Headers Test"
    fi
    
    # SSL/TLS certificate information
    if command_exists openssl; then
        safe_run "timeout 15 openssl s_client -connect $host:443 -servername $host < /dev/null" "TLS Certificate Check"
    fi
    
    echo
}

# Function to collect system network information
collect_system_info() {
    echo "################################################################################"
    echo "# SYSTEM NETWORK CONFIGURATION"
    echo "################################################################################"
    echo
    
    # DNS configuration
    if [[ -f /etc/resolv.conf ]]; then
        safe_run "cat /etc/resolv.conf" "DNS Configuration (/etc/resolv.conf)"
    fi
    
    # Hosts file (first 50 lines to avoid spam)
    if [[ -f /etc/hosts ]]; then
        safe_run "head -50 /etc/hosts" "Hosts file (/etc/hosts - first 50 lines)"
    fi
    
    # Network interfaces
    if command_exists ip; then
        safe_run "ip addr show" "Network Interfaces (ip addr)"
        safe_run "ip route show" "Routing Table (ip route)"
    elif command_exists ifconfig; then
        safe_run "ifconfig" "Network Interfaces (ifconfig)"
    elif command_exists ipconfig && [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        safe_run "ipconfig /all" "Network Configuration [Windows]"
        safe_run "route print" "Routing Table [Windows]"
    fi
    
    # Default gateway
    if command_exists route && [[ "$OSTYPE" != "msys" && "$OSTYPE" != "cygwin" ]]; then
        safe_run "route -n" "Routing Table (route -n)"
    fi
    
    echo
}

# Function to collect proxy and environment information
collect_proxy_info() {
    echo "################################################################################"
    echo "# PROXY AND ENVIRONMENT INFORMATION"
    echo "################################################################################"
    echo
    
    echo "=== Environment Variables ==="
    echo "HTTP_PROXY: ${HTTP_PROXY:-<not set>}"
    echo "HTTPS_PROXY: ${HTTPS_PROXY:-<not set>}"
    echo "http_proxy: ${http_proxy:-<not set>}"
    echo "https_proxy: ${https_proxy:-<not set>}"
    echo "NO_PROXY: ${NO_PROXY:-<not set>}"
    echo "no_proxy: ${no_proxy:-<not set>}"
    echo "ALL_PROXY: ${ALL_PROXY:-<not set>}"
    echo "all_proxy: ${all_proxy:-<not set>}"
    echo
    
    # System information
    echo "=== System Information ==="
    echo "OS: $(uname -s 2>/dev/null || echo 'Unknown')"
    echo "Kernel: $(uname -r 2>/dev/null || echo 'Unknown')"
    echo "Architecture: $(uname -m 2>/dev/null || echo 'Unknown')"
    echo "Hostname: $(hostname 2>/dev/null || echo 'Unknown')"
    echo "User: $(whoami 2>/dev/null || echo 'Unknown')"
    echo "Shell: $SHELL"
    echo "Date: $(date)"
    echo
    
    # Node.js version (if available)
    if command_exists node; then
        safe_run "node --version" "Node.js Version"
    fi
    
    # npm configuration (if available)
    if command_exists npm; then
        safe_run "npm config list" "npm Configuration"
    fi
    
    echo
}

# Main function
main() {
    local output_file=""
    local extra_hosts=""
    local hosts=()
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --output)
                output_file="$2"
                shift 2
                ;;
            --extra-hosts)
                extra_hosts="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $0 [--output file] [--extra-hosts \"host1,host2\"]"
                echo ""
                echo "Options:"
                echo "  --output         Write output to specified file (default: stdout)"
                echo "  --extra-hosts    Comma-separated list of additional hosts to test"
                echo "  -h, --help      Show this help message"
                echo ""
                echo "Environment variables:"
                echo "  EXTRA_NETWORK_HOSTS  Additional hosts to test (comma-separated)"
                echo ""
                echo "Example:"
                echo "  $0 --output /tmp/network-diagnostics.txt"
                echo "  EXTRA_NETWORK_HOSTS=\"example.com\" $0"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Redirect output if specified
    if [[ -n "$output_file" ]]; then
        exec > "$output_file" 2>&1
        echo "Network diagnostics output redirected to: $output_file" >&2
    fi
    
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
    
    # Header
    echo "################################################################################"
    echo "# COMPREHENSIVE NETWORK DIAGNOSTICS"
    echo "# Generated: $(date)"
    echo "# Hosts: ${hosts[*]}"
    echo "################################################################################"
    echo
    
    # System information first
    collect_system_info
    collect_proxy_info
    
    # Test each host
    for host in "${hosts[@]}"; do
        if [[ -n "$host" ]]; then
            diagnose_host "$host"
        fi
    done
    
    # Footer
    echo "################################################################################"
    echo "# DIAGNOSTICS COMPLETE"
    echo "# Generated: $(date)"
    echo "################################################################################"
    
    if [[ -n "$output_file" ]]; then
        echo "Diagnostics complete. Output saved to: $output_file" >&2
        echo "Share this file with your infrastructure team for analysis." >&2
    fi
}

# Handle script being sourced vs executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi