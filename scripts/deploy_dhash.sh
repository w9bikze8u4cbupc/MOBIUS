#!/bin/bash
#
# deploy_dhash.sh - Main dhash deployment orchestrator
# Provides env validation, health checks, backup integration, and --dry-run support
#
# Usage: ./scripts/deploy_dhash.sh --env production [--dry-run] [--backup-file backup.zip]
#

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/deploy_logs"
BACKUP_DIR="$ROOT_DIR/backups"

# Default values
ENV=""
DRY_RUN=false
BACKUP_FILE=""
HEALTH_CHECK_TIMEOUT=300
DEPLOY_TIMEOUT=1800

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

Deploy dhash component with comprehensive validation and monitoring.

Required Arguments:
  --env ENVIRONMENT     Target environment (production, staging, development)

Optional Arguments:
  --dry-run            Perform validation checks without actual deployment
  --backup-file FILE   Use specific backup file instead of creating new one
  --health-timeout SEC Health check timeout in seconds (default: 300)
  --deploy-timeout SEC Deployment timeout in seconds (default: 1800)
  --help              Show this help message

Examples:
  $0 --env production --dry-run
  $0 --env staging
  $0 --env production --backup-file backups/dhash_20231027_143022.zip

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
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --backup-file)
                BACKUP_FILE="$2"
                shift 2
                ;;
            --health-timeout)
                HEALTH_CHECK_TIMEOUT="$2"
                shift 2
                ;;
            --deploy-timeout)
                DEPLOY_TIMEOUT="$2"
                shift 2
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

# Environment validation
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

    # Check required tools
    local required_tools=("node" "npm" "curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool '$tool' not found in PATH"
            exit 1
        fi
    done

    # Check environment-specific requirements
    if [[ "$ENV" == "production" ]]; then
        if [[ -z "${DHASH_PRODUCTION_URL:-}" ]]; then
            log_error "DHASH_PRODUCTION_URL environment variable is required for production deployment"
            exit 1
        fi
    fi

    log_success "Environment validation completed"
}

# Pre-deployment health check
pre_deployment_health_check() {
    log_info "Performing pre-deployment health checks"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Skipping actual health checks"
        return 0
    fi

    # Check current dhash service status
    local health_endpoint="${DHASH_${ENV^^}_URL:-http://localhost:3000}/health"
    
    log_info "Checking health endpoint: $health_endpoint"
    
    local start_time=$(date +%s)
    local timeout_time=$((start_time + HEALTH_CHECK_TIMEOUT))
    
    while [[ $(date +%s) -lt $timeout_time ]]; do
        if curl -sf "$health_endpoint" > /dev/null 2>&1; then
            log_success "Health check passed"
            return 0
        fi
        log_info "Health check failed, retrying in 5 seconds..."
        sleep 5
    done
    
    log_error "Health check timed out after $HEALTH_CHECK_TIMEOUT seconds"
    return 1
}

# Create backup if needed
ensure_backup() {
    if [[ -n "$BACKUP_FILE" ]]; then
        if [[ -f "$BACKUP_FILE" ]]; then
            log_info "Using existing backup file: $BACKUP_FILE"
            
            # Verify backup integrity
            if [[ -f "${BACKUP_FILE}.sha256" ]]; then
                log_info "Verifying backup integrity"
                if cd "$BACKUP_DIR" && sha256sum -c "$(basename "$BACKUP_FILE").sha256" 2>/dev/null; then
                    log_success "Backup integrity verified"
                else
                    log_error "Backup integrity check failed"
                    exit 1
                fi
            else
                log_warn "No SHA256 checksum found for backup file"
            fi
        else
            log_error "Specified backup file does not exist: $BACKUP_FILE"
            exit 1
        fi
    else
        log_info "Creating new backup"
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Would create backup using: $SCRIPT_DIR/backup_dhash.sh --env $ENV"
            BACKUP_FILE="$BACKUP_DIR/dhash_$(date +'%Y%m%d_%H%M%S')_dry_run.zip"
        else
            if ! "$SCRIPT_DIR/backup_dhash.sh" --env "$ENV"; then
                log_error "Backup creation failed"
                exit 1
            fi
            # Get the latest backup file
            BACKUP_FILE=$(find "$BACKUP_DIR" -name "dhash_*.zip" -type f -printf '%T@ %p\n' | sort -k 1nr | head -n1 | cut -d' ' -f2-)
            log_success "Backup created: $BACKUP_FILE"
        fi
    fi
}

