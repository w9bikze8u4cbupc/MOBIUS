#!/usr/bin/env bash
set -euo pipefail

# backup_library.sh - Create verified backup of dhash library and data
# Usage: ./scripts/backup_library.sh --out backups/dhash_20231225T120000Z.zip

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
OUTPUT_FILE=""
INCLUDE_LOGS="${INCLUDE_LOGS:-false}"
COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-6}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --out)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --include-logs)
      INCLUDE_LOGS="true"
      shift
      ;;
    --compression)
      COMPRESSION_LEVEL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 --out OUTPUT_FILE [--include-logs] [--compression LEVEL]"
      echo "  --out OUTPUT_FILE    Required: Path for backup ZIP file"
      echo "  --include-logs       Optional: Include log files in backup"
      echo "  --compression LEVEL  Optional: ZIP compression level 0-9 (default: 6)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ -z "$OUTPUT_FILE" ]; then
  echo "Error: --out OUTPUT_FILE is required"
  exit 1
fi

# Ensure backup directory exists
BACKUP_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$BACKUP_DIR"

cd "$PROJECT_ROOT"

# Create temporary directory for staging backup
TEMP_DIR=$(mktemp -d)
BACKUP_STAGE_DIR="$TEMP_DIR/dhash_backup"
mkdir -p "$BACKUP_STAGE_DIR"

echo "Creating dhash backup at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Core library files
echo "Backing up core library files..."
if [ -d "src" ]; then
  cp -r src "$BACKUP_STAGE_DIR/"
fi

# Configuration files
echo "Backing up configuration..."
cp package.json "$BACKUP_STAGE_DIR/" 2>/dev/null || true
cp package-lock.json "$BACKUP_STAGE_DIR/" 2>/dev/null || true
cp .gitignore "$BACKUP_STAGE_DIR/" 2>/dev/null || true

# Scripts directory (excluding this backup script)
echo "Backing up scripts..."
if [ -d "scripts" ]; then
  mkdir -p "$BACKUP_STAGE_DIR/scripts"
  cp scripts/*.sh "$BACKUP_STAGE_DIR/scripts/" 2>/dev/null || true
  cp scripts/*.js "$BACKUP_STAGE_DIR/scripts/" 2>/dev/null || true
  cp scripts/*.mjs "$BACKUP_STAGE_DIR/scripts/" 2>/dev/null || true
fi

# Database/data files (if they exist)
echo "Backing up data files..."
if [ -d "data" ]; then
  cp -r data "$BACKUP_STAGE_DIR/"
fi

# Client directory for full-stack backup
echo "Backing up client..."
if [ -d "client" ]; then
  mkdir -p "$BACKUP_STAGE_DIR/client"
  cp -r client/src "$BACKUP_STAGE_DIR/client/" 2>/dev/null || true
  cp client/package.json "$BACKUP_STAGE_DIR/client/" 2>/dev/null || true
  cp client/package-lock.json "$BACKUP_STAGE_DIR/client/" 2>/dev/null || true
fi

# Documentation
echo "Backing up documentation..."
cp README.md "$BACKUP_STAGE_DIR/" 2>/dev/null || true
cp PR_MERGE_CHECKLIST.md "$BACKUP_STAGE_DIR/" 2>/dev/null || true

# Include logs if requested
if [ "$INCLUDE_LOGS" = "true" ]; then
  echo "Including log files..."
  if [ -d "logs" ]; then
    cp -r logs "$BACKUP_STAGE_DIR/"
  fi
  if [ -d "monitor_logs" ]; then
    cp -r monitor_logs "$BACKUP_STAGE_DIR/"
  fi
fi

# Create backup manifest
echo "Creating backup manifest..."
cat > "$BACKUP_STAGE_DIR/BACKUP_MANIFEST.txt" << EOF
MOBIUS dhash Backup
Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Host: $(hostname)
User: $(whoami)
Git commit: $(git rev-parse HEAD 2>/dev/null || echo "unknown")
Git branch: $(git branch --show-current 2>/dev/null || echo "unknown")

Contents:
$(find "$BACKUP_STAGE_DIR" -type f | sort)

Backup completed at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

# Create the ZIP archive
echo "Creating ZIP archive with compression level $COMPRESSION_LEVEL..."
cd "$TEMP_DIR"
zip -r -"$COMPRESSION_LEVEL" "$OUTPUT_FILE" dhash_backup/

# Cleanup
rm -rf "$TEMP_DIR"

# Verify backup was created
if [ -f "$OUTPUT_FILE" ]; then
  BACKUP_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
  echo "Backup created successfully: $OUTPUT_FILE ($BACKUP_SIZE)"
  echo "To verify: unzip -t \"$OUTPUT_FILE\""
  echo "To create checksum: sha256sum \"$OUTPUT_FILE\" > \"$OUTPUT_FILE.sha256\""
else
  echo "Error: Backup file was not created"
  exit 1
fi