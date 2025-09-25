#!/bin/bash
# scripts/backup_library.sh
# Creates a backup of the media library with SHA256 checksum verification

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
LIBRARY_DIR="${LIBRARY_DIR:-./src/uploads}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mobius_library_${TIMESTAMP}"
LOG_FILE="${BACKUP_DIR}/${BACKUP_NAME}.log"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "Starting backup of media library"
log "Source: $LIBRARY_DIR"
log "Destination: $BACKUP_DIR/$BACKUP_NAME.tar.gz"

# Check if source directory exists
if [[ ! -d "$LIBRARY_DIR" ]]; then
    log "ERROR: Source directory not found: $LIBRARY_DIR"
    exit 1
fi

# Check available space
REQUIRED_SPACE=$(du -sb "$LIBRARY_DIR" | cut -f1)
AVAILABLE_SPACE=$(df "$BACKUP_DIR" | tail -1 | awk '{print $4 * 1024}')

if [[ $REQUIRED_SPACE -gt $AVAILABLE_SPACE ]]; then
    log "ERROR: Insufficient space. Required: $REQUIRED_SPACE bytes, Available: $AVAILABLE_SPACE bytes"
    exit 5
fi

# Create compressed backup
log "Creating compressed backup..."
cd "$(dirname "$LIBRARY_DIR")"
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "$(basename "$LIBRARY_DIR")" 2>&1 | tee -a "$LOG_FILE"

if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
    log "ERROR: Backup creation failed"
    exit 2
fi

# Generate SHA256 checksum
log "Generating SHA256 checksum..."
cd "$BACKUP_DIR"
sha256sum "${BACKUP_NAME}.tar.gz" > "${BACKUP_NAME}.sha256"

# Verify backup integrity
log "Verifying backup integrity..."
if sha256sum -c "${BACKUP_NAME}.sha256" >/dev/null 2>&1; then
    log "SUCCESS: Backup created and verified"
    log "Backup file: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
    log "Checksum: ${BACKUP_DIR}/${BACKUP_NAME}.sha256"
else
    log "ERROR: Backup verification failed"
    exit 2
fi

# Output backup information for CI/scripts
echo "BACKUP_FILE=${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "CHECKSUM_FILE=${BACKUP_DIR}/${BACKUP_NAME}.sha256"
echo "BACKUP_SIZE=$(stat -c%s "${BACKUP_NAME}.tar.gz")"

# Clean up old backups (keep last 5)
log "Cleaning up old backups..."
ls -t "${BACKUP_DIR}"/mobius_library_*.tar.gz | tail -n +6 | while read -r old_backup; do
    if [[ -f "$old_backup" ]]; then
        log "Removing old backup: $old_backup"
        rm -f "$old_backup" "${old_backup%.tar.gz}.sha256" "${old_backup%.tar.gz}.log" || true
    fi
done

log "Backup completed successfully"
exit 0