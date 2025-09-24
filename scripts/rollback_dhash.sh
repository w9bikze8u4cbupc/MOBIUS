#!/bin/bash

# MOBIUS Game Tutorial Generator - Rollback Script
# Usage: ./rollback_dhash.sh [--force] [--to-backup <backup_file>]

set -euo pipefail

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${PROJECT_DIR}/backups"
ROLLBACK_LOG="${BACKUP_DIR}/rollback_$(date +%Y%m%d_%H%M%S).log"

# Flags
FORCE=false
BACKUP_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --to-backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--force] [--to-backup <backup_file>]"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message"
    mkdir -p "$(dirname "$ROLLBACK_LOG")"
    echo "$message" >> "$ROLLBACK_LOG"
}

# Confirmation function
confirm_rollback() {
    if [[ "$FORCE" == "false" ]]; then
        echo "⚠️  WARNING: This will rollback the MOBIUS deployment!"
        echo "Current directory: $PROJECT_DIR"
        if [[ -n "$BACKUP_FILE" ]]; then
            echo "Rollback to: $BACKUP_FILE"
        else
            echo "Rollback to: Latest backup"
        fi
        echo
        read -p "Are you sure you want to proceed? (yes/NO): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log "Rollback cancelled by user"
            exit 0
        fi
    else
        log "FORCE mode enabled - skipping confirmation"
    fi
}

# Stop services function
stop_services() {
    log "Stopping MOBIUS services..."
    
    # Stop any running Node.js processes (if applicable)
    pkill -f "node.*api" || true
    pkill -f "npm.*start" || true
    
    # Wait for processes to stop
    sleep 2
    
    log "Services stopped"
}

# Find latest backup
find_latest_backup() {
    local latest_backup=""
    
    if [[ -d "$BACKUP_DIR" ]]; then
        latest_backup=$(ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -n1 || echo "")
    fi
    
    if [[ -z "$latest_backup" ]]; then
        log "ERROR: No backup files found in $BACKUP_DIR"
        log "Cannot rollback without a backup"
        exit 1
    fi
    
    echo "$latest_backup"
}

# Rollback to golden state
rollback_to_golden() {
    log "Rolling back to golden test state..."
    
    cd "$PROJECT_DIR"
    
    # Reset to last known good golden state
    if npm run golden:approve &>/dev/null; then
        log "✅ Rolled back to golden state successfully"
    else
        log "❌ Failed to rollback to golden state"
        return 1
    fi
}

# Rollback from backup
rollback_from_backup() {
    local backup_file="$1"
    local restore_temp_dir="${PROJECT_DIR}_rollback_temp"
    local current_backup="${PROJECT_DIR}_pre_rollback_$(date +%Y%m%d_%H%M%S)"
    
    log "Rolling back from backup: $backup_file"
    
    # Verify backup first
    if ! "${PROJECT_DIR}/scripts/backup_library.sh" verify "$backup_file"; then
        log "ERROR: Backup verification failed"
        exit 1
    fi
    
    # Create a backup of current state before rollback
    log "Creating pre-rollback backup..."
    if ! "${PROJECT_DIR}/scripts/backup_library.sh" create "pre_rollback_$(date +%Y%m%d_%H%M%S)"; then
        log "WARNING: Failed to create pre-rollback backup"
        if [[ "$FORCE" == "false" ]]; then
            read -p "Continue without pre-rollback backup? (yes/NO): " -r
            if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
                exit 1
            fi
        fi
    fi
    
    # Extract backup to temporary directory
    log "Extracting backup to temporary location..."
    mkdir -p "$restore_temp_dir"
    
    if ! tar -xzf "$backup_file" -C "$restore_temp_dir"; then
        log "ERROR: Failed to extract backup"
        rm -rf "$restore_temp_dir"
        exit 1
    fi
    
    # Move current installation aside
    log "Moving current installation to: $current_backup"
    if ! mv "$PROJECT_DIR" "$current_backup"; then
        log "ERROR: Failed to move current installation"
        rm -rf "$restore_temp_dir"
        exit 1
    fi
    
    # Move restored backup to project directory
    log "Restoring backup to project directory..."
    if ! mv "$restore_temp_dir" "$PROJECT_DIR"; then
        log "ERROR: Failed to restore backup"
        log "Attempting to restore original installation..."
        mv "$current_backup" "$PROJECT_DIR" || {
            log "CRITICAL ERROR: Failed to restore original installation!"
            log "Manual recovery required:"
            log "  mv '$current_backup' '$PROJECT_DIR'"
            exit 1
        }
        exit 1
    fi
    
    # Install dependencies
    log "Installing dependencies..."
    cd "$PROJECT_DIR"
    if ! npm install; then
        log "WARNING: Failed to install dependencies"
        log "You may need to run 'npm install' manually"
    fi
    
    # Cleanup
    log "Cleaning up temporary files..."
    rm -rf "$current_backup"
    
    log "✅ Rollback from backup completed successfully"
}

# Health check after rollback
post_rollback_health_check() {
    log "Performing post-rollback health checks..."
    
    cd "$PROJECT_DIR"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        log "❌ package.json not found - rollback may have failed"
        return 1
    fi
    
    # Try to run golden tests
    if npm run golden:check &>/dev/null; then
        log "✅ Golden tests pass"
    else
        log "⚠️  Golden tests failed - may need manual intervention"
    fi
    
    # Check if essential scripts exist
    local essential_scripts=("scripts/check_golden.js" "scripts/generate_golden.js")
    for script in "${essential_scripts[@]}"; do
        if [[ -f "$script" ]]; then
            log "✅ Essential script found: $script"
        else
            log "❌ Essential script missing: $script"
        fi
    done
    
    log "Health check completed"
}

# Main rollback logic
main() {
    log "Starting MOBIUS rollback process..."
    
    confirm_rollback
    
    stop_services
    
    if [[ -n "$BACKUP_FILE" ]]; then
        # Rollback from specific backup
        if [[ ! -f "$BACKUP_FILE" ]]; then
            log "ERROR: Backup file not found: $BACKUP_FILE"
            exit 1
        fi
        rollback_from_backup "$BACKUP_FILE"
    else
        # Try golden state rollback first
        if rollback_to_golden; then
            log "Rollback to golden state completed"
        else
            # Fall back to latest backup
            log "Golden rollback failed, trying backup rollback..."
            local latest_backup=$(find_latest_backup)
            log "Using latest backup: $latest_backup"
            rollback_from_backup "$latest_backup"
        fi
    fi
    
    post_rollback_health_check
    
    log "Rollback process completed!"
    log "Log file: $ROLLBACK_LOG"
    
    echo
    echo "🔄 ROLLBACK COMPLETED"
    echo "Next steps:"
    echo "  1. Review the rollback log: $ROLLBACK_LOG"
    echo "  2. Start services if needed"
    echo "  3. Run health checks: npm run golden:check"
    echo "  4. Monitor system for stability"
}

# Error handling
trap 'log "Rollback failed with exit code $?"' ERR

# Run main function
main