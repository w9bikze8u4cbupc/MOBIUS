#!/bin/bash
# MOBIUS Deployment - Backup Script
# Creates incremental backups with SHA256 verification

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Configuration
DEFAULT_ENV="staging"
DEFAULT_COMPONENTS="database,config,artifacts,logs"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV          Target environment (default: ${DEFAULT_ENV})"
    echo "  --components LIST  Comma-separated list of components to backup"
    echo "                     Options: database,config,artifacts,logs,all"
    echo "                     Default: ${DEFAULT_COMPONENTS}"
    echo "  --output DIR       Output directory (default: ${BACKUP_DIR})"
    echo "  --dry-run          Show what would be backed up without executing"
    echo "  --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --env production --components all"
    echo "  $0 --env staging --components database,config --dry-run"
    exit 1
}

# Parse arguments
ENV="${DEFAULT_ENV}"
COMPONENTS="${DEFAULT_COMPONENTS}"
OUTPUT_DIR="${BACKUP_DIR}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --components)
            COMPONENTS="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
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

# Validate environment
if [[ ! "$ENV" =~ ^(staging|production|development)$ ]]; then
    echo "Error: Invalid environment '$ENV'. Must be staging, production, or development."
    exit 1
fi

# Create backup directory
mkdir -p "$OUTPUT_DIR"

BACKUP_NAME="dhash_${ENV}_${TIMESTAMP}"
BACKUP_FILE="${OUTPUT_DIR}/${BACKUP_NAME}.zip"
MANIFEST_FILE="${OUTPUT_DIR}/${BACKUP_NAME}.manifest"
SHA_FILE="${OUTPUT_DIR}/${BACKUP_NAME}.zip.sha256"

echo "=== MOBIUS Backup Script ==="
echo "Environment: $ENV"
echo "Components: $COMPONENTS"
echo "Output: $BACKUP_FILE"
echo "Dry run: $DRY_RUN"
echo ""

# Create temporary backup staging area
TEMP_DIR=$(mktemp -d)
BACKUP_STAGING="${TEMP_DIR}/${BACKUP_NAME}"
mkdir -p "$BACKUP_STAGING"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Component backup functions
backup_database() {
    echo "Backing up database..."
    local db_dir="${BACKUP_STAGING}/database"
    mkdir -p "$db_dir"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] Would backup database to $db_dir"
        return
    fi
    
    # Mock database backup - replace with actual database backup commands
    echo "Database backup timestamp: $(date)" > "${db_dir}/backup_info.txt"
    echo "Environment: $ENV" >> "${db_dir}/backup_info.txt"
    
    # For SQLite databases (example)
    if [[ -f "${PROJECT_ROOT}/data/mobius.db" ]]; then
        cp "${PROJECT_ROOT}/data/mobius.db" "${db_dir}/mobius_backup.db"
    fi
    
    echo "✓ Database backup completed"
}

backup_config() {
    echo "Backing up configuration..."
    local config_dir="${BACKUP_STAGING}/config"
    mkdir -p "$config_dir"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] Would backup config to $config_dir"
        return
    fi
    
    # Backup configuration files
    [[ -f "${PROJECT_ROOT}/package.json" ]] && cp "${PROJECT_ROOT}/package.json" "$config_dir/"
    [[ -f "${PROJECT_ROOT}/.env" ]] && cp "${PROJECT_ROOT}/.env" "$config_dir/"
    [[ -d "${PROJECT_ROOT}/config" ]] && cp -r "${PROJECT_ROOT}/config" "$config_dir/"
    
    echo "✓ Configuration backup completed"
}

backup_artifacts() {
    echo "Backing up artifacts..."
    local artifacts_dir="${BACKUP_STAGING}/artifacts"
    mkdir -p "$artifacts_dir"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] Would backup artifacts to $artifacts_dir"
        return
    fi
    
    # Backup build artifacts and generated content
    [[ -d "${PROJECT_ROOT}/out" ]] && cp -r "${PROJECT_ROOT}/out" "$artifacts_dir/"
    [[ -d "${PROJECT_ROOT}/dist" ]] && cp -r "${PROJECT_ROOT}/dist" "$artifacts_dir/"
    [[ -d "${PROJECT_ROOT}/build" ]] && cp -r "${PROJECT_ROOT}/build" "$artifacts_dir/"
    
    echo "✓ Artifacts backup completed"
}

backup_logs() {
    echo "Backing up logs..."
    local logs_dir="${BACKUP_STAGING}/logs"
    mkdir -p "$logs_dir"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] Would backup logs to $logs_dir"
        return
    fi
    
    # Backup log files
    [[ -d "${PROJECT_ROOT}/logs" ]] && cp -r "${PROJECT_ROOT}/logs" "$logs_dir/"
    [[ -f "${PROJECT_ROOT}/application.log" ]] && cp "${PROJECT_ROOT}/application.log" "$logs_dir/"
    
    echo "✓ Logs backup completed"
}

# Process components
IFS=',' read -ra COMPONENT_LIST <<< "$COMPONENTS"
for component in "${COMPONENT_LIST[@]}"; do
    component=$(echo "$component" | tr -d ' ')  # Remove whitespace
    case "$component" in
        database|db)
            backup_database
            ;;
        config|configuration)
            backup_config
            ;;
        artifacts|build)
            backup_artifacts
            ;;
        logs|logging)
            backup_logs
            ;;
        all)
            backup_database
            backup_config
            backup_artifacts
            backup_logs
            ;;
        *)
            echo "Warning: Unknown component '$component', skipping"
            ;;
    esac
done

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo "=== DRY RUN COMPLETE ==="
    echo "Would create backup: $BACKUP_FILE"
    exit 0
fi

# Create manifest
echo "Creating backup manifest..."
cat > "$MANIFEST_FILE" << EOF
# MOBIUS Backup Manifest
# Generated: $(date)
Backup Name: $BACKUP_NAME
Environment: $ENV
Components: $COMPONENTS
Backup File: $(basename "$BACKUP_FILE")
SHA256 File: $(basename "$SHA_FILE")

# Files included in backup:
EOF

find "$BACKUP_STAGING" -type f -exec basename {} \; | sort >> "$MANIFEST_FILE"

# Create ZIP archive
echo "Creating backup archive..."
cd "$TEMP_DIR"
zip -r "$BACKUP_FILE" "$BACKUP_NAME"

# Generate SHA256 checksum
echo "Generating SHA256 checksum..."
cd "$OUTPUT_DIR"
sha256sum "$(basename "$BACKUP_FILE")" > "$SHA_FILE"

# Verify checksum
echo "Verifying backup integrity..."
if sha256sum -c "$SHA_FILE" >/dev/null 2>&1; then
    echo "✓ Backup integrity verified"
else
    echo "✗ Backup integrity check failed!"
    exit 1
fi

# Display summary
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo ""
echo "=== BACKUP COMPLETE ==="
echo "Backup file: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE"
echo "SHA256: $SHA_FILE"
echo "Manifest: $MANIFEST_FILE"
echo ""
echo "To verify backup integrity later:"
echo "  sha256sum -c \"$SHA_FILE\""
echo ""
echo "To restore from this backup:"
echo "  ./scripts/deploy/restore_dhash.sh --backup \"$BACKUP_FILE\" --env $ENV"