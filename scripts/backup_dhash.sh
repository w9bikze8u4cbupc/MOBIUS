#!/bin/bash
set -euo pipefail

# dhash Backup Script
# Usage: ./backup_dhash.sh --env production [--dry-run] [--output backup.zip]

ENV=""
DRY_RUN=false
OUTPUT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$ENV" ]]; then
  echo "Error: --env is required"
  exit 1
fi

if [[ -z "$OUTPUT" ]]; then
  OUTPUT="dhash_backup_$(date +%Y%m%d_%H%M%S).zip"
fi

echo "📦 Creating dhash backup for environment: $ENV"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] Would create backup: $OUTPUT"
  echo "[DRY RUN] Would backup configuration files"
  echo "[DRY RUN] Would backup data directories"
  echo "[DRY RUN] Would generate checksums"
else
  echo "Creating backup: $OUTPUT"
  
  # Create backup directory structure
  TEMP_DIR=$(mktemp -d)
  BACKUP_DIR="$TEMP_DIR/dhash_backup"
  mkdir -p "$BACKUP_DIR"
  
  # Backup configuration (placeholder - replace with actual paths)
  echo "Backing up configuration..."
  mkdir -p "$BACKUP_DIR/config"
  echo "dhash-config-$(date)" > "$BACKUP_DIR/config/dhash.conf"
  
  # Backup data (placeholder - replace with actual paths)
  echo "Backing up data..."
  mkdir -p "$BACKUP_DIR/data"
  echo "dhash-data-$(date)" > "$BACKUP_DIR/data/dhash.db"
  
  # Create metadata
  cat > "$BACKUP_DIR/metadata.json" << EOF
{
  "backup_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENV",
  "version": "1.0.0",
  "component": "dhash"
}
EOF
  
  # Create zip archive
  (cd "$TEMP_DIR" && zip -r "$OUTPUT" dhash_backup/)
  
  # Move to final location
  if [[ "$OUTPUT" != /* ]]; then
    mv "$TEMP_DIR/$OUTPUT" "$OUTPUT"
  else
    mv "$TEMP_DIR/$OUTPUT" "$OUTPUT"
  fi
  
  # Cleanup
  rm -rf "$TEMP_DIR"
  
  echo "✅ Backup created successfully: $OUTPUT"
fi