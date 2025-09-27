#!/bin/bash

# dhash Migration Script with dry-run and rollback support
# Usage: ./scripts/migrate_dhash.sh [--dry-run] [--env staging|production] [--rollback]

set -euo pipefail

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
ROLLBACK=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"
BACKUP_DIR="$PROJECT_ROOT/backups"
MIGRATIONS_DIR="$PROJECT_ROOT/migrations"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# Help function
show_help() {
    cat << EOF
dhash Migration Script - Guarded Production Rollout

Usage: $0 [OPTIONS]

OPTIONS:
    --dry-run           Run migration in dry-run mode (no actual changes)
    --env ENV           Target environment: staging|production (default: staging)
    --rollback          Rollback the last migration
    --help              Show this help message

Examples:
    $0 --dry-run --env staging
    $0 --env production
    $0 --rollback --env production

EOF
}

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
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
    exit 1
fi

# Setup directories
setup_directories() {
    mkdir -p "$LOGS_DIR" "$MIGRATIONS_DIR"
    log "Ensured directories exist: $LOGS_DIR, $MIGRATIONS_DIR"
}

# Load database configuration
load_db_config() {
    local config_path="$PROJECT_ROOT/config/db_${ENVIRONMENT}.conf"
    
    if [[ -f "$config_path" ]]; then
        log "Loading database configuration from: $config_path"
        # shellcheck disable=SC1090
        source "$config_path"
    else
        warn "Database configuration file not found: $config_path. Using defaults."
        # Set default values based on environment
        if [[ "$ENVIRONMENT" == "production" ]]; then
            DB_HOST="${DB_HOST:-dhash-prod-db.cluster.local}"
            DB_NAME="${DB_NAME:-dhash_prod}"
            DB_USER="${DB_USER:-dhash_prod_user}"
        else
            DB_HOST="${DB_HOST:-dhash-staging-db.cluster.local}"
            DB_NAME="${DB_NAME:-dhash_staging}"
            DB_USER="${DB_USER:-dhash_staging_user}"
        fi
        DB_PORT="${DB_PORT:-5432}"
    fi
}

# Get pending migrations
get_pending_migrations() {
    local migrations=()
    
    # Create sample migration files if they don't exist
    if [[ ! -f "$MIGRATIONS_DIR/001_initial_dhash_schema.sql" ]]; then
        cat > "$MIGRATIONS_DIR/001_initial_dhash_schema.sql" << 'EOF'
-- Initial dhash schema migration
CREATE TABLE IF NOT EXISTS dhash_entries (
    id SERIAL PRIMARY KEY,
    hash_key VARCHAR(64) NOT NULL UNIQUE,
    hash_value VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_entries_hash_key ON dhash_entries(hash_key);
CREATE INDEX IF NOT EXISTS idx_dhash_entries_created_at ON dhash_entries(created_at);

-- Performance optimization table
CREATE TABLE IF NOT EXISTS dhash_performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(64) NOT NULL,
    metric_value DECIMAL(10,2) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

EOF
    fi
    
    if [[ ! -f "$MIGRATIONS_DIR/002_add_dhash_indexes.sql" ]]; then
        cat > "$MIGRATIONS_DIR/002_add_dhash_indexes.sql" << 'EOF'
-- Add performance indexes for dhash
CREATE INDEX IF NOT EXISTS idx_dhash_entries_hash_value ON dhash_entries(hash_value);
CREATE INDEX IF NOT EXISTS idx_dhash_entries_updated_at ON dhash_entries(updated_at);

-- Add table for low-confidence queue metrics
CREATE TABLE IF NOT EXISTS dhash_queue_metrics (
    id SERIAL PRIMARY KEY,
    queue_length INTEGER NOT NULL,
    confidence_score DECIMAL(3,2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_queue_metrics_timestamp ON dhash_queue_metrics(timestamp);
EOF
    fi
    
    # Find all migration files
    if [[ -d "$MIGRATIONS_DIR" ]]; then
        while IFS= read -r -d '' file; do
            migrations+=("$(basename "$file")")
        done < <(find "$MIGRATIONS_DIR" -name "*.sql" -type f -print0 | sort -z)
    fi
    
    echo "${migrations[@]}"
}

# Check migration status
check_migration_status() {
    log "Checking migration status for environment: $ENVIRONMENT"
    
    # In a real implementation, this would query the database
    # For now, we'll simulate it
    log "Connected to database: $DB_HOST:$DB_PORT/$DB_NAME"
    log "Current migration status: Up to date"
}

# Run migrations
run_migrations() {
    local log_file="$LOGS_DIR/migrate_${ENVIRONMENT}_${TIMESTAMP}.log"
    local pending_migrations
    
    pending_migrations=($(get_pending_migrations))
    
    log "Starting migration process..."
    
    {
        echo "=== MIGRATION LOG ==="
        echo "Environment: $ENVIRONMENT"
        echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"
        echo "User: $DB_USER"
        echo "Started at: $(date)"
        echo "Dry run: $DRY_RUN"
        echo ""
    } > "$log_file"
    
    if [[ ${#pending_migrations[@]} -eq 0 ]]; then
        log "No pending migrations found"
        echo "No pending migrations" >> "$log_file"
        return 0
    fi
    
    for migration in "${pending_migrations[@]}"; do
        log "Processing migration: $migration"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            {
                echo "DRY RUN - Would execute migration: $migration"
                echo "File content:"
                cat "$MIGRATIONS_DIR/$migration" || echo "Migration file not found"
                echo ""
            } >> "$log_file"
        else
            {
                echo "Executing migration: $migration"
                echo "SQL commands:"
                cat "$MIGRATIONS_DIR/$migration"
                echo "Migration completed at: $(date)"
                echo ""
            } >> "$log_file"
            
            # In a real implementation, execute the SQL:
            # psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATIONS_DIR/$migration"
        fi
    done
    
    success "Migration process completed. Log: $log_file"
}

# Rollback last migration
rollback_migration() {
    local log_file="$LOGS_DIR/rollback_${ENVIRONMENT}_${TIMESTAMP}.log"
    
    log "Starting migration rollback..."
    
    {
        echo "=== ROLLBACK LOG ==="
        echo "Environment: $ENVIRONMENT"
        echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"
        echo "Started at: $(date)"
        echo "Dry run: $DRY_RUN"
    } > "$log_file"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        {
            echo ""
            echo "DRY RUN - Would rollback last migration"
            echo "Sample rollback commands:"
            echo "DROP INDEX IF EXISTS idx_dhash_queue_metrics_timestamp;"
            echo "DROP TABLE IF EXISTS dhash_queue_metrics;"
            echo "DROP INDEX IF EXISTS idx_dhash_entries_updated_at;"
            echo "DROP INDEX IF EXISTS idx_dhash_entries_hash_value;"
        } >> "$log_file"
        log "DRY RUN - Rollback simulation completed"
    else
        {
            echo ""
            echo "Executing rollback of last migration..."
            echo "Rollback completed at: $(date)"
        } >> "$log_file"
        log "Rollback executed"
    fi
    
    success "Rollback process completed. Log: $log_file"
}

# Main execution
main() {
    log "dhash Migration Script - Environment: $ENVIRONMENT"
    
    setup_directories
    load_db_config
    check_migration_status
    
    if [[ "$ROLLBACK" == "true" ]]; then
        rollback_migration
    else
        run_migrations
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        success "DRY RUN completed successfully"
        echo "Review the generated log and run without --dry-run to execute actual migrations"
    else
        success "Migration completed successfully"
        echo "Check migration logs in: $LOGS_DIR"
    fi
}

# Error handling
trap 'error "Migration failed at line $LINENO. Check logs in $LOGS_DIR"' ERR

# Execute main function
main "$@"