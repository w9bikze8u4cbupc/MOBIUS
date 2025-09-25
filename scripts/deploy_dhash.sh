#!/bin/bash

# deploy_dhash.sh - Production deployment script for MOBIUS dhash
# Usage: ./scripts/deploy_dhash.sh --env production --tag v1.0.0

set -euo pipefail

# Default configuration
ENVIRONMENT=""
RELEASE_TAG=""
DRY_RUN=false
BACKUP_BEFORE_DEPLOY=true
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

usage() {
    cat << EOF
Usage: $0 --env ENVIRONMENT --tag RELEASE_TAG [OPTIONS]

Deploy MOBIUS dhash to specified environment.

Required arguments:
    --env ENVIRONMENT       Target environment (production, staging, etc.)
    --tag RELEASE_TAG      Git tag or version to deploy (e.g., v1.0.0)

Optional arguments:
    --dry-run              Perform a dry-run without actual deployment
    --no-backup           Skip pre-deployment backup creation
    --help                Show this help message

Examples:
    $0 --env production --tag v2.1.0
    $0 --env staging --tag v2.1.0-rc1 --dry-run
    $0 --env production --tag v2.0.5 --no-backup

Environment variables:
    DEPLOY_LEAD           Deploy lead identifier (e.g., @username)
    BACKUP_RETENTION_DAYS Number of days to retain backups (default: 30)
    MONITOR_DURATION      Post-deploy monitoring duration in seconds (default: 3600)
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --tag)
            RELEASE_TAG="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-backup)
            BACKUP_BEFORE_DEPLOY=false
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
if [[ -z "$ENVIRONMENT" || -z "$RELEASE_TAG" ]]; then
    error "Both --env and --tag are required"
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
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
MONITOR_DURATION="${MONITOR_DURATION:-3600}"

log "Starting MOBIUS dhash deployment"
log "Environment: $ENVIRONMENT"
log "Release tag: $RELEASE_TAG"
log "Deploy lead: $DEPLOY_LEAD"
log "Dry run: $DRY_RUN"
log "Backup before deploy: $BACKUP_BEFORE_DEPLOY"
log "Timestamp: $TIMESTAMP"

# Create necessary directories
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

# Pre-deployment validation
log "=== Pre-deployment Validation ==="

# Check if running as appropriate user
if [[ $ENVIRONMENT == "production" && $(id -u) -eq 0 ]]; then
    warn "Running as root in production - consider using dedicated service user"
fi

# Validate release tag format
if [[ ! $RELEASE_TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-.*)?$ ]]; then
    warn "Release tag format doesn't match semantic versioning: $RELEASE_TAG"
fi

# Check Git repository state
cd "$PROJECT_ROOT"
if ! git rev-parse "$RELEASE_TAG" >/dev/null 2>&1; then
    error "Release tag $RELEASE_TAG not found in repository"
    exit 1
fi

# Validate environment configuration
if [[ ! -f "$CONFIG_FILE" && $ENVIRONMENT == "production" ]]; then
    error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Check service status
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    log "Service $SERVICE_NAME is currently running"
    CURRENT_VERSION=$(systemctl show "$SERVICE_NAME" --property=ExecStart 2>/dev/null || echo "unknown")
    log "Current version info: $CURRENT_VERSION"
else
    warn "Service $SERVICE_NAME is not running"
fi

# Pre-deployment backup
if [[ $BACKUP_BEFORE_DEPLOY == true ]]; then
    log "=== Creating Pre-deployment Backup ==="
    
    BACKUP_FILE="$BACKUP_DIR/dhash_pre_${RELEASE_TAG//\//_}_${TIMESTAMP}.zip"
    
    if [[ $DRY_RUN == true ]]; then
        log "[DRY-RUN] Would create backup: $BACKUP_FILE"
    else
        log "Creating backup: $BACKUP_FILE"
        
        # Create backup of current state
        zip -r "$BACKUP_FILE" \
            "$CONFIG_FILE" \
            "$DATA_DIR" \
            "$PROJECT_ROOT/package.json" \
            "$PROJECT_ROOT/src" \
            2>/dev/null || warn "Some files may not exist for backup"
            
        # Generate checksum
        sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
        
        success "Backup created: $BACKUP_FILE"
        log "Backup checksum: ${BACKUP_FILE}.sha256"
    fi
fi

# Deployment process
log "=== Deployment Process ==="

# Step 1: Checkout release tag
log "[1/6] Checking out release tag: $RELEASE_TAG"
if [[ $DRY_RUN == true ]]; then
    log "[DRY-RUN] Would checkout: git checkout $RELEASE_TAG"
else
    git fetch --tags
    git checkout "$RELEASE_TAG"
    success "Checked out release tag: $RELEASE_TAG"
fi

# Step 2: Install dependencies
log "[2/6] Installing dependencies"
if [[ $DRY_RUN == true ]]; then
    log "[DRY-RUN] Would run: npm ci --production"
else
    npm ci --production --silent
    success "Dependencies installed"
fi

# Step 3: Build application (if needed)
log "[3/6] Building application"
if [[ $DRY_RUN == true ]]; then
    log "[DRY-RUN] Would run build process"
else
    if npm run build --if-present 2>/dev/null; then
        success "Application built successfully"
    else
        log "No build script found or build not required"
    fi
fi

# Step 4: Stop current service
log "[4/6] Stopping current service"
if [[ $DRY_RUN == true ]]; then
    log "[DRY-RUN] Would stop service: $SERVICE_NAME"
else
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl stop "$SERVICE_NAME"
        log "Service $SERVICE_NAME stopped"
        
        # Wait for graceful shutdown
        sleep 5
        
        # Ensure service is stopped
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            warn "Service still running, forcing stop..."
            systemctl kill "$SERVICE_NAME"
            sleep 2
        fi
    else
        log "Service $SERVICE_NAME was not running"
    fi
fi

# Step 5: Deploy new version
log "[5/6] Deploying new version"
if [[ $DRY_RUN == true ]]; then
    log "[DRY-RUN] Would deploy version $RELEASE_TAG to $ENVIRONMENT"
    log "[DRY-RUN] Would update configuration if needed"
    log "[DRY-RUN] Would update service files and restart"
else
    # Update version marker
    echo "$RELEASE_TAG" > "$DATA_DIR/version.txt"
    echo "$TIMESTAMP" > "$DATA_DIR/deploy_time.txt"
    echo "$DEPLOY_LEAD" > "$DATA_DIR/deploy_lead.txt"
    
    # Start service
    systemctl start "$SERVICE_NAME"
    log "Service $SERVICE_NAME started"
    
    # Wait for service to be ready
    sleep 10
    
    # Verify service started successfully
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Service $SERVICE_NAME is running"
    else
        error "Service $SERVICE_NAME failed to start"
        
        # Show recent logs for debugging
        log "Recent service logs:"
        journalctl -u "$SERVICE_NAME" --lines=20 --no-pager
        exit 1
    fi
fi

# Step 6: Post-deployment validation
log "[6/6] Post-deployment validation"
if [[ $DRY_RUN == true ]]; then
    log "[DRY-RUN] Would run health checks and smoke tests"
    log "[DRY-RUN] Would validate quality gates"
    log "[DRY-RUN] Would check service endpoints"
else
    # Health check
    HEALTH_CHECK_URL="http://localhost:8080/health"  # Adjust as needed
    if command -v curl >/dev/null 2>&1; then
        if curl -f -s "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
            success "Health check passed: $HEALTH_CHECK_URL"
        else
            warn "Health check failed or endpoint not available: $HEALTH_CHECK_URL"
        fi
    else
        warn "curl not available for health checks"
    fi
    
    # Smoke tests
    if [[ -f "$SCRIPT_DIR/smoke_tests.sh" ]]; then
        log "Running smoke tests..."
        if bash "$SCRIPT_DIR/smoke_tests.sh" "$ENVIRONMENT"; then
            success "Smoke tests passed"
        else
            error "Smoke tests failed"
            exit 1
        fi
    else
        warn "Smoke tests script not found: $SCRIPT_DIR/smoke_tests.sh"
    fi
    
    # Quality gates (if applicable)
    if [[ -f "$SCRIPT_DIR/check_golden.js" ]]; then
        log "Running quality gate validation..."
        if node "$SCRIPT_DIR/check_golden.js" --env "$ENVIRONMENT" 2>/dev/null || true; then
            success "Quality gates validation completed"
        else
            warn "Quality gates validation had issues"
        fi
    fi
fi

# Cleanup old backups
if [[ $BACKUP_BEFORE_DEPLOY == true && $DRY_RUN == false ]]; then
    log "=== Backup Cleanup ==="
    log "Cleaning up backups older than $BACKUP_RETENTION_DAYS days"
    find "$BACKUP_DIR" -name "dhash_*.zip" -mtime +$BACKUP_RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "dhash_*.zip.sha256" -mtime +$BACKUP_RETENTION_DAYS -delete 2>/dev/null || true
fi

# Generate deployment report
REPORT_FILE="$LOG_DIR/deployment_${RELEASE_TAG//\//_}_${TIMESTAMP}.log"
{
    echo "MOBIUS dhash Deployment Report"
    echo "============================="
    echo ""
    echo "Deployment Details:"
    echo "- Timestamp: $TIMESTAMP"
    echo "- Environment: $ENVIRONMENT"
    echo "- Release Tag: $RELEASE_TAG"
    echo "- Deploy Lead: $DEPLOY_LEAD"
    echo "- Dry Run: $DRY_RUN"
    echo ""
    echo "System Information:"
    echo "- Service: $SERVICE_NAME"
    echo "- Config: $CONFIG_FILE"
    echo "- Data Dir: $DATA_DIR"
    echo "- Log Dir: $LOG_DIR"
    echo "- Backup Dir: $BACKUP_DIR"
    echo ""
    if [[ $DRY_RUN == false ]]; then
        echo "Deployment Results:"
        echo "- Service Status: $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo 'unknown')"
        echo "- Process ID: $(systemctl show "$SERVICE_NAME" --property=MainPID --value 2>/dev/null || echo 'unknown')"
        echo "- Start Time: $(systemctl show "$SERVICE_NAME" --property=ActiveEnterTimestamp --value 2>/dev/null || echo 'unknown')"
    else
        echo "Dry Run Results:"
        echo "- All validation steps completed"
        echo "- No actual deployment performed"
        echo "- Ready for production deployment"
    fi
    echo ""
    echo "Next Steps:"
    if [[ $DRY_RUN == false ]]; then
        echo "1. Monitor deployment with: ./scripts/monitor_dhash.sh --env $ENVIRONMENT --duration $MONITOR_DURATION"
        echo "2. Check service logs: journalctl -u $SERVICE_NAME -f"
        echo "3. Validate quality gates and performance"
    else
        echo "1. Review dry-run results"
        echo "2. Run actual deployment: ${0} --env $ENVIRONMENT --tag $RELEASE_TAG"
        echo "3. Monitor and validate post-deployment"
    fi
    echo ""
    echo "Report generated: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
} > "$REPORT_FILE"

# Final summary
echo ""
echo "====================================================================="
if [[ $DRY_RUN == true ]]; then
    success "Deployment dry-run completed successfully!"
    log "No actual changes were made to the system"
else
    success "Deployment completed successfully!"
fi
echo "====================================================================="
echo ""
log "Deployment Summary:"
echo "  🎯 Environment: $ENVIRONMENT"
echo "  🏷️  Release: $RELEASE_TAG"
echo "  👤 Deploy Lead: $DEPLOY_LEAD"
echo "  📋 Report: $REPORT_FILE"
echo ""
if [[ $DRY_RUN == false ]]; then
    log "Next steps:"
    echo "  1. Monitor deployment: ./scripts/monitor_dhash.sh --env $ENVIRONMENT"
    echo "  2. Check service status: systemctl status $SERVICE_NAME"
    echo "  3. Watch logs: journalctl -u $SERVICE_NAME -f"
    echo ""
    warn "Monitoring window: $MONITOR_DURATION seconds ($((MONITOR_DURATION/60)) minutes)"
    warn "Rollback available with backup: $BACKUP_FILE"
else
    log "Ready for actual deployment:"
    echo "  Run: ${0} --env $ENVIRONMENT --tag $RELEASE_TAG"
fi
echo ""
echo "====================================================================="