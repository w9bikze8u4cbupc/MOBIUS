#!/bin/bash
set -euo pipefail

# rollback_dhash.sh - Automated rollback script for dhash migrations
# Picks the latest verified backup and restores it

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LIBRARY_FILE="${PROJECT_ROOT}/library.json"
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOGS_DIR="${PROJECT_ROOT}/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

# Find latest verified backup
find_latest_verified_backup() {
    log_info "Searching for latest verified backup in: $BACKUP_DIR"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    local backups
    backups=$(find "$BACKUP_DIR" -name "library.json.bak.*" -not -name "*.sha256" -type f 2>/dev/null | sort -V)
    
    if [[ -z "$backups" ]]; then
        log_error "No backup files found in $BACKUP_DIR"
        return 1
    fi
    
    # Check backups in reverse chronological order (newest first)
    local latest_verified=""
    while IFS= read -r backup_file; do
        local checksum_file="${backup_file}.sha256"
        
        if [[ -f "$checksum_file" ]]; then
            log_info "Verifying backup: $(basename "$backup_file")"
            
            if sha256sum -c "$checksum_file" --quiet 2>/dev/null; then
                log_success "Backup verification passed: $(basename "$backup_file")"
                latest_verified="$backup_file"
                break
            else
                log_warn "Backup verification failed: $(basename "$backup_file")"
            fi
        else
            log_warn "No checksum file found for: $(basename "$backup_file")"
        fi
    done <<< "$(echo "$backups" | tac)"
    
    if [[ -n "$latest_verified" ]]; then
        echo "$latest_verified"
        return 0
    else
        log_error "No verified backup found"
        return 1
    fi
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    local timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
    local log_file="${LOGS_DIR}/rollback-${timestamp}.log"
    
    # Create logs directory
    mkdir -p "$LOGS_DIR"
    
    log_info "Starting rollback process"
    log_info "Target backup: $backup_file"
    log_info "Log file: $log_file"
    
    # Create a backup of current state before rollback
    if [[ -f "$LIBRARY_FILE" ]]; then
        local pre_rollback_backup="${BACKUP_DIR}/library.json.pre-rollback.${timestamp}"
        cp "$LIBRARY_FILE" "$pre_rollback_backup"
        sha256sum "$pre_rollback_backup" > "${pre_rollback_backup}.sha256"
        log_info "Current state backed up to: $pre_rollback_backup"
    fi
    
    # Perform the restore
    log_info "Restoring from backup..."
    cp "$backup_file" "$LIBRARY_FILE"
    
    # Log the rollback operation
    {
        echo "=== DHASH ROLLBACK LOG ==="
        echo "Timestamp: $timestamp"
        echo "Restored from: $backup_file"
        echo "Backup checksum: $(sha256sum "$backup_file" | cut -d' ' -f1)"
        echo "Restored to: $LIBRARY_FILE"
        echo "New checksum: $(sha256sum "$LIBRARY_FILE" | cut -d' ' -f1)"
        echo "=========================="
    } > "$log_file"
    
    log_success "Rollback completed successfully"
    log_info "Restored from: $(basename "$backup_file")"
    log_info "Rollback logged to: $log_file"
    
    # Verify the restored file
    if command -v jq >/dev/null 2>&1; then
        if jq . "$LIBRARY_FILE" >/dev/null 2>&1; then
            log_success "Restored library file is valid JSON"
        else
            log_error "Restored library file is not valid JSON"
            return 1
        fi
    elif command -v python3 >/dev/null 2>&1; then
        if python3 -m json.tool "$LIBRARY_FILE" >/dev/null 2>&1; then
            log_success "Restored library file is valid JSON"
        else
            log_error "Restored library file is not valid JSON"
            return 1
        fi
    fi
    
    return 0
}

# Stop running services/jobs (simulation)
stop_services() {
    log_info "Stopping migration and deployment jobs..."
    
    # Kill any running deploy processes
    pkill -f "deploy_dhash.sh" 2>/dev/null || true
    pkill -f "migrate" 2>/dev/null || true
    
    # Stop any background jobs related to dhash processing
    # This would be customized based on actual service architecture
    log_success "Services stopped"
}

# Check service status after rollback
check_services() {
    log_info "Checking service status after rollback..."
    
    # Check if services are responding (simulation)
    local health_endpoint="http://localhost:5001/health"
    
    if command -v curl >/dev/null 2>&1; then
        local max_attempts=5
        local attempt=1
        
        while [[ $attempt -le $max_attempts ]]; do
            log_info "Health check attempt $attempt/$max_attempts"
            
            if curl -sf "$health_endpoint" >/dev/null 2>&1; then
                log_success "Health check passed"
                return 0
            fi
            
            log_warn "Health check failed, waiting 10 seconds..."
            sleep 10
            ((attempt++))
        done
        
        log_error "Health check failed after $max_attempts attempts"
        log_error "Manual intervention may be required"
        return 1
    else
        log_warn "curl not available, skipping health check"
        return 0
    fi
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Automated rollback script for dhash migrations.
Finds the latest verified backup and restores it.

OPTIONS:
    --force, -f     Skip confirmation prompt
    --list, -l      List available backups
    --backup FILE   Rollback to specific backup file
    --help, -h      Show this help

EXAMPLES:
    $0              # Interactive rollback to latest verified backup
    $0 --force      # Automatic rollback without confirmation
    $0 --list       # Show available backups
    $0 --backup /path/to/backup.json  # Rollback to specific backup

EOF
}

# List available backups
list_backups() {
    log_info "Available backups in: $BACKUP_DIR"
    echo
    
    local backups
    backups=$(find "$BACKUP_DIR" -name "library.json.bak.*" -not -name "*.sha256" -type f 2>/dev/null | sort -V)
    
    if [[ -z "$backups" ]]; then
        echo "No backup files found."
        return 1
    fi
    
    local count=0
    while IFS= read -r backup_file; do
        ((count++))
        local checksum_file="${backup_file}.sha256"
        local size=$(ls -l "$backup_file" 2>/dev/null | awk '{print $5}' || echo "unknown")
        local date=$(ls -l "$backup_file" 2>/dev/null | awk '{print $6, $7, $8}' || echo "unknown")
        local verified="❌"
        
        if [[ -f "$checksum_file" ]] && sha256sum -c "$checksum_file" --quiet 2>/dev/null; then
            verified="✅"
        fi
        
        printf "%2d. %s %s (%s bytes, %s)\n" "$count" "$verified" "$(basename "$backup_file")" "$size" "$date"
    done <<< "$backups"
    
    echo
    echo "✅ = Verified backup"
    echo "❌ = Unverified or corrupted backup"
}

# Main function
main() {
    local force=false
    local list_only=false
    local specific_backup=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force|-f)
                force=true
                shift
                ;;
            --list|-l)
                list_only=true
                shift
                ;;
            --backup)
                specific_backup="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    if [[ "$list_only" == "true" ]]; then
        list_backups
        exit 0
    fi
    
    log_info "=== DHASH ROLLBACK PROCESS ==="
    
    # Stop running services first
    stop_services
    
    # Find backup to restore
    local backup_to_restore
    if [[ -n "$specific_backup" ]]; then
        if [[ ! -f "$specific_backup" ]]; then
            log_error "Specified backup file not found: $specific_backup"
            exit 1
        fi
        backup_to_restore="$specific_backup"
        log_info "Using specified backup: $specific_backup"
    else
        backup_to_restore=$(find_latest_verified_backup) || {
            log_error "No suitable backup found for rollback"
            exit 1
        }
        log_info "Latest verified backup: $(basename "$backup_to_restore")"
    fi
    
    # Confirm rollback unless forced
    if [[ "$force" != "true" ]]; then
        echo
        echo "This will rollback the dhash library to:"
        echo "  File: $(basename "$backup_to_restore")"
        echo "  Date: $(ls -l "$backup_to_restore" 2>/dev/null | awk '{print $6, $7, $8}' || echo "unknown")"
        echo "  Size: $(ls -l "$backup_to_restore" 2>/dev/null | awk '{print $5}' || echo "unknown") bytes"
        echo
        echo -n "Continue with rollback? [y/N]: "
        read -r confirmation
        
        if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
            log_info "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Perform rollback
    if restore_backup "$backup_to_restore"; then
        log_success "=== ROLLBACK COMPLETED SUCCESSFULLY ==="
        
        # Check services after rollback
        check_services
        
        echo
        echo "Next steps:"
        echo "1. Verify service functionality manually"
        echo "2. Check low-confidence queue: npm run lcm:export"
        echo "3. Review rollback logs in: $LOGS_DIR"
        echo "4. Investigate root cause of the issue that required rollback"
        
    else
        log_error "=== ROLLBACK FAILED ==="
        echo "Manual intervention required"
        exit 1
    fi
}

# Trap for cleanup
cleanup_on_exit() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Rollback script exited with error code $exit_code"
    fi
}

trap cleanup_on_exit EXIT

# Run main function with all arguments
main "$@"