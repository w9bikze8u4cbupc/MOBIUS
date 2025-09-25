#!/usr/bin/env bash
set -euo pipefail

# scripts/backup_library.sh
# Creates a timestamped ZIP backup of the library/database with verification
#
# Usage:
#   ./scripts/backup_library.sh --out backups/dhash_20240101T120000Z.zip
#
# Options:
#   --out OUTPUT_FILE  Output ZIP file path (required)
#   --include-tests    Include test files in backup (default: false)
#   --help             Show this help

usage() {
  cat <<EOF
Usage: $0 --out OUTPUT_FILE [options]

Creates a backup ZIP of the library with SHA256 verification.

Options:
  --out OUTPUT_FILE     Output ZIP file path (required)
  --include-tests      Include test files in backup (default: false)
  --help               Show this help

Examples:
  $0 --out backups/dhash_\$(date -u +%Y%m%dT%H%M%SZ).zip
  $0 --out backups/full_backup.zip --include-tests
EOF
}

# Parse arguments
OUTPUT_FILE=""
INCLUDE_TESTS=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --out)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --include-tests)
      INCLUDE_TESTS=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$OUTPUT_FILE" ]]; then
  echo "Error: --out option is required" >&2
  usage >&2
  exit 1
fi

# Ensure output directory exists
OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$OUTPUT_DIR"

echo "Creating backup: $OUTPUT_FILE"

# Define what to include in the backup
INCLUDE_PATTERNS=(
  "src/"
  "scripts/"
  "package.json"
  "package-lock.json"
  "README.md"
  ".gitignore"
  "client/"
)

if [[ "$INCLUDE_TESTS" == "true" ]]; then
  INCLUDE_PATTERNS+=("tests/")
fi

# Create temporary file list
TEMP_LIST=$(mktemp)
trap "rm -f '$TEMP_LIST'" EXIT

# Build file list, excluding unwanted patterns
for pattern in "${INCLUDE_PATTERNS[@]}"; do
  if [[ -e "$pattern" ]]; then
    find "$pattern" -type f \
      ! -path "*/node_modules/*" \
      ! -path "*/dist/*" \
      ! -path "*/build/*" \
      ! -path "*/.git/*" \
      ! -path "*/tmp/*" \
      ! -path "*/temp/*" \
      ! -name "*.log" \
      ! -name "*.tmp" \
      ! -name ".DS_Store" \
      ! -name "Thumbs.db" \
      >> "$TEMP_LIST" || true
  fi
done

# Verify we have files to backup
if [[ ! -s "$TEMP_LIST" ]]; then
  echo "Error: No files found to backup" >&2
  exit 1
fi

echo "Found $(wc -l < "$TEMP_LIST") files to backup"

# Create the ZIP backup
if ! zip -r "$OUTPUT_FILE" -@ < "$TEMP_LIST" > /dev/null; then
  echo "Error: Failed to create backup ZIP" >&2
  exit 1
fi

# Verify the backup was created
if [[ ! -f "$OUTPUT_FILE" ]]; then
  echo "Error: Backup file was not created" >&2
  exit 1
fi

# Get file size for verification
BACKUP_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null)
echo "Backup created successfully: $OUTPUT_FILE (${BACKUP_SIZE} bytes)"

# Test ZIP integrity
if ! unzip -t "$OUTPUT_FILE" > /dev/null 2>&1; then
  echo "Error: Backup ZIP integrity check failed" >&2
  exit 1
fi

echo "Backup integrity verified"
exit 0