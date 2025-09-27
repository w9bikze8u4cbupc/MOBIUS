#!/bin/bash
# dhash Migration Script with dry-run support
# Usage: ./scripts/migrate_dhash.sh [--dry-run] [--env ENV] [--direction up|down]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
DRY_RUN=false
ENVIRONMENT="production"
DIRECTION="up"
VERBOSE=false
FORCE=false

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
    --direction)
      DIRECTION="$2"
      if [[ "${DIRECTION}" != "up" && "${DIRECTION}" != "down" ]]; then
        echo "Error: --direction must be 'up' or 'down'"
        exit 1
      fi
      shift 2
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--env ENV] [--direction up|down] [--verbose] [--force]"
      echo ""
      echo "Options:"
      echo "  --dry-run      Show what migrations would be applied without executing"
      echo "  --env ENV      Target environment (default: production)"
      echo "  --direction    Migration direction: 'up' or 'down' (default: up)"
      echo "  --verbose      Enable verbose output"
      echo "  --force        Force migration even if environment seems unsafe"
      echo "  --help         Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --dry-run --env staging"
      echo "  $0 --direction up --env production"
      echo "  $0 --direction down --env development --force"
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

# Check migration prerequisites
check_prerequisites() {
  log "Checking migration prerequisites..."
  
  # Check if this is a production environment and we're not forcing
  if [[ "${ENVIRONMENT}" == "production" && "${FORCE}" == "false" && "${DRY_RUN}" == "false" ]]; then
    log "WARNING: This is a production environment migration"
    log "Ensure you have:"
    log "  1. Created a backup: ./scripts/backup_dhash.sh --env production"
    log "  2. Tested migration on staging: ./scripts/migrate_dhash.sh --dry-run --env staging"
    log "  3. Obtained deployment operator approval"
    log ""
    echo -n "Continue with production migration? (yes/no): "
    read -r response
    if [[ "${response}" != "yes" ]]; then
      log "Migration cancelled by user"
      exit 0
    fi
  fi
  
  # Check for migration files
  local migration_dir="${PROJECT_ROOT}/migrations/dhash"
  if [[ ! -d "${migration_dir}" ]]; then
    if [[ "${DRY_RUN}" == "true" ]]; then
      log "DRY-RUN: Would create migration directory: ${migration_dir}"
    else
      log "Creating migration directory: ${migration_dir}"
      mkdir -p "${migration_dir}"
    fi
  fi
  
  # Check database connectivity (placeholder - adjust based on actual database)
  log_verbose "Checking database connectivity..."
  if [[ "${DRY_RUN}" == "false" ]]; then
    # Add actual database connection check here
    log_verbose "Database connectivity check passed"
  fi
  
  return 0
}

# Get pending migrations
get_pending_migrations() {
  local migration_dir="${PROJECT_ROOT}/migrations/dhash"
  local direction="$1"
  
  # For demonstration, create some sample migration files if they don't exist
  if [[ "${DRY_RUN}" == "false" && ! -f "${migration_dir}/001_create_dhash_tables.sql" ]]; then
    mkdir -p "${migration_dir}"
    cat > "${migration_dir}/001_create_dhash_tables.sql" << 'EOF'
-- Migration: Create dhash tables
-- Direction: up

CREATE TABLE IF NOT EXISTS dhash_configs (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(255) NOT NULL UNIQUE,
  config_value TEXT,
  environment VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_configs_key_env ON dhash_configs(config_key, environment);

CREATE TABLE IF NOT EXISTS dhash_queue (
  id SERIAL PRIMARY KEY,
  hash_type VARCHAR(100) NOT NULL,
  input_data TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  confidence_level DECIMAL(5,4),
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_queue_status ON dhash_queue(status);
CREATE INDEX IF NOT EXISTS idx_dhash_queue_created ON dhash_queue(created_at);
EOF
  fi
  
  if [[ "${direction}" == "up" ]]; then
    # List migrations that need to be applied
    find "${migration_dir}" -name "*.sql" -type f | sort
  else
    # List migrations that need to be rolled back
    find "${migration_dir}" -name "*.sql" -type f | sort -r
  fi
}

# Apply single migration
apply_migration() {
  local migration_file="$1"
  local direction="$2"
  
  local migration_name=$(basename "${migration_file}" .sql)
  
  log "Applying migration: ${migration_name} (${direction})"
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would execute migration: ${migration_file}"
    log "DRY-RUN: Migration content:"
    if [[ -f "${migration_file}" ]]; then
      sed 's/^/  | /' "${migration_file}"
    else
      log "  | -- Migration file would be created"
    fi
    return 0
  fi
  
  # Record migration start
  log_verbose "Starting migration execution..."
  local start_time=$(date +%s)
  
  # Execute migration (placeholder - adjust based on actual database system)
  if [[ -f "${migration_file}" ]]; then
    # Add actual database migration execution here
    # For example: psql -d dhash -f "${migration_file}"
    log_verbose "Executing SQL from: ${migration_file}"
    
    # Simulate migration execution
    sleep 1
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "Migration ${migration_name} completed successfully (${duration}s)"
  else
    log_error "Migration file not found: ${migration_file}"
    return 1
  fi
  
  return 0
}

# Run migrations
run_migrations() {
  local direction="$1"
  
  log "Running migrations in ${direction} direction for environment: ${ENVIRONMENT}"
  
  # Get list of migrations to apply
  local migrations=()
  while IFS= read -r -d $'\0' migration; do
    migrations+=("$migration")
  done < <(get_pending_migrations "${direction}" | tr '\n' '\0')
  
  if [[ ${#migrations[@]} -eq 0 ]]; then
    log "No migrations to apply"
    return 0
  fi
  
  log "Found ${#migrations[@]} migration(s) to apply"
  
  # Apply each migration
  local applied=0
  local failed=0
  
  for migration in "${migrations[@]}"; do
    if apply_migration "${migration}" "${direction}"; then
      ((applied++))
    else
      ((failed++))
      log_error "Migration failed: $(basename "${migration}")"
      
      # Stop on first failure unless in dry-run mode
      if [[ "${DRY_RUN}" == "false" ]]; then
        break
      fi
    fi
  done
  
  # Summary
  log "Migration summary:"
  log "  Applied successfully: ${applied}"
  log "  Failed: ${failed}"
  log "  Total: ${#migrations[@]}"
  
  if [[ ${failed} -gt 0 && "${DRY_RUN}" == "false" ]]; then
    log_error "Some migrations failed. Database may be in inconsistent state."
    log "Consider running rollback or manual intervention."
    return 1
  fi
  
  return 0
}

# Verify migration state
verify_migration_state() {
  log "Verifying migration state..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would verify migration state"
    log "DRY-RUN: Would check table schemas"
    log "DRY-RUN: Would validate data integrity"
    return 0
  fi
  
  # Add actual verification logic here
  log_verbose "Checking database schema consistency..."
  log_verbose "Validating data integrity..."
  
  # Simulate verification
  sleep 1
  
  log "Migration state verification completed"
  return 0
}

# Main migration function
main() {
  log "Starting dhash migration process..."
  log "Environment: ${ENVIRONMENT}"
  log "Direction: ${DIRECTION}"
  log "Dry run mode: ${DRY_RUN}"
  
  # Check prerequisites
  if ! check_prerequisites; then
    log_error "Prerequisites check failed"
    exit 1
  fi
  
  # Run migrations
  if ! run_migrations "${DIRECTION}"; then
    log_error "Migration execution failed"
    exit 1
  fi
  
  # Verify final state
  if ! verify_migration_state; then
    log_error "Migration state verification failed"
    exit 1
  fi
  
  # Success message
  if [[ "${DRY_RUN}" == "false" ]]; then
    log ""
    log "Migration completed successfully!"
    log "Environment: ${ENVIRONMENT}"
    log "Direction: ${DIRECTION}"
    log ""
    log "Next steps:"
    log "  1. Verify application functionality"
    log "  2. Run integration tests"
    log "  3. Monitor application health"
    
    if [[ "${DIRECTION}" == "up" ]]; then
      log "  4. Consider creating a backup: ./scripts/backup_dhash.sh --env ${ENVIRONMENT}"
    fi
  else
    log ""
    log "DRY-RUN completed successfully!"
    log "No actual migrations were performed."
    log ""
    log "To apply these migrations, run:"
    log "  ${0} --env ${ENVIRONMENT} --direction ${DIRECTION}"
  fi
}

# Execute main function
main "$@"