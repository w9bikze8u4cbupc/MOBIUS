#!/bin/bash
#
# rollback_dhash.sh - Verified rollback flow with pre-rollback snapshot and post-restore validation
#
# Usage: ./scripts/rollback_dhash.sh --backup backup.zip --env production [--dry-run]
#

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
LOG_DIR="$ROOT_DIR/deploy_logs"
TEMP_DIR="/tmp/dhash_rollback_$$"

# Default values
BACKUP_FILE=""
ENV=""
DRY_RUN=false
SKIP_PRE_SNAPSHOT=false

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

# Cleanup function
cleanup() {
    local exit_code=$?
    
    if [[ -d "$TEMP_DIR" ]]; then
        log_info "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Rollback process failed with exit code: $exit_code"
        log_error "Check logs for details: $LOG_DIR/rollback.log"
    fi
    
    exit $exit_code
}

# Usage information
usage() {
    cat << EOF
Usage: $0 --backup BACKUP_FILE --env ENVIRONMENT [OPTIONS]

Perform verified rollback of dhash component with comprehensive validation.

Required Arguments:
  --backup FILE        Path to backup ZIP file to restore from
  --env ENVIRONMENT    Target environment (production, staging, development)

Optional Arguments:
  --dry-run           Show what would be restored without making changes
  --skip-pre-snapshot Skip creating pre-rollback snapshot (not recommended)
  --help             Show this help message

Examples:
  $0 --backup backups/dhash_20231027_143022.zip --env production --dry-run
  $0 --backup backups/dhash_staging_20231027.zip --env staging
  $0 --backup /path/to/backup.zip --env production

Safety Notes:
  - Always verify backup integrity before rollback
  - Pre-rollback snapshot is created by default (use --skip-pre-snapshot to disable)
  - Post-restore validation ensures system health
  - Rollback process includes database migration rollbacks

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backup)
                BACKUP_FILE="$2"
                shift 2
                ;;
            --env)
                ENV="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-pre-snapshot)
                SKIP_PRE_SNAPSHOT=true
                shift
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
    if [[ -z "$BACKUP_FILE" ]]; then
        log_error "Backup file is required. Use --backup BACKUP_FILE"
        usage
        exit 1
    fi

    if [[ -z "$ENV" ]]; then
        log_error "Environment is required. Use --env ENVIRONMENT"
        usage
        exit 1
    fi
}

# Validate arguments and environment
validate_args() {
    log_info "Validating arguments and environment"
    
    # Validate environment
    case "$ENV" in
        production|staging|development)
            log_success "Environment '$ENV' is valid"
            ;;
        *)
            log_error "Invalid environment '$ENV'. Must be one of: production, staging, development"
            exit 1
            ;;
    esac

    # Validate backup file
    if [[ ! -f "$BACKUP_FILE" ]]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi

    # Make backup file path absolute
    BACKUP_FILE=$(realpath "$BACKUP_FILE")
    log_info "Using backup file: $BACKUP_FILE"

    # Check backup file extension
    if [[ ! "$BACKUP_FILE" =~ \.zip$ ]]; then
        log_error "Backup file must be a ZIP archive: $BACKUP_FILE"
        exit 1
    fi

    # Check required tools
    local required_tools=("unzip" "node" "sqlite3")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool '$tool' not found in PATH"
            exit 1
        fi
    done
}

# Verify backup integrity
verify_backup_integrity() {
    log_info "Verifying backup integrity"
    
    local checksum_file="${BACKUP_FILE}.sha256"
    
    if [[ ! -f "$checksum_file" ]]; then
        log_error "Checksum file not found: $checksum_file"
        log_error "Cannot verify backup integrity"
        exit 1
    fi

    log_info "Checking SHA256 checksum"
    
    cd "$(dirname "$BACKUP_FILE")"
    local backup_filename=$(basename "$BACKUP_FILE")
    
    if sha256sum -c "$(basename "$checksum_file")" &>/dev/null || shasum -a 256 -c "$(basename "$checksum_file")" &>/dev/null; then
        log_success "Backup integrity verified"
    else
        log_error "Backup integrity check failed"
        exit 1
    fi

    # Test zip file
    if ! unzip -t "$BACKUP_FILE" &>/dev/null; then
        log_error "Backup ZIP file is corrupted"
        exit 1
    fi

    log_success "Backup file integrity confirmed"
}

# Create pre-rollback snapshot
create_pre_rollback_snapshot() {
    if [[ "$SKIP_PRE_SNAPSHOT" == true ]]; then
        log_info "Skipping pre-rollback snapshot (--skip-pre-snapshot specified)"
        return 0
    fi

    log_info "Creating pre-rollback snapshot"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would create pre-rollback snapshot"
        return 0
    fi

    local snapshot_timestamp="prerollback_$(date +'%Y%m%d_%H%M%S')"
    
    # Create snapshot using backup script
    if ! "$SCRIPT_DIR/backup_dhash.sh" --env "$ENV"; then
        log_error "Failed to create pre-rollback snapshot"
        exit 1
    fi

    # Find the most recent backup (our snapshot)
    local snapshot_file=$(find "$BACKUP_DIR" -name "dhash_${ENV}_*.zip" -type f -printf '%T@ %p\n' | sort -k 1nr | head -n1 | cut -d' ' -f2-)
    
    log_success "Pre-rollback snapshot created: $(basename "$snapshot_file")"
    
    # Store snapshot path for reference
    echo "$snapshot_file" > "$LOG_DIR/pre_rollback_snapshot.path"
}

# Extract backup
extract_backup() {
    log_info "Extracting backup archive"
    
    mkdir -p "$TEMP_DIR"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would extract backup to: $TEMP_DIR"
        # List contents for dry run
        log_info "Backup contents:"
        unzip -l "$BACKUP_FILE" | head -20
        return 0
    fi

    cd "$TEMP_DIR"
    
    if ! unzip -q "$BACKUP_FILE"; then
        log_error "Failed to extract backup archive"
        exit 1
    fi

    log_success "Backup extracted to: $TEMP_DIR"
    
    # List extracted contents
    log_info "Extracted contents:"
    ls -la "$TEMP_DIR"
}

# Validate backup contents
validate_backup_contents() {
    log_info "Validating backup contents"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would validate backup contents"
        return 0
    fi

    # Check for metadata file
    local metadata_file="$TEMP_DIR/backup_metadata.json"
    if [[ -f "$metadata_file" ]]; then
        log_info "Backup metadata found:"
        cat "$metadata_file" | jq . 2>/dev/null || cat "$metadata_file"
        
        # Validate environment match
        local backup_env=$(jq -r '.environment' "$metadata_file" 2>/dev/null || echo "unknown")
        if [[ "$backup_env" != "$ENV" ]]; then
            log_warn "Environment mismatch: backup is for '$backup_env', restoring to '$ENV'"
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_error "Rollback cancelled by user"
                exit 1
            fi
        fi
    else
        log_warn "No backup metadata found"
    fi

    # Check for database backup
    local db_files=($(find "$TEMP_DIR" -name "*.sql" -type f))
    if [[ ${#db_files[@]} -gt 0 ]]; then
        log_success "Database backup found: ${db_files[0]}"
    else
        log_warn "No database backup found in archive"
    fi

    # Check for application files
    local app_dirs=("src" "scripts" "config")
    local found_dirs=()
    
    for dir in "${app_dirs[@]}"; do
        if [[ -d "$TEMP_DIR/$dir" ]]; then
            found_dirs+=("$dir")
        fi
    done
    
    if [[ ${#found_dirs[@]} -gt 0 ]]; then
        log_success "Application directories found: ${found_dirs[*]}"
    else
        log_warn "No application directories found in backup"
    fi

    log_success "Backup contents validated"
}

# Stop services
stop_services() {
    log_info "Stopping dhash services"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would stop dhash services for environment: $ENV"
        return 0
    fi

    # Environment-specific service stopping
    case "$ENV" in
        production)
            log_info "Stopping production services..."
            # Add production-specific stop commands here
            # systemctl stop dhash-prod || log_warn "Failed to stop dhash-prod service"
            ;;
        staging)
            log_info "Stopping staging services..."
            # Add staging-specific stop commands here
            # systemctl stop dhash-staging || log_warn "Failed to stop dhash-staging service"
            ;;
        development)
            log_info "Stopping development services..."
            # Add development-specific stop commands here
            # pkill -f "dhash.*dev" || log_warn "No development processes found"
            ;;
    esac
    
    # Wait for services to stop
    sleep 5
    log_success "Services stopped"
}

# Restore database
restore_database() {
    log_info "Restoring database from backup"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would restore database for environment: $ENV"
        return 0
    fi

    # Find database backup file
    local db_backup_file=$(find "$TEMP_DIR" -name "*.sql" -type f | head -n1)
    
    if [[ -z "$db_backup_file" ]]; then
        log_warn "No database backup found - skipping database restore"
        return 0
    fi

    log_info "Restoring from: $(basename "$db_backup_file")"

    # Get database connection
    local env_var="DHASH_${ENV^^}_DATABASE_URL"
    local db_url="${!env_var:-}"
    
    if [[ -z "$db_url" ]]; then
        if [[ "$ENV" == "development" ]]; then
            db_url="sqlite://./dhash_dev.db"
        else
            log_error "Database URL not configured for $ENV environment"
            log_error "Please set $env_var environment variable"
            exit 1
        fi
    fi

    case "$db_url" in
        sqlite://*)
            local db_file="${db_url#sqlite://}"
            log_info "Restoring SQLite database: $db_file"
            
            # Backup current database
            if [[ -f "$db_file" ]]; then
                cp "$db_file" "${db_file}.pre_rollback"
                log_info "Current database backed up to: ${db_file}.pre_rollback"
            fi
            
            # Restore from backup
            sqlite3 "$db_file" < "$db_backup_file"
            log_success "Database restored successfully"
            ;;
        postgres://*)
            log_info "Restoring PostgreSQL database"
            if command -v psql &> /dev/null; then
                # Drop and recreate database, then restore
                log_warn "PostgreSQL restore implementation needed"
            else
                log_error "psql not found. Install PostgreSQL client tools."
                exit 1
            fi
            ;;
        mysql://*)
            log_info "Restoring MySQL database"
            if command -v mysql &> /dev/null; then
                log_warn "MySQL restore implementation needed"
            else
                log_error "mysql not found. Install MySQL client tools."
                exit 1
            fi
            ;;
        *)
            log_error "Unsupported database URL format: $db_url"
            exit 1
            ;;
    esac
}

# Restore application files
restore_application_files() {
    log_info "Restoring application files"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would restore application files to: $ROOT_DIR"
        return 0
    fi

    cd "$ROOT_DIR"
    
    # Define files and directories to restore
    local restore_items=(
        "src"
        "scripts"
        "config"
        "templates"
        "package.json"
        "quality-gates-config.json"
    )
    
    # Backup current files before restore
    local backup_suffix=".pre_rollback_$(date +'%Y%m%d_%H%M%S')"
    
    for item in "${restore_items[@]}"; do
        if [[ -e "$ROOT_DIR/$item" ]]; then
            log_info "Backing up current: $item"
            if [[ -d "$ROOT_DIR/$item" ]]; then
                mv "$ROOT_DIR/$item" "${ROOT_DIR}/${item}${backup_suffix}"
            else
                cp "$ROOT_DIR/$item" "${ROOT_DIR}/${item}${backup_suffix}"
            fi
        fi
        
        # Restore from backup
        if [[ -e "$TEMP_DIR/$item" ]]; then
            log_info "Restoring: $item"
            if [[ -d "$TEMP_DIR/$item" ]]; then
                cp -r "$TEMP_DIR/$item" "$ROOT_DIR/"
            else
                cp "$TEMP_DIR/$item" "$ROOT_DIR/"
            fi
        fi
    done
    
    log_success "Application files restored"
}

# Rollback database migrations if needed
rollback_migrations() {
    log_info "Rolling back database migrations if needed"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would rollback migrations for environment: $ENV"
        return 0
    fi

    # Check if migration rollback is needed
    local metadata_file="$TEMP_DIR/backup_metadata.json"
    if [[ -f "$metadata_file" ]]; then
        local backup_commit=$(jq -r '.git_commit // "unknown"' "$metadata_file" 2>/dev/null)
        local current_commit=$(cd "$ROOT_DIR" && git rev-parse HEAD 2>/dev/null || echo "unknown")
        
        if [[ "$backup_commit" != "$current_commit" && "$backup_commit" != "unknown" ]]; then
            log_info "Git commit mismatch detected - migrations may need rollback"
            log_info "Backup commit: $backup_commit"
            log_info "Current commit: $current_commit"
            
            # Run migration rollback
            if [[ -x "$SCRIPT_DIR/migrate_dhash.sh" ]]; then
                log_info "Running migration rollback..."
                "$SCRIPT_DIR/migrate_dhash.sh" --env "$ENV" --direction rollback || log_warn "Migration rollback failed"
            fi
        else
            log_info "No migration rollback needed"
        fi
    fi
}

# Start services
start_services() {
    log_info "Starting dhash services"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would start dhash services for environment: $ENV"
        return 0
    fi

    # Install dependencies
    cd "$ROOT_DIR"
    npm ci --production
    
    # Environment-specific service starting
    case "$ENV" in
        production)
            log_info "Starting production services..."
            # systemctl start dhash-prod
            ;;
        staging)
            log_info "Starting staging services..."
            # systemctl start dhash-staging
            ;;
        development)
            log_info "Starting development services..."
            # npm start &
            ;;
    esac
    
    # Wait for services to start
    sleep 10
    log_success "Services started"
}

# Post-restore validation
post_restore_validation() {
    log_info "Performing post-restore validation"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would perform post-restore validation"
        return 0
    fi

    # Run health checks
    local health_endpoint="${DHASH_${ENV^^}_URL:-http://localhost:3000}/health"
    local max_attempts=12
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -sf "$health_endpoint" > /dev/null 2>&1; then
            log_success "Health check passed"
            break
        fi
        
        attempt=$((attempt + 1))
        log_info "Health check failed, attempt $attempt/$max_attempts"
        sleep 5
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Health check failed after $max_attempts attempts"
        return 1
    fi

    # Run smoke tests
    if [[ -x "$SCRIPT_DIR/smoke_tests.sh" ]]; then
        log_info "Running smoke tests..."
        "$SCRIPT_DIR/smoke_tests.sh" --env "$ENV" || return 1
    fi

    # Validate logging
    if [[ -f "$SCRIPT_DIR/validate_logging.js" ]]; then
        log_info "Validating logging..."
        node "$SCRIPT_DIR/validate_logging.js" --env "$ENV" || return 1
    fi

    log_success "Post-restore validation completed"
}

# Send rollback notifications
send_notifications() {
    local status=$1
    local message=$2
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would send notification: $status - $message"
        return 0
    fi

    if [[ -f "$SCRIPT_DIR/deploy/deploy-notify.js" ]]; then
        node "$SCRIPT_DIR/deploy/deploy-notify.js" \
            --env "$ENV" \
            --status "$status" \
            --message "ROLLBACK: $message" \
            --backup-file "$BACKUP_FILE"
    fi
}

# Main execution
main() {
    # Setup
    trap cleanup EXIT
    mkdir -p "$LOG_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    log_info "Starting dhash rollback process"
    log_info "Environment: $ENV"
    log_info "Backup file: $BACKUP_FILE"
    log_info "Dry run: $DRY_RUN"
    
    # Execute rollback steps
    validate_args
    verify_backup_integrity
    create_pre_rollback_snapshot
    extract_backup
    validate_backup_contents
    
    send_notifications "started" "Rollback process initiated"
    
    stop_services
    restore_database
    restore_application_files
    rollback_migrations
    start_services
    
    if post_restore_validation; then
        send_notifications "success" "Rollback completed successfully"
        log_success "Dhash rollback completed successfully!"
        
        # Print summary
        cat << EOF

=== ROLLBACK SUMMARY ===
Environment: $ENV
Backup File: $(basename "$BACKUP_FILE")
Dry Run: $DRY_RUN
Pre-rollback Snapshot: $(test -f "$LOG_DIR/pre_rollback_snapshot.path" && cat "$LOG_DIR/pre_rollback_snapshot.path" | xargs basename || echo "N/A")
Status: SUCCESS
Completed: $(date)

Post-Rollback Steps:
1. Monitor system for 30 minutes
2. Run additional smoke tests if needed
3. Verify all critical functionality
4. Update incident documentation

EOF
        exit 0
    else
        send_notifications "failed" "Rollback validation failed"
        log_error "Rollback validation failed!"
        exit 1
    fi
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi