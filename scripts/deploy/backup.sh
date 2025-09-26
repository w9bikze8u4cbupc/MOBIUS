#!/bin/bash
# MOBIUS Deployment Backup Script
# Creates SHA256-verified backups for rollback safety

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ENV="${DEPLOY_ENV:-production}"
BACKUP_NAME="dhash_${ENV}_${TIMESTAMP}"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Function to create backup archive
create_backup() {
    local backup_path="$BACKUP_DIR/${BACKUP_NAME}.zip"
    
    log "Creating backup: $backup_path"
    
    # Include critical directories and configuration
    if zip -r "$backup_path" \
        src/ \
        client/ \
        scripts/ \
        package.json \
        package-lock.json \
        .env.example \
        runbooks/ \
        tests/golden/ \
        -x "*/node_modules/*" "*/tmp/*" "*/logs/*" "*/artifacts/*" \
        >/dev/null 2>&1; then
        log "Backup archive created successfully"
    else
        log "ERROR: Failed to create backup archive"
        exit 1
    fi
    
    log "Backup created: $backup_path ($(du -h "$backup_path" | cut -f1))"
    echo "$backup_path"
}

# Function to generate SHA256 checksum
generate_checksum() {
    local backup_path="$1"
    local checksum_path="${backup_path}.sha256"
    
    log "Generating SHA256 checksum: $checksum_path"
    
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$backup_path" > "$checksum_path"
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$backup_path" > "$checksum_path"
    else
        log "ERROR: No SHA256 utility found (sha256sum or shasum required)"
        exit 1
    fi
    
    log "Checksum generated: $checksum_path"
    echo "$checksum_path"
}

# Function to verify backup integrity
verify_backup() {
    local backup_path="$1"
    local checksum_path="${backup_path}.sha256"
    
    log "Verifying backup integrity"
    
    if [[ ! -f "$checksum_path" ]]; then
        log "ERROR: Checksum file not found: $checksum_path"
        exit 1
    fi
    
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -c "$checksum_path" >/dev/null
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 -c "$checksum_path" >/dev/null
    else
        log "ERROR: No SHA256 utility found for verification"
        exit 1
    fi
    
    log "Backup integrity verified successfully"
}

# Function to clean old backups (keep last 10)
cleanup_old_backups() {
    log "Cleaning up old backups (keeping last 10)"
    
    # Find and remove old backup files
    find "$BACKUP_DIR" -name "dhash_${ENV}_*.zip" -type f | \
        sort -r | \
        tail -n +11 | \
        while read -r old_backup; do
            log "Removing old backup: $old_backup"
            rm -f "$old_backup" "${old_backup}.sha256"
        done
}

# Main execution
main() {
    log "Starting backup process for environment: $ENV"
    
    # Create backup
    backup_path=$(create_backup)
    
    # Generate checksum
    checksum_path=$(generate_checksum "$backup_path")
    
    # Verify backup
    verify_backup "$backup_path"
    
    # Cleanup old backups
    cleanup_old_backups
    
    log "Backup process completed successfully"
    log "Backup: $backup_path"
    log "Checksum: $checksum_path"
    
    # Output for scripting
    echo "BACKUP_PATH=$backup_path"
    echo "CHECKSUM_PATH=$checksum_path"
}

# Help function
usage() {
    cat << EOF
Usage: $0 [options]

Creates SHA256-verified backups for MOBIUS deployment rollback safety.

Environment Variables:
  BACKUP_DIR   Directory for backups (default: ./backups)
  DEPLOY_ENV   Environment name (default: production)

Options:
  -h, --help   Show this help message

Examples:
  $0                           # Create backup for production
  DEPLOY_ENV=staging $0        # Create backup for staging
  BACKUP_DIR=/tmp/backups $0   # Use custom backup directory
EOF
}

# Handle command line arguments
case "${1:-}" in
    -h|--help)
        usage
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac