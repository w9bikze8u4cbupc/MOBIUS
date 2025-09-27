#!/bin/bash
# backup_dhash.sh - Timestamped backups with SHA256 generation and verification
# Usage: ./backup_dhash.sh --env <environment> [--dry-run] [--retention-days <days>]

set -euo pipefail

# Default configuration
DEFAULT_RETENTION_DAYS=30
BACKUP_DIR="backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Parse command line arguments
DRY_RUN=false
ENVIRONMENT=""
RETENTION_DAYS=$DEFAULT_RETENTION_DAYS

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 --env <environment> [--dry-run] [--retention-days <days>]"
      echo "  --env: Environment to backup (required)"
      echo "  --dry-run: Show what would be done without executing"
      echo "  --retention-days: Days to retain backups (default: $DEFAULT_RETENTION_DAYS)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$ENVIRONMENT" ]]; then
  echo "Error: --env is required"
  exit 1
fi

# Define backup paths
BACKUP_FILE="dhash_${ENVIRONMENT}_${TIMESTAMP}.zip"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
SHA256_FILE="${BACKUP_PATH}.sha256"

# Create backup directory
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Would create backup directory: $BACKUP_DIR"
  echo "[DRY-RUN] Would create backup: $BACKUP_PATH"
  echo "[DRY-RUN] Would generate SHA256: $SHA256_FILE"
  echo "[DRY-RUN] Would clean backups older than $RETENTION_DAYS days"
else
  mkdir -p "$BACKUP_DIR"
  
  echo "Creating backup for environment: $ENVIRONMENT"
  echo "Backup file: $BACKUP_PATH"
  
  # Create backup (mock dhash component backup)
  # In a real implementation, this would backup actual dhash data/config/state
  cat > "/tmp/dhash_backup_manifest.txt" << EOF
# DHash Backup Manifest
Environment: $ENVIRONMENT
Timestamp: $TIMESTAMP
Components:
- Configuration files
- State databases
- Migration scripts
- Runtime data
EOF
  
  # Create the backup zip
  zip -r "$BACKUP_PATH" \
    "/tmp/dhash_backup_manifest.txt" \
    "src/api" \
    "scripts" \
    || true
  
  # Generate SHA256 checksum
  if [[ -f "$BACKUP_PATH" ]]; then
    (cd "$(dirname "$BACKUP_PATH")" && sha256sum "$(basename "$BACKUP_PATH")") > "$SHA256_FILE"
    echo "✅ Backup created: $BACKUP_PATH"
    echo "✅ SHA256 checksum: $SHA256_FILE"
    
    # Verify the checksum immediately
    if (cd "$(dirname "$BACKUP_PATH")" && sha256sum -c "$(basename "$SHA256_FILE")") >/dev/null 2>&1; then
      echo "✅ SHA256 verification: PASS"
    else
      echo "❌ SHA256 verification: FAIL"
      exit 1
    fi
  else
    echo "❌ Backup creation failed"
    exit 1
  fi
  
  # Clean old backups
  echo "Cleaning backups older than $RETENTION_DAYS days..."
  find "$BACKUP_DIR" -name "dhash_${ENVIRONMENT}_*.zip*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
fi

echo "Backup completed successfully"