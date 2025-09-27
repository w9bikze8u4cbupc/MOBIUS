#!/bin/bash

# dhash Deployment Script with Guarded Rollout Support
# Usage: ./scripts/deploy_dhash.sh [--dry-run] [--env production|staging|canary] [--backup-id BACKUP_ID]

set -euo pipefail

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
BACKUP_ID=""
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
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] DEPLOY:${NC} $1"
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
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --backup-id)
            BACKUP_ID="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--env production|staging|canary] [--backup-id BACKUP_ID]"
            echo ""
            echo "Options:"
            echo "  --dry-run       Simulate deployment without making changes"
            echo "  --env ENV       Target environment (production, staging, canary)"
            echo "  --backup-id ID  Use specific backup ID for deployment"
            echo "  -h, --help      Show this help message"
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

log "Starting dhash deployment to $ENVIRONMENT environment"
log "Target URL: $BASE_URL"
log "Dry-run mode: $DRY_RUN"

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    # Check if target environment is reachable
    if $DRY_RUN; then
        log "[DRY-RUN] Would check connectivity to $BASE_URL"
    else
        if ! curl -s --max-time 10 "$BASE_URL/health" > /dev/null; then
            warn "Cannot reach $BASE_URL/health - continuing anyway"
        else
            success "Environment health check passed"
        fi
    fi
    
    # Verify backup exists if specified
    if [[ -n "$BACKUP_ID" ]]; then
        BACKUP_FILE="$ROOT_DIR/backups/dhash_${BACKUP_ID}.zip"
        if [[ ! -f "$BACKUP_FILE" ]]; then
            error "Backup file not found: $BACKUP_FILE"
            exit 1
        fi
        
        # Verify SHA256
        if [[ -f "${BACKUP_FILE}.sha256" ]]; then
            if $DRY_RUN; then
                log "[DRY-RUN] Would verify SHA256 for $BACKUP_FILE"
            else
                if sha256sum -c "${BACKUP_FILE}.sha256" >/dev/null 2>&1; then
                    success "Backup SHA256 verification passed"
                else
                    error "Backup SHA256 verification failed"
                    exit 1
                fi
            fi
        else
            warn "No SHA256 file found for backup: ${BACKUP_FILE}.sha256"
        fi
    fi
    
    # Check required scripts exist
    local required_scripts=(
        "rollback_dhash.sh"
        "monitor_dhash.js"
        "backup_dhash.sh"
    )
    
    for script in "${required_scripts[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/$script" ]]; then
            error "Required script not found: $SCRIPT_DIR/$script"
            exit 1
        fi
    done
    
    success "Pre-deployment checks passed"
}

# Create deployment backup
create_deployment_backup() {
    log "Creating pre-deployment backup..."
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would create backup using: $SCRIPT_DIR/backup_dhash.sh --env $ENVIRONMENT"
        return 0
    fi
    
    if ! "$SCRIPT_DIR/backup_dhash.sh" --env "$ENVIRONMENT"; then
        error "Failed to create pre-deployment backup"
        exit 1
    fi
    
    success "Pre-deployment backup created"
}

# Perform deployment
deploy_dhash() {
    log "Performing dhash deployment..."
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would perform deployment steps:"
        log "[DRY-RUN]   1. Stop dhash service"
        log "[DRY-RUN]   2. Update dhash binary/code"
        log "[DRY-RUN]   3. Update configuration"
        log "[DRY-RUN]   4. Start dhash service"
        log "[DRY-RUN]   5. Wait for service to be ready"
        return 0
    fi
    
    # Actual deployment steps would go here
    # This is a placeholder implementation
    
    log "Step 1/5: Stopping dhash service..."
    # systemctl stop dhash || docker stop dhash-container
    sleep 1
    
    log "Step 2/5: Updating dhash binary/code..."
    # Update application code, binaries, etc.
    sleep 2
    
    log "Step 3/5: Updating configuration..."
    # Update config files
    sleep 1
    
    log "Step 4/5: Starting dhash service..."
    # systemctl start dhash || docker start dhash-container
    sleep 2
    
    log "Step 5/5: Waiting for service to be ready..."
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

# Post-deployment verification
post_deployment_verification() {
    log "Running post-deployment verification..."
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would run post-deployment smoke tests"
        log "[DRY-RUN] Would verify service health"
        log "[DRY-RUN] Would check basic functionality"
        return 0
    fi
    
    # Run smoke tests
    if [[ -f "$SCRIPT_DIR/smoke_tests.sh" ]]; then
        if ! "$SCRIPT_DIR/smoke_tests.sh" --env "$ENVIRONMENT"; then
            error "Post-deployment smoke tests failed"
            return 1
        fi
    else
        warn "Smoke test script not found: $SCRIPT_DIR/smoke_tests.sh"
    fi
    
    # Basic health check
    if ! curl -s --max-time 10 "$BASE_URL/health" >/dev/null; then
        error "Post-deployment health check failed"
        return 1
    fi
    
    success "Post-deployment verification passed"
}

# Start monitoring
start_monitoring() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log "Starting 60-minute monitoring period..."
        
        if $DRY_RUN; then
            log "[DRY-RUN] Would start monitoring: node $SCRIPT_DIR/monitor_dhash.js --env $ENVIRONMENT"
            return 0
        fi
        
        # Start monitoring in background
        nohup node "$SCRIPT_DIR/monitor_dhash.js" --env "$ENVIRONMENT" > monitor_logs/monitor_$(date +%Y%m%d_%H%M%S).log 2>&1 &
        local monitor_pid=$!
        
        log "Monitoring started with PID: $monitor_pid"
        echo "$monitor_pid" > /tmp/dhash_monitor.pid
        
        # Send notification
        if [[ -f "$SCRIPT_DIR/notify.js" ]]; then
            node "$SCRIPT_DIR/notify.js" --type deploy --env "$ENVIRONMENT" --message "dhash deployment to $ENVIRONMENT completed. 60-minute monitoring started." || true
        fi
    else
        log "Monitoring skipped for non-production environment: $ENVIRONMENT"
    fi
}

# Main deployment flow
main() {
    log "=== dhash Deployment Start ==="
    log "Environment: $ENVIRONMENT"
    log "Dry-run: $DRY_RUN"
    log "Timestamp: $(date -Iseconds)"
    
    # Create logs directory
    mkdir -p "$ROOT_DIR/monitor_logs"
    
    # Run deployment steps
    pre_deployment_checks
    create_deployment_backup
    
    if deploy_dhash; then
        post_deployment_verification
        start_monitoring
        success "=== dhash Deployment Completed Successfully ==="
        
        if [[ "$ENVIRONMENT" == "production" ]]; then
            log ""
            log "Next steps:"
            log "1. Monitor the deployment for 60 minutes"
            log "2. Check monitor_logs/ for real-time status"
            log "3. Auto-rollback will trigger if quality gates fail"
            log "4. Manual rollback: ./scripts/rollback_dhash.sh --env $ENVIRONMENT"
        fi
    else
        error "=== dhash Deployment Failed ==="
        
        if [[ "$ENVIRONMENT" == "production" ]] && [[ "$DRY_RUN" == "false" ]]; then
            warn "Consider rolling back immediately:"
            warn "  ./scripts/rollback_dhash.sh --env $ENVIRONMENT"
        fi
        
        exit 1
    fi
}

# Execute main function
main "$@"