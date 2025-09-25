#!/bin/bash
set -euo pipefail

# MOBIUS dhash Backup Script
# Usage: ./backup_dhash.sh --env <environment>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
ENVIRONMENT=""
BACKUP_DIR="${PROJECT_ROOT}/backups"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    exit 1
}

usage() {
    cat << EOF
Usage: $0 --env <environment>

Options:
    --env ENVIRONMENT    Target environment (staging|production)
    --help              Show this help message
EOF
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --help)
                usage
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    if [[ -z "$ENVIRONMENT" ]]; then
        error "Environment is required (--env)"
    fi

    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        error "Environment must be 'staging' or 'production'"
    fi
}

create_backup() {
    mkdir -p "$BACKUP_DIR"
    
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="dhash-${ENVIRONMENT}-${timestamp}.zip"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    log "Creating backup for $ENVIRONMENT environment..."
    log "Backup will be saved as: $backup_path"
    
    # Create temporary directory for backup preparation
    local temp_backup_dir
    temp_backup_dir=$(mktemp -d)
    
    # Copy current application state
    log "Collecting application files..."
    
    # Copy main application files (excluding node_modules and temp files)
    rsync -av --exclude='node_modules' --exclude='tmp' --exclude='.git' \
          --exclude='monitor_logs' --exclude='backups' \
          "$PROJECT_ROOT/" "$temp_backup_dir/app/"
    
    # Copy configuration files
    if [[ -f "$PROJECT_ROOT/quality-gates-config.json" ]]; then
        cp "$PROJECT_ROOT/quality-gates-config.json" "$temp_backup_dir/"
    fi
    
    # Copy environment-specific configurations
    if [[ -f "$PROJECT_ROOT/.env.$ENVIRONMENT" ]]; then
        cp "$PROJECT_ROOT/.env.$ENVIRONMENT" "$temp_backup_dir/"
    fi
    
    # Create backup metadata
    cat > "$temp_backup_dir/backup-metadata.json" << EOF
{
    "backup": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "environment": "$ENVIRONMENT",
        "created_by": "$(whoami)",
        "hostname": "$(hostname)",
        "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
        "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
    },
    "system_info": {
        "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
        "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
        "os": "$(uname -s)",
        "platform": "$(uname -m)"
    }
}
EOF
    
    # Create the backup archive
    log "Creating backup archive..."
    cd "$temp_backup_dir"
    zip -r "$backup_path" . >/dev/null
    cd "$PROJECT_ROOT"
    
    # Create SHA256 checksum
    log "Generating SHA256 checksum..."
    cd "$BACKUP_DIR"
    sha256sum "$backup_name" > "${backup_name}.sha256"
    cd "$PROJECT_ROOT"
    
    # Cleanup temporary directory
    rm -rf "$temp_backup_dir"
    
    # Verify backup was created successfully
    if [[ -f "$backup_path" && -f "${backup_path}.sha256" ]]; then
        local backup_size
        backup_size=$(du -h "$backup_path" | cut -f1)
        log "Backup created successfully: $backup_name (${backup_size})"
        log "SHA256 checksum: ${backup_name}.sha256"
        
        # Verify integrity immediately
        if sha256sum -c "${backup_path}.sha256" >/dev/null 2>&1; then
            log "Backup integrity verified"
        else
            error "Backup integrity check failed"
        fi
    else
        error "Failed to create backup files"
    fi
    
    echo "$backup_path"  # Return backup path for use by other scripts
}

cleanup_old_backups() {
    log "Cleaning up old backups (keeping last 30 days)..."
    
    # Remove backups older than 30 days
    find "$BACKUP_DIR" -name "dhash-${ENVIRONMENT}-*.zip*" -mtime +30 -delete 2>/dev/null || true
    
    local remaining_backups
    remaining_backups=$(find "$BACKUP_DIR" -name "dhash-${ENVIRONMENT}-*.zip" | wc -l)
    log "Backup cleanup completed. Remaining backups: $remaining_backups"
}

main() {
    log "Starting backup process for $ENVIRONMENT environment..."
    
    local backup_path
    backup_path=$(create_backup)
    cleanup_old_backups
    
    log "Backup process completed successfully"
    log "Backup location: $backup_path"
    log "To restore from this backup, use:"
    log "  ./scripts/rollback_dhash.sh --backup '$backup_path' --env '$ENVIRONMENT'"
}

parse_args "$@"
main