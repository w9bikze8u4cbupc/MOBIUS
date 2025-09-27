#!/bin/bash
#
# migrate_dhash.sh - Migration runner with forward/rollback support and dry-run
#
# Usage: ./scripts/migrate_dhash.sh --env production --direction forward [--dry-run]
#

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/deploy_logs"
MIGRATIONS_DIR="$ROOT_DIR/migrations/dhash"

# Default values
ENV=""
DIRECTION=""
DRY_RUN=false
MIGRATION_TIMEOUT=900

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

# Usage information
usage() {
    cat << EOF
Usage: $0 --env ENVIRONMENT --direction DIRECTION [OPTIONS]

Run dhash database migrations with support for forward/rollback operations.

Required Arguments:
  --env ENVIRONMENT     Target environment (production, staging, development)
  --direction DIRECTION Migration direction (forward, rollback)

Optional Arguments:
  --dry-run            Show what migrations would be run without executing
  --timeout SEC        Migration timeout in seconds (default: 900)
  --help              Show this help message

Examples:
  $0 --env production --direction forward --dry-run
  $0 --env staging --direction rollback
  $0 --env development --direction forward

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENV="$2"
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
            --timeout)
                MIGRATION_TIMEOUT="$2"
                shift 2
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$ENV" ]]; then
        log_error "Environment is required. Use --env ENVIRONMENT"
        usage
        exit 1
    fi

    if [[ -z "$DIRECTION" ]]; then
        log_error "Direction is required. Use --direction DIRECTION"
        usage
        exit 1
    fi
}

# Validate environment and direction
validate_args() {
    log_info "Validating arguments"
    
    case "$ENV" in
        production|staging|development)
            log_success "Environment '$ENV' is valid"
            ;;
        *)
            log_error "Invalid environment '$ENV'. Must be one of: production, staging, development"
            exit 1
            ;;
    esac

    case "$DIRECTION" in
        forward|rollback)
            log_success "Direction '$DIRECTION' is valid"
            ;;
        *)
            log_error "Invalid direction '$DIRECTION'. Must be one of: forward, rollback"
            exit 1
            ;;
    esac

    # Check for migration directory
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        log_warn "Migrations directory does not exist: $MIGRATIONS_DIR"
        log_info "Creating migrations directory"
        mkdir -p "$MIGRATIONS_DIR"
    fi
}

# Get database connection string for environment
get_database_connection() {
    local env_var="DHASH_${ENV^^}_DATABASE_URL"
    local db_url="${!env_var:-}"
    
    if [[ -z "$db_url" ]]; then
        # Default connection for development
        if [[ "$ENV" == "development" ]]; then
            db_url="sqlite://./dhash_dev.db"
        else
            log_error "Database URL not configured for $ENV environment"
            log_error "Please set $env_var environment variable"
            exit 1
        fi
    fi
    
    echo "$db_url"
}

# Initialize migration system if needed
init_migration_system() {
    log_info "Initializing migration system"
    
    local db_url
    db_url=$(get_database_connection)
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would initialize migration system for: $db_url"
        return 0
    fi

    # Create migration tracking table if it doesn't exist
    case "$db_url" in
        sqlite://*)
            local db_file="${db_url#sqlite://}"
            sqlite3 "$db_file" "
                CREATE TABLE IF NOT EXISTS dhash_migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT UNIQUE NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    checksum TEXT,
                    execution_time_ms INTEGER
                );
            " 2>/dev/null || log_warn "Failed to create migration table (may already exist)"
            ;;
        postgres://*)
            # PostgreSQL migration table creation
            log_warn "PostgreSQL migration support not yet implemented"
            ;;
        mysql://*)
            # MySQL migration table creation
            log_warn "MySQL migration support not yet implemented"
            ;;
        *)
            log_error "Unsupported database URL format: $db_url"
            exit 1
            ;;
    esac
    
    log_success "Migration system initialized"
}

# Get applied migrations
get_applied_migrations() {
    local db_url
    db_url=$(get_database_connection)
    
    case "$db_url" in
        sqlite://*)
            local db_file="${db_url#sqlite://}"
            if [[ -f "$db_file" ]]; then
                sqlite3 "$db_file" "SELECT filename FROM dhash_migrations ORDER BY applied_at;" 2>/dev/null || echo ""
            fi
            ;;
        *)
            log_error "Unsupported database for migration tracking: $db_url"
            exit 1
            ;;
    esac
}

# Get pending forward migrations
get_pending_migrations() {
    local applied_migrations
    applied_migrations=$(get_applied_migrations)
    
    local pending=()
    
    # Find all migration files
    if [[ -d "$MIGRATIONS_DIR" ]]; then
        while IFS= read -r -d '' file; do
            local filename=$(basename "$file")
            if [[ ! "$applied_migrations" =~ $filename ]]; then
                pending+=("$file")
            fi
        done < <(find "$MIGRATIONS_DIR" -name "*.sql" -print0 | sort -z)
    fi
    
    printf '%s\n' "${pending[@]}"
}

# Get rollback migrations
get_rollback_migrations() {
    local applied_migrations
    applied_migrations=$(get_applied_migrations)
    
    local rollback=()
    
    # Get applied migrations in reverse order
    while IFS= read -r filename; do
        if [[ -n "$filename" ]]; then
            local migration_file="$MIGRATIONS_DIR/$filename"
            local rollback_file="${migration_file%.sql}.rollback.sql"
            if [[ -f "$rollback_file" ]]; then
                rollback+=("$rollback_file")
            else
                log_warn "No rollback file found for: $filename"
            fi
        fi
    done <<< "$(echo "$applied_migrations" | tac)"
    
    printf '%s\n' "${rollback[@]}"
}

# Execute a single migration
execute_migration() {
    local migration_file="$1"
    local is_rollback="$2"
    local filename=$(basename "$migration_file")
    
    log_info "Executing migration: $filename"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would execute: $migration_file"
        return 0
    fi

    local db_url
    db_url=$(get_database_connection)
    
    local start_time=$(date +%s%3N)
    
    case "$db_url" in
        sqlite://*)
            local db_file="${db_url#sqlite://}"
            if ! timeout "$MIGRATION_TIMEOUT" sqlite3 "$db_file" < "$migration_file"; then
                log_error "Migration failed: $filename"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported database for migration execution: $db_url"
            return 1
            ;;
    esac
    
    local end_time=$(date +%s%3N)
    local execution_time=$((end_time - start_time))
    
    # Update migration tracking
    if [[ "$is_rollback" == false ]]; then
        local checksum=$(sha256sum "$migration_file" | cut -d' ' -f1)
        case "$db_url" in
            sqlite://*)
                local db_file="${db_url#sqlite://}"
                sqlite3 "$db_file" "
                    INSERT INTO dhash_migrations (filename, checksum, execution_time_ms) 
                    VALUES ('$filename', '$checksum', $execution_time);
                "
                ;;
        esac
    else
        # Remove from migration tracking for rollback
        local original_filename="${filename%.rollback.sql}.sql"
        case "$db_url" in
            sqlite://*)
                local db_file="${db_url#sqlite://}"
                sqlite3 "$db_file" "DELETE FROM dhash_migrations WHERE filename = '$original_filename';"
                ;;
        esac
    fi
    
    log_success "Migration completed: $filename (${execution_time}ms)"
}

# Run migrations
run_migrations() {
    log_info "Running $DIRECTION migrations for environment: $ENV"
    
    local migrations
    if [[ "$DIRECTION" == "forward" ]]; then
        migrations=$(get_pending_migrations)
    else
        migrations=$(get_rollback_migrations)
    fi
    
    if [[ -z "$migrations" ]]; then
        log_info "No migrations to run"
        return 0
    fi
    
    local count=0
    while IFS= read -r migration_file; do
        if [[ -n "$migration_file" && -f "$migration_file" ]]; then
            local is_rollback=false
            if [[ "$DIRECTION" == "rollback" ]]; then
                is_rollback=true
            fi
            
            if execute_migration "$migration_file" "$is_rollback"; then
                count=$((count + 1))
            else
                log_error "Migration failed, stopping execution"
                return 1
            fi
        fi
    done <<< "$migrations"
    
    log_success "Completed $count migrations"
}

# Create example migration files if directory is empty
create_example_migrations() {
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        mkdir -p "$MIGRATIONS_DIR"
    fi
    
    local example_count=$(find "$MIGRATIONS_DIR" -name "*.sql" | wc -l)
    
    if [[ $example_count -eq 0 ]]; then
        log_info "Creating example migration files"
        
        cat > "$MIGRATIONS_DIR/001_create_dhash_tables.sql" << 'EOF'
-- Create dhash tables
-- Migration: 001_create_dhash_tables.sql

CREATE TABLE IF NOT EXISTS dhash_configs (
    id INTEGER PRIMARY KEY,
    environment TEXT NOT NULL,
    config_key TEXT NOT NULL,
    config_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dhash_metrics (
    id INTEGER PRIMARY KEY,
    metric_name TEXT NOT NULL,
    metric_value REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    environment TEXT NOT NULL
);

CREATE INDEX idx_dhash_configs_env_key ON dhash_configs(environment, config_key);
CREATE INDEX idx_dhash_metrics_recorded_at ON dhash_metrics(recorded_at);
EOF

        cat > "$MIGRATIONS_DIR/001_create_dhash_tables.rollback.sql" << 'EOF'
-- Rollback: 001_create_dhash_tables.sql

DROP INDEX IF EXISTS idx_dhash_metrics_recorded_at;
DROP INDEX IF EXISTS idx_dhash_configs_env_key;
DROP TABLE IF EXISTS dhash_metrics;
DROP TABLE IF EXISTS dhash_configs;
EOF

        log_info "Created example migration files"
    fi
}

# Main execution
main() {
    # Setup
    mkdir -p "$LOG_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    log_info "Starting dhash migration process"
    log_info "Environment: $ENV"
    log_info "Direction: $DIRECTION"
    log_info "Dry run: $DRY_RUN"
    
    # Execute migration steps
    validate_args
    create_example_migrations
    init_migration_system
    
    if run_migrations; then
        log_success "Migration process completed successfully!"
        
        # Print summary
        cat << EOF

=== MIGRATION SUMMARY ===
Environment: $ENV
Direction: $DIRECTION
Dry Run: $DRY_RUN
Status: SUCCESS
Time: $(date)

EOF
        exit 0
    else
        log_error "Migration process failed!"
        exit 1
    fi
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi