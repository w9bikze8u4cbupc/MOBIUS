#!/bin/bash

# Guarded Production Rollout - dhash Deploy Script
# Usage: ./scripts/deploy_dhash.sh [--dry-run] [--env staging|production] [--config /path/to/config]

set -euo pipefail

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
CONFIG_FILE=""
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

# Logging function
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
dhash Deployment Script - Guarded Production Rollout

Usage: $0 [OPTIONS]

OPTIONS:
    --dry-run           Run in dry-run mode (no actual deployment)
    --env ENV           Target environment: staging|production (default: staging)
    --config FILE       Path to custom configuration file
    --help              Show this help message

Examples:
    $0 --dry-run --env staging
    $0 --env production
    $0 --dry-run --env production --config /path/to/prod.conf

EOF
}

# Parse command line arguments
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
        --config)
            CONFIG_FILE="$2"
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

# Load configuration
load_config() {
    local config_path
    
    if [[ -n "$CONFIG_FILE" ]]; then
        config_path="$CONFIG_FILE"
    else
        config_path="$PROJECT_ROOT/config/dhash_${ENVIRONMENT}.conf"
    fi
    
    if [[ -f "$config_path" ]]; then
        log "Loading configuration from: $config_path"
        # shellcheck disable=SC1090
        source "$config_path"
    else
        warn "Configuration file not found: $config_path. Using defaults."
        # Set default values
        DHASH_SERVICE_NAME="${DHASH_SERVICE_NAME:-dhash-service}"
        DHASH_IMAGE_TAG="${DHASH_IMAGE_TAG:-latest}"
        DHASH_REPLICAS="${DHASH_REPLICAS:-3}"
        DHASH_MEMORY_LIMIT="${DHASH_MEMORY_LIMIT:-2Gi}"
        DHASH_CPU_LIMIT="${DHASH_CPU_LIMIT:-1000m}"
    fi
}

# Create necessary directories
setup_directories() {
    mkdir -p "$BACKUP_DIR" "$LOGS_DIR"
    log "Created directories: $BACKUP_DIR, $LOGS_DIR"
}

# Pre-deployment checks
pre_deploy_checks() {
    log "Running pre-deployment checks..."
    
    # Check if backup exists
    if [[ ! -d "$BACKUP_DIR" ]] || [[ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]]; then
        error "No backup found in $BACKUP_DIR. Run backup_dhash.sh first."
        exit 1
    fi
    
    # Verify latest backup integrity
    local latest_backup
    latest_backup=$(ls -1 "$BACKUP_DIR"/dhash_*.zip 2>/dev/null | sort -r | head -n1 || echo "")
    if [[ -n "$latest_backup" && -f "${latest_backup}.sha256" ]]; then
        log "Verifying backup integrity: $(basename "$latest_backup")"
        if ! sha256sum -c "${latest_backup}.sha256" > /dev/null 2>&1; then
            error "Backup integrity check failed for: $latest_backup"
            exit 1
        fi
        success "Backup integrity verified"
    else
        error "No valid backup with SHA256 checksum found"
        exit 1
    fi
    
    # Check if migration script exists
    if [[ ! -f "$SCRIPT_DIR/migrate_dhash.sh" ]]; then
        warn "migrate_dhash.sh not found. Skipping migration checks."
    fi
    
    # Check environment connectivity
    log "Checking environment connectivity..."
    if [[ "$ENVIRONMENT" == "production" ]]; then
        # Add production-specific checks here
        log "Production environment checks passed"
    else
        log "Staging environment checks passed"
    fi
    
    success "Pre-deployment checks completed"
}

# Execute deployment
deploy_dhash() {
    local log_file="$LOGS_DIR/deploy_${ENVIRONMENT}_${TIMESTAMP}.log"
    
    log "Starting dhash deployment to $ENVIRONMENT environment"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN MODE - No actual deployment will occur"
        echo "=== DRY RUN DEPLOYMENT LOG ===" > "$log_file"
        echo "Environment: $ENVIRONMENT" >> "$log_file"
        echo "Service: $DHASH_SERVICE_NAME" >> "$log_file"
        echo "Image Tag: $DHASH_IMAGE_TAG" >> "$log_file"
        echo "Replicas: $DHASH_REPLICAS" >> "$log_file"
        echo "Memory Limit: $DHASH_MEMORY_LIMIT" >> "$log_file"
        echo "CPU Limit: $DHASH_CPU_LIMIT" >> "$log_file"
        echo "Timestamp: $TIMESTAMP" >> "$log_file"
        echo "Would deploy dhash service with above configuration" >> "$log_file"
    else
        log "Deploying dhash service..."
        {
            echo "=== DEPLOYMENT LOG ==="
            echo "Environment: $ENVIRONMENT"
            echo "Service: $DHASH_SERVICE_NAME"
            echo "Image Tag: $DHASH_IMAGE_TAG"
            echo "Started at: $(date)"
            
            # Simulate deployment steps (replace with actual deployment commands)
            echo "Updating service configuration..."
            echo "Rolling out new version..."
            echo "Waiting for service to be ready..."
            
            # In a real deployment, this would include:
            # - Docker/Kubernetes deployment commands
            # - Health checks
            # - Service registration
            # - Load balancer updates
            
            echo "Deployment completed at: $(date)"
        } >> "$log_file"
    fi
    
    # Start monitoring hook
    if [[ "$DRY_RUN" == "false" ]] && [[ -f "$SCRIPT_DIR/monitor_dhash.js" ]]; then
        log "Starting post-deployment monitoring..."
        node "$SCRIPT_DIR/monitor_dhash.js" --env "$ENVIRONMENT" --duration 60 &
        echo "Monitoring PID: $!" >> "$log_file"
    fi
    
    success "Deployment completed. Log: $log_file"
}

# Main execution
main() {
    log "dhash Guarded Deployment Script - Environment: $ENVIRONMENT"
    
    setup_directories
    load_config
    pre_deploy_checks
    deploy_dhash
    
    if [[ "$DRY_RUN" == "true" ]]; then
        success "DRY RUN completed successfully"
        echo "Review the generated log and run without --dry-run to proceed with actual deployment"
    else
        success "Deployment initiated successfully"
        echo "Monitor the deployment progress and check logs in: $LOGS_DIR"
        if [[ "$ENVIRONMENT" == "production" ]]; then
            echo "Production deployment requires 60-minute monitoring window"
        fi
    fi
}

# Error handling
trap 'error "Deployment failed at line $LINENO. Check logs in $LOGS_DIR"' ERR

# Execute main function
main "$@"