# Deploy dhash component
deploy_dhash() {
    log_info "Starting dhash deployment for environment: $ENV"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would deploy dhash component"
        log_info "[DRY-RUN] Environment: $ENV"
        log_info "[DRY-RUN] Backup file: $BACKUP_FILE"
        log_info "[DRY-RUN] Deploy timeout: $DEPLOY_TIMEOUT seconds"
        return 0
    fi

    local start_time=$(date +%s)
    
    # Run deployment steps
    log_info "Installing dependencies..."
    cd "$ROOT_DIR"
    npm ci --production
    
    log_info "Building dhash component..."
    npm run build:dhash 2>/dev/null || npm run build || log_warn "No build script found"
    
    log_info "Running database migrations..."
    "$SCRIPT_DIR/migrate_dhash.sh" --env "$ENV" --direction forward
    
    # Restart services (environment-specific)
    case "$ENV" in
        production)
            log_info "Restarting production services..."
            # Add production-specific restart commands here
            ;;
        staging)
            log_info "Restarting staging services..."
            # Add staging-specific restart commands here
            ;;
        development)
            log_info "Restarting development services..."
            # Add development-specific restart commands here
            ;;
    esac
    
    local end_time=$(date +%s)
    local deploy_duration=$((end_time - start_time))
    
    log_success "Deployment completed in ${deploy_duration} seconds"
}

# Post-deployment health check
post_deployment_health_check() {
    log_info "Performing post-deployment health checks"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would perform post-deployment health checks"
        return 0
    fi

    # Run smoke tests
    log_info "Running smoke tests..."
    if ! "$SCRIPT_DIR/smoke_tests.sh" --env "$ENV"; then
        log_error "Smoke tests failed"
        return 1
    fi

    # Validate logging
    log_info "Validating logging configuration..."
    if ! node "$SCRIPT_DIR/validate_logging.js" --env "$ENV"; then
        log_error "Logging validation failed"
        return 1
    fi

    log_success "Post-deployment validation completed"
}

# Start monitoring
start_monitoring() {
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would start 60-minute monitoring"
        return 0
    fi

    log_info "Starting post-deployment monitoring (60 minutes)..."
    node "$SCRIPT_DIR/monitor_dhash.js" --env "$ENV" --duration 3600 &
    local monitor_pid=$!
    
    log_info "Monitoring started with PID: $monitor_pid"
    echo "$monitor_pid" > "$LOG_DIR/monitor.pid"
}

# Send deployment notifications
send_notifications() {
    local status=$1
    local message=$2
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would send notification: $status - $message"
        return 0
    fi

    log_info "Sending deployment notifications..."
    node "$SCRIPT_DIR/deploy/deploy-notify.js" \
        --env "$ENV" \
        --status "$status" \
        --message "$message" \
        --backup-file "$BACKUP_FILE"
}

# Cleanup function
cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Deployment failed with exit code: $exit_code"
        send_notifications "failed" "Deployment failed during execution"
    fi
    
    exit $exit_code
}

# Main execution
main() {
    # Setup
    trap cleanup EXIT
    mkdir -p "$LOG_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    log_info "Starting dhash deployment process"
    log_info "Environment: $ENV"
    log_info "Dry run: $DRY_RUN"
    log_info "Script directory: $SCRIPT_DIR"
    log_info "Root directory: $ROOT_DIR"
    
    # Execute deployment steps
    validate_environment
    pre_deployment_health_check
    ensure_backup
    
    send_notifications "started" "Deployment process initiated"
    
    if deploy_dhash && post_deployment_health_check; then
        start_monitoring
        send_notifications "success" "Deployment completed successfully"
        log_success "Dhash deployment completed successfully!"
        
        # Print summary
        cat << EOF

=== DEPLOYMENT SUMMARY ===
Environment: $ENV
Dry Run: $DRY_RUN
Backup: $BACKUP_FILE
Status: SUCCESS
Time: $(date)

Next Steps:
1. Monitor the deployment for 60 minutes
2. Check monitoring logs: tail -f $LOG_DIR/monitor.log
3. Review quality gates in quality-gates-config.json
4. Monitor notifications for any alerts

EOF
        exit 0
    else
        send_notifications "failed" "Deployment validation failed"
        log_error "Deployment failed!"
        exit 1
    fi
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi