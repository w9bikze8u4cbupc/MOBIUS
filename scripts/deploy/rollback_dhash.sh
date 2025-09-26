#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Emergency Rollback Script
# Restores from SHA256-verified backups

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --backup FILE      Path to backup zip file [required]"
    echo "  --env ENV          Environment (staging|production) [required]"
    echo "  --dry-run          Show what would be restored without executing"
    echo "  --force            Skip confirmation prompts"
    echo "  --help             Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --backup backups/dhash_production_20240101_120000.zip --env production"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
BACKUP_FILE=""
ENV=""
DRY_RUN=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --env)
            ENV="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
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

if [[ -z "$BACKUP_FILE" ]]; then
    echo "Error: --backup is required"
    usage
fi

if [[ -z "$ENV" ]]; then
    echo "Error: --env is required"
    usage
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "Error: --env must be 'staging' or 'production'"
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify SHA256 checksum
SHA256_FILE="${BACKUP_FILE}.sha256"
if [[ ! -f "$SHA256_FILE" ]]; then
    echo "Error: SHA256 file not found: $SHA256_FILE"
    exit 1
fi

log "Verifying backup integrity..."
BACKUP_DIR_FOR_VERIFY=$(dirname "$BACKUP_FILE")
cd "$BACKUP_DIR_FOR_VERIFY"
if ! sha256sum -c "$(basename "$SHA256_FILE")" > /dev/null; then
    log "❌ Backup integrity check failed!"
    exit 1
fi
log "✅ Backup integrity verified"

if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY RUN - would restore the following from $BACKUP_FILE:"
    echo "  - Extract backup to temporary directory"
    echo "  - Verify backup metadata"
    echo "  - Restore configuration files"
    echo "  - Restore application state"
    echo "  - Restart services (if applicable)"
    exit 0
fi

# Confirmation prompt (unless forced)
if [[ "$FORCE" != "true" ]]; then
    echo "⚠️  WARNING: This will restore the system to a previous state."
    echo "   Environment: $ENV"
    echo "   Backup file: $BACKUP_FILE"
    echo ""
    read -p "Are you sure you want to proceed? (yes/no): " response
    if [[ "$response" != "yes" ]]; then
        echo "Rollback cancelled."
        exit 1
    fi
fi

# Create temporary directory for extraction
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log "Extracting backup to: $TEMP_DIR"
cd "$TEMP_DIR"
unzip -q "$BACKUP_FILE"

# Verify backup metadata
if [[ -f "backup_metadata.json" ]]; then
    log "Backup metadata:"
    cat backup_metadata.json | while IFS= read -r line; do
        log "  $line"
    done
else
    log "Warning: No backup metadata found"
fi

log "Starting rollback for environment: $ENV"

# Create a pre-rollback backup
log "Creating pre-rollback backup..."
ROLLBACK_BACKUP="${BACKUP_DIR}/pre_rollback_${ENV}_$(date '+%Y%m%d_%H%M%S').zip"
"${SCRIPT_DIR}/backup.sh" --env "$ENV" --backup-dir "$BACKUP_DIR" || {
    log "Warning: Pre-rollback backup failed, continuing anyway..."
}

# Restore configuration files
if [[ -d "config" ]]; then
    log "Restoring configuration files..."
    if [[ -d "${PROJECT_ROOT}/config/${ENV}" ]]; then
        # Backup current config before overwriting
        cp -r "${PROJECT_ROOT}/config/${ENV}" "${PROJECT_ROOT}/config/${ENV}.backup.$(date '+%Y%m%d_%H%M%S')" || true
    fi
    mkdir -p "${PROJECT_ROOT}/config/${ENV}"
    cp -r config/* "${PROJECT_ROOT}/config/${ENV}/"
    log "Configuration files restored"
fi

# Restore package files
if [[ -f "package.json" ]]; then
    log "Restoring package.json..."
    cp "package.json" "${PROJECT_ROOT}/"
fi

if [[ -f "package-lock.json" ]]; then
    log "Restoring package-lock.json..."
    cp "package-lock.json" "${PROJECT_ROOT}/"
fi

# Restore environment files
if [[ -f ".env.${ENV}" ]]; then
    log "Restoring environment file..."
    cp ".env.${ENV}" "${PROJECT_ROOT}/"
fi

# Reinstall dependencies if package files were restored
if [[ -f "package.json" ]]; then
    log "Reinstalling dependencies..."
    cd "$PROJECT_ROOT"
    npm ci --production 2>/dev/null || {
        log "Warning: npm ci failed, you may need to manually reinstall dependencies"
    }
fi

log "✅ Rollback completed successfully!"
log "Rolled back to backup: $BACKUP_FILE"

# Run smoke tests to verify rollback
log "Running post-rollback verification..."
if [[ -x "${SCRIPT_DIR}/smoke_tests.sh" ]]; then
    "${SCRIPT_DIR}/smoke_tests.sh" --env "$ENV" --quick || {
        log "⚠️  Warning: Post-rollback smoke tests failed"
        log "   Manual verification may be required"
    }
else
    log "No smoke tests found, skipping post-rollback verification"
fi

log "Rollback process completed. Please verify system functionality."