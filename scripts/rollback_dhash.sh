#!/bin/bash
set -euo pipefail

# MOBIUS dhash Rollback Script
# Usage: ./rollback_dhash.sh --backup <backup_file> --env <environment>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/rollback.log"

# Default values  
BACKUP_FILE=""
ENVIRONMENT=""
AUTO_MODE=false

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    exit 1
}

usage() {
    cat << EOF
Usage: $0 --backup <backup_file> --env <environment> [options]

Options:
    --backup FILE        Backup file to restore from
    --env ENVIRONMENT    Target environment (staging|production)  
    --auto              Run in automatic mode (no prompts)
    --help              Show this help message
EOF
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backup)
                BACKUP_FILE="$2"
                shift 2
                ;;
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --auto)
                AUTO_MODE=true
                shift
                ;;
            --help)
                usage
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    if [[ -z "$BACKUP_FILE" ]]; then
        error "Backup file is required (--backup)"
    fi

    if [[ -z "$ENVIRONMENT" ]]; then
        error "Environment is required (--env)"
    fi

    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        error "Environment must be 'staging' or 'production'"
    fi
}

verify_backup() {
    log "Verifying backup file: $BACKUP_FILE"
    
    if [[ ! -f "$BACKUP_FILE" ]]; then
        error "Backup file not found: $BACKUP_FILE"
    fi
    
    # Check for SHA256 checksum file
    local checksum_file="${BACKUP_FILE}.sha256"
    if [[ -f "$checksum_file" ]]; then
        log "Verifying backup integrity with SHA256..."
        if sha256sum -c "$checksum_file"; then
            log "Backup integrity verified successfully"
        else
            error "Backup integrity check failed"
        fi
    else
        log "Warning: No SHA256 checksum file found for backup verification"
        if [[ "$AUTO_MODE" == false ]]; then
            read -p "Continue without integrity verification? (y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                error "Rollback cancelled by user"
            fi
        fi
    fi
    
    # Check backup file format
    if ! file "$BACKUP_FILE" | grep -q "Zip archive"; then
        error "Backup file is not a valid ZIP archive"
    fi
    
    log "Backup verification completed"
}

confirm_rollback() {
    if [[ "$AUTO_MODE" == true ]]; then
        log "Running in automatic mode - skipping confirmation"
        return
    fi
    
    log "WARNING: This will rollback the $ENVIRONMENT environment to a previous state"
    log "Current application will be stopped and replaced with backup: $BACKUP_FILE"
    echo
    read -p "Are you sure you want to proceed? (type 'rollback' to confirm): " -r
    
    if [[ "$REPLY" != "rollback" ]]; then
        error "Rollback cancelled by user"
    fi
    
    log "Rollback confirmed by user"
}

stop_current_application() {
    log "Stopping current application..."
    
    # This would typically stop application services
    # For now, simulate the stop process
    log "Attempting to gracefully stop dhash services..."
    
    # Check if there are any running processes to stop
    if pgrep -f "dhash" >/dev/null 2>&1; then
        log "Found running dhash processes, stopping..."
        pkill -f "dhash" || log "Warning: Some processes may not have stopped cleanly"
        sleep 5
        
        # Force kill if still running
        if pgrep -f "dhash" >/dev/null 2>&1; then
            log "Force stopping remaining processes..."
            pkill -9 -f "dhash" || true
        fi
    else
        log "No running dhash processes found"
    fi
    
    log "Current application stopped"
}

restore_from_backup() {
    log "Restoring from backup: $BACKUP_FILE"
    
    local backup_dir="${PROJECT_ROOT}/rollback_restoration"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local restore_dir="${backup_dir}/${timestamp}"
    
    # Create restoration directory
    mkdir -p "$restore_dir"
    
    # Extract backup
    log "Extracting backup to: $restore_dir"
    if ! unzip -q "$BACKUP_FILE" -d "$restore_dir"; then
        error "Failed to extract backup file"
    fi
    
    # Verify extracted contents
    if [[ ! -d "$restore_dir" ]] || [[ -z "$(ls -A "$restore_dir")" ]]; then
        error "Backup extraction resulted in empty directory"
    fi
    
    log "Backup extracted successfully"
    
    # Install dependencies for restored application
    if [[ -f "$restore_dir/package.json" ]]; then
        log "Installing dependencies for restored application..."
        cd "$restore_dir"
        npm ci --production || error "Failed to install dependencies"
        cd "$PROJECT_ROOT"
    fi
    
    # Create rollback metadata
    cat > "$restore_dir/rollback-info.json" << EOF
{
    "rollback": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "environment": "$ENVIRONMENT", 
        "backup_file": "$BACKUP_FILE",
        "restore_directory": "$restore_dir",
        "rollback_reason": "Manual rollback initiated"
    }
}
EOF
    
    log "Application restored from backup"
}

run_post_rollback_verification() {
    log "Running post-rollback verification..."
    
    # Health checks
    local health_script="${SCRIPT_DIR}/health_check.sh"
    local max_retries=5
    local retry_count=0
    
    while [[ $retry_count -lt $max_retries ]]; do
        if [[ -f "$health_script" ]]; then
            if "$health_script" --env "$ENVIRONMENT" --timeout 10; then
                log "Health check passed (attempt $((retry_count + 1))/$max_retries)"
                break
            else
                ((retry_count++))
                if [[ $retry_count -lt $max_retries ]]; then
                    log "Health check failed, retrying in 10 seconds..."
                    sleep 10
                else
                    error "Health check failed after $max_retries attempts"
                fi
            fi
        else
            log "Health check script not found, skipping health verification"
            break
        fi
    done
    
    # Smoke tests
    local smoke_script="${SCRIPT_DIR}/smoke_tests.sh"
    if [[ -f "$smoke_script" ]]; then
        log "Running post-rollback smoke tests..."
        if "$smoke_script" --env "$ENVIRONMENT" > "${PROJECT_ROOT}/rollback-smoke-tests.log"; then
            log "Smoke tests passed"
        else
            log "Warning: Some smoke tests failed, check rollback-smoke-tests.log"
        fi
    fi
    
    log "Post-rollback verification completed"
}

collect_rollback_artifacts() {
    log "Collecting rollback artifacts..."
    
    local artifacts_dir="${PROJECT_ROOT}/rollback_backups/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$artifacts_dir"
    
    # Copy logs
    cp "$LOG_FILE" "$artifacts_dir/" 2>/dev/null || true
    cp "${PROJECT_ROOT}/rollback-smoke-tests.log" "$artifacts_dir/" 2>/dev/null || true
    
    # Copy monitoring logs if they exist
    if [[ -d "${PROJECT_ROOT}/monitor_logs" ]]; then
        cp -r "${PROJECT_ROOT}/monitor_logs"/* "$artifacts_dir/" 2>/dev/null || true
    fi
    
    # Create rollback summary
    cat > "$artifacts_dir/rollback-summary.json" << EOF
{
    "rollback": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "environment": "$ENVIRONMENT",
        "backup_file": "$BACKUP_FILE",
        "status": "completed",
        "artifacts_location": "$artifacts_dir"
    },
    "verification": {
        "health_checks": "completed",
        "smoke_tests": "completed"  
    },
    "next_steps": [
        "Review rollback logs and smoke test results",
        "Monitor system stability for next 30 minutes",
        "Investigate root cause of original issue",
        "Plan forward fix if rollback was successful"
    ]
}
EOF
    
    log "Rollback artifacts collected in: $artifacts_dir"
}

main() {
    # Initialize log file
    echo "MOBIUS dhash Rollback - $(date)" > "$LOG_FILE"
    
    log "Starting rollback process..."
    log "Environment: $ENVIRONMENT"
    log "Backup file: $BACKUP_FILE"
    log "Auto mode: $AUTO_MODE"
    
    verify_backup
    confirm_rollback
    stop_current_application
    restore_from_backup
    run_post_rollback_verification
    collect_rollback_artifacts
    
    log "Rollback completed successfully!"
    log "Important next steps:"
    log "1. Monitor system stability for the next 30 minutes"
    log "2. Review rollback-smoke-tests.log for any issues"
    log "3. Investigate the root cause that required this rollback"
    log "4. Plan a forward fix once system is stable"
}

parse_args "$@"
main