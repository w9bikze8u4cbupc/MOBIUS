#!/bin/bash
#
# backup_dhash.sh - Timestamped backups + SHA256 generation/verification + retention
#
# Usage: ./scripts/backup_dhash.sh --env production [--retention-days 30]
#

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
LOG_DIR="$ROOT_DIR/deploy_logs"

# Default values
ENV=""
RETENTION_DAYS=30
DRY_RUN=false

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
Usage: $0 --env ENVIRONMENT [OPTIONS]

Create timestamped backups of dhash component with SHA256 verification.

Required Arguments:
  --env ENVIRONMENT      Target environment (production, staging, development)

Optional Arguments:
  --retention-days DAYS  Number of days to retain backups (default: 30)
  --dry-run             Show what would be backed up without creating backup
  --help               Show this help message

Examples:
  $0 --env production
  $0 --env staging --retention-days 7
  $0 --env production --dry-run

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
            --retention-days)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
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
    if [[ -z "$ENV" ]]; then
        log_error "Environment is required. Use --env ENVIRONMENT"
        usage
        exit 1
    fi
}

# Validate environment
validate_environment() {
    log_info "Validating environment: $ENV"
    
    case "$ENV" in
        production|staging|development)
            log_success "Environment '$ENV' is valid"
            ;;
        *)
            log_error "Invalid environment '$ENV'. Must be one of: production, staging, development"
            exit 1
            ;;
    esac

    # Ensure backup directory exists
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_info "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Get database backup
backup_database() {
    local backup_timestamp="$1"
    local db_backup_file="$BACKUP_DIR/dhash_${ENV}_db_${backup_timestamp}.sql"
    
    log_info "Creating database backup"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would create database backup: $db_backup_file"
        return 0
    fi

    # Get database connection
    local env_var="DHASH_${ENV^^}_DATABASE_URL"
    local db_url="${!env_var:-}"
    
    if [[ -z "$db_url" ]]; then
        if [[ "$ENV" == "development" ]]; then
            db_url="sqlite://./dhash_dev.db"
        else
            log_error "Database URL not configured for $ENV environment"
            log_error "Please set $env_var environment variable"
            return 1
        fi
    fi
    
    case "$db_url" in
        sqlite://*)
            local db_file="${db_url#sqlite://}"
            if [[ -f "$db_file" ]]; then
                log_info "Backing up SQLite database: $db_file"
                sqlite3 "$db_file" .dump > "$db_backup_file"
                log_success "Database backup created: $db_backup_file"
            else
                log_warn "SQLite database file not found: $db_file"
                echo "-- No database found to backup" > "$db_backup_file"
            fi
            ;;
        postgres://*)
            log_info "Backing up PostgreSQL database"
            # Extract connection details from URL
            # postgres://user:pass@host:port/dbname
            if command -v pg_dump &> /dev/null; then
                pg_dump "$db_url" > "$db_backup_file"
                log_success "PostgreSQL backup created: $db_backup_file"
            else
                log_error "pg_dump not found. Install PostgreSQL client tools."
                return 1
            fi
            ;;
        mysql://*)
            log_info "Backing up MySQL database"
            # mysql://user:pass@host:port/dbname
            if command -v mysqldump &> /dev/null; then
                # Parse MySQL URL and create backup
                log_warn "MySQL backup implementation needed"
                echo "-- MySQL backup not yet implemented" > "$db_backup_file"
            else
                log_error "mysqldump not found. Install MySQL client tools."
                return 1
            fi
            ;;
        *)
            log_warn "Unsupported database URL format: $db_url"
            echo "-- Unsupported database format for backup" > "$db_backup_file"
            ;;
    esac
    
    echo "$db_backup_file"
}

# Backup application files
backup_application_files() {
    local backup_timestamp="$1"
    local files_backup_dir="$BACKUP_DIR/dhash_${ENV}_files_${backup_timestamp}"
    
    log_info "Creating application files backup"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would create application files backup: $files_backup_dir"
        return 0
    fi

    mkdir -p "$files_backup_dir"
    
    # Define files and directories to backup
    local backup_items=(
        "src/"
        "scripts/"
        "package.json"
        "package-lock.json"
        ".env.${ENV}"
        "quality-gates-config.json"
    )
    
    # Optional items (backup if they exist)
    local optional_items=(
        "migrations/"
        "config/"
        "templates/"
        "logs/"
        "uploads/"
    )
    
    cd "$ROOT_DIR"
    
    # Backup required items
    for item in "${backup_items[@]}"; do
        if [[ -e "$item" ]]; then
            log_info "Backing up: $item"
            if [[ -d "$item" ]]; then
                cp -r "$item" "$files_backup_dir/"
            else
                cp "$item" "$files_backup_dir/"
            fi
        else
            log_warn "Required item not found: $item"
        fi
    done
    
    # Backup optional items
    for item in "${optional_items[@]}"; do
        if [[ -e "$item" ]]; then
            log_info "Backing up optional: $item"
            if [[ -d "$item" ]]; then
                cp -r "$item" "$files_backup_dir/"
            else
                cp "$item" "$files_backup_dir/"
            fi
        fi
    done
    
    log_success "Application files backup created: $files_backup_dir"
    echo "$files_backup_dir"
}

# Create backup archive
create_backup_archive() {
    local backup_timestamp="$1"
    local db_backup_file="$2"
    local files_backup_dir="$3"
    
    local archive_name="dhash_${ENV}_${backup_timestamp}.zip"
    local archive_path="$BACKUP_DIR/$archive_name"
    
    log_info "Creating backup archive: $archive_name"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would create archive: $archive_path"
        echo "$archive_path"
        return 0
    fi

    cd "$BACKUP_DIR"
    
    # Create archive with timestamp in metadata
    local temp_dir="backup_temp_$$"
    mkdir -p "$temp_dir"
    
    # Copy files to temp directory with proper structure
    if [[ -f "$db_backup_file" ]]; then
        cp "$db_backup_file" "$temp_dir/"
    fi
    
    if [[ -d "$files_backup_dir" ]]; then
        cp -r "$files_backup_dir"/* "$temp_dir/"
    fi
    
    # Create metadata file
    cat > "$temp_dir/backup_metadata.json" << EOF
{
    "backup_timestamp": "$backup_timestamp",
    "environment": "$ENV",
    "created_by": "$(whoami)",
    "hostname": "$(hostname)",
    "backup_script_version": "1.0.0",
    "created_at": "$(date -Iseconds)",
    "git_commit": "$(cd "$ROOT_DIR" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(cd "$ROOT_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF

    # Create ZIP archive
    if command -v zip &> /dev/null; then
        zip -r "$archive_name" "$temp_dir"/*
    else
        log_error "zip command not found. Install zip utility."
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Cleanup temp directory
    rm -rf "$temp_dir"
    
    # Cleanup individual backup files
    if [[ -f "$db_backup_file" ]]; then
        rm "$db_backup_file"
    fi
    
    if [[ -d "$files_backup_dir" ]]; then
        rm -rf "$files_backup_dir"
    fi
    
    log_success "Backup archive created: $archive_path"
    echo "$archive_path"
}

# Generate SHA256 checksum
generate_checksum() {
    local archive_path="$1"
    local checksum_file="${archive_path}.sha256"
    
    log_info "Generating SHA256 checksum"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would generate checksum: $checksum_file"
        return 0
    fi

    cd "$BACKUP_DIR"
    local archive_name=$(basename "$archive_path")
    
    # Generate checksum
    if command -v sha256sum &> /dev/null; then
        sha256sum "$archive_name" > "$checksum_file"
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$archive_name" > "$checksum_file"
    else
        log_error "Neither sha256sum nor shasum found. Cannot generate checksum."
        return 1
    fi
    
    log_success "Checksum generated: $checksum_file"
    
    # Verify checksum immediately
    if sha256sum -c "$checksum_file" &> /dev/null || shasum -a 256 -c "$checksum_file" &> /dev/null; then
        log_success "Checksum verification passed"
    else
        log_error "Checksum verification failed"
        return 1
    fi
}

# Clean old backups based on retention policy
cleanup_old_backups() {
    log_info "Cleaning up old backups (retention: $RETENTION_DAYS days)"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would clean up backups older than $RETENTION_DAYS days"
        find "$BACKUP_DIR" -name "dhash_${ENV}_*.zip" -mtime +$RETENTION_DAYS -ls 2>/dev/null || true
        return 0
    fi

    local deleted_count=0
    
    # Find and delete old backup files
    while IFS= read -r -d '' file; do
        log_info "Deleting old backup: $(basename "$file")"
        rm -f "$file"
        rm -f "${file}.sha256"
        deleted_count=$((deleted_count + 1))
    done < <(find "$BACKUP_DIR" -name "dhash_${ENV}_*.zip" -mtime +$RETENTION_DAYS -print0 2>/dev/null || true)
    
    if [[ $deleted_count -gt 0 ]]; then
        log_success "Deleted $deleted_count old backup(s)"
    else
        log_info "No old backups to delete"
    fi
}

# List existing backups
list_backups() {
    log_info "Current backups for environment: $ENV"
    
    local backups
    backups=$(find "$BACKUP_DIR" -name "dhash_${ENV}_*.zip" -type f 2>/dev/null | sort -r || true)
    
    if [[ -z "$backups" ]]; then
        log_info "No existing backups found"
        return 0
    fi
    
    echo ""
    printf "%-40s %-15s %-20s %s\n" "BACKUP FILE" "SIZE" "CREATED" "CHECKSUM"
    printf "%-40s %-15s %-20s %s\n" "$(printf '=%.0s' {1..40})" "$(printf '=%.0s' {1..15})" "$(printf '=%.0s' {1..20})" "$(printf '=%.0s' {1..10})"
    
    while IFS= read -r backup_file; do
        if [[ -n "$backup_file" ]]; then
            local filename=$(basename "$backup_file")
            local size=$(ls -lh "$backup_file" | awk '{print $5}')
            local created=$(ls -l "$backup_file" | awk '{print $6, $7, $8}')
            local checksum_status="❌"
            
            if [[ -f "${backup_file}.sha256" ]]; then
                if cd "$BACKUP_DIR" && (sha256sum -c "$(basename "$backup_file").sha256" &>/dev/null || shasum -a 256 -c "$(basename "$backup_file").sha256" &>/dev/null); then
                    checksum_status="✅"
                fi
            fi
            
            printf "%-40s %-15s %-20s %s\n" "$filename" "$size" "$created" "$checksum_status"
        fi
    done <<< "$backups"
    echo ""
}

# Main execution
main() {
    # Setup
    mkdir -p "$LOG_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    log_info "Starting dhash backup process"
    log_info "Environment: $ENV"
    log_info "Retention: $RETENTION_DAYS days"
    log_info "Dry run: $DRY_RUN"
    
    # Execute backup steps
    validate_environment
    
    # Show existing backups
    list_backups
    
    # Create new backup
    local backup_timestamp=$(date +'%Y%m%d_%H%M%S')
    log_info "Creating backup with timestamp: $backup_timestamp"
    
    local db_backup_file
    db_backup_file=$(backup_database "$backup_timestamp")
    
    local files_backup_dir
    files_backup_dir=$(backup_application_files "$backup_timestamp")
    
    local archive_path
    archive_path=$(create_backup_archive "$backup_timestamp" "$db_backup_file" "$files_backup_dir")
    
    if [[ "$DRY_RUN" != true ]]; then
        generate_checksum "$archive_path"
        cleanup_old_backups
        
        # Show updated backup list
        echo ""
        list_backups
        
        log_success "Backup process completed successfully!"
        
        # Print summary
        cat << EOF

=== BACKUP SUMMARY ===
Environment: $ENV
Timestamp: $backup_timestamp
Archive: $(basename "$archive_path")
Size: $(ls -lh "$archive_path" 2>/dev/null | awk '{print $5}' || echo "unknown")
Checksum: ${archive_path}.sha256
Retention: $RETENTION_DAYS days
Status: SUCCESS

Next Steps:
1. Verify backup integrity: sha256sum -c "$(basename "$archive_path").sha256"
2. Test restore procedure in non-production environment
3. Ensure backup is stored in secure location

EOF
    else
        log_info "Dry run completed - no files created"
    fi
    
    exit 0
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi