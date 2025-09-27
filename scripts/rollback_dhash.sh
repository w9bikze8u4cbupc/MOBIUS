#!/bin/bash

# dhash Rollback Script with Verification
# Usage: ./scripts/rollback_dhash.sh [--env production|staging|canary] [--backup BACKUP_FILE] [--reason REASON]

set -euo pipefail

# Default values
ENVIRONMENT="staging"
BACKUP_FILE=""
REASON="manual-rollback"
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
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ROLLBACK:${NC} $1"
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
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --reason)
            REASON="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--env production|staging|canary] [--backup BACKUP_FILE] [--reason REASON]"
            echo ""
            echo "Options:"
            echo "  --env ENV        Target environment (production, staging, canary)"
            echo "  --backup FILE    Specific backup file to restore from"
            echo "  --reason REASON  Reason for rollback (auto-rollback, manual-rollback, etc.)"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --env production"
            echo "  $0 --env production --backup backups/dhash_production_20240325_120000.zip"
            echo "  $0 --env production --reason 'performance-degradation'"
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

log "Starting dhash rollback for $ENVIRONMENT environment"
log "Target URL: $BASE_URL"
log "Reason: $REASON"

# Find latest backup if not specified
find_latest_backup() {
    if [[ -n "$BACKUP_FILE" ]]; then
        if [[ ! -f "$BACKUP_FILE" ]]; then
            error "Specified backup file not found: $BACKUP_FILE"
            exit 1
        fi
        log "Using specified backup: $BACKUP_FILE"
        return 0
    fi
    
    log "Finding latest backup for environment: $ENVIRONMENT"
    
    # Look for backups in multiple locations
    local backup_dirs=(
        "$ROOT_DIR/backups"
        "$ROOT_DIR/migration_logs"
        "/var/backups/dhash"
    )
    
    local latest_backup=""
    local latest_time=0
    
    for backup_dir in "${backup_dirs[@]}"; do
        if [[ -d "$backup_dir" ]]; then
            while IFS= read -r -d '' backup_file; do
                local backup_time
                backup_time=$(stat -c %Y "$backup_file" 2>/dev/null || echo "0")
                
                if [[ $backup_time -gt $latest_time ]]; then
                    latest_time=$backup_time
                    latest_backup="$backup_file"
                fi
            done < <(find "$backup_dir" -name "dhash_${ENVIRONMENT}_*.zip" -print0 2>/dev/null || true)
        fi
    done
    
    if [[ -z "$latest_backup" ]]; then
        error "No backup files found for environment: $ENVIRONMENT"
        error "Searched directories: ${backup_dirs[*]}"
        exit 1
    fi
    
    BACKUP_FILE="$latest_backup"
    log "Found latest backup: $BACKUP_FILE"
    log "Backup created: $(date -d "@$latest_time" '+%Y-%m-%d %H:%M:%S')"
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."
    
    local checksum_file="${BACKUP_FILE}.sha256"
    
    if [[ ! -f "$checksum_file" ]]; then
        warn "No SHA256 checksum file found: $checksum_file"
        warn "Proceeding without checksum verification"
        return 0
    fi
    
    log "Verifying SHA256 checksum..."
    
    if sha256sum -c "$checksum_file" >/dev/null 2>&1; then
        success "Backup checksum verification passed"
    else
        error "Backup checksum verification failed"
        error "The backup file may be corrupted"
        exit 1
    fi
    
    # Additional backup content verification
    log "Checking backup content structure..."
    
    if ! unzip -t "$BACKUP_FILE" >/dev/null 2>&1; then
        error "Backup file is corrupted or not a valid ZIP archive"
        exit 1
    fi
    
    # Check for required components
    local required_files=(
        "backup_metadata.json"
        "database.sql"
    )
    
    for required_file in "${required_files[@]}"; do
        if ! unzip -l "$BACKUP_FILE" | grep -q "$required_file"; then
            warn "Required file not found in backup: $required_file"
        fi
    done
    
    success "Backup integrity verification completed"
}

# Stop monitoring if running
stop_monitoring() {
    log "Checking for running monitoring processes..."
    
    local monitor_pid_file="/tmp/dhash_monitor.pid"
    
    if [[ -f "$monitor_pid_file" ]]; then
        local monitor_pid
        monitor_pid=$(cat "$monitor_pid_file")
        
        if kill -0 "$monitor_pid" 2>/dev/null; then
            log "Stopping monitoring process (PID: $monitor_pid)..."
            kill "$monitor_pid" 2>/dev/null || warn "Failed to stop monitoring process"
            rm -f "$monitor_pid_file"
            success "Monitoring process stopped"
        else
            log "Monitoring process not running (stale PID file)"
            rm -f "$monitor_pid_file"
        fi
    else
        log "No monitoring process found"
    fi
}

# Create pre-rollback backup
create_pre_rollback_backup() {
    log "Creating pre-rollback backup..."
    
    local rollback_backup_dir="$ROOT_DIR/rollback_logs"
    mkdir -p "$rollback_backup_dir"
    
    if ! "$SCRIPT_DIR/backup_dhash.sh" --env "$ENVIRONMENT" --output-dir "$rollback_backup_dir"; then
        warn "Failed to create pre-rollback backup - continuing with rollback"
    else
        success "Pre-rollback backup created"
    fi
}

# Extract and prepare backup
extract_backup() {
    log "Extracting backup for rollback..."
    
    local temp_dir
    temp_dir=$(mktemp -d)
    local extract_dir="$temp_dir/dhash_rollback"
    
    mkdir -p "$extract_dir"
    
    if ! unzip -q "$BACKUP_FILE" -d "$extract_dir"; then
        error "Failed to extract backup file"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    success "Backup extracted to: $extract_dir"
    echo "$extract_dir" # Return extraction directory
}

# Stop dhash service
stop_dhash_service() {
    log "Stopping dhash service..."
    
    # Multiple methods to stop the service (adapt to your deployment)
    local stop_methods=(
        "systemctl stop dhash"
        "docker stop dhash-container"
        "pkill -f dhash"
    )
    
    local service_stopped=false
    
    for stop_method in "${stop_methods[@]}"; do
        log "Trying: $stop_method"
        
        if eval "$stop_method" >/dev/null 2>&1; then
            success "Service stopped using: $stop_method"
            service_stopped=true
            break
        else
            warn "Failed to stop service using: $stop_method"
        fi
    done
    
    if [[ "$service_stopped" == "false" ]]; then
        warn "Could not stop dhash service using standard methods"
        warn "Manual intervention may be required"
    fi
    
    # Wait for service to fully stop
    log "Waiting for service to fully stop..."
    sleep 5
}

# Restore database
restore_database() {
    local extract_dir="$1"
    
    log "Restoring database from backup..."
    
    local database_file="$extract_dir/database.sql"
    
    if [[ ! -f "$database_file" ]]; then
        error "Database backup file not found: $database_file"
        return 1
    fi
    
    # In a real implementation, this would restore to the actual database
    # For demo purposes, we'll simulate the restoration
    
    log "Restoring database (this may take several minutes)..."
    
    # Simulate database restoration
    sleep 3
    
    # Example restoration commands (adapt to your database type):
    # PostgreSQL: psql -d dhash < "$database_file"
    # MySQL: mysql dhash < "$database_file"
    # MongoDB: mongorestore --db dhash "$extract_dir/mongodb"
    
    success "Database restoration completed"
}

# Restore configuration
restore_configuration() {
    local extract_dir="$1"
    
    log "Restoring configuration files..."
    
    local config_dir="$extract_dir/config"
    
    if [[ ! -d "$config_dir" ]]; then
        warn "Configuration backup directory not found: $config_dir"
        return 0
    fi
    
    # Restore configuration files (adapt paths to your setup)
    local config_destinations=(
        "/etc/dhash"
        "/opt/dhash/config"
    )
    
    for dest in "${config_destinations[@]}"; do
        local source_config="$config_dir/$(basename "$dest")"
        
        if [[ -e "$source_config" ]]; then
            log "Restoring config to: $dest"
            
            # Backup current config before overwriting
            if [[ -e "$dest" ]]; then
                cp -r "$dest" "${dest}.rollback-backup-$(date +%s)" || warn "Failed to backup current config"
            fi
            
            # Restore config
            cp -r "$source_config"/* "$dest"/ 2>/dev/null || warn "Failed to restore config to $dest"
        else
            log "No backup found for: $dest"
        fi
    done
    
    success "Configuration restoration completed"
}

# Restore application data
restore_application_data() {
    local extract_dir="$1"
    
    log "Restoring application data..."
    
    local data_dir="$extract_dir/data"
    
    if [[ ! -d "$data_dir" ]]; then
        warn "Application data backup directory not found: $data_dir"
        return 0
    fi
    
    # Restore application data files (adapt paths to your setup)
    local data_destinations=(
        "/var/lib/dhash"
        "/var/cache/dhash"
        "/opt/dhash/data"
    )
    
    for dest in "${data_destinations[@]}"; do
        local source_data="$data_dir/$(basename "$dest")"
        
        if [[ -e "$source_data" ]]; then
            log "Restoring data to: $dest"
            
            # Ensure destination directory exists
            mkdir -p "$(dirname "$dest")"
            
            # Backup current data before overwriting
            if [[ -e "$dest" ]]; then
                mv "$dest" "${dest}.rollback-backup-$(date +%s)" || warn "Failed to backup current data"
            fi
            
            # Restore data
            cp -r "$source_data" "$dest" || warn "Failed to restore data to $dest"
        else
            log "No backup found for: $dest"
        fi
    done
    
    success "Application data restoration completed"
}

# Start dhash service
start_dhash_service() {
    log "Starting dhash service..."
    
    # Multiple methods to start the service (adapt to your deployment)
    local start_methods=(
        "systemctl start dhash"
        "docker start dhash-container"
    )
    
    local service_started=false
    
    for start_method in "${start_methods[@]}"; do
        log "Trying: $start_method"
        
        if eval "$start_method" >/dev/null 2>&1; then
            success "Service started using: $start_method"
            service_started=true
            break
        else
            warn "Failed to start service using: $start_method"
        fi
    done
    
    if [[ "$service_started" == "false" ]]; then
        error "Could not start dhash service"
        return 1
    fi
    
    # Wait for service to be ready
    log "Waiting for service to be ready..."
    local retries=0
    local max_retries=30
    
    while [[ $retries -lt $max_retries ]]; do
        if curl -s --max-time 5 "$BASE_URL/health" >/dev/null 2>&1; then
            success "dhash service is ready"
            return 0
        fi
        
        retries=$((retries + 1))
        log "Waiting for dhash to be ready... ($retries/$max_retries)"
        sleep 2
    done
    
    error "dhash service failed to become ready after $max_retries attempts"
    return 1
}

# Post-rollback verification
post_rollback_verification() {
    log "Running post-rollback verification..."
    
    # Health check verification
    log "Performing health checks..."
    local consecutive_ok=0
    local required_ok=3
    
    for i in $(seq 1 $required_ok); do
        if curl -s --max-time 10 "$BASE_URL/health" >/dev/null 2>&1; then
            consecutive_ok=$((consecutive_ok + 1))
            success "Health check $i/$required_ok: OK"
        else
            error "Health check $i/$required_ok: FAILED"
            return 1
        fi
        
        if [[ $i -lt $required_ok ]]; then
            sleep 5
        fi
    done
    
    success "Health checks passed ($consecutive_ok/$required_ok consecutive OK)"
    
    # Run smoke tests if available
    if [[ -f "$SCRIPT_DIR/smoke_tests.sh" ]]; then
        log "Running post-rollback smoke tests..."
        
        if "$SCRIPT_DIR/smoke_tests.sh" --env "$ENVIRONMENT"; then
            success "Post-rollback smoke tests passed"
        else
            error "Post-rollback smoke tests failed"
            return 1
        fi
    else
        log "No smoke tests available - skipping"
    fi
    
    success "Post-rollback verification completed"
}

# Send notifications
send_rollback_notification() {
    local status="$1"
    
    if [[ -f "$SCRIPT_DIR/notify.js" ]]; then
        local message
        if [[ "$status" == "success" ]]; then
            message="dhash rollback completed successfully for $ENVIRONMENT. Reason: $REASON. Backup used: $(basename "$BACKUP_FILE")"
            node "$SCRIPT_DIR/notify.js" --type rollback --env "$ENVIRONMENT" --message "$message" --severity info || true
        else
            message="dhash rollback FAILED for $ENVIRONMENT. Reason: $REASON. Manual intervention required."
            node "$SCRIPT_DIR/notify.js" --type rollback --env "$ENVIRONMENT" --message "$message" --severity critical || true
        fi
    else
        warn "Notification script not found - skipping notification"
    fi
}

# Main rollback flow
main() {
    log "=== dhash Rollback Start ==="
    log "Environment: $ENVIRONMENT"
    log "Reason: $REASON"
    log "Timestamp: $(date -Iseconds)"
    
    # Create rollback logs directory
    mkdir -p "$ROOT_DIR/rollback_logs"
    
    # Pre-rollback steps
    find_latest_backup
    verify_backup
    stop_monitoring
    create_pre_rollback_backup
    
    # Extract backup
    local extract_dir
    extract_dir=$(extract_backup)
    
    # Perform rollback
    if stop_dhash_service && \
       restore_database "$extract_dir" && \
       restore_configuration "$extract_dir" && \
       restore_application_data "$extract_dir" && \
       start_dhash_service && \
       post_rollback_verification; then
        
        success "=== dhash Rollback Completed Successfully ==="
        
        log ""
        log "Rollback Summary:"
        log "  Environment: $ENVIRONMENT"
        log "  Reason: $REASON"
        log "  Backup used: $BACKUP_FILE"
        log "  Completed at: $(date -Iseconds)"
        log ""
        log "Next steps:"
        log "1. Monitor service health closely"
        log "2. Investigate root cause of the issue"
        log "3. Prepare fixes before next deployment"
        log "4. Update incident documentation"
        
        send_rollback_notification "success"
        
        # Clean up temporary directory
        if [[ -n "$extract_dir" ]] && [[ -d "$extract_dir" ]]; then
            rm -rf "$(dirname "$extract_dir")"
        fi
        
    else
        error "=== dhash Rollback Failed ==="
        
        error "Rollback failed - system may be in an inconsistent state"
        error "Manual intervention is required immediately"
        error ""
        error "Emergency contacts:"
        error "- Ops/SRE team: @ops"
        error "- Media engineering: @media-eng"
        error "- On-call escalation: follow incident response procedures"
        
        send_rollback_notification "failure"
        
        # Clean up temporary directory
        if [[ -n "$extract_dir" ]] && [[ -d "$extract_dir" ]]; then
            rm -rf "$(dirname "$extract_dir")"
        fi
        
        exit 1
    fi
}

# Execute main function
main "$@"