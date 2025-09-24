#!/bin/bash
set -euo pipefail

# DHash Rollback Script - Emergency rollback capabilities
# Usage: ./scripts/rollback_dhash.sh [--list] [--force <backup-file>] [--latest]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIBRARY_FILE="$PROJECT_ROOT/library.json"
BACKUPS_DIR="$PROJECT_ROOT/backups"
LOGS_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOGS_DIR/rollback_dhash_${TIMESTAMP}.log"

# Configuration
LIST_BACKUPS=false
FORCE_RESTORE=""
RESTORE_LATEST=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --list)
                LIST_BACKUPS=true
                shift
                ;;
            --force)
                FORCE_RESTORE="$2"
                shift 2
                ;;
            --latest)
                RESTORE_LATEST=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown parameter: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
DHash Rollback Script - Emergency Recovery

Usage: $0 [OPTIONS]

Options:
    --list                  List available backups with details
    --force <backup-file>   Force restore from specific backup file
    --latest               Restore from the most recent backup
    -h, --help             Show this help message

Examples:
    $0 --list                                          # List all available backups
    $0 --latest                                        # Restore from latest backup
    $0 --force backups/library.json.bak.20240924_143022  # Restore from specific backup

Emergency Quick Recovery:
    1. Stop services: sudo systemctl stop mobius-api
    2. Restore backup: $0 --latest
    3. Restart services: sudo systemctl start mobius-api
    4. Verify health: curl http://localhost:5001/health

EOF
}

# List available backups
list_backups() {
    log_info "Available backups in $BACKUPS_DIR:"
    echo
    
    if [[ ! -d "$BACKUPS_DIR" ]]; then
        log_warn "Backup directory does not exist: $BACKUPS_DIR"
        return 1
    fi
    
    local backups
    backups=$(find "$BACKUPS_DIR" -name "library.json.bak.*" -not -name "*.sha256" | sort -r)
    
    if [[ -z "$backups" ]]; then
        log_warn "No backups found"
        return 1
    fi
    
    printf "%-30s %-20s %-15s %-10s\n" "BACKUP FILE" "TIMESTAMP" "SIZE" "VERIFIED"
    printf "%-30s %-20s %-15s %-10s\n" "----------" "---------" "----" "--------"
    
    echo "$backups" | while read -r backup; do
        local filename
        filename=$(basename "$backup")
        
        local timestamp
        timestamp=$(echo "$filename" | sed 's/library\.json\.bak\.\([0-9_]*\)/\1/' | sed 's/_/ /')
        
        local size
        size=$(ls -lh "$backup" | awk '{print $5}')
        
        local checksum_file="${backup}.sha256"
        local verified="❌"
        
        if [[ -f "$checksum_file" ]]; then
            cd "$BACKUPS_DIR"
            if sha256sum -c "$(basename "$checksum_file")" >/dev/null 2>&1; then
                verified="✅"
            fi
        fi
        
        printf "%-30s %-20s %-15s %-10s\n" "$filename" "$timestamp" "$size" "$verified"
    done
    
    echo
    log_info "Use --force <filename> to restore from a specific backup"
    log_info "Use --latest to restore from the most recent backup"
}

# Get latest backup
get_latest_backup() {
    local latest_backup
    latest_backup=$(find "$BACKUPS_DIR" -name "library.json.bak.*" -not -name "*.sha256" | sort -r | head -n 1)
    
    if [[ -z "$latest_backup" ]]; then
        log_error "No backups found"
        exit 1
    fi
    
    echo "$latest_backup"
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    local checksum_file="${backup_file}.sha256"
    
    log_info "Verifying backup integrity: $(basename "$backup_file")"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    if [[ ! -f "$checksum_file" ]]; then
        log_warn "Checksum file not found: $checksum_file"
        log_warn "Proceeding without checksum verification"
        return 0
    fi
    
    cd "$BACKUPS_DIR"
    if sha256sum -c "$(basename "$checksum_file")" >/dev/null 2>&1; then
        log_success "Backup integrity verified"
    else
        log_error "Backup integrity verification failed!"
        log_error "Checksum mismatch - backup may be corrupted"
        exit 1
    fi
}

