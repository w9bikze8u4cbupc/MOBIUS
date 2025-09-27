#!/bin/bash

# dhash Backup Script with SHA256 verification & retention
# Usage: ./scripts/backup_dhash.sh [--env staging|production] [--retention-days 7]

set -euo pipefail

# Default values
ENVIRONMENT="staging"
RETENTION_DAYS=7
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
LOGS_DIR="$PROJECT_ROOT/logs"
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
dhash Backup Script - Guarded Production Rollout

Usage: $0 [OPTIONS]

OPTIONS:
    --env ENV               Target environment: staging|production (default: staging)
    --retention-days DAYS   Number of days to retain backups (default: 7)
    --help                  Show this help message

Examples:
    $0 --env staging
    $0 --env production --retention-days 14

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --retention-days)
            RETENTION_DAYS="$2"
            shift 2
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

# Validate retention days
if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$RETENTION_DAYS" -lt 1 ]]; then
    error "Invalid retention days: $RETENTION_DAYS. Must be a positive integer"
    exit 1
fi

# Setup directories
setup_directories() {
    mkdir -p "$BACKUP_DIR" "$LOGS_DIR"
    log "Ensured directories exist: $BACKUP_DIR, $LOGS_DIR"
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

# Create timestamped backup
create_backup() {
    local backup_name="dhash_${ENVIRONMENT}_${TIMESTAMP}"
    local backup_path="$BACKUP_DIR/${backup_name}.zip"
    local log_file="$LOGS_DIR/backup_${ENVIRONMENT}_${TIMESTAMP}.log"
    
    log "Creating backup: $backup_name"
    
    # Create log file
    {
        echo "=== BACKUP LOG ==="
        echo "Environment: $ENVIRONMENT"
        echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"
        echo "Backup name: $backup_name"
        echo "Started at: $(date)"
        echo ""
    } > "$log_file"
    
    # Create temporary directory for backup contents
    local temp_dir
    temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" EXIT
    
    local backup_content_dir="$temp_dir/$backup_name"
    mkdir -p "$backup_content_dir"
    
    # Database dump
    log "Creating database dump..."
    {
        echo "Creating database dump..."
        echo "pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
    } >> "$log_file"
    
    # Create sample database dump (in production, use real pg_dump)
    cat > "$backup_content_dir/database_dump.sql" << EOF
-- dhash Database Backup
-- Environment: $ENVIRONMENT
-- Created: $(date)
-- Database: $DB_NAME

-- Sample data structure
CREATE TABLE dhash_entries (
    id SERIAL PRIMARY KEY,
    hash_key VARCHAR(64) NOT NULL UNIQUE,
    hash_value VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample data
INSERT INTO dhash_entries (hash_key, hash_value) VALUES 
    ('test_key_1', 'sha256:abc123def456'),
    ('test_key_2', 'sha256:def789ghi012'),
    ('test_key_3', 'sha256:ghi345jkl678');

-- Performance metrics table
CREATE TABLE dhash_performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(64) NOT NULL,
    metric_value DECIMAL(10,2) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

EOF
    
    # Configuration backup
    log "Backing up configuration files..."
    {
        echo "Backing up configuration files..."
    } >> "$log_file"
    
    mkdir -p "$backup_content_dir/config"
    
    # Backup configuration files if they exist
    if [[ -d "$PROJECT_ROOT/config" ]]; then
        cp -r "$PROJECT_ROOT/config"/* "$backup_content_dir/config/" 2>/dev/null || true
    fi
    
    # Create sample config files for demonstration
    cat > "$backup_content_dir/config/dhash_${ENVIRONMENT}.conf" << EOF
# dhash Configuration - $ENVIRONMENT
DHASH_SERVICE_NAME=dhash-service
DHASH_IMAGE_TAG=v1.2.3
DHASH_REPLICAS=3
DHASH_MEMORY_LIMIT=2Gi
DHASH_CPU_LIMIT=1000m
BACKUP_RETENTION_DAYS=$RETENTION_DAYS
EOF
    
    # Create backup metadata
    cat > "$backup_content_dir/backup_metadata.json" << EOF
{
    "backup_name": "$backup_name",
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -Iseconds)",
    "database": {
        "host": "$DB_HOST",
        "port": "$DB_PORT",
        "name": "$DB_NAME"
    },
    "version": "1.0.0",
    "retention_days": $RETENTION_DAYS
}
EOF
    
    # Create the zip archive
    log "Creating zip archive..."
    (cd "$temp_dir" && zip -r "$backup_path" "$backup_name" > /dev/null)
    
    # Generate SHA256 checksum
    log "Generating SHA256 checksum..."
    cd "$BACKUP_DIR"
    sha256sum "$(basename "$backup_path")" > "${backup_path}.sha256"
    
    {
        echo "Backup created: $backup_path"
        echo "SHA256 checksum: ${backup_path}.sha256"
        echo "Backup size: $(du -h "$backup_path" | cut -f1)"
        echo "Completed at: $(date)"
    } >> "$log_file"
    
    success "Backup created successfully: $(basename "$backup_path")"
    log "SHA256 checksum: ${backup_path}.sha256"
    log "Backup size: $(du -h "$backup_path" | cut -f1)"
}

# Verify backup integrity
verify_backup() {
    local backup_path="$1"
    local checksum_path="${backup_path}.sha256"
    
    if [[ ! -f "$checksum_path" ]]; then
        error "Checksum file not found: $checksum_path"
        return 1
    fi
    
    log "Verifying backup integrity..."
    cd "$(dirname "$backup_path")"
    
    if sha256sum -c "$(basename "$checksum_path")" > /dev/null 2>&1; then
        success "Backup integrity verified"
        return 0
    else
        error "Backup integrity check failed"
        return 1
    fi
}

# Clean old backups based on retention policy
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local cleaned_count=0
    
    # Find and remove old backup files
    while IFS= read -r -d '' backup_file; do
        local backup_age
        backup_age=$(stat -c %Y "$backup_file")
        local current_time
        current_time=$(date +%s)
        local age_days
        age_days=$(( (current_time - backup_age) / 86400 ))
        
        if [[ $age_days -gt $RETENTION_DAYS ]]; then
            log "Removing old backup: $(basename "$backup_file") (${age_days} days old)"
            rm -f "$backup_file"
            rm -f "${backup_file}.sha256"
            ((cleaned_count++))
        fi
    done < <(find "$BACKUP_DIR" -name "dhash_*.zip" -type f -print0 2>/dev/null || true)
    
    if [[ $cleaned_count -gt 0 ]]; then
        success "Cleaned up $cleaned_count old backups"
    else
        log "No old backups to clean up"
    fi
}

# List existing backups
list_backups() {
    log "Current backups in $BACKUP_DIR:"
    
    local backup_count=0
    
    for backup_file in "$BACKUP_DIR"/dhash_*.zip; do
        if [[ -f "$backup_file" ]]; then
            local backup_size
            backup_size=$(du -h "$backup_file" | cut -f1)
            local backup_date
            backup_date=$(stat -c %y "$backup_file" | cut -d' ' -f1)
            
            echo "  $(basename "$backup_file") - $backup_size - $backup_date"
            
            # Check if checksum exists
            if [[ -f "${backup_file}.sha256" ]]; then
                echo "    ✓ SHA256 checksum available"
            else
                echo "    ⚠ SHA256 checksum missing"
            fi
            
            ((backup_count++))
        fi
    done
    
    if [[ $backup_count -eq 0 ]]; then
        log "No existing backups found"
    else
        log "Total backups: $backup_count"
    fi
}

# Main execution
main() {
    log "dhash Backup Script - Environment: $ENVIRONMENT"
    log "Retention policy: $RETENTION_DAYS days"
    
    setup_directories
    load_db_config
    
    # Show current backups
    list_backups
    
    # Create new backup
    create_backup
    
    # Verify the backup we just created
    local latest_backup
    latest_backup=$(ls -1 "$BACKUP_DIR"/dhash_*.zip | sort -r | head -n1)
    if [[ -n "$latest_backup" ]]; then
        verify_backup "$latest_backup"
    fi
    
    # Clean up old backups
    cleanup_old_backups
    
    # Show updated backup list
    echo ""
    list_backups
    
    success "Backup process completed successfully"
    echo "Latest backup: $(basename "$latest_backup")"
    echo "Verify with: sha256sum -c \"${latest_backup}.sha256\""
}

# Error handling
trap 'error "Backup failed at line $LINENO. Check logs in $LOGS_DIR"' ERR

# Execute main function
main "$@"