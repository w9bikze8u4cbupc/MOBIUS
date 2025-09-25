#!/bin/bash
# Backup script for MOBIUS dhash library with SHA256 verification
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups"

# Default values
OUTPUT_FILE=""
INCLUDE_LOGS=true
VERBOSE=false

usage() {
    echo "Usage: $0 --out <backup_file.zip> [options]"
    echo "Options:"
    echo "  --out FILE          Output backup file path (required)"
    echo "  --no-logs           Skip log files in backup"
    echo "  --verbose           Enable verbose output"
    echo "  --help              Show this help message"
}

log() {
    if [[ "$VERBOSE" == true ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
    fi
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --out)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --no-logs)
            INCLUDE_LOGS=false
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

if [[ -z "$OUTPUT_FILE" ]]; then
    echo "Error: --out parameter is required" >&2
    usage
    exit 1
fi

# Ensure backup directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Create temporary directory for backup staging
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

log "Starting backup process..."
log "Output file: $OUTPUT_FILE"
log "Include logs: $INCLUDE_LOGS"

# Create backup staging directory
BACKUP_STAGING="$TEMP_DIR/dhash_backup"
mkdir -p "$BACKUP_STAGING"

# Copy essential files
log "Copying source code..."
cp -r "$PROJECT_ROOT/src" "$BACKUP_STAGING/"
cp -r "$PROJECT_ROOT/scripts" "$BACKUP_STAGING/"
cp -r "$PROJECT_ROOT/client" "$BACKUP_STAGING/"
cp "$PROJECT_ROOT/package.json" "$BACKUP_STAGING/"
cp "$PROJECT_ROOT/package-lock.json" "$BACKUP_STAGING/" 2>/dev/null || true

# Copy configuration files
log "Copying configuration files..."
[[ -f "$PROJECT_ROOT/.env" ]] && cp "$PROJECT_ROOT/.env" "$BACKUP_STAGING/"
[[ -f "$PROJECT_ROOT/README.md" ]] && cp "$PROJECT_ROOT/README.md" "$BACKUP_STAGING/"

# Copy logs if requested
if [[ "$INCLUDE_LOGS" == true && -d "$PROJECT_ROOT/logs" ]]; then
    log "Copying log files..."
    cp -r "$PROJECT_ROOT/logs" "$BACKUP_STAGING/"
fi

# Copy tests and golden references
if [[ -d "$PROJECT_ROOT/tests" ]]; then
    log "Copying test files..."
    cp -r "$PROJECT_ROOT/tests" "$BACKUP_STAGING/"
fi

# Create backup metadata
log "Creating backup metadata..."
cat > "$BACKUP_STAGING/backup_metadata.json" << EOF
{
  "backup_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_version": "1.0.0",
  "source_directory": "$PROJECT_ROOT",
  "git_commit": "$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo 'unknown')",
  "include_logs": $INCLUDE_LOGS,
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
  "system_info": {
    "hostname": "$(hostname)",
    "platform": "$(uname -s)",
    "arch": "$(uname -m)"
  }
}
EOF

# Create the zip file
log "Creating zip archive..."
cd "$TEMP_DIR"
zip -r "$(basename "$OUTPUT_FILE")" dhash_backup/ >/dev/null

# Move to final location
mkdir -p "$(dirname "$OUTPUT_FILE")"
mv "$(basename "$OUTPUT_FILE")" "$OUTPUT_FILE"

# Generate SHA256 checksum
log "Generating SHA256 checksum..."
SHA256_FILE="${OUTPUT_FILE}.sha256"
if command -v sha256sum >/dev/null; then
    sha256sum "$OUTPUT_FILE" > "$SHA256_FILE"
elif command -v shasum >/dev/null; then
    shasum -a 256 "$OUTPUT_FILE" > "$SHA256_FILE"
else
    echo "Warning: Neither sha256sum nor shasum found, skipping checksum generation" >&2
fi

# Get file size
BACKUP_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

echo "✅ Backup completed successfully!"
echo "📁 Backup file: $OUTPUT_FILE ($BACKUP_SIZE)"
if [[ -f "$SHA256_FILE" ]]; then
    echo "🔐 SHA256 checksum: $SHA256_FILE"
    echo "    $(cat "$SHA256_FILE")"
fi

log "Backup process completed in $SECONDS seconds"