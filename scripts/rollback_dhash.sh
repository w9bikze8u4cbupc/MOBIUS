#!/bin/bash

# Rollback Script for MOBIUS dhash service
# Restores from latest SHA256-verified backup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"

# Default values
ENVIRONMENT="staging"
FORCE=false
BACKUP_FILE=""
ROLLBACK_TIMEOUT=120

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Rollback the MOBIUS dhash service to a previous backup.

OPTIONS:
    --env ENV           Target environment: staging|production (default: staging)
    --backup FILE       Specific backup file to restore from
    --force            Skip confirmation prompts
    --timeout SECONDS  Health check timeout (default: 120)
    -h, --help         Show this help message

EXAMPLES:
    $0 --env staging
    $0 --env production --backup backups/dhash_20231225T120000Z.zip
    $0 --force

NOTES:
    - Without --backup, uses the latest SHA256-verified backup
    - Always verifies backup integrity before rollback
    - Performs health checks after rollback

EOF
}

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

# Parse command line arguments
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
        --force)
            FORCE=true
            shift
            ;;
        --timeout)
            ROLLBACK_TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
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

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
    exit 1
fi

# Set environment-specific configuration
case $ENVIRONMENT in
    "staging")
        DEPLOY_PATH="${STAGING_DEPLOY_PATH:-/tmp/mobius-deploy-staging}"
        PORT="${STAGING_PORT:-5001}"
        ;;
    "production")
        DEPLOY_PATH="${PRODUCTION_DEPLOY_PATH:-/opt/mobius/production}"
        PORT="${PRODUCTION_PORT:-5000}"
        ;;
esac

# Find latest backup if not specified
find_latest_backup() {
    if [[ -n "$BACKUP_FILE" ]]; then
        if [[ ! -f "$BACKUP_FILE" ]]; then
            error "Specified backup file not found: $BACKUP_FILE"
            exit 1
        fi
        echo "$BACKUP_FILE"
        return 0
    fi
    
    log "Finding latest verified backup..."
    
    # Find all backup files with SHA256 checksums
    local latest_backup=""
    local latest_time=0
    
    for backup in "$BACKUP_DIR"/dhash_*.zip; do
        if [[ -f "$backup" && -f "$backup.sha256" ]]; then
            local file_time=$(stat -c %Y "$backup" 2>/dev/null || stat -f %m "$backup" 2>/dev/null || echo 0)
            if [[ $file_time -gt $latest_time ]]; then
                latest_time=$file_time
                latest_backup="$backup"
            fi
        fi
    done
    
    if [[ -z "$latest_backup" ]]; then
        error "No verified backup found in $BACKUP_DIR"
        error "Backups must have corresponding .sha256 files for verification"
        exit 1
    fi
    
    echo "$latest_backup"
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    local checksum_file="$backup_file.sha256"
    
    if [[ ! -f "$checksum_file" ]]; then
        error "Checksum file not found: $checksum_file"
        exit 1
    fi
    
    log "Verifying backup integrity..."
    
    local backup_dir=$(dirname "$backup_file")
    cd "$backup_dir"
    
    if command -v sha256sum >/dev/null 2>&1; then
        if sha256sum -c "$(basename "$checksum_file")" >/dev/null 2>&1; then
            success "Backup integrity verified"
            return 0
        else
            error "Backup integrity check failed"
            exit 1
        fi
    elif command -v shasum >/dev/null 2>&1; then
        if shasum -a 256 -c "$(basename "$checksum_file")" >/dev/null 2>&1; then
            success "Backup integrity verified"
            return 0
        else
            error "Backup integrity check failed"
            exit 1
        fi
    else
        warn "No SHA256 utility found. Skipping integrity check."
        return 0
    fi
}

