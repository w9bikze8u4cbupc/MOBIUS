#!/bin/bash
# scripts/reproduce-blocked-endpoints.sh - Safe local reproduction of blocked endpoints
# Usage: sudo ./scripts/reproduce-blocked-endpoints.sh [--block-all|--block-host HOST|--restore|--status]
#
# Features:
# - Safe /etc/hosts-based blocking with automatic backups
# - Clear status markers and restoration capabilities
# - Multiple blocking modes for different test scenarios
# - Validation of changes with rollback on error

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
HOSTS_FILE="/etc/hosts"
BACKUP_FILE="/etc/hosts.network-probe-backup"
MARKER_START="# === NETWORK PROBE BLOCK START ==="
MARKER_END="# === NETWORK PROBE BLOCK END ==="

# Default target hosts to block
DEFAULT_HOSTS=(
    "api.openai.com"
    "api.elevenlabs.io"
)

# Function to log messages
log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
        echo "Reason: Modifying /etc/hosts requires root privileges"
        exit 1
    fi
}

# Function to validate hosts file
validate_hosts_file() {
    if [[ ! -f "$HOSTS_FILE" ]]; then
        log "${RED}Error: $HOSTS_FILE does not exist${NC}"
        exit 1
    fi
    
    if [[ ! -w "$HOSTS_FILE" ]]; then
        log "${RED}Error: $HOSTS_FILE is not writable${NC}"
        exit 1
    fi
}

# Function to create backup
create_backup() {
    if [[ -f "$BACKUP_FILE" ]]; then
        log "${YELLOW}Warning: Backup already exists at $BACKUP_FILE${NC}"
        log "This suggests a previous blocking session wasn't properly restored."
        echo -n "Continue anyway? (y/N): "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log "Aborted by user"
            exit 1
        fi
    fi
    
    log "${CYAN}Creating backup of $HOSTS_FILE${NC}"
    cp "$HOSTS_FILE" "$BACKUP_FILE"
    
    if [[ ! -f "$BACKUP_FILE" ]]; then
        log "${RED}Error: Failed to create backup${NC}"
        exit 1
    fi
    
    log "${GREEN}Backup created successfully at $BACKUP_FILE${NC}"
}

# Function to remove existing blocks
remove_existing_blocks() {
    if grep -q "$MARKER_START" "$HOSTS_FILE" 2>/dev/null; then
        log "${CYAN}Removing existing network probe blocks${NC}"
        sed -i.tmp "/$MARKER_START/,/$MARKER_END/d" "$HOSTS_FILE"
        rm -f "$HOSTS_FILE.tmp" 2>/dev/null || true
    fi
}

# Function to add host blocks
add_host_blocks() {
    local hosts=("$@")
    
    log "${CYAN}Adding blocks for hosts: ${hosts[*]}${NC}"
    
    # Add marker and blocked hosts
    {
        echo
        echo "$MARKER_START"
        echo "# Added by network-probe script on $(date)"
        echo "# Use: sudo $0 --restore to remove these blocks"
        for host in "${hosts[@]}"; do
            echo "127.0.0.1 $host"
        done
        echo "$MARKER_END"
    } >> "$HOSTS_FILE"
}

# Function to validate changes
validate_changes() {
    local hosts=("$@")
    
    log "${CYAN}Validating changes...${NC}"
    
    # Check that markers are present
    if ! grep -q "$MARKER_START" "$HOSTS_FILE" || ! grep -q "$MARKER_END" "$HOSTS_FILE"; then
        log "${RED}Error: Markers not found in hosts file after modification${NC}"
        return 1
    fi
    
    # Check that each host is properly blocked
    for host in "${hosts[@]}"; do
        if ! grep -q "127.0.0.1 $host" "$HOSTS_FILE"; then
            log "${RED}Error: Host $host not found in hosts file${NC}"
            return 1
        fi
    done
    
    # Test DNS resolution to ensure blocking works
    for host in "${hosts[@]}"; do
        if command -v nslookup >/dev/null 2>&1; then
            local resolved_ip
            resolved_ip=$(nslookup "$host" 2>/dev/null | awk '/^Address: / { print $2 }' | grep -v '#' | head -n1 || echo "")
            if [[ "$resolved_ip" == "127.0.0.1" ]]; then
                log "${GREEN}✓ $host correctly resolves to 127.0.0.1${NC}"
            else
                log "${YELLOW}⚠ $host resolves to $resolved_ip (not 127.0.0.1)${NC}"
                log "  This might be due to DNS caching. Clear your DNS cache if needed."
            fi
        fi
    done
    
    return 0
}

