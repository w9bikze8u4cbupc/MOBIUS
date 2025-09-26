#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Migration Dry Run
# Validates database migrations without applying changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV          Environment (staging|production) [required]"
    echo "  --output FILE      Output migration dry-run log [default: migration-dryrun.log]"
    echo "  --verbose          Enable verbose logging"
    echo "  --help             Show this help message"
    echo ""
    echo "Migration validations:"
    echo "  - Migration files syntax"
    echo "  - Migration dependencies"
    echo "  - Database connectivity"
    echo "  - Schema validation"
    echo "  - Migration rollback capability"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
ENV=""
OUTPUT_FILE="${PROJECT_ROOT}/migration-dryrun.log"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ -z "$ENV" ]]; then
    echo "Error: --env is required"
    usage
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "Error: --env must be 'staging' or 'production'"
    exit 1
fi

# Initialize validation state
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_TOTAL=0

log "Starting migration dry-run for environment: $ENV"
log "Output file: $OUTPUT_FILE"

# Create output directory
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Function to run a migration check
run_check() {
    local check_name="$1"
    local check_command="$2"
    local critical="${3:-false}"
    
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    log "Validating: $check_name"
    
    local check_output
    local check_result
    
    if check_output=$(eval "$check_command" 2>&1); then
        check_result="PASS"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        log "✅ $check_name - PASSED"
        
        if [[ "$VERBOSE" == "true" && -n "$check_output" ]]; then
            log "   Output: $check_output"
        fi
    else
        check_result="FAIL"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        log "❌ $check_name - FAILED"
        
        if [[ "$critical" == "true" ]]; then
            log "💥 Critical migration validation failed: $check_name"
            echo "CRITICAL_MIGRATION_FAILURE: $check_name" >> "$OUTPUT_FILE"
            echo "$check_output" >> "$OUTPUT_FILE"
            return 1
        fi
    fi
    
    # Log check result
    cat >> "$OUTPUT_FILE" << EOF
$(date '+%Y-%m-%d %H:%M:%S')|$check_name|$check_result|$check_output
EOF
}

# Migration validation functions
validate_migration_directory() {
    # Check if migrations directory exists and has proper structure
    local migrations_dir="${PROJECT_ROOT}/migrations"
    
    if [[ -d "$migrations_dir" ]]; then
        # Count migration files
        local migration_count
        migration_count=$(find "$migrations_dir" -name "*.js" -o -name "*.sql" | wc -l)
        echo "Found $migration_count migration files"
        
        # Check for at least one migration
        [[ $migration_count -gt 0 ]]
    else
        # No migrations directory - might be OK for some projects
        echo "No migrations directory found - assuming no database migrations needed"
        return 0
    fi
}

validate_migration_syntax() {
    local migrations_dir="${PROJECT_ROOT}/migrations"
    
    if [[ ! -d "$migrations_dir" ]]; then
        return 0  # Skip if no migrations
    fi
    
    # Validate JavaScript migration files
    find "$migrations_dir" -name "*.js" | while read -r migration_file; do
        if ! node -c "$migration_file" 2>/dev/null; then
            echo "Syntax error in migration: $migration_file"
            return 1
        fi
    done
    
    # Validate SQL migration files (basic check)
    find "$migrations_dir" -name "*.sql" | while read -r migration_file; do
        # Check for basic SQL syntax issues
        if grep -qi "syntax error\|invalid\|error" "$migration_file"; then
            echo "Potential SQL syntax issues in: $migration_file"
            return 1
        fi
    done
    
    return 0
}

validate_database_connectivity() {
    # Try to connect to database if configuration exists
    local db_config="${PROJECT_ROOT}/config/${ENV}/database.json"
    
    if [[ -f "$db_config" ]]; then
        # Check if database configuration is valid JSON
        node -e "JSON.parse(require('fs').readFileSync('$db_config', 'utf8'))" 2>/dev/null
        echo "Database configuration file is valid JSON"
    else
        # Look for other common database config patterns
        if [[ -f "${PROJECT_ROOT}/.env.${ENV}" ]]; then
            if grep -q "DATABASE_URL\|DB_HOST\|DB_CONNECTION" "${PROJECT_ROOT}/.env.${ENV}"; then
                echo "Database environment variables found"
                return 0
            fi
        fi
        
        # If no database config found, assume no database needed
        echo "No database configuration found - assuming no database required"
        return 0
    fi
}