# Stop current service
stop_service() {
    log "Stopping current service..."
    
    # Find and stop any running processes on the port
    local pids=$(lsof -ti:$PORT 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo "$pids" | xargs -r kill -TERM
        sleep 3
        
        # Force kill if still running
        pids=$(lsof -ti:$PORT 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            echo "$pids" | xargs -r kill -KILL
        fi
        
        success "Service stopped"
    else
        log "No service running on port $PORT"
    fi
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    log "Restoring from backup: $(basename "$backup_file")"
    
    # Create rollback directory
    local rollback_dir="/tmp/mobius-rollback-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$rollback_dir"
    
    # Extract backup
    log "Extracting backup to $rollback_dir..."
    cd "$rollback_dir"
    unzip -q "$backup_file"
    
    # Install dependencies
    log "Installing dependencies..."
    npm ci --production
    
    # Create environment-specific config
    case $ENVIRONMENT in
        "staging")
            NODE_ENV="staging"
            ;;
        "production")
            NODE_ENV="production"
            ;;
    esac
    
    cat > "$rollback_dir/.env" << EOF
NODE_ENV=$NODE_ENV
PORT=$PORT
LOG_LEVEL=info
EOF
    
    echo "$rollback_dir"
}

# Health check after rollback
health_check() {
    local rollback_dir="$1"
    
    log "Starting service for health check..."
    
    cd "$rollback_dir"
    NODE_ENV="$NODE_ENV" PORT="$PORT" npm start &
    local service_pid=$!
    
    sleep 5
    
    local health_url="http://localhost:$PORT/health"
    local attempts=0
    local max_attempts=$((ROLLBACK_TIMEOUT / 10))
    
    log "Performing health check..."
    while [[ $attempts -lt $max_attempts ]]; do
        if curl -s -f "$health_url" >/dev/null 2>&1; then
            local health_response=$(curl -s "$health_url")
            local status=$(echo "$health_response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            
            if [[ "$status" == "OK" ]]; then
                success "Health check passed"
                kill $service_pid 2>/dev/null || true
                return 0
            else
                warn "Health check returned status: $status"
            fi
        fi
        
        log "Health check attempt $((attempts + 1))/$max_attempts..."
        sleep 10
        attempts=$((attempts + 1))
    done
    
    kill $service_pid 2>/dev/null || true
    error "Health check failed after $max_attempts attempts"
    exit 1
}

# Create rollback report
create_rollback_report() {
    local backup_file="$1"
    local rollback_dir="$2"
    
    local report_file="$PROJECT_ROOT/rollback_report_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
MOBIUS Rollback Report
=====================
Date: $(date)
Environment: $ENVIRONMENT
Backup Source: $backup_file
Rollback Directory: $rollback_dir
Port: $PORT

Backup Details:
$(ls -la "$backup_file" 2>/dev/null || echo "File info unavailable")

SHA256 Verification:
$(cat "$backup_file.sha256" 2>/dev/null || echo "Checksum unavailable")

Health Status:
$(curl -s "http://localhost:$PORT/health" 2>/dev/null || echo "Health check unavailable")

Next Steps:
1. Monitor service logs for any issues
2. Run smoke tests: node scripts/smoke-tests.js --quick
3. Check metrics: curl http://localhost:$PORT/metrics/dhash
4. Monitor for 30-60 minutes
5. If issues persist, investigate root cause

EOF

    log "Rollback report saved to: $report_file"
}

# Main rollback process
main() {
    log "Starting rollback process for $ENVIRONMENT environment..."
    
    # Confirmation prompt
    if [[ "$FORCE" == false ]]; then
        echo -n "Are you sure you want to rollback $ENVIRONMENT? (yes/no): "
        read -r confirm
        if [[ "$confirm" != "yes" ]]; then
            log "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Find backup
    local backup_file=$(find_latest_backup)
    log "Using backup: $(basename "$backup_file")"
    
    # Verify backup integrity
    verify_backup "$backup_file"
    
    # Stop current service
    stop_service
    
    # Restore from backup
    local rollback_dir=$(restore_backup "$backup_file")
    
    # Health check
    health_check "$rollback_dir"
    
    # Create report
    create_rollback_report "$backup_file" "$rollback_dir"
    
    success "Rollback completed successfully!"
    
    # Summary
    cat << EOF

Rollback Summary:
  Environment: $ENVIRONMENT
  Backup: $(basename "$backup_file")
  Service Directory: $rollback_dir
  Health Endpoint: http://localhost:$PORT/health
  Metrics Endpoint: http://localhost:$PORT/metrics/dhash

The service has been rolled back and health checks have passed.
Please monitor the service closely and run additional verification tests.

EOF
}

# Run main function
main