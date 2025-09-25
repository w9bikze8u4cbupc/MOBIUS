#!/bin/bash
# scripts/rollback_dhash.sh
# Rollback dhash deployment to previous version

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
ROLLBACK_TARGET=""
AUTO_CONFIRM=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup)
            ROLLBACK_TARGET="$2"
            shift 2
            ;;
        --yes)
            AUTO_CONFIRM=true
            shift
            ;;
        --list)
            echo "Available backups:"
            ls -la "$BACKUP_DIR"/mobius_library_*.tar.gz 2>/dev/null | tail -10 || echo "No backups found"
            exit 0
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --backup FILE     Specific backup file to restore"
            echo "  --yes            Skip confirmation prompt"
            echo "  --list           List available backups"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ROLLBACK] $*"
}

log "Starting rollback process"

# Find latest backup if none specified
if [[ -z "$ROLLBACK_TARGET" ]]; then
    ROLLBACK_TARGET=$(ls -t "$BACKUP_DIR"/mobius_library_*.tar.gz 2>/dev/null | head -1)
    if [[ -z "$ROLLBACK_TARGET" ]]; then
        log "ERROR: No backups found in $BACKUP_DIR"
        exit 1
    fi
    log "Using latest backup: $ROLLBACK_TARGET"
fi

# Verify backup exists and has checksum
if [[ ! -f "$ROLLBACK_TARGET" ]]; then
    log "ERROR: Backup file not found: $ROLLBACK_TARGET"
    exit 1
fi

CHECKSUM_FILE="${ROLLBACK_TARGET%.tar.gz}.sha256"
if [[ ! -f "$CHECKSUM_FILE" ]]; then
    log "ERROR: Checksum file not found: $CHECKSUM_FILE"
    log "Cannot verify backup integrity"
    exit 1
fi

# Verify backup integrity
log "Verifying backup integrity..."
cd "$(dirname "$ROLLBACK_TARGET")"
if ! sha256sum -c "$(basename "$CHECKSUM_FILE")" >/dev/null 2>&1; then
    log "ERROR: Backup integrity check failed"
    log "Backup may be corrupted: $ROLLBACK_TARGET"
    exit 2
fi
log "Backup integrity verified"

# Get backup information
BACKUP_SIZE=$(stat -c%s "$ROLLBACK_TARGET")
BACKUP_DATE=$(stat -c%y "$ROLLBACK_TARGET" | cut -d' ' -f1)
log "Backup size: $(numfmt --to=iec --suffix=B $BACKUP_SIZE)"
log "Backup date: $BACKUP_DATE"

# Confirmation
if [[ $AUTO_CONFIRM == false ]]; then
    echo
    echo "WARNING: This will replace current deployment with backup from $BACKUP_DATE"
    echo "Backup file: $ROLLBACK_TARGET"
    echo "Current data will be backed up before rollback"
    echo
    read -p "Continue with rollback? [y/N]: " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Rollback cancelled by user"
        exit 0
    fi
fi

# Create backup of current state before rollback
log "Creating backup of current state..."
if ! ./scripts/backup_library.sh; then
    log "WARNING: Could not backup current state"
    if [[ $AUTO_CONFIRM == false ]]; then
        read -p "Continue rollback without backup? [y/N]: " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Rollback cancelled"
            exit 0
        fi
    fi
fi

# Stop services (adjust based on your deployment setup)
log "Stopping services..."
# Add service stop commands here
# systemctl stop mobius-dhash || true
# pkill -f "node.*mobius" || true

# Restore from backup
log "Restoring from backup..."
cd "$(dirname "./src/uploads")"
if [[ -d "./src/uploads" ]]; then
    mv "./src/uploads" "./src/uploads.rollback.$(date +%Y%m%d_%H%M%S)"
fi

tar -xzf "$ROLLBACK_TARGET" -C .
if [[ $? -ne 0 ]]; then
    log "ERROR: Failed to extract backup"
    exit 2
fi

# Verify restored files
if [[ ! -d "./src/uploads" ]]; then
    log "ERROR: Rollback failed - uploads directory not found after extraction"
    exit 2
fi

# Start services
log "Starting services..."
# Add service start commands here
# systemctl start mobius-dhash || {
#   log "ERROR: Failed to start services after rollback"
#   exit 3
# }

# Health check
log "Performing post-rollback health check..."
sleep 5  # Give services time to start

# Basic health check (adjust URL and checks based on your setup)
HEALTH_URL="http://localhost:5001/health"
if command -v curl >/dev/null 2>&1; then
    if curl -f -s "$HEALTH_URL" >/dev/null 2>&1; then
        log "Health check passed"
    else
        log "WARNING: Health check failed - service may not be fully operational"
    fi
else
    log "WARNING: curl not available, skipping health check"
fi

log "Rollback completed successfully"
log "Restored from: $ROLLBACK_TARGET"
log "Services should be operational"

# Notify operators
log "IMPORTANT: Notify on-call team about rollback completion"
log "Document rollback reason and verify all functionality"

exit 0