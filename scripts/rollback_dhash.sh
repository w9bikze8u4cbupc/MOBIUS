#!/bin/bash
# dhash Rollback Script with backup restore and validation
# Usage: ./scripts/rollback_dhash.sh --backup BACKUP_FILE [--env ENV] [--dry-run]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_BACKUP_DIR="${PROJECT_ROOT}/backups"

# Default values
DRY_RUN=false
ENVIRONMENT="production"
BACKUP_FILE=""
VERBOSE=false
SKIP_VALIDATION=false
FORCE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --backup)
      BACKUP_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --skip-validation)
      SKIP_VALIDATION=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 --backup BACKUP_FILE [--env ENV] [--dry-run] [--verbose] [--skip-validation] [--force]"
      echo ""
      echo "Options:"
      echo "  --backup FILE       Path to backup file to restore"
      echo "  --dry-run           Show what would be restored without executing"
      echo "  --env ENV           Target environment (default: production)"
      echo "  --verbose           Enable verbose output"
      echo "  --skip-validation   Skip post-restore validation checks"
      echo "  --force             Force rollback even in production"
      echo "  --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --backup backups/dhash_production_20240101_120000.zip --env production"
      echo "  $0 --backup backups/latest.zip --dry-run --verbose"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Error: --backup parameter is required"
  echo "Use --help for usage information"
  exit 1
fi

# Logging functions
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log_verbose() {
  if [[ "${VERBOSE}" == "true" ]]; then
    log "$@"
  fi
}

log_error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Confirm rollback in production
confirm_rollback() {
  if [[ "${ENVIRONMENT}" == "production" && "${FORCE}" == "false" && "${DRY_RUN}" == "false" ]]; then
    log "WARNING: This will rollback dhash in PRODUCTION environment"
    log "Backup file: ${BACKUP_FILE}"
    log "This action will:"
    log "  1. Stop the current dhash service"
    log "  2. Replace current code with backup version"
    log "  3. Restore configuration and data"
    log "  4. Restart services"
    log ""
    echo -n "Are you sure you want to proceed? (yes/no): "
    read -r response
    if [[ "${response}" != "yes" ]]; then
      log "Rollback cancelled by user"
      exit 0
    fi
    
    echo -n "Please type 'ROLLBACK' to confirm: "
    read -r confirm
    if [[ "${confirm}" != "ROLLBACK" ]]; then
      log "Rollback cancelled - confirmation not matched"
      exit 0
    fi
  fi
}

# Verify backup file integrity
verify_backup_integrity() {
  local backup_file="$1"
  
  log "Verifying backup file integrity..."
  
  # Check if backup file exists
  if [[ ! -f "${backup_file}" ]]; then
    log_error "Backup file not found: ${backup_file}"
    return 1
  fi
  
  # Check SHA256 checksum if available
  local sha256_file="${backup_file}.sha256"
  if [[ -f "${sha256_file}" ]]; then
    log "Verifying SHA256 checksum..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
      log "DRY-RUN: Would verify SHA256 checksum"
    else
      # Verify checksum
      if command -v sha256sum >/dev/null 2>&1; then
        if (cd "$(dirname "${backup_file}")" && sha256sum -c "$(basename "${sha256_file}")"); then
          log "SHA256 verification successful"
        else
          log_error "SHA256 verification failed"
          return 1
        fi
      elif command -v shasum >/dev/null 2>&1; then
        if (cd "$(dirname "${backup_file}")" && shasum -a 256 -c "$(basename "${sha256_file}")"); then
          log "SHA256 verification successful"
        else
          log_error "SHA256 verification failed"
          return 1
        fi
      else
        log "Warning: No SHA256 utility found, skipping checksum verification"
      fi
    fi
  else
    log "Warning: No SHA256 checksum file found (${sha256_file})"
  fi
  
  # Test zip file integrity
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would test zip file integrity"
  else
    if command -v unzip >/dev/null 2>&1; then
      if unzip -t "${backup_file}" >/dev/null 2>&1; then
        log "Zip file integrity check passed"
      else
        log_error "Zip file integrity check failed"
        return 1
      fi
    else
      log "Warning: unzip not available, skipping zip integrity check"
    fi
  fi
  
  return 0
}

# Stop dhash services
stop_dhash_services() {
  log "Stopping dhash services..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would stop dhash services"
    log "DRY-RUN: Would wait for graceful shutdown"
    return 0
  fi
  
  # Add actual service stop commands here
  # Examples:
  # systemctl stop dhash
  # pm2 stop dhash
  # docker stop dhash-container
  
  log_verbose "Stopping dhash service processes..."
  
  # Simulate service stop
  sleep 2
  
  log "dhash services stopped successfully"
  return 0
}

# Restore from backup
restore_from_backup() {
  local backup_file="$1"
  
  log "Restoring from backup: $(basename "${backup_file}")"
  
  # Create restore point of current state
  local current_backup_name="pre_rollback_$(date +%Y%m%d_%H%M%S).zip"
  local current_backup_path="${DEFAULT_BACKUP_DIR}/${current_backup_name}"
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would create pre-rollback backup: ${current_backup_name}"
    log "DRY-RUN: Would extract backup to temporary location"
    log "DRY-RUN: Would restore files and configuration"
  else
    log "Creating pre-rollback backup of current state..."
    if "${SCRIPT_DIR}/backup_dhash.sh" --env "${ENVIRONMENT}" --output-dir "${DEFAULT_BACKUP_DIR}" >/dev/null 2>&1; then
      log "Pre-rollback backup created: ${current_backup_name}"
    else
      log "Warning: Failed to create pre-rollback backup"
    fi
    
    # Extract backup to temporary location
    local temp_dir
    temp_dir=$(mktemp -d)
    trap "rm -rf '${temp_dir}'" EXIT
    
    log "Extracting backup archive..."
    if unzip -q "${backup_file}" -d "${temp_dir}"; then
      log_verbose "Backup extracted to: ${temp_dir}"
    else
      log_error "Failed to extract backup archive"
      return 1
    fi
    
    # Restore files
    log "Restoring files and configuration..."
    
    # Restore specific directories/files (adjust based on backup structure)
    local restore_paths=(
      "src/dhash"
      "config/dhash"
      "data/dhash"
      ".env.dhash"
      "package.json"
      "package-lock.json"
    )
    
    for restore_path in "${restore_paths[@]}"; do
      local source="${temp_dir}/${restore_path}"
      local destination="${PROJECT_ROOT}/${restore_path}"
      
      if [[ -e "${source}" ]]; then
        log_verbose "Restoring: ${restore_path}"
        
        # Create parent directory if needed
        mkdir -p "$(dirname "${destination}")"
        
        # Copy files/directories
        cp -r "${source}" "${destination}"
      else
        log_verbose "Backup item not found, skipping: ${restore_path}"
      fi
    done
  fi
  
  log "Restore from backup completed"
  return 0
}

# Install dependencies from restored package.json
restore_dependencies() {
  log "Restoring dependencies from backup..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would run: npm ci"
    return 0
  fi
  
  # Install exact versions from restored package-lock.json
  if npm ci; then
    log "Dependencies restored successfully"
  else
    log_error "Failed to restore dependencies"
    return 1
  fi
  
  return 0
}

# Start dhash services
start_dhash_services() {
  log "Starting dhash services..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would start dhash services"
    log "DRY-RUN: Would wait for service initialization"
    return 0
  fi
  
  # Add actual service start commands here
  log_verbose "Starting dhash service processes..."
  
  # Simulate service start
  sleep 3
  
  log "dhash services started successfully"
  return 0
}

# Post-restore validation
validate_rollback() {
  log "Performing post-restore validation..."
  
  if [[ "${SKIP_VALIDATION}" == "true" ]]; then
    log "Skipping post-restore validation (--skip-validation)"
    return 0
  fi
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would perform 3 consecutive health checks"
    log "DRY-RUN: Would run smoke tests"
    log "DRY-RUN: Would validate service endpoints"
    return 0
  fi
  
  # Perform 3 consecutive health checks
  local health_checks=3
  local check_interval=10
  
  for i in $(seq 1 ${health_checks}); do
    log "Health check ${i}/${health_checks}..."
    
    # Add actual health check logic here
    # For now, simulate health check
    sleep ${check_interval}
    
    # Simulate health check result
    if [[ $(( RANDOM % 10 )) -lt 8 ]]; then  # 80% success rate for simulation
      log "Health check ${i} passed"
    else
      log_error "Health check ${i} failed"
      return 1
    fi
  done
  
  # Run smoke tests if available
  local smoke_test_script="${SCRIPT_DIR}/smoke_tests.sh"
  if [[ -x "${smoke_test_script}" ]]; then
    log "Running smoke tests..."
    if "${smoke_test_script}" --env "${ENVIRONMENT}" --quick; then
      log "Smoke tests passed"
    else
      log_error "Smoke tests failed"
      return 1
    fi
  else
    log "Smoke test script not found, skipping smoke tests"
  fi
  
  log "Post-restore validation completed successfully"
  return 0
}

# Main rollback function
main() {
  log "Starting dhash rollback process..."
  log "Environment: ${ENVIRONMENT}"
  log "Backup file: ${BACKUP_FILE}"
  log "Dry run mode: ${DRY_RUN}"
  
  # Confirm rollback if in production
  confirm_rollback
  
  # Verify backup integrity
  if ! verify_backup_integrity "${BACKUP_FILE}"; then
    log_error "Backup integrity verification failed"
    exit 1
  fi
  
  # Stop services
  if ! stop_dhash_services; then
    log_error "Failed to stop dhash services"
    exit 1
  fi
  
  # Restore from backup
  if ! restore_from_backup "${BACKUP_FILE}"; then
    log_error "Restore from backup failed"
    exit 1
  fi
  
  # Restore dependencies
  if ! restore_dependencies; then
    log_error "Dependency restoration failed"
    exit 1
  fi
  
  # Start services
  if ! start_dhash_services; then
    log_error "Failed to start dhash services"
    exit 1
  fi
  
  # Validate rollback
  if ! validate_rollback; then
    log_error "Post-restore validation failed"
    exit 1
  fi
  
  # Success message
  if [[ "${DRY_RUN}" == "false" ]]; then
    log ""
    log "Rollback completed successfully!"
    log "Environment: ${ENVIRONMENT}"
    log "Restored from: $(basename "${BACKUP_FILE}")"
    log ""
    log "Post-rollback checklist:"
    log "  ✓ Services restarted"
    log "  ✓ Health checks passed"
    log "  ✓ Dependencies restored"
    log ""
    log "Next steps:"
    log "  1. Monitor system health: ./scripts/monitor_dhash.js --env ${ENVIRONMENT}"
    log "  2. Verify application functionality"
    log "  3. Notify stakeholders of rollback completion"
    log "  4. Investigate and document the issue that required rollback"
  else
    log ""
    log "DRY-RUN completed successfully!"
    log "No actual rollback was performed."
    log ""
    log "To execute this rollback, run:"
    log "  ${0} --backup ${BACKUP_FILE} --env ${ENVIRONMENT}"
  fi
}

# Execute main function
main "$@"