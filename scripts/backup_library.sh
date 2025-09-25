#!/bin/bash
# scripts/backup_library.sh - Create verified backup of critical library components
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_BACKUP_DIR="$PROJECT_ROOT/backups"
DEFAULT_OUTPUT=""

# Help text
show_help() {
    cat << EOF
Usage: $0 [options]

Create a verified backup of the library including:
- Source code and scripts
- Configuration files
- Generated artifacts
- Test golden files

Options:
  --out PATH           Output backup file path (default: auto-generated timestamp)
  --backup-dir DIR     Directory for backups (default: backups/)
  --include-node       Include node_modules in backup
  --help              Show this help

Examples:
  $0 --out backups/dhash_20240101T120000Z.zip
  $0 --backup-dir /secure/backups

Environment variables:
  BACKUP_DIR          Override default backup directory
EOF
}

# Parse arguments
OUTPUT_FILE=""
BACKUP_DIR="${BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
INCLUDE_NODE_MODULES=false

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
        --include-node)
            INCLUDE_NODE_MODULES=true
            shift
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

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Auto-generate filename if not provided
if [[ -z "$OUTPUT_FILE" ]]; then
    TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
    OUTPUT_FILE="$BACKUP_DIR/dhash_${TIMESTAMP}.zip"
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "Creating backup: $OUTPUT_FILE"
echo "Project root: $PROJECT_ROOT"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Create temporary exclusion list
TEMP_EXCLUDE=$(mktemp)
trap 'rm -f "$TEMP_EXCLUDE"' EXIT

cat > "$TEMP_EXCLUDE" << EOF
.git/*
.github/workflows/*
node_modules/*
*.log
*.tmp
out/*
tmp/*
artifacts/*
backups/*
deploy_production_*.log
postdeploy-smoketests.log
*.zip
*.tar.gz
*.tgz
.DS_Store
Thumbs.db
.env
.env.local
EOF

# Conditionally exclude node_modules
if [[ "$INCLUDE_NODE_MODULES" == false ]]; then
    echo "node_modules/*" >> "$TEMP_EXCLUDE"
    echo "client/node_modules/*" >> "$TEMP_EXCLUDE"
fi

# Create backup archive
cd "$PROJECT_ROOT"
echo "Archiving files..."

# Use zip for cross-platform compatibility
if command -v zip >/dev/null 2>&1; then
    zip -r "$OUTPUT_FILE" . -x@"$TEMP_EXCLUDE" -q
else
    echo "Error: zip command not found. Please install zip." >&2
    exit 1
fi

# Verify archive was created
if [[ ! -f "$OUTPUT_FILE" ]]; then
    echo "Error: Backup file was not created: $OUTPUT_FILE" >&2
    exit 1
fi

# Get backup size and file count
BACKUP_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
FILE_COUNT=$(zipinfo -h "$OUTPUT_FILE" 2>/dev/null | grep "^Archive:" -A 10 | grep "files" | grep -o '[0-9]*' | head -n1 || echo "unknown")

echo "Backup created successfully:"
echo "  File: $OUTPUT_FILE"
echo "  Size: $BACKUP_SIZE"
echo "  Files: $FILE_COUNT"
echo ""

# Generate metadata
METADATA_FILE="${OUTPUT_FILE}.meta"
cat > "$METADATA_FILE" << EOF
{
  "backup_file": "$(basename "$OUTPUT_FILE")",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "size_bytes": $(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo 0),
  "file_count": $FILE_COUNT,
  "project_root": "$PROJECT_ROOT",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')"
}
EOF

echo "Metadata saved to: $METADATA_FILE"
echo ""
echo "To create checksum:"
echo "  sha256sum '$OUTPUT_FILE' > '${OUTPUT_FILE}.sha256'"
echo ""
echo "To verify backup:"
echo "  sha256sum -c '${OUTPUT_FILE}.sha256'"

exit 0