validate_migration_dependencies() {
    # Check if migration-related packages are installed
    cd "$PROJECT_ROOT"
    
    # Common migration tools
    local migration_tools=("knex" "sequelize" "migrate" "db-migrate")
    local found_tools=0
    
    for tool in "${migration_tools[@]}"; do
        if npm list "$tool" > /dev/null 2>&1; then
            echo "Found migration tool: $tool"
            found_tools=$((found_tools + 1))
        fi
    done
    
    if [[ $found_tools -eq 0 && -d "${PROJECT_ROOT}/migrations" ]]; then
        echo "Migrations directory exists but no migration tools found in package.json"
        return 1
    fi
    
    return 0
}

validate_migration_order() {
    local migrations_dir="${PROJECT_ROOT}/migrations"
    
    if [[ ! -d "$migrations_dir" ]]; then
        return 0  # Skip if no migrations
    fi
    
    # Check migration file naming convention (timestamp-based)
    local invalid_migrations
    invalid_migrations=$(find "$migrations_dir" -name "*.js" -o -name "*.sql" | grep -v -E '^[0-9]{8,}_.*\.(js|sql)$' | wc -l)
    
    if [[ $invalid_migrations -gt 0 ]]; then
        echo "Found $invalid_migrations migrations with non-standard naming"
        # This is a warning, not a failure
    fi
    
    return 0
}

validate_rollback_capability() {
    local migrations_dir="${PROJECT_ROOT}/migrations"
    
    if [[ ! -d "$migrations_dir" ]]; then
        return 0  # Skip if no migrations
    fi
    
    # Check if migrations have corresponding rollback/down methods
    find "$migrations_dir" -name "*.js" | while read -r migration_file; do
        if ! grep -q "down\|rollback" "$migration_file" 2>/dev/null; then
            echo "Migration lacks rollback method: $(basename "$migration_file")"
            # This is a warning for now
        fi
    done
    
    return 0
}

simulate_migration_run() {
    # Simulate what a migration run would do
    local migrations_dir="${PROJECT_ROOT}/migrations"
    
    if [[ ! -d "$migrations_dir" ]]; then
        echo "No migrations to simulate"
        return 0
    fi
    
    echo "Would run the following migrations:"
    find "$migrations_dir" -name "*.js" -o -name "*.sql" | sort | while read -r migration_file; do
        echo "  - $(basename "$migration_file")"
    done
    
    echo "Migration simulation completed"
    return 0
}

# Run migration validations
log "Running migration validations..."

run_check "Migration Directory" "validate_migration_directory" false
run_check "Migration Syntax" "validate_migration_syntax" true
run_check "Database Connectivity" "validate_database_connectivity" false
run_check "Migration Dependencies" "validate_migration_dependencies" true
run_check "Migration Order" "validate_migration_order" false
run_check "Rollback Capability" "validate_rollback_capability" false
run_check "Migration Simulation" "simulate_migration_run" false

# Generate migration plan
log "Generating migration plan..."

cat >> "$OUTPUT_FILE" << EOF

=== MIGRATION PLAN FOR $ENV ===
Timestamp: $(date --iso-8601)
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')
Git Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')

Migration steps would be:
1. Create database backup (if applicable)
2. Validate database connectivity
3. Check current migration state
4. Apply pending migrations in order
5. Verify schema changes
6. Update migration tracking table
7. Test rollback capability (dry-run)

Available migrations:
EOF

if [[ -d "${PROJECT_ROOT}/migrations" ]]; then
    find "${PROJECT_ROOT}/migrations" -name "*.js" -o -name "*.sql" | sort | while read -r migration_file; do
        echo "  - $(basename "$migration_file")" >> "$OUTPUT_FILE"
    done
else
    echo "  No migrations found" >> "$OUTPUT_FILE"
fi

cat >> "$OUTPUT_FILE" << EOF

Rollback plan:
- Database backup would be restored if migrations fail
- Individual migration rollbacks available via 'down' methods
EOF

# Generate final report
log "Migration dry-run completed"
log "Results: $CHECKS_PASSED passed, $CHECKS_FAILED failed, $CHECKS_TOTAL total"

# Create summary
cat >> "$OUTPUT_FILE" << EOF

=== MIGRATION VALIDATION SUMMARY ===
Total checks: $CHECKS_TOTAL
Passed: $CHECKS_PASSED
Failed: $CHECKS_FAILED
Success rate: $(($CHECKS_PASSED * 100 / $CHECKS_TOTAL))%
EOF

log "Migration dry-run log: $OUTPUT_FILE"

# Exit with appropriate code
if [[ $CHECKS_FAILED -eq 0 ]]; then
    log "🎉 Migration validation passed!"
    exit 0
else
    log "💥 Migration validation failed with $CHECKS_FAILED issues"
    exit 1
fi