#!/bin/bash
# dhash Backup Script with SHA256 verification
# Usage: ./scripts/backup_dhash.sh [--dry-run] [--env ENV] [--output-dir DIR]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_BACKUP_DIR="${PROJECT_ROOT}/backups"

# Default values
DRY_RUN=false
ENVIRONMENT="production"
BACKUP_DIR="${DEFAULT_BACKUP_DIR}"
VERBOSE=false

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
    --output-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--env ENV] [--output-dir DIR] [--verbose]"
      echo ""
      echo "Options:"
      echo "  --dry-run      Show what would be backed up without executing"
      echo "  --env ENV      Target environment (default: production)"
      echo "  --output-dir   Backup output directory (default: ${DEFAULT_BACKUP_DIR})"
      echo "  --verbose      Enable verbose output"
      echo "  --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

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

# Generate backup filename with timestamp
generate_backup_filename() {
  local timestamp=$(date +%Y%m%d_%H%M%S)
  echo "dhash_${ENVIRONMENT}_${timestamp}.zip"
}

# Create backup directory if it doesn't exist
ensure_backup_dir() {
  local dir="$1"
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would create backup directory: ${dir}"
    return 0
  fi
  
  if [[ ! -d "${dir}" ]]; then
    log "Creating backup directory: ${dir}"
    mkdir -p "${dir}"
  fi
}

# Backup dhash configuration and data
backup_dhash_data() {
  local backup_file="$1"
  local temp_dir
  
  # Create temporary directory for staging backup contents
  temp_dir=$(mktemp -d)
  trap "rm -rf '${temp_dir}'" EXIT
  
  log_verbose "Using temporary directory: ${temp_dir}"
  
  # Files and directories to backup (adjust based on actual dhash structure)
  local backup_items=(
    "src/dhash/"
    "config/dhash/"
    "data/dhash/"
    ".env.dhash"
    "package.json"
    "package-lock.json"
  )
  
  # Stage backup files
  log "Staging backup files..."
  local staged_count=0
  
  for item in "${backup_items[@]}"; do
    local full_path="${PROJECT_ROOT}/${item}"
    
    if [[ -f "${full_path}" ]] || [[ -d "${full_path}" ]]; then
      if [[ "${DRY_RUN}" == "true" ]]; then
        log "DRY-RUN: Would backup: ${item}"
      else
        log_verbose "Copying ${item} to staging area"
        mkdir -p "$(dirname "${temp_dir}/${item}")"
        cp -r "${full_path}" "${temp_dir}/${item}"
      fi
      ((staged_count++))
    else
      log_verbose "Skipping missing item: ${item}"
    fi
  done
  
  if [[ "${staged_count}" -eq 0 ]]; then
    log_error "No backup items found to include in backup"
    return 1
  fi
  
  # Create backup archive
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would create backup archive: ${backup_file}"
    log "DRY-RUN: Backup would contain ${staged_count} items"
  else
    log "Creating backup archive: ${backup_file}"
    (cd "${temp_dir}" && zip -r "${backup_file}" . -x "*.tmp" "*.log~" "node_modules/*")
    
    if [[ ! -f "${backup_file}" ]]; then
      log_error "Failed to create backup archive"
      return 1
    fi
    
    local backup_size=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null || echo "unknown")
    log "Backup created successfully (size: ${backup_size} bytes)"
  fi
  
  return 0
}

# Generate and verify SHA256 checksum
generate_sha256() {
  local backup_file="$1"
  local sha256_file="${backup_file}.sha256"
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would generate SHA256 checksum: ${sha256_file}"
    return 0
  fi
  
  log "Generating SHA256 checksum..."
  
  # Use appropriate sha256 command based on OS
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "${backup_file}")" && sha256sum "$(basename "${backup_file}")" > "${sha256_file}")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$(dirname "${backup_file}")" && shasum -a 256 "$(basename "${backup_file}")" > "${sha256_file}")
  else
    log_error "Neither sha256sum nor shasum found. Cannot generate checksum."
    return 1
  fi
  
  # Verify checksum was created
  if [[ -f "${sha256_file}" ]]; then
    log "SHA256 checksum generated: ${sha256_file}"
    log_verbose "Checksum content: $(cat "${sha256_file}")"
    
    # Verify the checksum immediately
    if command -v sha256sum >/dev/null 2>&1; then
      if (cd "$(dirname "${backup_file}")" && sha256sum -c "${sha256_file}" >/dev/null 2>&1); then
        log "SHA256 verification successful"
      else
        log_error "SHA256 verification failed"
        return 1
      fi
    fi
  else
    log_error "Failed to generate SHA256 checksum file"
    return 1
  fi
  
  return 0
}

# Main backup function
main() {
  log "Starting dhash backup process..."
  log "Environment: ${ENVIRONMENT}"
  log "Backup directory: ${BACKUP_DIR}"
  log "Dry run mode: ${DRY_RUN}"
  
  # Ensure backup directory exists
  ensure_backup_dir "${BACKUP_DIR}"
  
  # Generate backup filename
  local backup_filename
  backup_filename=$(generate_backup_filename)
  local backup_path="${BACKUP_DIR}/${backup_filename}"
  
  log "Backup file: ${backup_filename}"
  
  # Create backup
  if backup_dhash_data "${backup_path}"; then
    log "Backup data collection completed successfully"
  else
    log_error "Backup data collection failed"
    exit 1
  fi
  
  # Generate SHA256 checksum
  if generate_sha256 "${backup_path}"; then
    log "SHA256 checksum generation completed successfully"
  else
    log_error "SHA256 checksum generation failed"
    exit 1
  fi
  
  # Final verification command for operators
  if [[ "${DRY_RUN}" == "false" ]]; then
    log ""
    log "Backup completed successfully!"
    log "To verify backup integrity, run:"
    log "  cd ${BACKUP_DIR}"
    log "  sha256sum -c ${backup_filename}.sha256"
    log ""
    log "Backup files:"
    log "  ${backup_path}"
    log "  ${backup_path}.sha256"
  else
    log ""
    log "DRY-RUN completed successfully!"
    log "No actual backup files were created."
  fi
}

# Execute main function
main "$@"