#!/bin/bash
set -euo pipefail

# Library Backup Script
# Usage: ./scripts/backup_library.sh [--verify-only]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="$PROJECT_ROOT/backups"
LIBRARY_PATH="$PROJECT_ROOT/library.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
VERIFY_ONLY=false
for arg in "$@"; do
    case $arg in
        --verify-only)
            VERIFY_ONLY=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $arg${NC}"
            echo "Usage: $0 [--verify-only]"
            exit 1
            ;;
    esac
done

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Function to create backup with timestamp and checksum
create_backup() {
    log "Creating timestamped backup of library..."
    
    # Ensure backup directory exists
    mkdir -p "$BACKUP_DIR"
    
    # Create library.json if it doesn't exist
    if [[ ! -f "$LIBRARY_PATH" ]]; then
        warn "Library file not found, creating empty library.json"
        echo '{"games": [], "version": "1.0.0", "created": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}' > "$LIBRARY_PATH"
    fi
    
    local backup_file="$BACKUP_DIR/library.json.bak.$TIMESTAMP"
    local checksum_file="$backup_file.sha256"
    
    # Copy library file to backup
    cp "$LIBRARY_PATH" "$backup_file"
    
    # Generate SHA256 checksum
    sha256sum "$backup_file" > "$checksum_file"
    
    local checksum=$(cat "$checksum_file" | cut -d' ' -f1)
    local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
    
    log "Backup created successfully:"
    log "  File: $backup_file"
    log "  Size: $file_size bytes"
    log "  SHA256: $checksum"
    
    # Set proper permissions
    chmod 644 "$backup_file"
    chmod 644 "$checksum_file"
    
    echo "$backup_file"
}

# Function to verify backup integrity
verify_backup() {
    local backup_file="$1"
    local checksum_file="$backup_file.sha256"
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
    fi
    
    if [[ ! -f "$checksum_file" ]]; then
        error "Checksum file not found: $checksum_file"
    fi
    
    log "Verifying backup integrity..."
    
    # Verify checksum
    if sha256sum -c "$checksum_file" > /dev/null 2>&1; then
        log "✓ Checksum verification passed"
    else
        error "✗ Checksum verification failed"
    fi
    
    # Verify JSON structure
    if jq empty "$backup_file" > /dev/null 2>&1; then
        log "✓ JSON structure validation passed"
    else
        error "✗ JSON structure validation failed"
    fi
    
    # Check file size
    local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
    if [[ "$file_size" -gt 0 ]]; then
        log "✓ File size validation passed ($file_size bytes)"
    else
        error "✗ File size validation failed (empty file)"
    fi
    
    log "Backup verification completed successfully"
}

# Function to verify latest backup
verify_latest_backup() {
    log "Verifying latest backup..."
    
    local latest_backup=$(ls -t "$BACKUP_DIR"/library.json.bak.* 2>/dev/null | grep -v '\.sha256$' | head -n1 || echo "")
    
    if [[ -z "$latest_backup" ]]; then
        error "No backups found in $BACKUP_DIR"
    fi
    
    verify_backup "$latest_backup"
}

# Function to list all backups
list_backups() {
    log "Available backups:"
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        warn "Backup directory does not exist: $BACKUP_DIR"
        return
    fi
    
    local backups=($(ls -t "$BACKUP_DIR"/library.json.bak.* 2>/dev/null || true))
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        warn "No backups found"
        return
    fi
    
    printf "%-30s %-12s %-64s\n" "TIMESTAMP" "SIZE" "SHA256"
    printf "%-30s %-12s %-64s\n" "----------" "----" "------"
    
    for backup in "${backups[@]}"; do
        local timestamp=$(basename "$backup" | sed 's/library.json.bak.//')
        local size=$(stat -f%z "$backup" 2>/dev/null || stat -c%s "$backup" 2>/dev/null)
        local checksum_file="$backup.sha256"
        local checksum=""
        
        if [[ -f "$checksum_file" ]]; then
            checksum=$(cat "$checksum_file" | cut -d' ' -f1)
        else
            checksum="MISSING"
        fi
        
        printf "%-30s %-12s %-64s\n" "$timestamp" "$size bytes" "$checksum"
    done
}

# Function to restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Restoring from backup: $backup_file"
    
    # Verify backup before restore
    verify_backup "$backup_file"
    
    # Create backup of current library before restore
    if [[ -f "$LIBRARY_PATH" ]]; then
        local current_backup="$LIBRARY_PATH.restore-backup.$(date +%Y%m%d_%H%M%S)"
        cp "$LIBRARY_PATH" "$current_backup"
        log "Current library backed up to: $current_backup"
    fi
    
    # Restore from backup
    cp "$backup_file" "$LIBRARY_PATH"
    
    log "Library restored successfully from backup"
}

# Function to cleanup old backups (keep specified number)
cleanup_old_backups() {
    local keep_count="${1:-10}"
    
    log "Cleaning up old backups (keeping $keep_count most recent)..."
    
    local backups=($(ls -t "$BACKUP_DIR"/library.json.bak.* 2>/dev/null || true))
    local backup_count=${#backups[@]}
    
    if [[ $backup_count -le $keep_count ]]; then
        log "Only $backup_count backups found, no cleanup needed"
        return
    fi
    
    local to_remove=$((backup_count - keep_count))
    log "Removing $to_remove old backups..."
    
    # Remove old backups and their checksums
    for ((i=keep_count; i<backup_count; i++)); do
        local backup="${backups[i]}"
        local checksum_file="$backup.sha256"
        
        log "Removing: $(basename "$backup")"
        rm -f "$backup"
        rm -f "$checksum_file"
    done
    
    log "Cleanup completed"
}

# Function to validate backup retention policy
validate_retention_policy() {
    log "Validating backup retention policy..."
    
    local backups=($(ls -t "$BACKUP_DIR"/library.json.bak.* 2>/dev/null || true))
    local backup_count=${#backups[@]}
    
    log "Current backup count: $backup_count"
    
    if [[ $backup_count -gt 20 ]]; then
        warn "More than 20 backups found, consider cleanup"
    elif [[ $backup_count -eq 0 ]]; then
        warn "No backups found"
    else
        log "Backup count within acceptable range"
    fi
    
    # Check backup age
    if [[ $backup_count -gt 0 ]]; then
        local latest_backup="${backups[0]}"
        local backup_timestamp=$(basename "$latest_backup" | sed 's/library.json.bak.//')
        local backup_date=$(echo "$backup_timestamp" | sed 's/_/ /')
        
        log "Latest backup: $backup_date"
    fi
}

# Main function
main() {
    if [[ "$VERIFY_ONLY" == "true" ]]; then
        log "Running in verify-only mode"
        verify_latest_backup
        list_backups
        validate_retention_policy
    else
        log "Creating new backup..."
        local backup_file=$(create_backup)
        verify_backup "$backup_file"
        cleanup_old_backups 10
        validate_retention_policy
    fi
    
    log "Backup operation completed successfully"
}

# Handle command line options for advanced usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        "restore")
            if [[ -n "${2:-}" ]]; then
                restore_backup "$2"
            else
                error "Usage: $0 restore <backup_file>"
            fi
            ;;
        "list")
            list_backups
            ;;
        "cleanup")
            cleanup_old_backups "${2:-10}"
            ;;
        *)
            main "$@"
            ;;
    esac
fi