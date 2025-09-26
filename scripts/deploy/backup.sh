#!/bin/bash
# Deployment Backup Script
# Creates SHA256-verified backups with automatic retention

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_COUNT="${RETENTION_COUNT:-10}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_${TIMESTAMP}"

log() {
  echo "[BACKUP] $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

create_backup() {
  local backup_path="$BACKUP_DIR/$BACKUP_NAME"
  
  log "Creating backup at $backup_path"
  mkdir -p "$backup_path"
  
  # Backup application files
  if [ -d "app" ]; then
    log "Backing up application files"
    tar -czf "$backup_path/app.tar.gz" app/
    sha256sum "$backup_path/app.tar.gz" > "$backup_path/app.tar.gz.sha256"
  fi
  
  # Backup configuration
  if [ -d "config" ]; then
    log "Backing up configuration"
    tar -czf "$backup_path/config.tar.gz" config/
    sha256sum "$backup_path/config.tar.gz" > "$backup_path/config.tar.gz.sha256"
  fi
  
  # Create backup manifest
  cat > "$backup_path/manifest.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "backup_type": "pre-deploy"
}
EOF
  
  log "Backup completed: $backup_path"
  echo "$backup_path"
}

cleanup_old_backups() {
  log "Cleaning up old backups (keeping $RETENTION_COUNT)"
  find "$BACKUP_DIR" -maxdepth 1 -type d -name "backup_*" | \
    sort -r | \
    tail -n +$(($RETENTION_COUNT + 1)) | \
    while read -r old_backup; do
      log "Removing old backup: $old_backup"
      rm -rf "$old_backup"
    done
}

main() {
  mkdir -p "$BACKUP_DIR"
  
  local backup_path=$(create_backup)
  cleanup_old_backups
  
  log "Backup process completed successfully"
  echo "BACKUP_PATH=$backup_path" >> $GITHUB_OUTPUT 2>/dev/null || true
}

main "$@"
