#!/bin/bash
set -euo pipefail

# DHash Rollback Script
# Provides rollback functionality for DHash deployments with verification

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"

# Default values
TARGET_FILE=""
BACKUP_TIMESTAMP=""
FORCE_MODE=false
LIST_BACKUPS=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Rollback DHash deployment to a previous backup with verification.

Options:
  -t, --target FILE          Target file to rollback (e.g., library.dhash.json)
  -b, --backup TIMESTAMP     Specific backup timestamp to restore (YYYYMMDD_HHMMSS)
  -l, --list                 List available backups and exit
  --force                    Skip confirmations and force rollback
  -v, --verbose              Enable verbose logging
  -h, --help                 Show this help message

Examples:
  $0 --list                                    # List available backups
  $0 -t library.dhash.json                     # Rollback to latest backup
  $0 -t library.dhash.json -b 20240101_120000  # Rollback to specific backup
  $0 -t library.dhash.json --force             # Force rollback without confirmation

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--target)
                TARGET_FILE="$2"
                shift 2
                ;;
            -b|--backup)
                BACKUP_TIMESTAMP="$2"
                shift 2
                ;;
            -l|--list)
                LIST_BACKUPS=true
                shift
                ;;
            --force)
                FORCE_MODE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# List available backups
list_backups() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warn "No backup directory found: $BACKUP_DIR"
        exit 0
    fi

    log_info "Available backups in $BACKUP_DIR:"
    echo
    
    local backup_count=0
    while IFS= read -r -d '' backup_file; do
        local backup_basename
        backup_basename=$(basename "$backup_file")
        local timestamp
        timestamp=$(echo "$backup_basename" | sed -E 's/library_([0-9]{8}_[0-9]{6})\.json/\1/')
        
        local size
        size=$(du -h "$backup_file" | cut -f1)
        
        local date_formatted
        date_formatted=$(date -d "${timestamp:0:8} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$timestamp")
        
        local checksum_status="❌ No checksum"
        if [[ -f "${backup_file}.sha256" ]]; then
            if sha256sum -c "${backup_file}.sha256" >/dev/null 2>&1 || shasum -a 256 -c "${backup_file}.sha256" >/dev/null 2>&1; then
                checksum_status="✅ Verified"
            else
                checksum_status="⚠️ Checksum mismatch"
            fi
        fi
        
        printf "  %-20s %-20s %-8s %s\n" "$timestamp" "$date_formatted" "$size" "$checksum_status"
        ((backup_count++))
        
    done < <(find "$BACKUP_DIR" -name "library_*.json" -type f -print0 | sort -z)
    
    echo
    [[ $backup_count -eq 0 ]] && log_warn "No backups found" || log_info "Found $backup_count backup(s)"
}

# Find backup file by timestamp or get latest
find_backup_file() {
    local backup_file=""
    
    if [[ -n "$BACKUP_TIMESTAMP" ]]; then
        # Use specific timestamp
        backup_file="${BACKUP_DIR}/library_${BACKUP_TIMESTAMP}.json"
        if [[ ! -f "$backup_file" ]]; then
            log_error "Backup not found for timestamp: $BACKUP_TIMESTAMP"
            log_info "Use --list to see available backups"
            exit 1
        fi
    else
        # Find latest backup
        backup_file=$(find "$BACKUP_DIR" -name "library_*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
        if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
            log_error "No backups found in $BACKUP_DIR"
            log_info "Use deploy_dhash.sh to create backups during deployment"
            exit 1
        fi
        
        local found_timestamp
        found_timestamp=$(basename "$backup_file" | sed -E 's/library_([0-9]{8}_[0-9]{6})\.json/\1/')
        log_info "Found latest backup: $found_timestamp"
    fi
    
    echo "$backup_file"
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    local checksum_file="${backup_file}.sha256"
    
    log_info "Verifying backup integrity: $(basename "$backup_file")"
    
    # Check if backup file is valid JSON
    if ! jq empty "$backup_file" 2>/dev/null; then
        log_error "Backup file is not valid JSON: $backup_file"
        return 1
    fi
    
    # Verify checksum if available
    if [[ -f "$checksum_file" ]]; then
        local checksum_cmd=""
        if command -v sha256sum >/dev/null 2>&1; then
            checksum_cmd="sha256sum"
        elif command -v shasum >/dev/null 2>&1; then
            checksum_cmd="shasum -a 256"
        fi
        
        if [[ -n "$checksum_cmd" ]]; then
            if cd "$BACKUP_DIR" && $checksum_cmd -c "$(basename "$checksum_file")" >/dev/null 2>&1; then
                log_success "Checksum verification passed"
            else
                log_error "Checksum verification failed"
                if [[ "$FORCE_MODE" != "true" ]]; then
                    read -p "Continue with potentially corrupted backup? (y/N): " -n 1 -r
                    echo
                    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
                fi
            fi
        fi
    else
        log_warn "No checksum file found - unable to verify integrity"
        if [[ "$FORCE_MODE" != "true" ]]; then
            read -p "Continue without checksum verification? (y/N): " -n 1 -r
            echo
            [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
        fi
    fi
    
    return 0
}

# Create rollback backup of current state
create_rollback_backup() {
    local current_file="$1"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local rollback_backup="${BACKUP_DIR}/rollback_before_restore_${timestamp}.json"
    
    if [[ -f "$current_file" ]]; then
        log_info "Creating rollback backup of current state"
        
        mkdir -p "$BACKUP_DIR"
        cp "$current_file" "$rollback_backup"
        
        # Generate checksum
        if command -v sha256sum >/dev/null 2>&1; then
            (cd "$BACKUP_DIR" && sha256sum "$(basename "$rollback_backup")" > "${rollback_backup}.sha256")
        elif command -v shasum >/dev/null 2>&1; then
            (cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$rollback_backup")" > "${rollback_backup}.sha256")
        fi
        
        log_success "Rollback backup created: $(basename "$rollback_backup")"
    fi
}

# Perform the rollback
perform_rollback() {
    local backup_file="$1"
    local target_file="$2"
    local temp_file="${target_file}.rollback.tmp"
    
    log_info "Rolling back $target_file from backup: $(basename "$backup_file")"
    
    # Copy backup to temporary file
    cp "$backup_file" "$temp_file"
    
    # Verify temp file
    if ! jq empty "$temp_file" 2>/dev/null; then
        log_error "Rollback failed: temporary file is not valid JSON"
        rm -f "$temp_file"
        exit 1
    fi
    
    # Atomic move
    mv "$temp_file" "$target_file"
    
    log_success "Rollback completed successfully"
}

# Post-rollback verification
post_rollback_verification() {
    local target_file="$1"
    
    log_info "Performing post-rollback verification"
    
    # Verify target file is valid JSON
    if ! jq empty "$target_file" 2>/dev/null; then
        log_error "Post-rollback verification failed: target file is not valid JSON"
        return 1
    fi
    
    # Check file size (should be reasonable)
    local file_size
    file_size=$(stat -c%s "$target_file" 2>/dev/null || stat -f%z "$target_file" 2>/dev/null)
    if [[ $file_size -lt 10 ]]; then
        log_error "Post-rollback verification failed: file appears to be empty or corrupted"
        return 1
    fi
    
    # Try to read basic metadata if it's a DHash file
    if jq -e '.metadata' "$target_file" >/dev/null 2>&1; then
        local version
        version=$(jq -r '.metadata.version // "unknown"' "$target_file")
        local timestamp
        timestamp=$(jq -r '.metadata.generated_at // "unknown"' "$target_file")
        log_info "Restored DHash file - Version: $version, Generated: $timestamp"
    fi
    
    log_success "Post-rollback verification passed"
    return 0
}

# Main rollback function
main() {
    log_info "Starting DHash rollback process"
    
    parse_args "$@"
    
    # Handle list option
    if [[ "$LIST_BACKUPS" == "true" ]]; then
        list_backups
        exit 0
    fi
    
    # Validate required parameters
    if [[ -z "$TARGET_FILE" ]]; then
        log_error "Target file is required (-t/--target)"
        usage
        exit 1
    fi
    
    # Check if backup directory exists
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        log_info "Run deploy_dhash.sh first to create backups"
        exit 1
    fi
    
    # Find backup file
    local backup_file
    backup_file=$(find_backup_file)
    
    # Verify backup
    verify_backup "$backup_file"
    
    # Show rollback summary
    if [[ "$FORCE_MODE" != "true" ]]; then
        echo
        echo "Rollback Summary:"
        echo "  Target file: $TARGET_FILE"
        echo "  Backup file: $(basename "$backup_file")"
        local backup_date
        backup_date=$(stat -c %y "$backup_file" 2>/dev/null || stat -f %Sm "$backup_file" 2>/dev/null)
        echo "  Backup date: $backup_date"
        echo "  Current file will be backed up before rollback"
        echo
        log_warn "This will overwrite the current target file!"
        read -p "Proceed with rollback? (y/N): " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && {
            log_info "Rollback cancelled by user"
            exit 0
        }
    fi
    
    # Create backup of current state before rollback
    create_rollback_backup "$TARGET_FILE"
    
    # Perform rollback
    perform_rollback "$backup_file" "$TARGET_FILE"
    
    # Post-rollback verification
    if post_rollback_verification "$TARGET_FILE"; then
        log_success "DHash rollback completed successfully"
        log_info "Restored from: $(basename "$backup_file")"
        log_info "Target file: $TARGET_FILE"
    else
        log_error "Rollback completed but verification failed"
        log_error "Please check the target file manually: $TARGET_FILE"
        exit 1
    fi
}

# Check for required dependencies
check_dependencies() {
    local missing_deps=()
    
    command -v jq >/dev/null 2>&1 || missing_deps+=("jq")
    
    if [[ ${#missing_deps[@]} -ne 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install the missing dependencies and try again"
        exit 1
    fi
}

# Error handling
trap 'log_error "Script interrupted"; exit 130' INT
trap 'log_error "Unexpected error on line $LINENO"; exit 1' ERR

# Dependency check
check_dependencies

# Run main function
main "$@"