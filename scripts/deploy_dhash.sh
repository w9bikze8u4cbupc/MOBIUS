#!/bin/bash
# scripts/deploy_dhash.sh
# Deploy dhash pipeline with dry-run capability and rollback preparation

set -euo pipefail

# Configuration
DEPLOY_ENV="${DEPLOY_ENV:-staging}"
DRY_RUN=false
FORCE_DEPLOY=false
BACKUP_BEFORE_DEPLOY=true
HEALTH_CHECK_TIMEOUT=300

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        --no-backup)
            BACKUP_BEFORE_DEPLOY=false
            shift
            ;;
        --env)
            DEPLOY_ENV="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --dry-run         Show what would be deployed without executing"
            echo "  --force           Skip safety checks and deploy immediately"
            echo "  --no-backup       Skip pre-deployment backup"
            echo "  --env ENV         Target environment (staging|production)"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$DEPLOY_ENV] $*"
}

# Dry run function
dry_run_log() {
    if [[ $DRY_RUN == true ]]; then
        echo "[DRY RUN] $*"
    else
        log "$*"
    fi
}

log "Starting dhash deployment process"
log "Environment: $DEPLOY_ENV"
log "Dry run: $DRY_RUN"

# Pre-flight checks
perform_preflight_checks() {
    log "Performing pre-flight checks..."
    
    # Check Node.js version
    if ! node --version | grep -q "v20"; then
        log "WARNING: Expected Node.js v20, got $(node --version)"
        if [[ $FORCE_DEPLOY == false ]]; then
            log "ERROR: Use --force to override version check"
            exit 3
        fi
    fi
    
    # Check npm dependencies
    if [[ ! -f package-lock.json ]]; then
        log "ERROR: package-lock.json not found"
        exit 1
    fi
    
    # Check FFmpeg availability
    if ! command -v ffmpeg >/dev/null 2>&1; then
        log "ERROR: FFmpeg not found in PATH"
        exit 3
    fi
    
    # Check disk space (need at least 5GB)
    AVAILABLE_GB=$(df . | tail -1 | awk '{print int($4/1024/1024)}')
    if [[ $AVAILABLE_GB -lt 5 ]]; then
        log "ERROR: Insufficient disk space. Available: ${AVAILABLE_GB}GB, Required: 5GB"
        exit 5
    fi
    
    log "Pre-flight checks passed"
}

# Create backup before deployment
create_backup() {
    if [[ $BACKUP_BEFORE_DEPLOY == true ]]; then
        log "Creating pre-deployment backup..."
        if [[ $DRY_RUN == false ]]; then
            if ! ./scripts/backup_library.sh; then
                log "ERROR: Backup creation failed"
                exit 2
            fi
        else
            echo "[DRY RUN] Would create backup using scripts/backup_library.sh"
        fi
    else
        log "Skipping backup (--no-backup specified)"
    fi
}

# Install dependencies
install_dependencies() {
    dry_run_log "Installing npm dependencies..."
    if [[ $DRY_RUN == false ]]; then
        npm ci --production
    fi
}

# Run tests
run_tests() {
    dry_run_log "Running critical tests..."
    if [[ $DRY_RUN == false ]]; then
        # Run smoke tests only for deployment
        npm test -- --testNamePattern="smoke|integration" || {
            log "ERROR: Critical tests failed"
            exit 2
        }
    fi
}

# Deploy application
deploy_application() {
    dry_run_log "Deploying dhash application..."
    if [[ $DRY_RUN == false ]]; then
        # Build application
        npm run build --if-present
        
        # Start application services (this would be environment-specific)
        case $DEPLOY_ENV in
            "staging")
                log "Deploying to staging environment"
                # Staging-specific deployment steps
                ;;
            "production")
                log "Deploying to production environment"
                # Production-specific deployment steps  
                ;;
            *)
                log "ERROR: Unknown environment: $DEPLOY_ENV"
                exit 1
                ;;
        esac
    fi
}

# Health check
perform_health_check() {
    if [[ $DRY_RUN == true ]]; then
        echo "[DRY RUN] Would perform health check on deployed service"
        return 0
    fi
    
    log "Performing post-deployment health check..."
    
    # Check if service is responding (adjust URL based on your setup)
    local health_url="http://localhost:5001/health"
    local start_time=$(date +%s)
    local timeout=$HEALTH_CHECK_TIMEOUT
    
    while true; do
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))
        
        if [[ $elapsed -gt $timeout ]]; then
            log "ERROR: Health check timeout after ${timeout}s"
            exit 4
        fi
        
        if curl -f -s "$health_url" >/dev/null 2>&1; then
            log "Health check passed"
            break
        fi
        
        log "Waiting for service to be healthy... (${elapsed}s/${timeout}s)"
        sleep 5
    done
}

# Main deployment flow
main() {
    perform_preflight_checks
    create_backup
    install_dependencies
    run_tests
    deploy_application
    perform_health_check
    
    if [[ $DRY_RUN == true ]]; then
        log "DRY RUN completed - no changes made"
        log "To execute deployment, run without --dry-run flag"
    else
        log "Deployment completed successfully"
        log "Environment: $DEPLOY_ENV"
        log "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    fi
}

# Error handling
trap 'log "ERROR: Deployment failed at line $LINENO"; exit 1' ERR

# Execute main flow
main

exit 0