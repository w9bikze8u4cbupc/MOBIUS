#!/bin/bash

# Developer Reproduction Scripts for Blocked Endpoints
# Simulate network connectivity issues for testing and development

echo "🧪 Endpoint Blocker - Developer Testing Tool"
echo "============================================="

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "OPTIONS:"
    echo "  --block-openai     Block OpenAI API endpoints"
    echo "  --block-elevenlabs Block ElevenLabs API endpoints"  
    echo "  --block-all        Block all external APIs"
    echo "  --restore          Restore original connectivity"
    echo "  --status           Show current blocking status"
    echo "  --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --block-openai              # Block only OpenAI"
    echo "  $0 --block-all                 # Block all APIs"
    echo "  $0 --restore                   # Restore connectivity"
    echo ""
    echo "Note: This script modifies your hosts file temporarily"
    echo "      Run with --restore to undo changes"
}

# Backup and hosts file paths
HOSTS_FILE="/etc/hosts"
HOSTS_BACKUP="/tmp/hosts.backup.$(date +%s)"

# Domains to block
OPENAI_DOMAINS="api.openai.com"
ELEVENLABS_DOMAINS="api.elevenlabs.io"

# Function to backup hosts file
backup_hosts() {
    if [ ! -f "$HOSTS_BACKUP" ]; then
        echo "📋 Backing up hosts file to $HOSTS_BACKUP"
        sudo cp "$HOSTS_FILE" "$HOSTS_BACKUP"
    fi
}

# Function to add blocking entries
add_block() {
    local domain="$1"
    local comment="$2"
    
    if ! grep -q "127.0.0.1 $domain" "$HOSTS_FILE"; then
        echo "🚫 Blocking $domain"
        echo "127.0.0.1 $domain # $comment" | sudo tee -a "$HOSTS_FILE" > /dev/null
    else
        echo "⚠️  $domain already blocked"
    fi
}

# Function to remove blocking entries
remove_block() {
    local domain="$1"
    echo "✅ Unblocking $domain"
    sudo sed -i.bak "/127\.0\.0\.1 $domain/d" "$HOSTS_FILE"
}

# Function to block OpenAI
block_openai() {
    echo "🔒 Blocking OpenAI API endpoints..."
    backup_hosts
    for domain in $OPENAI_DOMAINS; do
        add_block "$domain" "BLOCKED BY DEV SCRIPT - OpenAI"
    done
}

# Function to block ElevenLabs
block_elevenlabs() {
    echo "🔒 Blocking ElevenLabs API endpoints..."
    backup_hosts
    for domain in $ELEVENLABS_DOMAINS; do
        add_block "$domain" "BLOCKED BY DEV SCRIPT - ElevenLabs"
    done
}

# Function to block all APIs
block_all() {
    echo "🔒 Blocking all external API endpoints..."
    backup_hosts
    
    for domain in $OPENAI_DOMAINS; do
        add_block "$domain" "BLOCKED BY DEV SCRIPT - OpenAI"
    done
    
    for domain in $ELEVENLABS_DOMAINS; do
        add_block "$domain" "BLOCKED BY DEV SCRIPT - ElevenLabs"
    done
}

# Function to restore original hosts file
restore_connectivity() {
    echo "🔓 Restoring original connectivity..."
    
    # Remove all dev script entries
    for domain in $OPENAI_DOMAINS $ELEVENLABS_DOMAINS; do
        remove_block "$domain"
    done
    
    echo "✅ All blocks removed"
}

# Function to show current status
show_status() {
    echo "📊 Current Blocking Status:"
    echo "=========================="
    
    for domain in $OPENAI_DOMAINS; do
        if grep -q "127.0.0.1 $domain" "$HOSTS_FILE" 2>/dev/null; then
            echo "🚫 $domain: BLOCKED"
        else
            echo "✅ $domain: ACCESSIBLE"
        fi
    done
    
    for domain in $ELEVENLABS_DOMAINS; do
        if grep -q "127.0.0.1 $domain" "$HOSTS_FILE" 2>/dev/null; then
            echo "🚫 $domain: BLOCKED"
        else
            echo "✅ $domain: ACCESSIBLE"
        fi
    done
}

# Function to test the application with blocked endpoints
test_application() {
    echo "🧪 Testing application with blocked endpoints..."
    echo "Run your application now to see how it handles network failures:"
    echo ""
    echo "# Start the backend server"
    echo "cd src/api && node index.js"
    echo ""
    echo "# Or run the full application"
    echo "npm start"
    echo ""
    echo "Expected behaviors:"
    echo "- Connection timeouts or ECONNREFUSED errors"
    echo "- Graceful error handling (if implemented)"
    echo "- Fallback mechanisms (if available)"
}

# Main script logic
case "${1:-}" in
    --block-openai)
        block_openai
        show_status
        test_application
        ;;
    --block-elevenlabs)
        block_elevenlabs
        show_status
        test_application
        ;;
    --block-all)
        block_all
        show_status
        test_application
        ;;
    --restore)
        restore_connectivity
        show_status
        ;;
    --status)
        show_status
        ;;
    --help)
        show_usage
        ;;
    "")
        show_usage
        exit 1
        ;;
    *)
        echo "❌ Unknown option: $1"
        show_usage
        exit 1
        ;;
esac

echo ""
echo "💡 Tips:"
echo "  • Use 'curl -I https://api.openai.com/v1/models' to test blocking"
echo "  • Monitor application logs for network errors"
echo "  • Run './scripts/network-probe.sh' to verify blocking"
echo "  • Always run '$0 --restore' when finished testing"