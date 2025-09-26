#!/bin/bash
# MOBIUS Deployment Framework - Backup Script
# Creates SHA256-verified backups of critical application data and configurations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${REPO_ROOT}/backups"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_NAME="dhash_${TIMESTAMP}"

# Default environment
ENV="${ENV:-staging}"

# Help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Create SHA256-verified backups for MOBIUS deployment

OPTIONS:
    --env ENV       Target environment (staging|production) [default: staging]
    --backup-dir DIR   Backup directory [default: ${BACKUP_DIR}]
    --help         Show this help message

EXAMPLES:
    $0 --env production
    $0 --env staging --backup-dir /custom/backup/path

EOF
}

# Parse arguments
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
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_help >&2
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    echo "Error: Invalid environment '$ENV'. Must be 'staging' or 'production'." >&2
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Starting MOBIUS backup for environment: $ENV"
echo "Backup directory: $BACKUP_DIR"
echo "Backup name: $BACKUP_NAME"

# Create temporary working directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

BACKUP_PATH="$TEMP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_PATH"

# Backup configuration files
echo "Backing up configuration files..."
if [[ -f "$REPO_ROOT/package.json" ]]; then
    cp "$REPO_ROOT/package.json" "$BACKUP_PATH/"
fi
if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
    cp "$REPO_ROOT/package-lock.json" "$BACKUP_PATH/"
fi

# Backup client configuration if exists
if [[ -d "$REPO_ROOT/client" ]]; then
    echo "Backing up client configuration..."
    mkdir -p "$BACKUP_PATH/client"
    if [[ -f "$REPO_ROOT/client/package.json" ]]; then
        cp "$REPO_ROOT/client/package.json" "$BACKUP_PATH/client/"
    fi
    if [[ -f "$REPO_ROOT/client/package-lock.json" ]]; then
        cp "$REPO_ROOT/client/package-lock.json" "$BACKUP_PATH/client/"
    fi
fi

# Backup critical source files (API and core components)
echo "Backing up critical source files..."
if [[ -d "$REPO_ROOT/src" ]]; then
    cp -r "$REPO_ROOT/src" "$BACKUP_PATH/"
fi

# Backup deployment scripts
echo "Backing up deployment scripts..."
if [[ -d "$REPO_ROOT/scripts" ]]; then
    cp -r "$REPO_ROOT/scripts" "$BACKUP_PATH/"
fi

# Backup test data (golden files)
echo "Backing up test baselines..."
if [[ -d "$REPO_ROOT/tests" ]]; then
    cp -r "$REPO_ROOT/tests" "$BACKUP_PATH/"
fi

# Create environment-specific backup metadata
cat > "$BACKUP_PATH/backup_metadata.json" << EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$TIMESTAMP",
  "environment": "$ENV",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "nodejs_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
  "backup_contents": [
    "package.json",
    "package-lock.json", 
    "client/",
    "src/",
    "scripts/",
    "tests/"
  ]
}
EOF

# Create ZIP archive
echo "Creating ZIP archive..."
ARCHIVE_PATH="$BACKUP_DIR/$BACKUP_NAME.zip"
cd "$TEMP_DIR"
zip -r "$ARCHIVE_PATH" "$BACKUP_NAME"

# Generate SHA256 checksum
echo "Generating SHA256 checksum..."
cd "$BACKUP_DIR"
sha256sum "$BACKUP_NAME.zip" > "$BACKUP_NAME.zip.sha256"

# Verify backup integrity
echo "Verifying backup integrity..."
if sha256sum -c "$BACKUP_NAME.zip.sha256" > /dev/null 2>&1; then
    echo "✓ Backup integrity verified"
else
    echo "✗ Backup integrity verification failed" >&2
    exit 1
fi

# Display backup information
BACKUP_SIZE=$(du -h "$ARCHIVE_PATH" | cut -f1)
echo ""
echo "=== BACKUP COMPLETED ==="
echo "Archive: $ARCHIVE_PATH"
echo "Checksum: $BACKUP_NAME.zip.sha256"
echo "Size: $BACKUP_SIZE"
echo "Environment: $ENV"
echo ""
echo "Verification command:"
echo "  cd $BACKUP_DIR && sha256sum -c $BACKUP_NAME.zip.sha256"
echo ""
echo "Restore preparation:"
echo "  unzip $BACKUP_NAME.zip"
echo "  cd $BACKUP_NAME"
echo ""