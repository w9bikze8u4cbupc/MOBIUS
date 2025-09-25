#!/bin/bash

# rollback_dhash.sh - Automated rollback script for MOBIUS dhash
# Usage: ./scripts/rollback_dhash.sh --backup backup.zip --env production

set -euo pipefail

# Default configuration
BACKUP_FILE=""
ENVIRONMENT=""
EMERGENCY=false
VERIFY_BACKUP=true
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR $(date +'%H:%M:%S')]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS $(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN $(date +'%H:%M:%S')]${NC} $1"
}

emergency_log() {
    echo -e "${RED}[EMERGENCY $(date +'%H:%M:%S')]${NC} 🚨 $1"
}

usage() {
    cat << EOF
Usage: $0 --backup BACKUP_FILE --env ENVIRONMENT [OPTIONS]

Rollback MOBIUS dhash to a previous stable state.

Required arguments:
    --backup BACKUP_FILE    Path to backup zip file to restore from
    --env ENVIRONMENT       Target environment (production, staging, etc.)

Optional arguments:
    --emergency            Emergency rollback mode (minimal validation)
    --no-verify           Skip backup verification (not recommended)
    --help                Show this help message

Examples:
    $0 --backup backups/dhash_20240115_143021.zip --env production
    $0 --backup /var/backups/dhash_stable.zip --env production --emergency
    $0 --backup backups/dhash_pre_v2.1.0_20240115_140000.zip --env staging

Environment variables:
    DEPLOY_LEAD           Deploy lead identifier for notifications
    ROLLBACK_RETENTION    Number of rollback logs to retain (default: 10)
EOF
}

# Parse command line arguments
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
        --emergency)
            EMERGENCY=true
            shift
            ;;
        --no-verify)
            VERIFY_BACKUP=false
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$BACKUP_FILE" || -z "$ENVIRONMENT" ]]; then
    error "Both --backup and --env are required"
    usage
    exit 1
fi

# Set environment-specific configuration
case $ENVIRONMENT in
    production)
        SERVICE_NAME="mobius-dhash"
        CONFIG_FILE="/etc/mobius/dhash/production.conf"
        LOG_DIR="/var/log/mobius/dhash"
        DATA_DIR="/var/lib/mobius/dhash"
        BACKUP_DIR="/var/backups/mobius/dhash"
        ;;
    staging)
        SERVICE_NAME="mobius-dhash-staging"
        CONFIG_FILE="/etc/mobius/dhash/staging.conf"
        LOG_DIR="/var/log/mobius/dhash-staging"
        DATA_DIR="/var/lib/mobius/dhash-staging"
        BACKUP_DIR="/var/backups/mobius/dhash-staging"
        ;;
    *)
        error "Unsupported environment: $ENVIRONMENT"
        exit 1
        ;;
esac

# Environment variables with defaults
DEPLOY_LEAD="${DEPLOY_LEAD:-@DEPLOY_LEAD}"
ROLLBACK_RETENTION="${ROLLBACK_RETENTION:-10}"

# Create necessary directories
mkdir -p "$LOG_DIR/rollbacks" "$BACKUP_DIR"

if [[ $EMERGENCY == true ]]; then
    emergency_log "EMERGENCY ROLLBACK MODE ACTIVATED"
    emergency_log "Minimal validation - proceeding with rollback immediately"
else
    log "Starting MOBIUS dhash rollback"
fi

log "Environment: $ENVIRONMENT"
log "Backup file: $BACKUP_FILE"
log "Deploy lead: $DEPLOY_LEAD"
log "Emergency mode: $EMERGENCY"
log "Timestamp: $TIMESTAMP"

