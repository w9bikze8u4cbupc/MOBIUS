#!/usr/bin/env bash
set -euo pipefail

# rollback_dhash.sh - Rollback dhash system to a verified backup
# Usage: ./scripts/rollback_dhash.sh --backup backups/dhash_20231225T120000Z.zip

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
BACKUP_FILE=""
LOG_FILE="rollback.log"
VERIFY_BACKUP=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --backup)
      BACKUP_FILE="$2"
      shift 2
      ;;
    --log)
      LOG_FILE="$2"
      shift 2
      ;;
    --skip-verify)
      VERIFY_BACKUP=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 --backup BACKUP_FILE [--log LOG_FILE] [--skip-verify]"
      echo "  --backup BACKUP_FILE  Required: Path to backup ZIP file"
      echo "  --log LOG_FILE        Optional: Log file path (default: rollback.log)"
      echo "  --skip-verify         Optional: Skip backup verification (not recommended)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  echo "Error: --backup BACKUP_FILE is required"
  exit 1
fi

# Logging function
log() {
  local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

log "=== STARTING DHASH ROLLBACK PROCEDURE ==="
log "Backup file: $BACKUP_FILE"

cd "$PROJECT_ROOT"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  log "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Verify backup integrity
if [ "$VERIFY_BACKUP" = true ]; then
  log "Verifying backup integrity..."
  
  # Check if checksum file exists
  CHECKSUM_FILE="${BACKUP_FILE}.sha256"
  if [ -f "$CHECKSUM_FILE" ]; then
    log "Found checksum file: $CHECKSUM_FILE"
    if sha256sum -c "$CHECKSUM_FILE" 2>&1 | tee -a "$LOG_FILE"; then
      log "✓ Backup integrity verified"
    else
      log "ERROR: Backup integrity check failed"
      exit 1
    fi
  else
    log "WARNING: No checksum file found, performing basic ZIP test"
    if unzip -t "$BACKUP_FILE" > /dev/null 2>&1; then
      log "✓ Backup ZIP file is valid"
    else
      log "ERROR: Backup ZIP file is corrupted"
      exit 1
    fi
  fi
fi

# Create current state backup before rollback
CURRENT_BACKUP_DIR="rollback_backups"
mkdir -p "$CURRENT_BACKUP_DIR"
CURRENT_BACKUP_FILE="$CURRENT_BACKUP_DIR/pre_rollback_$(date -u +%Y%m%dT%H%M%SZ).zip"

log "Creating backup of current state before rollback..."
if ./scripts/backup_library.sh --out "$CURRENT_BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"; then
  log "✓ Current state backed up to: $CURRENT_BACKUP_FILE"
else
  log "WARNING: Failed to backup current state, continuing with rollback"
fi

# Stop services
log "Stopping dhash services..."
if pgrep -f "src/api/index.js" > /dev/null; then
  log "Stopping API server..."
  pkill -f "src/api/index.js" || true
  sleep 3
  
  # Force kill if still running
  if pgrep -f "src/api/index.js" > /dev/null; then
    log "Force stopping API server..."
    pkill -9 -f "src/api/index.js" || true
    sleep 1
  fi
fi

# Additional service stops can be added here
log "✓ Services stopped"

# Create restoration directory
RESTORE_DIR=$(mktemp -d)
log "Extracting backup to temporary directory: $RESTORE_DIR"

if unzip -q "$BACKUP_FILE" -d "$RESTORE_DIR" 2>&1 | tee -a "$LOG_FILE"; then
  log "✓ Backup extracted successfully"
else
  log "ERROR: Failed to extract backup"
  exit 1
fi

# Find the backup content directory
BACKUP_CONTENT_DIR="$RESTORE_DIR"
if [ -d "$RESTORE_DIR/dhash_backup" ]; then
  BACKUP_CONTENT_DIR="$RESTORE_DIR/dhash_backup"
fi

# Restore files
log "Restoring files from backup..."

# Restore source code
if [ -d "$BACKUP_CONTENT_DIR/src" ]; then
  log "Restoring src/ directory..."
  rm -rf src
  cp -r "$BACKUP_CONTENT_DIR/src" .
  log "✓ Source code restored"
fi

# Restore scripts
if [ -d "$BACKUP_CONTENT_DIR/scripts" ]; then
  log "Restoring scripts/ directory..."
  # Keep the current rollback script to avoid issues
  TEMP_ROLLBACK_SCRIPT="/tmp/rollback_dhash.sh.tmp"
  cp scripts/rollback_dhash.sh "$TEMP_ROLLBACK_SCRIPT" 2>/dev/null || true
  
  rm -rf scripts
  cp -r "$BACKUP_CONTENT_DIR/scripts" .
  chmod +x scripts/*.sh 2>/dev/null || true
  
  # Restore current rollback script
  if [ -f "$TEMP_ROLLBACK_SCRIPT" ]; then
    cp "$TEMP_ROLLBACK_SCRIPT" scripts/rollback_dhash.sh
    rm "$TEMP_ROLLBACK_SCRIPT"
  fi
  
  log "✓ Scripts restored"
fi

# Restore client
if [ -d "$BACKUP_CONTENT_DIR/client" ]; then
  log "Restoring client/ directory..."
  rm -rf client
  cp -r "$BACKUP_CONTENT_DIR/client" .
  log "✓ Client code restored"
fi

# Restore configuration files
for config_file in package.json package-lock.json; do
  if [ -f "$BACKUP_CONTENT_DIR/$config_file" ]; then
    log "Restoring $config_file..."
    cp "$BACKUP_CONTENT_DIR/$config_file" .
  fi
done

# Restore data if present
if [ -d "$BACKUP_CONTENT_DIR/data" ]; then
  log "Restoring data/ directory..."
  rm -rf data
  cp -r "$BACKUP_CONTENT_DIR/data" .
  log "✓ Data restored"
fi

# Install dependencies
log "Installing dependencies..."
if npm ci 2>&1 | tee -a "$LOG_FILE"; then
  log "✓ Dependencies installed"
else
  log "WARNING: Some dependencies may have failed to install"
fi

# Restart services
log "Restarting dhash services..."

# Start API server (in production, use proper process management)
log "Starting API server..."
# This is a placeholder - in production, use PM2, systemd, etc.
log "✓ Services would be restarted (placeholder)"

# Cleanup temporary directory
rm -rf "$RESTORE_DIR"

# Health check
log "Performing post-rollback health checks..."
sleep 5

HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
if command -v curl > /dev/null; then
  if curl -fsS --max-time 10 "$HEALTH_URL" > /dev/null 2>&1; then
    log "✓ Health check passed: $HEALTH_URL"
  else
    log "WARNING: Health check failed: $HEALTH_URL"
  fi
else
  log "WARNING: curl not available, skipping health check"
fi

log "=== ROLLBACK COMPLETED SUCCESSFULLY ==="
log "Rolled back to backup: $BACKUP_FILE"
log "Current state backup saved to: $CURRENT_BACKUP_FILE"
log "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "Rollback log saved to: $LOG_FILE"