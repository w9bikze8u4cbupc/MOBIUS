#!/bin/bash

# MOBIUS Library Backup Script with SHA256 Verification
# Usage: ./scripts/backup_library.sh --out backups/dhash_$(date -u +%Y%m%dT%H%M%SZ).zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
OUTPUT_FILE=""
INCLUDE_LOGS=false
INCLUDE_CACHE=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --out)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --include-logs)
      INCLUDE_LOGS=true
      shift
      ;;
    --include-cache)
      INCLUDE_CACHE=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 --out OUTPUT_FILE [--include-logs] [--include-cache] [--verbose]"
      echo ""
      echo "Options:"
      echo "  --out OUTPUT_FILE    Required. Path to output backup file"
      echo "  --include-logs       Include log files in backup"
      echo "  --include-cache      Include cache files in backup"
      echo "  --verbose            Enable verbose output"
      echo "  --help               Show this help message"
      echo ""
      echo "Example:"
      echo "  $0 --out backups/dhash_\$(date -u +%Y%m%dT%H%M%SZ).zip"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$OUTPUT_FILE" ]]; then
  echo "Error: --out parameter is required"
  echo "Use --help for usage information"
  exit 1
fi

# Create output directory if it doesn't exist
OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$OUTPUT_DIR"

# Convert to absolute path
OUTPUT_FILE="$(cd "$OUTPUT_DIR" && pwd)/$(basename "$OUTPUT_FILE")"

# Create temporary directory for backup preparation
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

BACKUP_DIR="$TEMP_DIR/mobius-backup"
mkdir -p "$BACKUP_DIR"

echo "🔄 Preparing MOBIUS library backup..."
echo "   Output: $OUTPUT_FILE"
echo "   Include logs: $INCLUDE_LOGS"
echo "   Include cache: $INCLUDE_CACHE"

# Core application files
if [[ "$VERBOSE" == "true" ]]; then
  echo "📁 Backing up core application files..."
fi

# Copy source code
cp -r "$PROJECT_ROOT/src" "$BACKUP_DIR/"
cp -r "$PROJECT_ROOT/scripts" "$BACKUP_DIR/"
cp -r "$PROJECT_ROOT/client" "$BACKUP_DIR/"

# Copy configuration files
cp "$PROJECT_ROOT/package.json" "$BACKUP_DIR/"
cp "$PROJECT_ROOT/package-lock.json" "$BACKUP_DIR/" 2>/dev/null || true
cp "$PROJECT_ROOT/.gitignore" "$BACKUP_DIR/" 2>/dev/null || true
cp "$PROJECT_ROOT/README.md" "$BACKUP_DIR/" 2>/dev/null || true

# Copy GitHub workflows
if [[ -d "$PROJECT_ROOT/.github" ]]; then
  cp -r "$PROJECT_ROOT/.github" "$BACKUP_DIR/"
fi

# Copy tests
if [[ -d "$PROJECT_ROOT/tests" ]]; then
  cp -r "$PROJECT_ROOT/tests" "$BACKUP_DIR/"
fi

# Backup uploads directory (media library)
if [[ -d "$PROJECT_ROOT/src/api/uploads" ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "📸 Backing up uploads directory..."
  fi
  cp -r "$PROJECT_ROOT/src/api/uploads" "$BACKUP_DIR/"
fi

# Backup database if it exists
if [[ -f "$PROJECT_ROOT/mobius.db" ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "🗄️  Backing up database..."
  fi
  cp "$PROJECT_ROOT/mobius.db" "$BACKUP_DIR/"
fi

# Optionally include logs
if [[ "$INCLUDE_LOGS" == "true" && -d "$PROJECT_ROOT/logs" ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "📝 Including log files..."
  fi
  cp -r "$PROJECT_ROOT/logs" "$BACKUP_DIR/"
fi

# Optionally include cache
if [[ "$INCLUDE_CACHE" == "true" ]]; then
  if [[ -d "$PROJECT_ROOT/node_modules" ]]; then
    if [[ "$VERBOSE" == "true" ]]; then
      echo "📦 Including node_modules cache..."
    fi
    cp -r "$PROJECT_ROOT/node_modules" "$BACKUP_DIR/"
  fi
  if [[ -d "$PROJECT_ROOT/client/node_modules" ]]; then
    if [[ "$VERBOSE" == "true" ]]; then
      echo "📦 Including client node_modules cache..."
    fi
    cp -r "$PROJECT_ROOT/client/node_modules" "$BACKUP_DIR/client/"
  fi
fi

# Create backup metadata
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
HOSTNAME=$(hostname)
USER=$(whoami)

cat > "$BACKUP_DIR/backup_metadata.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "hostname": "$HOSTNAME",
  "user": "$USER",
  "backup_version": "1.0",
  "project": "MOBIUS",
  "include_logs": $INCLUDE_LOGS,
  "include_cache": $INCLUDE_CACHE,
  "git_commit": "$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF

if [[ "$VERBOSE" == "true" ]]; then
  echo "📊 Backup statistics:"
  du -sh "$BACKUP_DIR"
fi

# Create ZIP archive
echo "🗜️  Creating backup archive..."
cd "$TEMP_DIR"
zip -r "$(basename "$OUTPUT_FILE")" mobius-backup/ > /dev/null

# Move to final location (with absolute path)
mv "$(basename "$OUTPUT_FILE")" "$OUTPUT_FILE"

# Generate SHA256 checksum
echo "🔐 Generating SHA256 checksum..."
SHA256_FILE="${OUTPUT_FILE}.sha256"
OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
if command -v sha256sum > /dev/null; then
  cd "$OUTPUT_DIR"
  sha256sum "$(basename "$OUTPUT_FILE")" > "$SHA256_FILE"
elif command -v shasum > /dev/null; then
  cd "$OUTPUT_DIR"
  shasum -a 256 "$(basename "$OUTPUT_FILE")" > "$SHA256_FILE"
else
  echo "Warning: Neither sha256sum nor shasum found. Cannot generate checksum."
  exit 1
fi

# Display results
BACKUP_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
SHA256=$(cut -d' ' -f1 "$SHA256_FILE")

echo "✅ Backup completed successfully!"
echo ""
echo "📋 Backup Details:"
echo "   File: $OUTPUT_FILE"
echo "   Size: $BACKUP_SIZE"
echo "   SHA256: $SHA256"
echo "   Checksum file: $SHA256_FILE"
echo ""
echo "🔍 To verify backup integrity:"
echo "   sha256sum -c \"$SHA256_FILE\""
echo ""
echo "📋 Backup contents:"
echo "   - Source code (src/, scripts/, client/)"
echo "   - Configuration files (package.json, etc.)"
echo "   - Tests and CI workflows"
echo "   - Uploads directory (media library)"
echo "   - Database file (if present)"
if [[ "$INCLUDE_LOGS" == "true" ]]; then
  echo "   - Log files"
fi
if [[ "$INCLUDE_CACHE" == "true" ]]; then
  echo "   - Node.js dependencies cache"
fi
echo "   - Backup metadata with git information"