# Create rollback backup
create_rollback_backup() {
    log_info "Creating rollback backup of current state..."
    
    local rollback_backup="$BACKUPS_DIR/library.json.rollback.${TIMESTAMP}"
    local checksum_file="${rollback_backup}.sha256"
    
    cp "$LIBRARY_FILE" "$rollback_backup"
    
    cd "$BACKUPS_DIR"
    sha256sum "$(basename "$rollback_backup")" > "$(basename "$checksum_file")"
    
    log_success "Current state backed up to: $(basename "$rollback_backup")"
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    log_info "Restoring from backup: $(basename "$backup_file")"
    
    # Verify backup first
    verify_backup "$backup_file"
    
    # Create backup of current state
    create_rollback_backup
    
    # Validate JSON before restoring
    if ! jq empty "$backup_file" 2>/dev/null; then
        log_error "Backup contains invalid JSON: $backup_file"
        exit 1
    fi
    
    # Atomic restore
    cp "$backup_file" "$LIBRARY_FILE"
    
    # Verify restoration
    if ! jq empty "$LIBRARY_FILE" 2>/dev/null; then
        log_error "Restoration resulted in invalid JSON!"
        exit 1
    fi
    
    log_success "Backup restored successfully"
    
    # Show what was restored
    local dhash_status
    dhash_status=$(jq -r '.dhash.migrationStatus // "unknown"' "$LIBRARY_FILE")
    log_info "DHash migration status after restore: $dhash_status"
    
    local migrated_games
    migrated_games=$(jq -r '.metrics.migratedGames // 0' "$LIBRARY_FILE")
    log_info "Migrated games count after restore: $migrated_games"
}

# Post-rollback verification
verify_rollback() {
    log_info "Verifying rollback..."
    
    # Check if library.json is valid JSON
    if ! jq empty "$LIBRARY_FILE" 2>/dev/null; then
        log_error "Library file is not valid JSON after rollback"
        return 1
    fi
    
    # Check basic structure
    local has_games
    has_games=$(jq -r 'has("games")' "$LIBRARY_FILE")
    
    if [[ "$has_games" != "true" ]]; then
        log_error "Library file missing games array after rollback"
        return 1
    fi
    
    local games_count
    games_count=$(jq -r '.games | length' "$LIBRARY_FILE")
    log_info "Restored library contains $games_count games"
    
    log_success "Rollback verification passed"
}

# Stop services (if running)
stop_services() {
    log_info "Attempting to stop services gracefully..."
    
    # Try to stop any running Node.js processes for this project
    local node_pids
    node_pids=$(pgrep -f "src/api/index.js" || true)
    
    if [[ -n "$node_pids" ]]; then
        log_info "Stopping Node.js API processes: $node_pids"
        echo "$node_pids" | xargs -r kill -TERM
        
        # Wait for graceful shutdown
        sleep 3
        
        # Force kill if still running
        node_pids=$(pgrep -f "src/api/index.js" || true)
        if [[ -n "$node_pids" ]]; then
            log_warn "Force killing remaining processes: $node_pids"
            echo "$node_pids" | xargs -r kill -KILL
        fi
    else
        log_info "No running API processes found"
    fi
}

# Start services
start_services() {
    log_info "Services should be started manually after rollback"
    log_info "To start the API: cd $PROJECT_ROOT && node src/api/index.js"
    log_info "Verify health at: http://localhost:5001/health"
}

# Main rollback flow
main() {
    log_info "=== DHash Rollback Started ==="
    log_info "Timestamp: $(date)"
    log_info "Log file: $LOG_FILE"
    
    # Ensure directories exist
    mkdir -p "$BACKUPS_DIR" "$LOGS_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    # Handle list command
    if [[ "$LIST_BACKUPS" == "true" ]]; then
        list_backups
        exit 0
    fi
    
    # Determine backup to restore
    local backup_to_restore=""
    
    if [[ -n "$FORCE_RESTORE" ]]; then
        # Use specified backup file
        if [[ "$FORCE_RESTORE" =~ ^/ ]]; then
            # Absolute path
            backup_to_restore="$FORCE_RESTORE"
        else
            # Relative path - assume it's in backups directory
            backup_to_restore="$BACKUPS_DIR/$FORCE_RESTORE"
        fi
    elif [[ "$RESTORE_LATEST" == "true" ]]; then
        # Use latest backup
        backup_to_restore=$(get_latest_backup)
    else
        # No restore option specified - show help
        log_error "No restore option specified"
        echo
        show_help
        exit 1
    fi
    
    # Confirmation
    echo
    log_warn "This will restore the library from: $(basename "$backup_to_restore")"
    log_warn "Current state will be backed up before restoration."
    echo -n "Continue? (y/N): "
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi
    
    # Execute rollback
    stop_services
    restore_backup "$backup_to_restore"
    verify_rollback
    
    # Summary
    echo
    log_success "=== Rollback Complete ==="
    log_success "Library restored from: $(basename "$backup_to_restore")"
    log_info "Current state was backed up before rollback"
    log_info "Remember to restart services and verify functionality"
    echo
    log_info "Next steps:"
    log_info "1. Start services manually"
    log_info "2. Verify health endpoint: curl http://localhost:5001/health"
    log_info "3. Check metrics: curl http://localhost:5001/metrics/dhash"
    log_info "4. Notify stakeholders of rollback completion"
    
    start_services
    
    log_info "Full rollback log: $LOG_FILE"
}

# Execute main function with all arguments
main "$@"