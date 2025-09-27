#!/bin/bash

# Backup script for dhash component with SHA256 verification
# Creates timestamped backups with integrity verification

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$PROJECT_ROOT/backups"

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
VERIFY_BACKUP=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --no-verify)
      VERIFY_BACKUP=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --dry-run      Simulate backup creation without making changes"
      echo "  --env ENV      Target environment (staging, production)"
      echo "  --no-verify    Skip backup verification"
      echo "  -h, --help     Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Logging functions
log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
}

log_warn() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*" >&2
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Create backup directory
prepare_backup_directory() {
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would create backup directory: $BACKUP_DIR"
    return 0
  fi
  
  mkdir -p "$BACKUP_DIR"
  log_info "Backup directory prepared: $BACKUP_DIR"
}

# Create backup archive
create_backup_archive() {
  local backup_file="$BACKUP_DIR/dhash_${ENVIRONMENT}_${TIMESTAMP}.zip"
  
  log_info "Creating backup archive for $ENVIRONMENT environment"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would create backup archive: $backup_file"
    log_info "[DRY-RUN] Would include:"
    log_info "[DRY-RUN] - Source code (src/)"
    log_info "[DRY-RUN] - Configuration files"
    log_info "[DRY-RUN] - Deployment manifests"
    log_info "[DRY-RUN] - Package definitions"
    return 0
  fi
  
  # Create temporary directory for backup staging
  local temp_dir
  temp_dir=$(mktemp -d)
  trap "rm -rf $temp_dir" EXIT
  
  # Copy files to backup
  log_info "Staging backup files..."
  
  # Core source files
  if [[ -d "$PROJECT_ROOT/src" ]]; then
    cp -r "$PROJECT_ROOT/src" "$temp_dir/"
  fi
  
  # Configuration files
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    cp "$PROJECT_ROOT/package.json" "$temp_dir/"
  fi
  
  if [[ -f "$PROJECT_ROOT/package-lock.json" ]]; then
    cp "$PROJECT_ROOT/package-lock.json" "$temp_dir/"
  fi
  
  # Environment-specific deployment data
  if [[ -d "$PROJECT_ROOT/deployments/$ENVIRONMENT" ]]; then
    mkdir -p "$temp_dir/deployments"
    cp -r "$PROJECT_ROOT/deployments/$ENVIRONMENT" "$temp_dir/deployments/"
  fi
  
  # Scripts (excluding this backup script to avoid recursion)
  mkdir -p "$temp_dir/scripts"
  for script in "$SCRIPT_DIR"/*.sh "$SCRIPT_DIR"/*.js; do
    if [[ -f "$script" && "$(basename "$script")" != "backup_dhash.sh" ]]; then
      cp "$script" "$temp_dir/scripts/"
    fi
  done
  
  # Create backup metadata
  cat > "$temp_dir/backup_metadata.json" << EOF
{
  "backup_timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "backup_script_version": "1.0.0",
  "created_by": "$(whoami)",
  "hostname": "$(hostname)",
  "backup_type": "dhash_component"
}
EOF
  
  # Create the zip archive
  log_info "Creating zip archive..."
  cd "$temp_dir"
  
  if command -v zip &> /dev/null; then
    zip -r "$backup_file" . -q
  else
    # Fallback to tar if zip is not available
    backup_file="${backup_file%.zip}.tar.gz"
    tar -czf "$backup_file" .
  fi
  
  cd - > /dev/null
  
  log_info "Backup archive created: $(basename "$backup_file")"
  echo "$backup_file"  # Return the backup file path
}

# Generate SHA256 checksum
generate_checksum() {
  local backup_file="$1"
  local checksum_file="${backup_file}.sha256"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would generate SHA256 checksum for: $(basename "$backup_file")"
    return 0
  fi
  
  log_info "Generating SHA256 checksum..."
  
  if command -v sha256sum &> /dev/null; then
    # Linux
    (cd "$(dirname "$backup_file")" && sha256sum "$(basename "$backup_file")" > "$(basename "$checksum_file")")
  elif command -v shasum &> /dev/null; then
    # macOS
    (cd "$(dirname "$backup_file")" && shasum -a 256 "$(basename "$backup_file")" > "$(basename "$checksum_file")")
  else
    log_error "No SHA256 utility found (sha256sum or shasum)"
    exit 1
  fi
  
  log_info "Checksum generated: $(basename "$checksum_file")"
}

# Verify backup integrity
verify_backup() {
  local backup_file="$1"
  local checksum_file="${backup_file}.sha256"
  
  if [[ "$VERIFY_BACKUP" == false ]]; then
    log_warn "Backup verification skipped"
    return 0
  fi
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would verify backup integrity using SHA256 checksum"
    return 0
  fi
  
  log_info "Verifying backup integrity..."
  
  if [[ ! -f "$checksum_file" ]]; then
    log_error "Checksum file not found: $(basename "$checksum_file")"
    exit 1
  fi
  
  local verification_result
  if command -v sha256sum &> /dev/null; then
    # Linux
    (cd "$(dirname "$backup_file")" && sha256sum -c "$(basename "$checksum_file")" --quiet)
    verification_result=$?
  elif command -v shasum &> /dev/null; then
    # macOS
    (cd "$(dirname "$backup_file")" && shasum -a 256 -c "$(basename "$checksum_file")" --quiet)
    verification_result=$?
  else
    log_error "No SHA256 utility found for verification"
    exit 1
  fi
  
  if [[ $verification_result -eq 0 ]]; then
    log_info "Backup verification successful"
  else
    log_error "Backup verification failed"
    exit 1
  fi
}

# Clean up old backups
cleanup_old_backups() {
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would clean up backups older than 30 days"
    return 0
  fi
  
  log_info "Cleaning up backups older than 30 days..."
  
  # Find and remove backups older than 30 days
  find "$BACKUP_DIR" -name "dhash_${ENVIRONMENT}_*.zip*" -mtime +30 -type f -delete 2>/dev/null || true
  find "$BACKUP_DIR" -name "dhash_${ENVIRONMENT}_*.tar.gz*" -mtime +30 -type f -delete 2>/dev/null || true
  
  log_info "Old backup cleanup completed"
}

# Main backup process
main() {
  log_info "Starting dhash backup process"
  log_info "Environment: $ENVIRONMENT"
  log_info "Dry run: $DRY_RUN"
  
  prepare_backup_directory
  
  if [[ "$DRY_RUN" == true ]]; then
    create_backup_archive
    generate_checksum "/dev/null"  # Dummy path for dry run
    verify_backup "/dev/null"
    cleanup_old_backups
    log_info "Backup dry run completed successfully"
  else
    local backup_file
    backup_file=$(create_backup_archive)
    generate_checksum "$backup_file"
    verify_backup "$backup_file"
    cleanup_old_backups
    
    log_info "Backup process completed successfully"
    log_info "Backup file: $(basename "$backup_file")"
    log_info "Checksum file: $(basename "${backup_file}.sha256")"
    
    # Output backup verification command for operators
    echo
    echo "To verify this backup manually, run:"
    echo "LATEST_BACKUP=\$(ls -1 backups/dhash_${ENVIRONMENT}_*.zip | sort -r | head -n1)"
    echo "sha256sum -c \"\${LATEST_BACKUP}.sha256\""
  fi
}

# Execute main function
main "$@"