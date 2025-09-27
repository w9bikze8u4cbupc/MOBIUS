#!/bin/bash

# Migration script for dhash component
# Handles database/configuration migrations with rollback support

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
MIGRATION_TYPE="forward"

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
    --type)
      MIGRATION_TYPE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --dry-run           Simulate migration without making changes"
      echo "  --env ENVIRONMENT   Target environment (staging, production)"
      echo "  --type TYPE         Migration type (forward, rollback)"
      echo "  -h, --help          Show this help message"
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

# Validate migration parameters
validate_migration() {
  log_info "Validating migration parameters"
  
  if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    exit 1
  fi
  
  if [[ "$MIGRATION_TYPE" != "forward" && "$MIGRATION_TYPE" != "rollback" ]]; then
    log_error "Invalid migration type: $MIGRATION_TYPE"
    exit 1
  fi
  
  log_info "Migration validation passed"
}

# Check current migration state
check_migration_state() {
  local state_file="$PROJECT_ROOT/migrations/${ENVIRONMENT}_migration_state.json"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would check migration state from: $(basename "$state_file")"
    return 0
  fi
  
  # Create migrations directory if it doesn't exist
  mkdir -p "$PROJECT_ROOT/migrations"
  
  if [[ ! -f "$state_file" ]]; then
    log_info "Creating initial migration state file"
    cat > "$state_file" << EOF
{
  "environment": "$ENVIRONMENT",
  "current_version": "0.0.0",
  "last_migration": null,
  "migration_history": [],
  "created_at": "$TIMESTAMP"
}
EOF
  fi
  
  log_info "Migration state checked"
}

# Execute configuration migrations
migrate_configuration() {
  log_info "Executing configuration migrations"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would perform configuration migrations:"
    log_info "[DRY-RUN] - Update dhash component configurations"
    log_info "[DRY-RUN] - Migrate environment-specific settings"
    log_info "[DRY-RUN] - Update quality gate thresholds if needed"
    return 0
  fi
  
  # Create/update environment-specific configuration
  local config_dir="$PROJECT_ROOT/config/$ENVIRONMENT"
  mkdir -p "$config_dir"
  
  if [[ "$MIGRATION_TYPE" == "forward" ]]; then
    # Forward migration - apply new configurations
    log_info "Applying forward configuration migrations..."
    
    # Create or update dhash configuration
    cat > "$config_dir/dhash.json" << EOF
{
  "environment": "$ENVIRONMENT",
  "hash_algorithm": "sha256",
  "processing_timeout": 30000,
  "max_concurrent_processes": 4,
  "retry_attempts": 3,
  "monitoring": {
    "enabled": true,
    "interval_ms": 30000,
    "health_check_timeout": 5000
  },
  "quality_gates": {
    "health_failures": {
      "threshold": 2,
      "window_minutes": 5,
      "action": "auto-rollback"
    },
    "extraction_failure_rate": {
      "threshold": 5.0,
      "window_minutes": 10,
      "action": "auto-rollback"
    },
    "p95_hash_time": {
      "threshold": 2000,
      "window_minutes": 15,
      "action": "auto-rollback"
    },
    "low_confidence_queue": {
      "threshold": 1000,
      "action": "auto-rollback"
    }
  },
  "updated_at": "$TIMESTAMP"
}
EOF
    
    # Update environment-specific settings
    if [[ "$ENVIRONMENT" == "production" ]]; then
      # Production-specific overrides
      log_info "Applying production-specific configuration overrides..."
      # More conservative settings for production
      jq '.monitoring.interval_ms = 120000 | .quality_gates.health_failures.threshold = 1' \
        "$config_dir/dhash.json" > "$config_dir/dhash.json.tmp" && \
        mv "$config_dir/dhash.json.tmp" "$config_dir/dhash.json"
    fi
    
  elif [[ "$MIGRATION_TYPE" == "rollback" ]]; then
    # Rollback migration - restore previous configurations
    log_info "Applying rollback configuration migrations..."
    
    # Restore backup configuration if available
    local backup_config="$config_dir/dhash.json.backup"
    if [[ -f "$backup_config" ]]; then
      cp "$backup_config" "$config_dir/dhash.json"
      log_info "Configuration restored from backup"
    else
      log_warn "No backup configuration found, keeping current configuration"
    fi
  fi
}

# Migrate data structures
migrate_data() {
  log_info "Executing data migrations"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would perform data migrations:"
    log_info "[DRY-RUN] - Update data schemas if needed"
    log_info "[DRY-RUN] - Migrate hash storage format"
    log_info "[DRY-RUN] - Clean up legacy data structures"
    return 0
  fi
  
  # Create data directory structure
  local data_dir="$PROJECT_ROOT/data/$ENVIRONMENT"
  mkdir -p "$data_dir/hashes"
  mkdir -p "$data_dir/cache"
  mkdir -p "$data_dir/logs"
  
  if [[ "$MIGRATION_TYPE" == "forward" ]]; then
    log_info "Applying forward data migrations..."
    
    # Initialize hash storage
    if [[ ! -f "$data_dir/hash_index.json" ]]; then
      cat > "$data_dir/hash_index.json" << EOF
{
  "version": "1.0.0",
  "environment": "$ENVIRONMENT",
  "hashes": {},
  "metadata": {
    "created_at": "$TIMESTAMP",
    "last_updated": "$TIMESTAMP"
  }
}
EOF
    fi
    
    # Create cache directory with appropriate permissions
    chmod 755 "$data_dir/cache"
    
  elif [[ "$MIGRATION_TYPE" == "rollback" ]]; then
    log_info "Applying rollback data migrations..."
    
    # Archive current data before rollback
    local archive_dir="$data_dir/rollback_archive_$TIMESTAMP"
    mkdir -p "$archive_dir"
    
    if [[ -f "$data_dir/hash_index.json" ]]; then
      cp "$data_dir/hash_index.json" "$archive_dir/"
    fi
    
    log_info "Current data archived for rollback"
  fi
}

# Update migration state
update_migration_state() {
  local state_file="$PROJECT_ROOT/migrations/${ENVIRONMENT}_migration_state.json"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would update migration state in: $(basename "$state_file")"
    return 0
  fi
  
  local current_version="1.0.0"  # This would normally come from package.json or similar
  
  # Update migration state
  local temp_file
  temp_file=$(mktemp)
  
  jq --arg timestamp "$TIMESTAMP" \
     --arg migration_type "$MIGRATION_TYPE" \
     --arg version "$current_version" \
     '.last_migration = $timestamp | 
      .migration_history += [{
        "timestamp": $timestamp,
        "type": $migration_type,
        "version": $version
      }] | 
      .current_version = $version | 
      .updated_at = $timestamp' \
     "$state_file" > "$temp_file" && mv "$temp_file" "$state_file"
  
  log_info "Migration state updated"
}

# Run post-migration validation
validate_migration_success() {
  log_info "Validating migration success"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would validate migration success:"
    log_info "[DRY-RUN] - Check configuration file integrity"
    log_info "[DRY-RUN] - Verify data structure consistency"
    log_info "[DRY-RUN] - Test dhash component functionality"
    return 0
  fi
  
  # Check configuration file exists and is valid JSON
  local config_file="$PROJECT_ROOT/config/$ENVIRONMENT/dhash.json"
  if [[ -f "$config_file" ]]; then
    if jq . "$config_file" > /dev/null 2>&1; then
      log_info "Configuration file validation passed"
    else
      log_error "Configuration file validation failed - invalid JSON"
      exit 1
    fi
  else
    log_error "Configuration file not found: $config_file"
    exit 1
  fi
  
  # Check data directory structure
  local data_dir="$PROJECT_ROOT/data/$ENVIRONMENT"
  if [[ -d "$data_dir" && -f "$data_dir/hash_index.json" ]]; then
    log_info "Data structure validation passed"
  else
    log_error "Data structure validation failed"
    exit 1
  fi
  
  log_info "Migration validation completed successfully"
}

# Main migration process
main() {
  log_info "Starting dhash migration process"
  log_info "Environment: $ENVIRONMENT"
  log_info "Migration type: $MIGRATION_TYPE"
  log_info "Dry run: $DRY_RUN"
  
  validate_migration
  check_migration_state
  migrate_configuration
  migrate_data
  update_migration_state
  validate_migration_success
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "Migration dry run completed successfully"
  else
    log_info "Migration process completed successfully"
    
    # Send migration notification
    if [[ -f "$SCRIPT_DIR/notify.js" ]]; then
      node "$SCRIPT_DIR/notify.js" \
        --type migration \
        --env "$ENVIRONMENT" \
        --message "dhash $MIGRATION_TYPE migration completed successfully" \
        --timestamp "$TIMESTAMP"
    fi
  fi
}

# Execute main function
main "$@"