# Pre-rollback validation
if [[ $EMERGENCY == false ]]; then
    log "=== Pre-rollback Validation ==="
    
    # Check if backup file exists
    if [[ ! -f "$BACKUP_FILE" ]]; then
        error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    # Verify backup integrity
    if [[ $VERIFY_BACKUP == true ]]; then
        log "Verifying backup integrity..."
        CHECKSUM_FILE="${BACKUP_FILE}.sha256"
        
        if [[ -f "$CHECKSUM_FILE" ]]; then
            if sha256sum -c "$CHECKSUM_FILE" >/dev/null 2>&1; then
                success "Backup integrity verified"
            else
                error "Backup integrity check failed"
                error "Backup may be corrupted: $BACKUP_FILE"
                exit 1
            fi
        else
            warn "Checksum file not found: $CHECKSUM_FILE"
            warn "Cannot verify backup integrity"
            
            # Test zip file integrity
            if unzip -t "$BACKUP_FILE" >/dev/null 2>&1; then
                warn "Zip file appears to be valid, proceeding..."
            else
                error "Backup file appears to be corrupted"
                exit 1
            fi
        fi
    else
        warn "Skipping backup verification as requested"
    fi
    
    # Check available disk space
    BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo "0")
    AVAILABLE_SPACE=$(df "$DATA_DIR" | tail -1 | awk '{print $4}')
    REQUIRED_SPACE=$((BACKUP_SIZE / 1024 + 1048576))  # Add 1GB buffer
    
    if [[ $AVAILABLE_SPACE -lt $REQUIRED_SPACE ]]; then
        error "Insufficient disk space for rollback"
        error "Required: $((REQUIRED_SPACE/1024))MB, Available: $((AVAILABLE_SPACE/1024))MB"
        exit 1
    fi
    
    log "Disk space check passed"
else
    warn "Emergency mode: Skipping pre-rollback validation"
fi

# Create pre-rollback backup of current state
CURRENT_BACKUP=""
if [[ $EMERGENCY == false ]]; then
    log "=== Creating Current State Backup ==="
    
    CURRENT_BACKUP="$BACKUP_DIR/dhash_pre_rollback_${TIMESTAMP}.zip"
    log "Creating backup of current state: $CURRENT_BACKUP"
    
    # Backup current state
    zip -r "$CURRENT_BACKUP" \
        "$CONFIG_FILE" \
        "$DATA_DIR" \
        "$PROJECT_ROOT/package.json" \
        "$PROJECT_ROOT/src" \
        2>/dev/null || warn "Some files may not exist for current backup"
    
    # Generate checksum for current backup
    sha256sum "$CURRENT_BACKUP" > "${CURRENT_BACKUP}.sha256"
    success "Current state backup created: $CURRENT_BACKUP"
fi

# Rollback process
log "=== Starting Rollback Process ==="

# Step 1: Stop current service
log "[1/5] Stopping current service: $SERVICE_NAME"
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    systemctl stop "$SERVICE_NAME"
    log "Service $SERVICE_NAME stopped"
    
    # Wait for graceful shutdown
    if [[ $EMERGENCY == false ]]; then
        sleep 5
    else
        sleep 2
    fi
    
    # Ensure service is stopped
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        warn "Service still running, forcing stop..."
        systemctl kill "$SERVICE_NAME"
        sleep 2
    fi
    
    success "Service $SERVICE_NAME fully stopped"
else
    log "Service $SERVICE_NAME was not running"
fi

# Step 2: Extract backup
log "[2/5] Extracting backup: $BACKUP_FILE"
RESTORE_TEMP_DIR=$(mktemp -d)
trap "rm -rf $RESTORE_TEMP_DIR" EXIT

if unzip -q "$BACKUP_FILE" -d "$RESTORE_TEMP_DIR"; then
    success "Backup extracted to temporary directory"
else
    error "Failed to extract backup"
    exit 1
fi

# Step 3: Restore configuration and data
log "[3/5] Restoring configuration and data"

# Restore configuration if present in backup
if [[ -f "$RESTORE_TEMP_DIR$(basename "$CONFIG_FILE")" ]]; then
    cp "$RESTORE_TEMP_DIR$(basename "$CONFIG_FILE")" "$CONFIG_FILE"
    log "Configuration restored: $CONFIG_FILE"
elif [[ -f "$RESTORE_TEMP_DIR/$(dirname "$CONFIG_FILE" | sed 's|.*/||')/$(basename "$CONFIG_FILE")" ]]; then
    # Handle nested config structure
    cp "$RESTORE_TEMP_DIR/$(dirname "$CONFIG_FILE" | sed 's|.*/||')/$(basename "$CONFIG_FILE")" "$CONFIG_FILE"
    log "Configuration restored from nested path"
else
    warn "Configuration file not found in backup"
fi

# Restore data directory
if [[ -d "$RESTORE_TEMP_DIR/$(basename "$DATA_DIR")" ]]; then
    # Backup current data directory if not emergency
    if [[ $EMERGENCY == false && -d "$DATA_DIR" ]]; then
        mv "$DATA_DIR" "${DATA_DIR}.rollback_backup_${TIMESTAMP}"
        log "Current data directory backed up"
    fi
    
    # Restore data directory
    cp -r "$RESTORE_TEMP_DIR/$(basename "$DATA_DIR")" "$DATA_DIR"
    success "Data directory restored: $DATA_DIR"
elif [[ -d "$RESTORE_TEMP_DIR$(dirname "$DATA_DIR")/$(basename "$DATA_DIR")" ]]; then
    # Handle full path structure
    if [[ $EMERGENCY == false && -d "$DATA_DIR" ]]; then
        mv "$DATA_DIR" "${DATA_DIR}.rollback_backup_${TIMESTAMP}"
    fi
    cp -r "$RESTORE_TEMP_DIR$(dirname "$DATA_DIR")/$(basename "$DATA_DIR")" "$DATA_DIR"
    success "Data directory restored from full path"
else
    warn "Data directory not found in backup"
fi

# Restore application code if present
if [[ -d "$RESTORE_TEMP_DIR/src" ]]; then
    log "Restoring application source code..."
    
    # Backup current source if not emergency
    if [[ $EMERGENCY == false && -d "$PROJECT_ROOT/src" ]]; then
        mv "$PROJECT_ROOT/src" "$PROJECT_ROOT/src.rollback_backup_${TIMESTAMP}"
    fi
    
    cp -r "$RESTORE_TEMP_DIR/src" "$PROJECT_ROOT/"
    success "Application source restored"
fi

# Restore package.json if present
if [[ -f "$RESTORE_TEMP_DIR/package.json" ]]; then
    cp "$RESTORE_TEMP_DIR/package.json" "$PROJECT_ROOT/"
    log "Package.json restored"
    
    # Reinstall dependencies if not in emergency mode
    if [[ $EMERGENCY == false ]]; then
        log "Reinstalling dependencies..."
        cd "$PROJECT_ROOT"
        npm install --production --silent || warn "Dependency installation failed"
    fi
fi

# Step 4: Update version markers
log "[4/5] Updating version markers"
ROLLBACK_VERSION="rollback_${TIMESTAMP}"
echo "$ROLLBACK_VERSION" > "$DATA_DIR/version.txt"
echo "$TIMESTAMP" > "$DATA_DIR/rollback_time.txt"
echo "$DEPLOY_LEAD" > "$DATA_DIR/rollback_lead.txt"
echo "$BACKUP_FILE" > "$DATA_DIR/rollback_source.txt"

# Step 5: Start service and validate
log "[5/5] Starting service and validating"
systemctl start "$SERVICE_NAME"
log "Service $SERVICE_NAME started"

# Wait for service to be ready
if [[ $EMERGENCY == false ]]; then
    sleep 15
else
    sleep 5
fi

# Verify service started successfully
if systemctl is-active --quiet "$SERVICE_NAME"; then
    success "Service $SERVICE_NAME is running after rollback"
else
    error "Service $SERVICE_NAME failed to start after rollback"
    
    # Show recent logs for debugging
    log "Recent service logs:"
    journalctl -u "$SERVICE_NAME" --lines=20 --no-pager
    exit 1
fi

# Post-rollback validation
if [[ $EMERGENCY == false ]]; then
    log "=== Post-rollback Validation ==="
    
    # Health check
    HEALTH_URL="http://localhost:8080/health"  # Adjust as needed
    if command -v curl >/dev/null 2>&1; then
        if curl -f -s "$HEALTH_URL" >/dev/null 2>&1; then
            success "Health check passed: $HEALTH_URL"
        else
            warn "Health check failed or endpoint not available: $HEALTH_URL"
        fi
    else
        warn "curl not available for health checks"
    fi
    
    # Basic smoke tests
    if [[ -f "$SCRIPT_DIR/smoke_tests.sh" ]]; then
        log "Running basic smoke tests..."
        if bash "$SCRIPT_DIR/smoke_tests.sh" "$ENVIRONMENT" 2>/dev/null; then
            success "Smoke tests passed"
        else
            warn "Some smoke tests failed - manual verification recommended"
        fi
    fi
    
    # Quality gates (if applicable)
    if [[ -f "$SCRIPT_DIR/check_golden.js" ]]; then
        log "Running quality gate validation..."
        if node "$SCRIPT_DIR/check_golden.js" --env "$ENVIRONMENT" --quick 2>/dev/null; then
            success "Quality gates validation passed"
        else
            warn "Quality gates validation had issues"
        fi
    fi
