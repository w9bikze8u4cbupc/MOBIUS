#!/bin/bash

# Network Diagnostics Script for Mobius Games Tutorial Generator
# Collects detailed network information for troubleshooting

echo "🔍 Network Diagnostics Report"
echo "=============================="
echo "Generated on: $(date)"
echo "Hostname: $(hostname)"
echo "User: $(whoami)"
echo ""

# Function to run command safely and capture output
safe_run() {
    local cmd="$1"
    local desc="$2"
    
    echo "🔧 $desc"
    echo "Command: $cmd"
    echo "Output:"
    
    if eval "$cmd" 2>&1; then
        echo "✅ Success"
    else
        echo "❌ Failed (exit code: $?)"
    fi
    
    echo ""
}

# System info
echo "📋 System Information:"
safe_run "uname -a" "System info"
safe_run "cat /etc/os-release 2>/dev/null || echo 'OS release info not available'" "OS release"

# Network interface info
echo "🌐 Network Configuration:"
safe_run "ip addr show 2>/dev/null || ifconfig 2>/dev/null || echo 'Network interface info not available'" "Network interfaces"
safe_run "ip route show 2>/dev/null || netstat -rn 2>/dev/null || echo 'Route info not available'" "Routing table"

# DNS configuration
echo "🔍 DNS Configuration:"
safe_run "cat /etc/resolv.conf 2>/dev/null || echo 'DNS config not available'" "DNS servers"
safe_run "nslookup api.openai.com" "OpenAI DNS lookup"
safe_run "nslookup api.elevenlabs.io" "ElevenLabs DNS lookup"

# Connectivity tests
echo "🌍 Connectivity Tests:"
safe_run "ping -c 3 8.8.8.8 2>/dev/null || echo 'ping not available'" "Ping Google DNS"
safe_run "curl -I -m 10 https://api.openai.com/v1/models" "OpenAI API test"
safe_run "curl -I -m 10 https://api.elevenlabs.io/v1/voices" "ElevenLabs API test"

# Traceroute (if available)
echo "🗺️ Network Path Analysis:"
safe_run "traceroute -m 5 api.openai.com 2>/dev/null || tracert -h 5 api.openai.com 2>/dev/null || echo 'Traceroute not available'" "Traceroute to OpenAI"
safe_run "traceroute -m 5 api.elevenlabs.io 2>/dev/null || tracert -h 5 api.elevenlabs.io 2>/dev/null || echo 'Traceroute not available'" "Traceroute to ElevenLabs"

# Port connectivity
echo "🔌 Port Connectivity:"
if command -v telnet > /dev/null; then
    safe_run "echo 'quit' | timeout 5 telnet api.openai.com 443" "OpenAI port 443"
    safe_run "echo 'quit' | timeout 5 telnet api.elevenlabs.io 443" "ElevenLabs port 443"
else
    echo "⚠️ telnet not available for port testing"
fi

# Environment variables (sanitized)
echo "🔧 Environment (sanitized):"
echo "NODE_VERSION: $(node --version 2>/dev/null || echo 'not available')"
echo "NPM_VERSION: $(npm --version 2>/dev/null || echo 'not available')"
echo "OPENAI_API_KEY: $([ -n "$OPENAI_API_KEY" ] && echo 'SET (hidden)' || echo 'NOT SET')"
echo "ELEVENLABS_API_KEY: $([ -n "$ELEVENLABS_API_KEY" ] && echo 'SET (hidden)' || echo 'NOT SET')"

echo ""
echo "=============================="
echo "🏁 Diagnostics complete!"
echo ""
echo "📋 To report an issue:"
echo "  1. Copy this entire output"
echo "  2. Paste into your GitHub issue or PR"
echo "  3. Include any specific error messages you're seeing"
echo "  4. Mention your network environment (corporate, home, cloud, etc.)"