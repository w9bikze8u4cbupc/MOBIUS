#!/bin/bash
# Rollback Script with SHA256 verification
# Performs automated rollback with post-rollback verification

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"
BACKUP_PATH="${BACKUP_PATH:-}"

log() {
  echo "[ROLLBACK] $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

find_latest_backup() {
  if [ -n "$BACKUP_PATH" ] && [ -d "$BACKUP_PATH" ]; then
    echo "$BACKUP_PATH"
    return 0
  fi
  
  local latest_backup=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "backup_*" | sort -r | head -1)
  
  if [ -z "$latest_backup" ]; then
    log "ERROR: No backup found in $BACKUP_DIR"
    return 1
  fi
  
  echo "$latest_backup"
}

verify_backup_integrity() {
  local backup_path="$1"
  
  log "Verifying backup integrity at $backup_path"
  
  # Verify SHA256 checksums
  local failed_verifications=0
  
  for checksum_file in "$backup_path"/*.sha256; do
    if [ -f "$checksum_file" ]; then
      local archive_file=$(basename "$checksum_file" .sha256)
      
      if [ -f "$backup_path/$archive_file" ]; then
        log "Verifying $archive_file"
        
        if (cd "$backup_path" && sha256sum -c "$archive_file.sha256"); then
          log "✓ $archive_file integrity verified"
        else
          log "✗ $archive_file integrity verification failed"
          ((failed_verifications++))
        fi
      else
        log "✗ Archive file $archive_file missing"
        ((failed_verifications++))
      fi
    fi
  done
  
  if [ $failed_verifications -gt 0 ]; then
    log "ERROR: $failed_verifications backup integrity verification(s) failed"
    return 1
  fi
  
  log "✓ All backup integrity verifications passed"
  return 0
}

restore_from_backup() {
  local backup_path="$1"
  
  log "Restoring from backup: $backup_path"
  
  # Restore application files
  if [ -f "$backup_path/app.tar.gz" ]; then
    log "Restoring application files"
    rm -rf app.backup 2>/dev/null || true
    [ -d app ] && mv app app.backup
    tar -xzf "$backup_path/app.tar.gz"
    log "✓ Application files restored"
  fi
  
  # Restore configuration
  if [ -f "$backup_path/config.tar.gz" ]; then
    log "Restoring configuration files"
    rm -rf config.backup 2>/dev/null || true
    [ -d config ] && mv config config.backup
    tar -xzf "$backup_path/config.tar.gz"
    log "✓ Configuration files restored"
  fi
  
  # Display backup manifest
  if [ -f "$backup_path/manifest.json" ]; then
    log "Backup manifest:"
    cat "$backup_path/manifest.json"
  fi
}

run_post_rollback_verification() {
  log "Running post-rollback verification"
  
  # Run smoke tests if available
  if [ -f "scripts/deploy/smoke_tests.sh" ]; then
    log "Running smoke tests"
    if bash scripts/deploy/smoke_tests.sh; then
      log "✓ Smoke tests passed"
    else
      log "✗ Smoke tests failed after rollback"
      return 1
    fi
  fi
  
  # Run 3 consecutive health checks
  if [ -f "scripts/deploy/monitor.sh" ]; then
    log "Running health verification (3 consecutive checks)"
    local check_count=0
    local success_count=0
    
    while [ $check_count -lt 3 ]; do
      ((check_count++))
      log "Health check $check_count/3"
      
      if BASE_URL="${BASE_URL:-http://localhost:3000}" timeout 30 bash -c '
        response=$(curl -s --max-time 10 "$BASE_URL/health" 2>/dev/null || curl -s --max-time 10 "$BASE_URL/" 2>/dev/null)
        if [ -n "$response" ]; then
          exit 0
        else
          exit 1
        fi
      '; then
        ((success_count++))
        log "✓ Health check $check_count passed"
      else
        log "✗ Health check $check_count failed"
      fi
      
      [ $check_count -lt 3 ] && sleep 10
    done
    
    if [ $success_count -eq 3 ]; then
      log "✓ All 3 consecutive health checks passed"
    else
      log "✗ Only $success_count/3 health checks passed"
      return 1
    fi
  fi
  
  log "✓ Post-rollback verification completed successfully"
}

send_rollback_notification() {
  local status="$1"
  local backup_path="$2"
  
  local message="Rollback $status. Backup: $(basename "$backup_path")"
  
  # Send notification if notify script exists
  if [ -f "scripts/deploy/notify.js" ]; then
    local severity="info"
    [ "$status" = "failed" ] && severity="critical"
    
    node scripts/deploy/notify.js --message "$message" --severity "$severity" || true
  fi
  
  log "Rollback notification sent: $message"
}

main() {
  log "Starting rollback process"
  
  local backup_path
  if ! backup_path=$(find_latest_backup); then
    log "ERROR: Cannot proceed without backup"
    exit 1
  fi
  
  log "Using backup: $backup_path"
  
  if ! verify_backup_integrity "$backup_path"; then
    log "ERROR: Backup integrity verification failed"
    exit 1
  fi
  
  restore_from_backup "$backup_path"
  
  if run_post_rollback_verification; then
    log "✓ Rollback completed successfully"
    send_rollback_notification "completed successfully" "$backup_path"
    echo "ROLLBACK_SUCCESS=true" >> $GITHUB_OUTPUT 2>/dev/null || true
    exit 0
  else
    log "✗ Post-rollback verification failed"
    send_rollback_notification "failed" "$backup_path"
    echo "ROLLBACK_SUCCESS=false" >> $GITHUB_OUTPUT 2>/dev/null || true
    exit 1
  fi
}

main "$@"
