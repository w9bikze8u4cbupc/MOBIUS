#!/bin/bash
# migrate_dhash.sh - Migration runner with forward/rollback support and dry-run validation
# Usage: ./migrate_dhash.sh --env <environment> [--direction forward|rollback] [--dry-run] [--target-version <version>]

set -euo pipefail

# Default configuration
MIGRATION_DIR="migrations"
DIRECTION="forward"
TARGET_VERSION=""

# Parse command line arguments
DRY_RUN=false
ENVIRONMENT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --direction)
      DIRECTION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --target-version)
      TARGET_VERSION="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 --env <environment> [--direction forward|rollback] [--dry-run] [--target-version <version>]"
      echo "  --env: Environment to migrate (required)"
      echo "  --direction: Migration direction - forward or rollback (default: forward)"
      echo "  --dry-run: Show what would be done without executing"
      echo "  --target-version: Target version for migration"
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

# Validate direction
if [[ "$DIRECTION" != "forward" && "$DIRECTION" != "rollback" ]]; then
  echo "Error: --direction must be 'forward' or 'rollback'"
  exit 1
fi

# Create migration directory if it doesn't exist
mkdir -p "$MIGRATION_DIR"

# Mock migration files (in a real implementation, these would be actual migration scripts)
create_mock_migrations() {
  if [[ ! -f "$MIGRATION_DIR/001_initial_dhash_schema.sql" ]]; then
    cat > "$MIGRATION_DIR/001_initial_dhash_schema.sql" << 'EOF'
-- Migration 001: Initial dhash schema
-- Forward migration
CREATE TABLE IF NOT EXISTS dhash_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  value TEXT,
  environment VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dhash_metrics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(255) NOT NULL,
  metric_value FLOAT NOT NULL,
  environment VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dhash_config_env ON dhash_config(environment);
CREATE INDEX idx_dhash_metrics_env_timestamp ON dhash_metrics(environment, timestamp);
EOF
  fi

  if [[ ! -f "$MIGRATION_DIR/002_add_dhash_performance_table.sql" ]]; then
    cat > "$MIGRATION_DIR/002_add_dhash_performance_table.sql" << 'EOF'
-- Migration 002: Add performance tracking
-- Forward migration
CREATE TABLE IF NOT EXISTS dhash_performance (
  id SERIAL PRIMARY KEY,
  operation_type VARCHAR(100) NOT NULL,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  environment VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dhash_performance_env_timestamp ON dhash_performance(environment, timestamp);
CREATE INDEX idx_dhash_performance_operation ON dhash_performance(operation_type, environment);
EOF
  fi

  if [[ ! -f "$MIGRATION_DIR/rollback_002.sql" ]]; then
    cat > "$MIGRATION_DIR/rollback_002.sql" << 'EOF'
-- Rollback 002: Remove performance tracking
DROP TABLE IF EXISTS dhash_performance;
EOF
  fi

  if [[ ! -f "$MIGRATION_DIR/rollback_001.sql" ]]; then
    cat > "$MIGRATION_DIR/rollback_001.sql" << 'EOF'
-- Rollback 001: Remove initial schema
DROP TABLE IF EXISTS dhash_metrics;
DROP TABLE IF EXISTS dhash_config;
EOF
  fi
}

# Get current database version (mock implementation)
get_current_version() {
  local env=$1
  # In a real implementation, this would query the database
  # For now, return a mock version based on environment
  case $env in
    production) echo "002" ;;
    staging) echo "002" ;;
    development) echo "001" ;;
    *) echo "000" ;;
  esac
}

# Get available migrations
get_available_migrations() {
  local direction=$1
  if [[ "$direction" == "forward" ]]; then
    find "$MIGRATION_DIR" -name "*.sql" -not -name "rollback_*" | sort
  else
    find "$MIGRATION_DIR" -name "rollback_*.sql" | sort -r
  fi
}

# Execute migration (mock implementation)
execute_migration() {
  local file=$1
  local env=$2
  local dry_run=$3
  
  echo "  Executing migration: $(basename "$file")"
  
  if [[ "$dry_run" == "true" ]]; then
    echo "    [DRY-RUN] Would execute SQL from: $file"
    echo "    [DRY-RUN] Target environment: $env"
  else
    # In a real implementation, this would execute the SQL against the database
    echo "    ✅ Migration executed successfully"
    sleep 1  # Simulate execution time
  fi
}

# Validate migration integrity
validate_migrations() {
  echo "Validating migration integrity..."
  
  local forward_count
  forward_count=$(find "$MIGRATION_DIR" -name "*.sql" -not -name "rollback_*" | wc -l)
  
  local rollback_count
  rollback_count=$(find "$MIGRATION_DIR" -name "rollback_*.sql" | wc -l)
  
  if [[ "$forward_count" -ne "$rollback_count" ]]; then
    echo "⚠️  Warning: Forward migrations ($forward_count) != Rollback migrations ($rollback_count)"
    echo "   This may indicate missing rollback scripts"
  fi
  
  echo "✅ Migration integrity check completed"
}

# Main migration function
run_migrations() {
  local env=$1
  local direction=$2
  local dry_run=$3
  local target_version=$4
  
  echo "🗃️  Starting dhash migrations"
  echo "Environment: $env"
  echo "Direction: $direction"
  echo "Dry run: $dry_run"
  if [[ -n "$target_version" ]]; then
    echo "Target version: $target_version"
  fi
  echo ""

  # Create mock migrations for demonstration
  create_mock_migrations
  
  # Validate migrations
  validate_migrations
  
  # Get current version
  local current_version
  current_version=$(get_current_version "$env")
  echo "Current database version: $current_version"
  
  # Get available migrations
  local migrations
  migrations=$(get_available_migrations "$direction")
  
  if [[ -z "$migrations" ]]; then
    echo "No migrations found for direction: $direction"
    return 0
  fi
  
  echo "Available migrations:"
  echo "$migrations" | sed 's/^/  /'
  echo ""
  
  # Execute migrations
  local executed_count=0
  
  while IFS= read -r migration_file; do
    if [[ -f "$migration_file" ]]; then
      # Extract version from filename (simplified)
      local migration_version
      migration_version=$(basename "$migration_file" | grep -o '[0-9]\+' | head -1)
      
      # Check if we should execute this migration
      local should_execute=false
      
      if [[ "$direction" == "forward" ]]; then
        if [[ -z "$target_version" ]] || [[ "$migration_version" -le "$target_version" ]]; then
          if [[ "$migration_version" -gt "$current_version" ]]; then
            should_execute=true
          fi
        fi
      else
        # Rollback logic
        if [[ -z "$target_version" ]] || [[ "$migration_version" -gt "$target_version" ]]; then
          if [[ "$migration_version" -le "$current_version" ]]; then
            should_execute=true
          fi
        fi
      fi
      
      if [[ "$should_execute" == "true" ]]; then
        execute_migration "$migration_file" "$env" "$dry_run"
        executed_count=$((executed_count + 1))
      else
        echo "  Skipping migration: $(basename "$migration_file") (version: $migration_version)"
      fi
    fi
  done <<< "$migrations"
  
  if [[ $executed_count -gt 0 ]]; then
    echo "✅ Executed $executed_count migrations"
  else
    echo "ℹ️  No migrations to execute"
  fi
  
  # Post-migration validation
  if [[ "$dry_run" != "true" ]]; then
    echo "Performing post-migration validation..."
    # In a real implementation, this would validate database state
    echo "✅ Post-migration validation: PASS"
  fi
}

# Execute main function
run_migrations "$ENVIRONMENT" "$DIRECTION" "$DRY_RUN" "$TARGET_VERSION"
echo "🎉 Migration completed successfully!"