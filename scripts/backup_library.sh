#!/bin/bash

# MOBIUS Game Tutorial Generator - Backup Library Script
# Usage: ./backup_library.sh [create|restore|verify|list] [backup_file]

set -euo pipefail

# Configuration
BACKUP_BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEFAULT_BACKUP_NAME="mobius_backup_${TIMESTAMP}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_BASE_DIR"

# Functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

show_usage() {
    cat << EOF
Usage: $0 [command] [options]

Commands:
  create [name]     Create a new backup (optional custom name)
  restore <file>    Restore from backup file
  verify <file>     Verify backup integrity
  list             List available backups

Examples:
  $0 create                    # Create backup with timestamp
  $0 create my_backup          # Create backup with custom name
  $0 restore backup_file.tar.gz
  $0 verify backup_file.tar.gz
  $0 list
EOF
}

calculate_checksum() {
    local file="$1"
    if command -v sha256sum &> /dev/null; then
        sha256sum "$file" | cut -d' ' -f1
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$file" | cut -d' ' -f1
    else
        log "ERROR: No SHA256 tool available (sha256sum or shasum)"
        exit 1
    fi
}

create_backup() {
    local backup_name="${1:-$DEFAULT_BACKUP_NAME}"
    local backup_file="${BACKUP_BASE_DIR}/${backup_name}.tar.gz"
    local checksum_file="${backup_file}.sha256"
    
    log "Creating backup: $backup_name"
    log "Backup file: $backup_file"
    
    # Create backup excluding certain directories
    cd "$PROJECT_DIR"
    tar -czf "$backup_file" \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='build' \
        --exclude='out' \
        --exclude='tmp' \
        --exclude='.git' \
        --exclude='backups' \
        --exclude='*.log' \
        .
    
    # Calculate checksum
    local checksum=$(calculate_checksum "$backup_file")
    echo "$checksum  $(basename "$backup_file")" > "$checksum_file"
    
    log "Backup created successfully"
    log "Size: $(du -h "$backup_file" | cut -f1)"
    log "SHA256: $checksum"
    log "Checksum file: $checksum_file"
    
    # Keep only last 10 backups
    cleanup_old_backups
}

restore_backup() {
    local backup_file="$1"
    local restore_dir="${PROJECT_DIR}_restore_$(date +%Y%m%d_%H%M%S)"
    
    if [[ ! -f "$backup_file" ]]; then
        log "ERROR: Backup file not found: $backup_file"
        exit 1
    fi
    
    log "Restoring backup: $backup_file"
    log "Restore directory: $restore_dir"
    
    # Verify backup first
    verify_backup "$backup_file"
    
    # Create restore directory
    mkdir -p "$restore_dir"
    
    # Extract backup
    tar -xzf "$backup_file" -C "$restore_dir"
    
    log "Backup restored to: $restore_dir"
    log "To replace current installation:"
    log "  1. Stop all services"
    log "  2. mv '$PROJECT_DIR' '${PROJECT_DIR}_old'"
    log "  3. mv '$restore_dir' '$PROJECT_DIR'"
    log "  4. cd '$PROJECT_DIR' && npm install"
    log "  5. Start services"
}

verify_backup() {
    local backup_file="$1"
    local checksum_file="${backup_file}.sha256"
    
    if [[ ! -f "$backup_file" ]]; then
        log "ERROR: Backup file not found: $backup_file"
        exit 1
    fi
    
    log "Verifying backup: $backup_file"
    
    # Check if checksum file exists
    if [[ -f "$checksum_file" ]]; then
        local stored_checksum=$(cat "$checksum_file" | cut -d' ' -f1)
        local calculated_checksum=$(calculate_checksum "$backup_file")
        
        if [[ "$stored_checksum" == "$calculated_checksum" ]]; then
            log "✅ Backup verification PASSED"
            log "SHA256: $calculated_checksum"
        else
            log "❌ Backup verification FAILED"
            log "Stored checksum:     $stored_checksum"
            log "Calculated checksum: $calculated_checksum"
            exit 1
        fi
    else
        log "WARNING: No checksum file found, calculating current checksum..."
        local checksum=$(calculate_checksum "$backup_file")
        log "Current SHA256: $checksum"
    fi
    
    # Test if tar file is readable
    if tar -tzf "$backup_file" >/dev/null 2>&1; then
        log "✅ Backup archive is readable"
    else
        log "❌ Backup archive is corrupted or unreadable"
        exit 1
    fi
}

list_backups() {
    log "Available backups in $BACKUP_BASE_DIR:"
    
    if [[ ! -d "$BACKUP_BASE_DIR" ]] || [[ -z "$(ls -A "$BACKUP_BASE_DIR" 2>/dev/null)" ]]; then
        log "No backups found."
        return
    fi
    
    echo
    printf "%-30s %-10s %-20s %-64s\n" "Backup Name" "Size" "Date" "SHA256"
    printf "%-30s %-10s %-20s %-64s\n" "----------" "----" "----" "------"
    
    for backup in "$BACKUP_BASE_DIR"/*.tar.gz; do
        if [[ -f "$backup" ]]; then
            local basename=$(basename "$backup" .tar.gz)
            local size=$(du -h "$backup" | cut -f1)
            local date=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
            local checksum="unknown"
            
            if [[ -f "${backup}.sha256" ]]; then
                checksum=$(cat "${backup}.sha256" | cut -d' ' -f1)
            fi
            
            printf "%-30s %-10s %-20s %-64s\n" "$basename" "$size" "$date" "$checksum"
        fi
    done
}

cleanup_old_backups() {
    log "Cleaning up old backups (keeping last 10)..."
    
    # Count backup files
    local backup_count=$(ls -1 "$BACKUP_BASE_DIR"/*.tar.gz 2>/dev/null | wc -l || echo "0")
    
    if [[ "$backup_count" -gt 10 ]]; then
        local files_to_delete=$((backup_count - 10))
        log "Found $backup_count backups, removing oldest $files_to_delete"
        
        # Remove oldest backup files and their checksums
        ls -t "$BACKUP_BASE_DIR"/*.tar.gz | tail -n "$files_to_delete" | while read -r file; do
            log "Removing old backup: $(basename "$file")"
            rm -f "$file"
            rm -f "${file}.sha256"
        done
    else
        log "Only $backup_count backups found, no cleanup needed"
    fi
}

# Main logic
case "${1:-}" in
    create)
        create_backup "${2:-}"
        ;;
    restore)
        if [[ -z "${2:-}" ]]; then
            log "ERROR: Backup file required for restore"
            show_usage
            exit 1
        fi
        restore_backup "$2"
        ;;
    verify)
        if [[ -z "${2:-}" ]]; then
            log "ERROR: Backup file required for verify"
            show_usage
            exit 1
        fi
        verify_backup "$2"
        ;;
    list)
        list_backups
        ;;
    *)
        log "ERROR: Invalid command or no command specified"
        show_usage
        exit 1
        ;;
esac