# Function to restore from backup
restore_hosts() {
    if [[ ! -f "$BACKUP_FILE" ]]; then
        log "${RED}Error: No backup found at $BACKUP_FILE${NC}"
        log "Cannot restore without backup. Check if blocks were added manually."
        exit 1
    fi
    
    log "${CYAN}Restoring hosts file from backup${NC}"
    cp "$BACKUP_FILE" "$HOSTS_FILE"
    
    # Verify restoration
    if grep -q "$MARKER_START" "$HOSTS_FILE" 2>/dev/null; then
        log "${RED}Error: Markers still present after restore${NC}"
        exit 1
    fi
    
    log "${GREEN}Successfully restored hosts file${NC}"
    
    # Remove backup
    rm -f "$BACKUP_FILE"
    log "${CYAN}Backup file removed${NC}"
}

# Function to show current status
show_status() {
    log "${BLUE}=== Network Probe Status ===${NC}"
    
    if [[ -f "$BACKUP_FILE" ]]; then
        log "${YELLOW}Status: BLOCKING ACTIVE${NC}"
        log "Backup file: $BACKUP_FILE"
    else
        log "${GREEN}Status: NO BLOCKING${NC}"
    fi
    
    if grep -q "$MARKER_START" "$HOSTS_FILE" 2>/dev/null; then
        log "${YELLOW}Blocked hosts found in $HOSTS_FILE:${NC}"
        sed -n "/$MARKER_START/,/$MARKER_END/p" "$HOSTS_FILE" | grep "127.0.0.1" | while read -r line; do
            local host=$(echo "$line" | awk '{print $2}')
            log "  - $host"
        done
    else
        log "${GREEN}No blocked hosts found${NC}"
    fi
    
    echo
    log "${CYAN}To restore normal connectivity:${NC}"
    log "  sudo $0 --restore"
}

# Function to block specific host
block_host() {
    local host="$1"
    
    validate_hosts_file
    create_backup
    remove_existing_blocks
    add_host_blocks "$host"
    
    if validate_changes "$host"; then
        log "${GREEN}Successfully blocked $host${NC}"
        log "Test your application now to observe connection failures"
        log "Run 'sudo $0 --restore' when done testing"
    else
        log "${RED}Validation failed, restoring from backup${NC}"
        restore_hosts
        exit 1
    fi
}

# Function to block all default hosts
block_all_hosts() {
    local hosts=("${DEFAULT_HOSTS[@]}")
    
    # Add any extra hosts from environment
    if [[ -n "${EXTRA_NETWORK_HOSTS:-}" ]]; then
        IFS=',' read -ra ENV_HOSTS <<< "$EXTRA_NETWORK_HOSTS"
        for host in "${ENV_HOSTS[@]}"; do
            hosts+=("$(echo "$host" | xargs)") # trim whitespace
        done
    fi
    
    validate_hosts_file
    create_backup
    remove_existing_blocks
    add_host_blocks "${hosts[@]}"
    
    if validate_changes "${hosts[@]}"; then
        log "${GREEN}Successfully blocked all hosts: ${hosts[*]}${NC}"
        log "Test your application now to observe connection failures"
        log "Run 'sudo $0 --restore' when done testing"
    else
        log "${RED}Validation failed, restoring from backup${NC}"
        restore_hosts
        exit 1
    fi
}

# Main function
main() {
    # Check if running as root
    check_root
    
    # Parse arguments
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 [--block-all|--block-host HOST|--restore|--status]"
        echo ""
        echo "Options:"
        echo "  --block-all      Block all default hosts (${DEFAULT_HOSTS[*]})"
        echo "  --block-host     Block specific host"
        echo "  --restore        Restore original hosts file"
        echo "  --status         Show current blocking status"
        echo "  -h, --help      Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  EXTRA_NETWORK_HOSTS  Additional hosts to block with --block-all"
        echo ""
        echo "Examples:"
        echo "  sudo $0 --block-all"
        echo "  sudo $0 --block-host api.example.com"
        echo "  sudo $0 --restore"
        echo ""
        echo "WARNING: This script modifies /etc/hosts. Always run --restore when done testing!"
        exit 0
    fi
    
    case $1 in
        --block-all)
            log "${CYAN}Blocking all default network hosts${NC}"
            block_all_hosts
            ;;
        --block-host)
            if [[ $# -lt 2 ]]; then
                log "${RED}Error: --block-host requires a hostname${NC}"
                exit 1
            fi
            log "${CYAN}Blocking specific host: $2${NC}"
            block_host "$2"
            ;;
        --restore)
            log "${CYAN}Restoring original hosts file${NC}"
            restore_hosts
            ;;
        --status)
            show_status
            ;;
        -h|--help)
            main  # Show help by calling main with no args
            ;;
        *)
            log "${RED}Unknown option: $1${NC}"
            log "Use --help for usage information"
            exit 1
            ;;
    esac
}

# Handle script being sourced vs executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi