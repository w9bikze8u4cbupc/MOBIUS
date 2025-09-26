#!/bin/bash
# MOBIUS Deployment - Rollback Script
# Quickly rolls back to a previous backup with safety checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --backup FILE      Path to backup file to restore from (required)"
    echo "  --env ENV          Target environment (staging|production)"
    echo "  --verify           Verify backup integrity before rollback"
    echo "  --skip-confirmation Skip interactive confirmation prompts"
    echo "  --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --backup backups/dhash_production_20240101_120000.zip --env production"
    echo "  $0 --backup backups/latest.zip --env staging --verify"
    exit 1
}

# Parse arguments
BACKUP_FILE=""
ENV=""
VERIFY=false
SKIP_CONFIRMATION=false

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
        --verify)
            VERIFY=true
            shift
            ;;
        --skip-confirmation)
            SKIP_CONFIRMATION=true
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

# Validate arguments
if [[ -z "$BACKUP_FILE" ]]; then
    echo "Error: --backup option is required"
    usage
fi

if [[ -z "$ENV" ]]; then
    echo "Error: --env option is required"
    usage
fi

if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    echo "Error: Invalid environment '$ENV'. Must be staging or production."
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file does not exist: $BACKUP_FILE"
    exit 1
fi

LOG_FILE="${PROJECT_ROOT}/rollback-$(date +%Y%m%d_%H%M%S).log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== MOBIUS ROLLBACK SCRIPT ==="
log "Environment: $ENV"
log "Backup file: $BACKUP_FILE"
log "Log file: $LOG_FILE"
log ""

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."
    
    local sha_file="${BACKUP_FILE}.sha256"
    if [[ -f "$sha_file" ]]; then
        local backup_dir
        backup_dir=$(dirname "$BACKUP_FILE")
        local backup_name
        backup_name=$(basename "$BACKUP_FILE")
        
        cd "$backup_dir"
        if sha256sum -c "${backup_name}.sha256" >/dev/null 2>&1; then
            log "✓ Backup integrity verification passed"
        else
            log "✗ Backup integrity verification failed!"
            log "The backup file may be corrupted."
            exit 1
        fi
    else
        log "Warning: SHA256 file not found: $sha_file"
        log "Skipping integrity verification"
    fi
}

# Confirm rollback
confirm_rollback() {
    if [[ "$SKIP_CONFIRMATION" == "true" ]]; then
        return
    fi
    
    echo ""
    echo "========================================="
    echo "WARNING: ROLLBACK OPERATION"
    echo "========================================="
    echo "Environment: $ENV"
    echo "Backup file: $BACKUP_FILE"
    echo ""
    echo "This will:"
    echo "1. Stop the current application"
    echo "2. Create a backup of current state"
    echo "3. Restore from the specified backup"
    echo "4. Restart the application"
    echo ""
    echo "This operation cannot be easily undone!"
    echo ""
    
    if [[ "$ENV" == "production" ]]; then
        echo "🚨 PRODUCTION ENVIRONMENT ROLLBACK 🚨"
        echo "This will affect live users!"
        echo ""
    fi
    
    read -p "Are you sure you want to proceed? (type 'yes' to continue): " confirmation
    if [[ "$confirmation" != "yes" ]]; then
        log "Rollback cancelled by user"
        exit 0
    fi
}

# Create rollback backup
create_rollback_backup() {
    log "Creating backup of current state before rollback..."
    
    local rollback_backup_script="${SCRIPT_DIR}/backup_dhash.sh"
    if [[ ! -f "$rollback_backup_script" ]]; then
        log "Warning: Backup script not found, skipping current state backup"
        return
    fi
    
    if ! "$rollback_backup_script" --env "$ENV" --components all; then
        log "Warning: Failed to create rollback backup"
        log "Continuing with rollback anyway..."
    else
        log "✓ Current state backed up"
    fi
}

# Stop services
stop_services() {
    log "Stopping application services..."
    
    # Mock service stopping - replace with actual commands
    # Examples:
    # systemctl stop mobius-api
    # pm2 stop mobius
    # docker-compose down
    
    # Check if Node.js processes are running
    if pgrep -f "node.*src/api/index.js" >/dev/null; then
        log "Stopping Node.js API processes..."
        pkill -f "node.*src/api/index.js" || true
    fi
    
    # Wait for processes to stop
    sleep 2
    
    log "✓ Services stopped"
}

# Restore from backup
restore_backup() {
    log "Restoring from backup: $BACKUP_FILE"
    
    # Create temporary extraction directory
    local temp_dir
    temp_dir=$(mktemp -d)
    local extract_dir="${temp_dir}/restore"
    
    cleanup_temp() {
        rm -rf "$temp_dir"
    }
    trap cleanup_temp EXIT
    
    # Extract backup
    log "Extracting backup archive..."
    mkdir -p "$extract_dir"
    if ! unzip -q "$BACKUP_FILE" -d "$extract_dir"; then
        log "Error: Failed to extract backup archive"
        exit 1
    fi
    
    # Find the backup directory (should be the only directory in extract_dir)
    local backup_content_dir
    backup_content_dir=$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n1)
    
    if [[ -z "$backup_content_dir" ]]; then
        log "Error: No backup content directory found in archive"
        exit 1
    fi
    
    log "Backup content directory: $backup_content_dir"
    
    # Restore components
    restore_database "$backup_content_dir"
    restore_config "$backup_content_dir"
    restore_artifacts "$backup_content_dir"
    restore_logs "$backup_content_dir"
    
    log "✓ Backup restoration completed"
}

restore_database() {
    local backup_dir="$1/database"
    if [[ ! -d "$backup_dir" ]]; then
        log "No database backup found, skipping"
        return
    fi
    
    log "Restoring database..."
    
    # Restore SQLite database example
    if [[ -f "${backup_dir}/mobius_backup.db" ]]; then
        mkdir -p "${PROJECT_ROOT}/data"
        cp "${backup_dir}/mobius_backup.db" "${PROJECT_ROOT}/data/mobius.db"
        log "✓ Database restored"
    else
        log "No database files found in backup"
    fi
}

restore_config() {
    local backup_dir="$1/config"
    if [[ ! -d "$backup_dir" ]]; then
        log "No config backup found, skipping"
        return
    fi
    
    log "Restoring configuration..."
    
    # Restore configuration files
    [[ -f "${backup_dir}/package.json" ]] && cp "${backup_dir}/package.json" "$PROJECT_ROOT/"
    [[ -f "${backup_dir}/.env" ]] && cp "${backup_dir}/.env" "$PROJECT_ROOT/"
    [[ -d "${backup_dir}/config" ]] && cp -r "${backup_dir}/config" "$PROJECT_ROOT/"
    
    log "✓ Configuration restored"
}

restore_artifacts() {
    local backup_dir="$1/artifacts"
    if [[ ! -d "$backup_dir" ]]; then
        log "No artifacts backup found, skipping"
        return
    fi
    
    log "Restoring artifacts..."
    
    # Restore build artifacts
    [[ -d "${backup_dir}/out" ]] && cp -r "${backup_dir}/out" "$PROJECT_ROOT/"
    [[ -d "${backup_dir}/dist" ]] && cp -r "${backup_dir}/dist" "$PROJECT_ROOT/"
    [[ -d "${backup_dir}/build" ]] && cp -r "${backup_dir}/build" "$PROJECT_ROOT/"
    
    log "✓ Artifacts restored"
}

restore_logs() {
    local backup_dir="$1/logs"
    if [[ ! -d "$backup_dir" ]]; then
        log "No logs backup found, skipping"
        return
    fi
    
    log "Restoring logs..."
    
    # Restore log files (be careful not to overwrite current rollback log)
    if [[ -d "${backup_dir}/logs" ]]; then
        mkdir -p "${PROJECT_ROOT}/logs"
        # Copy logs but don't overwrite current rollback log
        find "${backup_dir}/logs" -type f ! -name "*rollback*" -exec cp {} "${PROJECT_ROOT}/logs/" \;
    fi
    
    log "✓ Logs restored"
}

# Start services
start_services() {
    log "Starting application services..."
    
    # Ensure dependencies are installed
    if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        cd "$PROJECT_ROOT"
        log "Installing dependencies..."
        npm ci
    fi
    
    # Mock service starting - replace with actual commands
    # Examples:
    # systemctl start mobius-api
    # pm2 start mobius
    # docker-compose up -d
    
    log "Starting Node.js API..."
    cd "$PROJECT_ROOT"
    # Start API in background (in production, use proper process manager)
    nohup node src/api/index.js > api.log 2>&1 &
    
    # Wait for service to start
    sleep 3
    
    log "✓ Services started"
}

# Verify rollback
verify_rollback() {
    log "Verifying rollback success..."
    
    # Basic health check
    local health_check_count=0
    local max_attempts=5
    
    while [[ $health_check_count -lt $max_attempts ]]; do
        if curl -f http://localhost:5001/health >/dev/null 2>&1; then
            log "✓ Health check passed"
            break
        else
            health_check_count=$((health_check_count + 1))
            log "Health check attempt $health_check_count/$max_attempts failed, retrying..."
            sleep 2
        fi
    done
    
    if [[ $health_check_count -eq $max_attempts ]]; then
        log "✗ Health check failed after $max_attempts attempts"
        log "Manual intervention may be required"
        return 1
    fi
    
    log "✓ Rollback verification completed"
    return 0
}

# Main rollback process
main() {
    if [[ "$VERIFY" == "true" ]]; then
        verify_backup
    fi
    
    confirm_rollback
    create_rollback_backup
    stop_services
    restore_backup
    start_services
    
    if verify_rollback; then
        log ""
        log "=== ROLLBACK SUCCESSFUL ==="
        log "Environment: $ENV"
        log "Restored from: $BACKUP_FILE"
        log "Log file: $LOG_FILE"
        log ""
        log "POST-ROLLBACK CHECKLIST:"
        log "1. Verify all critical functionality works"
        log "2. Check application logs for errors"
        log "3. Run smoke tests"
        log "4. Monitor for stability"
        log "5. Notify stakeholders of rollback"
    else
        log ""
        log "=== ROLLBACK COMPLETED WITH WARNINGS ==="
        log "Some verification checks failed."
        log "Manual verification and intervention may be required."
        exit 1
    fi
}

# Run main rollback process
main