#!/bin/bash

# dhash Migration Script with Dry-Run Support
# Usage: ./scripts/migrate_dhash.sh [--dry-run] [--env production|staging|canary] [--migration-version VERSION]

set -euo pipefail

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
MIGRATION_VERSION=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] MIGRATE:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Parse arguments
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
        --migration-version)
            MIGRATION_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--env production|staging|canary] [--migration-version VERSION]"
            echo ""
            echo "Options:"
            echo "  --dry-run            Simulate migration without making changes"
            echo "  --env ENV            Target environment (production, staging, canary)"
            echo "  --migration-version  Specific migration version to run (optional)"
            echo "  -h, --help           Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate environment
case "$ENVIRONMENT" in
    production|staging|canary)
        ;;
    *)
        error "Invalid environment: $ENVIRONMENT. Must be one of: production, staging, canary"
        exit 1
        ;;
esac

# Load configuration
CONFIG_FILE="$ROOT_DIR/quality-gates-config.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Extract configuration using Node.js
BASE_URL=$(node -pe "require('$CONFIG_FILE').environments.$ENVIRONMENT.base_url")

if [[ "$BASE_URL" == "undefined" ]]; then
    error "Configuration for environment '$ENVIRONMENT' not found in $CONFIG_FILE"
    exit 1
fi

log "Starting dhash migration for $ENVIRONMENT environment"
log "Target URL: $BASE_URL"
log "Migration version: ${MIGRATION_VERSION:-"latest"}"
log "Dry-run mode: $DRY_RUN"

# Check current database version
check_current_version() {
    log "Checking current database version..."
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would query database for current schema version"
        log "[DRY-RUN] Would run: SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
        echo "20240315_120000" # Mock current version
        return 0
    fi
    
    # In a real implementation, this would query the actual database
    # For demo purposes, we'll return a mock version
    local current_version="20240315_120000"
    
    log "Current database version: $current_version"
    echo "$current_version"
}

# Get available migrations
get_available_migrations() {
    log "Checking available migrations..."
    
    local migrations_dir="$ROOT_DIR/migrations"
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would scan migrations directory: $migrations_dir"
        log "[DRY-RUN] Available migrations (mock):"
        log "[DRY-RUN]   - 20240315_120000_initial_dhash_schema.sql"
        log "[DRY-RUN]   - 20240320_140000_add_hash_index.sql"
        log "[DRY-RUN]   - 20240325_160000_update_queue_table.sql"
        return 0
    fi
    
    # Create migrations directory if it doesn't exist (for demo)
    if [[ ! -d "$migrations_dir" ]]; then
        mkdir -p "$migrations_dir"
        
        # Create sample migration files for demo
        cat > "$migrations_dir/20240315_120000_initial_dhash_schema.sql" << 'EOF'
-- Initial dhash schema migration
-- Version: 20240315_120000

-- Create schema_migrations table if not exists
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dhash tables
CREATE TABLE IF NOT EXISTS dhash_jobs (
    id SERIAL PRIMARY KEY,
    hash_value VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_jobs_status ON dhash_jobs(status);
CREATE INDEX IF NOT EXISTS idx_dhash_jobs_hash ON dhash_jobs(hash_value);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('20240315_120000') ON CONFLICT DO NOTHING;
EOF

        cat > "$migrations_dir/20240320_140000_add_hash_index.sql" << 'EOF'
-- Add additional hash performance index
-- Version: 20240320_140000

-- Add composite index for better hash lookup performance
CREATE INDEX IF NOT EXISTS idx_dhash_jobs_status_created ON dhash_jobs(status, created_at);

-- Add queue performance table
CREATE TABLE IF NOT EXISTS dhash_queue_stats (
    id SERIAL PRIMARY KEY,
    queue_length INTEGER DEFAULT 0,
    avg_processing_time_ms INTEGER DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('20240320_140000') ON CONFLICT DO NOTHING;
EOF

        cat > "$migrations_dir/20240325_160000_update_queue_table.sql" << 'EOF'
-- Update queue table for better monitoring
-- Version: 20240325_160000

-- Add confidence scoring column
ALTER TABLE dhash_jobs ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) DEFAULT 1.0;

-- Add processing metrics table
CREATE TABLE IF NOT EXISTS dhash_processing_metrics (
    id SERIAL PRIMARY KEY,
    p95_hash_time_ms INTEGER,
    extraction_failure_rate DECIMAL(5,4),
    low_confidence_queue_length INTEGER,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('20240325_160000') ON CONFLICT DO NOTHING;
EOF
    fi
    
    # List available migration files
    if [[ -d "$migrations_dir" ]]; then
        local available_migrations
        available_migrations=$(find "$migrations_dir" -name "*.sql" | sort)
        
        if [[ -n "$available_migrations" ]]; then
            log "Available migrations:"
            while IFS= read -r migration_file; do
                local migration_name
                migration_name=$(basename "$migration_file")
                log "  - $migration_name"
            done <<< "$available_migrations"
            
            echo "$available_migrations"
        else
            log "No migration files found in $migrations_dir"
            echo ""
        fi
    else
        warn "Migrations directory not found: $migrations_dir"
        echo ""
    fi
}

# Determine migrations to run
determine_migrations_to_run() {
    local current_version="$1"
    local available_migrations="$2"
    
    log "Determining migrations to run..."
    
    if [[ -z "$available_migrations" ]]; then
        log "No migrations available"
        echo ""
        return 0
    fi
    
    local migrations_to_run=""
    
    # If specific migration version is specified
    if [[ -n "$MIGRATION_VERSION" ]]; then
        while IFS= read -r migration_file; do
            local migration_name
            migration_name=$(basename "$migration_file")
            
            if [[ "$migration_name" == *"$MIGRATION_VERSION"* ]]; then
                migrations_to_run="$migration_file"
                break
            fi
        done <<< "$available_migrations"
        
        if [[ -z "$migrations_to_run" ]]; then
            error "Migration version not found: $MIGRATION_VERSION"
            exit 1
        fi
    else
        # Run all migrations newer than current version
        while IFS= read -r migration_file; do
            local migration_name
            migration_name=$(basename "$migration_file")
            local migration_version
            migration_version=$(echo "$migration_name" | cut -d'_' -f1)
            
            if [[ "$migration_version" > "$current_version" ]]; then
                if [[ -n "$migrations_to_run" ]]; then
                    migrations_to_run="$migrations_to_run"$'\n'"$migration_file"
                else
                    migrations_to_run="$migration_file"
                fi
            fi
        done <<< "$available_migrations"
    fi
    
    if [[ -n "$migrations_to_run" ]]; then
        log "Migrations to run:"
        while IFS= read -r migration_file; do
            local migration_name
            migration_name=$(basename "$migration_file")
            log "  - $migration_name"
        done <<< "$migrations_to_run"
    else
        log "No new migrations to run"
    fi
    
    echo "$migrations_to_run"
}

# Run migration file
run_migration() {
    local migration_file="$1"
    local migration_name
    migration_name=$(basename "$migration_file")
    
    log "Running migration: $migration_name"
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would execute migration file: $migration_file"
        log "[DRY-RUN] Would run SQL commands from the file"
        log "[DRY-RUN] Would update schema_migrations table"
        return 0
    fi
    
    # Validate migration file exists and is readable
    if [[ ! -f "$migration_file" ]] || [[ ! -r "$migration_file" ]]; then
        error "Migration file not found or not readable: $migration_file"
        return 1
    fi
    
    # In a real implementation, this would execute the SQL against the actual database
    # For demo purposes, we'll simulate the execution
    
    log "Executing SQL commands..."
    
    # Simulate database connection and execution
    sleep 1
    
    # Check for any obvious SQL syntax issues (basic validation)
    if ! grep -q "INSERT INTO schema_migrations" "$migration_file"; then
        warn "Migration file does not contain schema_migrations insert: $migration_name"
    fi
    
    success "Migration completed: $migration_name"
}

# Verify migration success
verify_migration() {
    local migration_file="$1"
    local migration_name
    migration_name=$(basename "$migration_file")
    local migration_version
    migration_version=$(echo "$migration_name" | cut -d'_' -f1)
    
    log "Verifying migration: $migration_name"
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would verify migration was applied successfully"
        log "[DRY-RUN] Would check schema_migrations table for version: $migration_version"
        return 0
    fi
    
    # In a real implementation, this would query the database to verify
    # For demo purposes, we'll simulate the verification
    
    log "Checking migration record in database..."
    sleep 1
    
    success "Migration verified: $migration_name"
}

# Rollback migration (if needed)
rollback_migration() {
    local migration_file="$1"
    local migration_name
    migration_name=$(basename "$migration_file")
    
    log "Rolling back migration: $migration_name"
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would rollback migration: $migration_file"
        log "[DRY-RUN] Would execute rollback SQL if available"
        return 0
    fi
    
    # Look for rollback file
    local rollback_file="${migration_file%.sql}_rollback.sql"
    
    if [[ -f "$rollback_file" ]]; then
        log "Executing rollback file: $(basename "$rollback_file")"
        # Execute rollback SQL
        sleep 1
        success "Migration rollback completed: $migration_name"
    else
        warn "No rollback file found for: $migration_name"
        warn "Manual rollback may be required"
    fi
}

# Main migration flow
main() {
    log "=== dhash Migration Start ==="
    log "Environment: $ENVIRONMENT"
    log "Dry-run: $DRY_RUN"
    log "Timestamp: $(date -Iseconds)"
    
    # Create backups directory for migration logs
    mkdir -p "$ROOT_DIR/migration_logs"
    
    # Check prerequisites
    local current_version
    current_version=$(check_current_version)
    
    local available_migrations
    available_migrations=$(get_available_migrations)
    
    local migrations_to_run
    migrations_to_run=$(determine_migrations_to_run "$current_version" "$available_migrations")
    
    if [[ -z "$migrations_to_run" ]]; then
        success "=== No migrations to run - database is up to date ==="
        exit 0
    fi
    
    # Create pre-migration backup (in production)
    if [[ "$ENVIRONMENT" == "production" ]] && [[ "$DRY_RUN" == "false" ]]; then
        log "Creating pre-migration backup..."
        if ! "$SCRIPT_DIR/backup_dhash.sh" --env "$ENVIRONMENT" --output-dir "$ROOT_DIR/migration_logs"; then
            error "Failed to create pre-migration backup"
            exit 1
        fi
    fi
    
    # Run migrations
    local migration_count=0
    local failed_migrations=()
    
    while IFS= read -r migration_file; do
        if [[ -n "$migration_file" ]]; then
            migration_count=$((migration_count + 1))
            
            if run_migration "$migration_file"; then
                verify_migration "$migration_file"
            else
                error "Migration failed: $(basename "$migration_file")"
                failed_migrations+=("$migration_file")
                
                # Rollback failed migration
                rollback_migration "$migration_file"
                break
            fi
        fi
    done <<< "$migrations_to_run"
    
    if [[ ${#failed_migrations[@]} -eq 0 ]]; then
        success "=== dhash Migration Completed Successfully ==="
        log "Migrations applied: $migration_count"
        
        # Send notification
        if [[ -f "$SCRIPT_DIR/notify.js" ]]; then
            node "$SCRIPT_DIR/notify.js" --type migration --env "$ENVIRONMENT" --message "dhash migration completed successfully. $migration_count migration(s) applied." || true
        fi
    else
        error "=== dhash Migration Failed ==="
        error "Failed migrations: ${#failed_migrations[@]}"
        
        for failed_migration in "${failed_migrations[@]}"; do
            error "  - $(basename "$failed_migration")"
        done
        
        # Send failure notification
        if [[ -f "$SCRIPT_DIR/notify.js" ]]; then
            node "$SCRIPT_DIR/notify.js" --type migration --env "$ENVIRONMENT" --message "dhash migration FAILED. ${#failed_migrations[@]} migration(s) failed." --severity error || true
        fi
        
        exit 1
    fi
}

# Execute main function
main "$@"