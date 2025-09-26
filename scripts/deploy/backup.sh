#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Backup Script
# Creates SHA256-verified backups before deployment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV          Environment (staging|production) [required]"
    echo "  --backup-dir DIR   Custom backup directory [default: ./backups]"
    echo "  --dry-run          Show what would be backed up without executing"
    echo "  --help             Show this help message"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
ENV=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ -z "$ENV" ]]; then
    echo "Error: --env is required"
    usage
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "Error: --env must be 'staging' or 'production'"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_NAME="dhash_${ENV}_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}.zip"

log "Starting backup for environment: $ENV"
log "Backup will be created at: $BACKUP_PATH"

if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY RUN - would backup the following:"
    echo "  - Configuration files from config/${ENV}/"
    echo "  - Database dump (if applicable)"
    echo "  - Application state"
    echo "  - Environment variables"
    exit 0
fi

# Create temporary directory for backup staging
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log "Staging backup files in: $TEMP_DIR"

# Backup configuration files
if [[ -d "${PROJECT_ROOT}/config/${ENV}" ]]; then
    cp -r "${PROJECT_ROOT}/config/${ENV}" "$TEMP_DIR/config"
    log "Backed up configuration files"
fi

# Backup package files
cp "${PROJECT_ROOT}/package.json" "$TEMP_DIR/"
cp "${PROJECT_ROOT}/package-lock.json" "$TEMP_DIR/"

# Backup environment-specific files
if [[ -f "${PROJECT_ROOT}/.env.${ENV}" ]]; then
    cp "${PROJECT_ROOT}/.env.${ENV}" "$TEMP_DIR/"
fi

# Create backup metadata
cat > "$TEMP_DIR/backup_metadata.json" << EOF
{
  "environment": "$ENV",
  "timestamp": "$TIMESTAMP",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "backup_version": "1.0",
  "created_by": "${USER:-unknown}@$(hostname)"
}
EOF

# Create the backup archive
log "Creating backup archive..."
cd "$TEMP_DIR"
zip -r "$BACKUP_PATH" . > /dev/null

# Generate SHA256 checksum
SHA256_FILE="${BACKUP_PATH}.sha256"
cd "$BACKUP_DIR"
sha256sum "$(basename "$BACKUP_PATH")" > "$SHA256_FILE"

log "Backup created successfully!"
log "Backup file: $BACKUP_PATH"
log "SHA256 file: $SHA256_FILE"
log "SHA256: $(cat "$SHA256_FILE")"

# Verify the backup
log "Verifying backup integrity..."
if sha256sum -c "$SHA256_FILE" > /dev/null; then
    log "✅ Backup integrity verified"
else
    log "❌ Backup integrity check failed!"
    exit 1
fi

# Clean up old backups (keep last 10)
log "Cleaning up old backups..."
cd "$BACKUP_DIR"
ls -1 dhash_${ENV}_*.zip 2>/dev/null | sort -r | tail -n +11 | while read -r old_backup; do
    if [[ -f "$old_backup" ]]; then
        log "Removing old backup: $old_backup"
        rm -f "$old_backup" "${old_backup}.sha256"
    fi
done

log "Backup completed successfully!"
echo "BACKUP_FILE=$BACKUP_PATH"
echo "SHA256_FILE=$SHA256_FILE"