fi

# Generate rollback report
ROLLBACK_LOG="$LOG_DIR/rollbacks/rollback_${TIMESTAMP}.log"
{
    echo "MOBIUS dhash Rollback Report"
    echo "============================"
    echo ""
    echo "Rollback Details:"
    echo "- Timestamp: $TIMESTAMP"
    echo "- Environment: $ENVIRONMENT"
    echo "- Backup Source: $BACKUP_FILE"
    echo "- Deploy Lead: $DEPLOY_LEAD"
    echo "- Emergency Mode: $EMERGENCY"
    echo ""
    echo "System Information:"
    echo "- Service: $SERVICE_NAME"
    echo "- Config: $CONFIG_FILE"
    echo "- Data Dir: $DATA_DIR"
    echo "- Log Dir: $LOG_DIR"
    echo ""
    echo "Rollback Results:"
    echo "- Service Status: $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo 'unknown')"
    echo "- Process ID: $(systemctl show "$SERVICE_NAME" --property=MainPID --value 2>/dev/null || echo 'unknown')"
    echo "- Start Time: $(systemctl show "$SERVICE_NAME" --property=ActiveEnterTimestamp --value 2>/dev/null || echo 'unknown')"
    echo ""
    if [[ -n "$CURRENT_BACKUP" ]]; then
        echo "Pre-rollback Backup: $CURRENT_BACKUP"
    fi
    echo "Restore Source: $BACKUP_FILE"
    echo ""
    echo "Next Steps:"
    echo "1. Monitor system stability: ./scripts/monitor_dhash.sh --env $ENVIRONMENT --duration 7200"
    echo "2. Validate functionality with stakeholders"
    echo "3. Investigate root cause of original deployment issue"
    echo "4. Plan re-deployment with fixes"
    echo ""
    echo "Report generated: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
} > "$ROLLBACK_LOG"

# Cleanup old rollback logs
find "$LOG_DIR/rollbacks" -name "rollback_*.log" -mtime +30 -delete 2>/dev/null || true
if [[ $(ls -1 "$LOG_DIR/rollbacks/rollback_"*.log 2>/dev/null | wc -l) -gt $ROLLBACK_RETENTION ]]; then
    ls -1t "$LOG_DIR/rollbacks/rollback_"*.log | tail -n +$((ROLLBACK_RETENTION + 1)) | xargs rm -f
fi

# Final summary
echo ""
echo "====================================================================="
if [[ $EMERGENCY == true ]]; then
    emergency_log "EMERGENCY ROLLBACK COMPLETED!"
else
    success "Rollback completed successfully!"
fi
echo "====================================================================="
echo ""
log "Rollback Summary:"
echo "  🎯 Environment: $ENVIRONMENT"
echo "  📦 Backup Source: $(basename "$BACKUP_FILE")"
echo "  👤 Deploy Lead: $DEPLOY_LEAD"
echo "  📋 Report: $ROLLBACK_LOG"
echo ""
if [[ -n "$CURRENT_BACKUP" ]]; then
    log "Pre-rollback backup: $CURRENT_BACKUP"
fi
echo ""
log "Next steps:"
echo "  1. Extended monitoring: ./scripts/monitor_dhash.sh --env $ENVIRONMENT --duration 7200"
echo "  2. Validate system functionality with stakeholders"
echo "  3. Check service status: systemctl status $SERVICE_NAME"
echo "  4. Review logs: journalctl -u $SERVICE_NAME -f"
echo ""
if [[ $EMERGENCY == true ]]; then
    warn "EMERGENCY MODE: Extended monitoring (2+ hours) highly recommended"
else
    warn "Recommended monitoring window: 2 hours"
fi
echo ""
success "System restored to previous stable state"
echo "====================================================================="