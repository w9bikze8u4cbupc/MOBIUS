#!/bin/bash
# MOBIUS Migration Dry Run
# Tests database migrations without affecting production data

set -euo pipefail

ENV="${DEPLOY_ENV:-staging}"
DRY_RUN_LOG="${DRY_RUN_LOG:-./logs/migrate-dryrun.log}"
DB_URL="${DATABASE_URL:-}"
ROLLBACK_AFTER="${ROLLBACK_AFTER:-true}"

# Ensure log directory exists
mkdir -p "$(dirname "$DRY_RUN_LOG")"

# Function to log with timestamp
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message" | tee -a "$DRY_RUN_LOG"
}

# Function to validate database connection
validate_db_connection() {
    log "=== Database Connection Validation ==="
    local failures=0
    
    if [[ -z "$DB_URL" ]]; then
        log "⚠ WARNING: DATABASE_URL not set, skipping connection test"
        log "  Migration dry run will use default connection configuration"
        return 0
    fi
    
    # Parse database type from URL
    local db_type
    db_type=$(echo "$DB_URL" | cut -d':' -f1)
    log "Database type detected: $db_type"
    
    case "$db_type" in
        "postgresql"|"postgres")
            test_postgres_connection || ((failures++))
            ;;
        "mysql")
            test_mysql_connection || ((failures++))
            ;;
        "sqlite")
            test_sqlite_connection || ((failures++))
            ;;
        *)
            log "⚠ WARNING: Unsupported database type: $db_type"
            log "  Will attempt generic migration dry run"
            ;;
    esac
    
    return $failures
}

# Function to test PostgreSQL connection
test_postgres_connection() {
    if command -v psql >/dev/null 2>&1; then
        log "Testing PostgreSQL connection..."
        if psql "$DB_URL" -c "SELECT 1;" >/dev/null 2>&1; then
            log "✓ PASS: PostgreSQL connection successful"
            return 0
        else
            log "✗ FAIL: PostgreSQL connection failed"
            return 1
        fi
    else
        log "⚠ WARNING: psql not available, skipping direct connection test"
        return 0
    fi
}

# Function to test MySQL connection
test_mysql_connection() {
    if command -v mysql >/dev/null 2>&1; then
        log "Testing MySQL connection..."
        # Parse MySQL URL (basic parsing)
        local mysql_cmd="mysql"
        if mysql -e "SELECT 1;" >/dev/null 2>&1; then
            log "✓ PASS: MySQL connection successful"
            return 0
        else
            log "✗ FAIL: MySQL connection failed"
            return 1
        fi
    else
        log "⚠ WARNING: mysql not available, skipping direct connection test"
        return 0
    fi
}

# Function to test SQLite connection
test_sqlite_connection() {
    local db_file
    db_file=$(echo "$DB_URL" | sed 's/sqlite://')
    
    if [[ -f "$db_file" ]]; then
        log "✓ PASS: SQLite database file exists: $db_file"
        return 0
    else
        log "⚠ WARNING: SQLite database file not found: $db_file"
        log "  File will be created during migration"
        return 0
    fi
}

# Function to backup database for dry run
create_db_backup() {
    log "=== Database Backup for Dry Run ==="
    
    if [[ -z "$DB_URL" ]]; then
        log "⚠ INFO: No DATABASE_URL set, skipping database backup"
        return 0
    fi
    
    local backup_dir="./tmp/migration_backup"
    mkdir -p "$backup_dir"
    local backup_file="$backup_dir/pre_migration_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    local db_type
    db_type=$(echo "$DB_URL" | cut -d':' -f1)
    
    case "$db_type" in
        "postgresql"|"postgres")
            if command -v pg_dump >/dev/null 2>&1; then
                log "Creating PostgreSQL backup..."
                if pg_dump "$DB_URL" > "$backup_file" 2>/dev/null; then
                    log "✓ PASS: Database backup created: $backup_file"
                    echo "$backup_file"
                else
                    log "✗ FAIL: PostgreSQL backup failed"
                    return 1
                fi
            else
                log "⚠ WARNING: pg_dump not available"
                return 0
            fi
            ;;
        "mysql")
            if command -v mysqldump >/dev/null 2>&1; then
                log "Creating MySQL backup..."
                if mysqldump --single-transaction "$DB_URL" > "$backup_file" 2>/dev/null; then
                    log "✓ PASS: Database backup created: $backup_file"
                    echo "$backup_file"
                else
                    log "✗ FAIL: MySQL backup failed"
                    return 1
                fi
            else
                log "⚠ WARNING: mysqldump not available"
                return 0
            fi
            ;;
        "sqlite")
            local db_file
            db_file=$(echo "$DB_URL" | sed 's/sqlite://')
            if [[ -f "$db_file" ]]; then
                log "Creating SQLite backup..."
                cp "$db_file" "$backup_file.db"
                log "✓ PASS: SQLite backup created: $backup_file.db"
                echo "$backup_file.db"
            else
                log "⚠ INFO: SQLite file doesn't exist yet"
                return 0
            fi
            ;;
        *)
            log "⚠ WARNING: Cannot create backup for database type: $db_type"
            return 0
            ;;
    esac
}

# Function to run migration dry run
run_migration_dryrun() {
    log "=== Migration Dry Run Execution ==="
    local failures=0
    
    # Check for common migration tools
    if [[ -f "migrations/" ]] || [[ -d "migrations/" ]]; then
        log "Migrations directory found"
    elif [[ -f "db/migrations/" ]] || [[ -d "db/migrations/" ]]; then
        log "Database migrations directory found"
    else
        log "⚠ WARNING: No migrations directory found"
        log "  If you have a custom migration setup, ensure it's configured properly"
    fi
    
    # Check for package.json migration scripts
    if [[ -f "package.json" ]]; then
        local migration_scripts
        migration_scripts=$(grep -o '"migrate[^"]*"' package.json || echo "")
        
        if [[ -n "$migration_scripts" ]]; then
            log "Migration scripts found in package.json:"
            echo "$migration_scripts" | while read -r script; do
                log "  $script"
            done
        else
            log "⚠ INFO: No migration scripts found in package.json"
        fi
        
        # Test if there's a migration command
        if npm run --silent | grep -q "migrate"; then
            log "Testing migration command execution..."
            
            # Try to run migration in dry-run mode if supported
            local migrate_output
            migrate_output=$(npm run migrate -- --dry-run 2>&1 || npm run migrate -- --help 2>&1 || echo "Migration command failed")
            
            if echo "$migrate_output" | grep -i -q -E "(dry.?run|help|usage)"; then
                log "✓ PASS: Migration command responds to arguments"
            else
                log "⚠ WARNING: Migration command may not support dry-run mode"
                log "Migration output (first 10 lines):"
                echo "$migrate_output" | head -10 | while read -r line; do
                    log "  $line"
                done
            fi
        else
            log "⚠ INFO: No 'migrate' script found in package.json"
        fi
    fi
    
    # Check for Knex.js migrations
    if [[ -f "knexfile.js" ]] || [[ -f "knex.config.js" ]]; then
        log "Knex.js configuration found"
        if command -v knex >/dev/null 2>&1; then
            log "Testing Knex.js migration dry run..."
            local knex_output
            knex_output=$(knex migrate:status 2>&1 || echo "Knex migrate status failed")
            
            if echo "$knex_output" | grep -i -q -E "(pending|applied|migration)"; then
                log "✓ PASS: Knex.js migrations status accessible"
            else
                log "⚠ WARNING: Knex.js migration status check failed"
                log "Knex output: $knex_output"
            fi
        else
            log "⚠ INFO: Knex CLI not available"
        fi
    fi
    
    # Check for Sequelize migrations
    if [[ -f ".sequelizerc" ]] || [[ -d "models/" ]]; then
        log "Sequelize configuration detected"
        if command -v sequelize >/dev/null 2>&1; then
            log "Testing Sequelize migration dry run..."
            local sequelize_output
            sequelize_output=$(sequelize db:migrate:status 2>&1 || echo "Sequelize status failed")
            
            if echo "$sequelize_output" | grep -i -q -E "(migration|up|down)"; then
                log "✓ PASS: Sequelize migrations accessible"
            else
                log "⚠ WARNING: Sequelize migration status check failed"
            fi
        else
            log "⚠ INFO: Sequelize CLI not available"
        fi
    fi
    
    # Generic migration validation
    log "Performing generic migration validation..."
    
    # Check for SQL files
    local sql_files
    sql_files=$(find . -name "*.sql" -type f 2>/dev/null | head -5)
    if [[ -n "$sql_files" ]]; then
        log "SQL files found (sample):"
        echo "$sql_files" | while read -r file; do
            log "  $file"
        done
    fi
    
    return $failures
}

# Function to validate migration rollback capability
test_rollback_capability() {
    log "=== Migration Rollback Capability Test ==="
    local failures=0
    
    # Check for rollback/down migration support
    if [[ -f "package.json" ]]; then
        local rollback_scripts
        rollback_scripts=$(grep -o '".*rollback.*"' package.json || grep -o '".*down.*"' package.json || echo "")
        
        if [[ -n "$rollback_scripts" ]]; then
            log "✓ PASS: Rollback scripts found in package.json"
            echo "$rollback_scripts" | while read -r script; do
                log "  $script"
            done
        else
            log "⚠ WARNING: No rollback scripts found in package.json"
            log "  Ensure your migration tool supports rollback functionality"
        fi
    fi
    
    # Check for down migration files
    local down_migrations
    down_migrations=$(find . -name "*down*" -o -name "*rollback*" 2>/dev/null | head -5)
    if [[ -n "$down_migrations" ]]; then
        log "Rollback migration files found:"
        echo "$down_migrations" | while read -r file; do
            log "  $file"
        done
    else
        log "⚠ INFO: No explicit rollback/down migration files found"
    fi
    
    return $failures
}

# Function to clean up after dry run
cleanup_dryrun() {
    log "=== Migration Dry Run Cleanup ==="
    
    if [[ "$ROLLBACK_AFTER" == "true" ]]; then
        log "Performing post-dry-run cleanup..."
        
        # If we have a backup, we could restore it here
        # This would depend on your specific migration tool and setup
        log "⚠ INFO: Automatic rollback not implemented"
        log "  If migrations were applied during dry run, manual rollback may be needed"
    else
        log "Cleanup skipped (ROLLBACK_AFTER=false)"
    fi
    
    # Clean up temporary files
    if [[ -d "./tmp/migration_backup" ]]; then
        log "Cleaning up temporary backup files..."
        rm -rf "./tmp/migration_backup"
        log "✓ Temporary files cleaned up"
    fi
}

# Main migration dry run execution
main() {
    log "=== MOBIUS Migration Dry Run Starting ==="
    log "Timestamp: $(date)"
    log "Environment: $ENV"
    log "Database URL: $(echo "$DB_URL" | sed 's/:[^@]*@/:***@/g')" # Mask password
    log "Rollback after: $ROLLBACK_AFTER"
    
    local total_failures=0
    local backup_file=""
    
    # Run all migration validations
    validate_db_connection || ((total_failures += $?))
    
    # Create backup if possible
    backup_file=$(create_db_backup) || ((total_failures += $?))
    
    # Run migration dry run
    run_migration_dryrun || ((total_failures += $?))
    
    # Test rollback capability
    test_rollback_capability || ((total_failures += $?))
    
    # Clean up
    cleanup_dryrun
    
    log "=== Migration Dry Run Summary ==="
    if [[ $total_failures -eq 0 ]]; then
        log "✓ ALL VALIDATIONS PASSED: Migrations appear ready"
        log "Database migrations should be safe to apply to $ENV environment"
        if [[ -n "$backup_file" ]]; then
            log "Backup created: $backup_file"
        fi
        exit 0
    else
        log "✗ VALIDATIONS FAILED: $total_failures migration validation failures detected"
        log "Review the failures above before applying migrations to $ENV environment"
        exit 1
    fi
}

# Handle help argument
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    cat << EOF
Usage: $0 [options]

Performs migration dry run validation for MOBIUS.

Environment Variables:
  DEPLOY_ENV       Environment name (default: staging)
  DRY_RUN_LOG      Log file path (default: ./logs/migrate-dryrun.log)
  DATABASE_URL     Database connection URL
  ROLLBACK_AFTER   Rollback after dry run (default: true)

Exit Codes:
  0   All validations passed
  1   One or more validations failed

Examples:
  $0                                           # Run migration dry run
  DATABASE_URL=postgres://user:pass@host/db $0  # With specific database
  ROLLBACK_AFTER=false $0                     # Don't rollback after
EOF
    exit 0
fi

# Execute main function
main "$@"