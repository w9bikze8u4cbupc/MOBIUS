#!/bin/bash

# Backup Library Script for MOBIUS
# Creates timestamped backups with SHA256 verification

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_BACKUP_DIR="$PROJECT_ROOT/backups"

# Default values
BACKUP_DIR="$DEFAULT_BACKUP_DIR"
OUTPUT_FILE=""
RETENTION_DAYS=30
INCLUDE_LOGS=false
INCLUDE_NODE_MODULES=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Create a timestamped backup of the MOBIUS library with SHA256 verification.

OPTIONS:
    --out PATH          Output file path (default: backups/dhash_TIMESTAMP.zip)
    --backup-dir PATH   Backup directory (default: $DEFAULT_BACKUP_DIR)
    --retention DAYS    Days to keep old backups (default: 30)
    --include-logs      Include log files in backup
    --include-modules   Include node_modules in backup (not recommended)
    --dry-run          Show what would be backed up without creating archive
    -h, --help         Show this help message

EXAMPLES:
    $0 --out backups/dhash_\$(date -u +%Y%m%dT%H%M%SZ).zip
    $0 --retention 7 --include-logs
    $0 --dry-run

EOF
}

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

# Parse command line arguments
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --out)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --include-logs)
            INCLUDE_LOGS=true
            shift
            ;;
        --include-modules)
            INCLUDE_NODE_MODULES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Generate timestamp and default output file if not specified
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
if [[ -z "$OUTPUT_FILE" ]]; then
    OUTPUT_FILE="$BACKUP_DIR/dhash_$TIMESTAMP.zip"
fi

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Create exclude list
EXCLUDE_FILE=$(mktemp)
trap "rm -f $EXCLUDE_FILE" EXIT

cat > "$EXCLUDE_FILE" << EOF
node_modules/*
.git/*
*.log
logs/*
backups/*
out/*
tmp/*
dist/*
build/*
coverage/*
.nyc_output/*
*.tmp
.DS_Store
.env
.env.local
*.swp
*.swo
*~
EOF

# Include logs if requested
if [[ "$INCLUDE_LOGS" == false ]]; then
    echo "logs/*" >> "$EXCLUDE_FILE"
fi

# Include node_modules if requested
if [[ "$INCLUDE_NODE_MODULES" == false ]]; then
    echo "node_modules/*" >> "$EXCLUDE_FILE"
fi

log "Starting backup process..."
log "Project root: $PROJECT_ROOT"
log "Output file: $OUTPUT_FILE"
log "Include logs: $INCLUDE_LOGS"
log "Include node_modules: $INCLUDE_NODE_MODULES"

if [[ "$DRY_RUN" == true ]]; then
    log "DRY RUN - Files to be included:"
    cd "$PROJECT_ROOT"
    find . -type f | grep -v -f "$EXCLUDE_FILE" | sort
    log "DRY RUN - Would create backup at: $OUTPUT_FILE"
    exit 0
fi

# Create the backup archive
cd "$PROJECT_ROOT"
log "Creating backup archive..."

if command -v zip >/dev/null 2>&1; then
    # Use zip with exclude patterns
    zip -r "$OUTPUT_FILE" . -x@"$EXCLUDE_FILE" >/dev/null 2>&1
    if [[ $? -eq 0 ]]; then
        success "Backup archive created: $OUTPUT_FILE"
    else
        error "Failed to create backup archive"
        exit 1
    fi
else
    error "zip command not found. Please install zip utility."
    exit 1
fi

# Calculate SHA256
log "Calculating SHA256 checksum..."
if command -v sha256sum >/dev/null 2>&1; then
    SHA256_HASH=$(sha256sum "$OUTPUT_FILE" | cut -d' ' -f1)
    echo "$SHA256_HASH  $(basename "$OUTPUT_FILE")" > "$OUTPUT_FILE.sha256"
    success "SHA256: $SHA256_HASH"
    success "Checksum saved to: $OUTPUT_FILE.sha256"
elif command -v shasum >/dev/null 2>&1; then
    SHA256_HASH=$(shasum -a 256 "$OUTPUT_FILE" | cut -d' ' -f1)
    echo "$SHA256_HASH  $(basename "$OUTPUT_FILE")" > "$OUTPUT_FILE.sha256"
    success "SHA256: $SHA256_HASH"
    success "Checksum saved to: $OUTPUT_FILE.sha256"
else
    warn "Neither sha256sum nor shasum found. Checksum not calculated."
fi

# Get file size
FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo "unknown")
if [[ "$FILE_SIZE" != "unknown" ]]; then
    FILE_SIZE_MB=$(echo "scale=2; $FILE_SIZE / 1024 / 1024" | bc 2>/dev/null || echo "unknown")
    log "Archive size: ${FILE_SIZE_MB}MB"
fi

# Clean up old backups based on retention policy
if [[ $RETENTION_DAYS -gt 0 ]]; then
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    # Find and remove old backup files
    find "$BACKUP_DIR" -name "dhash_*.zip" -type f -mtime +$RETENTION_DAYS -print0 | while IFS= read -r -d '' file; do
        warn "Removing old backup: $(basename "$file")"
        rm -f "$file" "${file}.sha256"
    done
    
    success "Cleanup completed"
fi

# Summary
log "Backup Summary:"
log "  File: $OUTPUT_FILE"
log "  Size: ${FILE_SIZE_MB:-unknown}MB"
log "  SHA256: ${SHA256_HASH:-not calculated}"
log "  Timestamp: $TIMESTAMP"

success "Backup completed successfully!"

# Verification instructions
cat << EOF

To verify the backup integrity:
  sha256sum -c "$OUTPUT_FILE.sha256"

To list backup contents:
  unzip -l "$OUTPUT_FILE"

To restore from backup:
  unzip "$OUTPUT_FILE" -d /path/to/restore/location

EOF