#!/bin/bash
# MOBIUS Deployment Rollback Script
# SHA256-verified rollback with health checks

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
ENV="${DEPLOY_ENV:-production}"
BACKUP_PATH=""
FORCE_ROLLBACK=false

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Function to show usage
usage() {
    cat << EOF
Usage: $0 --backup BACKUP_PATH --env ENVIRONMENT [options]

Performs SHA256-verified rollback of MOBIUS deployment.

Required Arguments:
  --backup BACKUP_PATH    Path to the backup ZIP file
  --env ENVIRONMENT      Target environment (production, staging, etc.)

Options:
  --force                Force rollback without interactive confirmation
  -h, --help            Show this help message

Examples:
  $0 --backup backups/dhash_production_20240101_120000.zip --env production
  $0 --backup \$LATEST_BACKUP --env production --force
EOF
}

# Function to verify backup integrity
verify_backup_integrity() {
    local backup_path="$1"
    local checksum_path="${backup_path}.sha256"
    
    log "Verifying backup integrity: $backup_path"
    
    if [[ ! -f "$backup_path" ]]; then
        log "ERROR: Backup file not found: $backup_path"
        exit 1
    fi
    
    if [[ ! -f "$checksum_path" ]]; then
        log "ERROR: Checksum file not found: $checksum_path"
        exit 1
    fi
    
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -c "$checksum_path" >/dev/null || {
            log "ERROR: Backup integrity check failed"
            exit 1
        }
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 -c "$checksum_path" >/dev/null || {
            log "ERROR: Backup integrity check failed"
            exit 1
        }
    else
        log "ERROR: No SHA256 utility found for verification"
        exit 1
    fi
    
    log "Backup integrity verified successfully"
}

# Function to create pre-rollback backup
create_prerollback_backup() {
    log "Creating pre-rollback backup of current state"
    
    if [[ -f "./scripts/deploy/backup.sh" ]]; then
        DEPLOY_ENV="${ENV}_prerollback" ./scripts/deploy/backup.sh || {
            log "WARNING: Failed to create pre-rollback backup"
        }
    else
        log "WARNING: Backup script not found, skipping pre-rollback backup"
    fi
}

# Function to stop services (customize for your deployment)
stop_services() {
    log "Stopping application services for rollback"
    
    # Stop Node.js processes (customize as needed)
    pkill -f "node.*index.js" || true
    pkill -f "npm.*start" || true
    
    # Wait for processes to stop
    sleep 5
    
    log "Services stopped"
}

# Function to restore from backup
restore_from_backup() {
    local backup_path="$1"
    local restore_dir="./rollback_restore"
    
    log "Restoring from backup: $backup_path"
    
    # Create temporary restore directory
    rm -rf "$restore_dir"
    mkdir -p "$restore_dir"
    
    # Extract backup
    unzip -q "$backup_path" -d "$restore_dir" || {
        log "ERROR: Failed to extract backup"
        exit 1
    }
    
    # Backup current critical files
    log "Backing up current environment files"
    mkdir -p "./rollback_backup"
    cp -r .env* ./rollback_backup/ 2>/dev/null || true
    cp -r node_modules ./rollback_backup/ 2>/dev/null || true
    
    # Restore files (be careful with node_modules and env files)
    log "Restoring application files"
    cp -r "$restore_dir"/src ./
    cp -r "$restore_dir"/client ./
    cp -r "$restore_dir"/scripts ./
    cp "$restore_dir"/package.json ./
    cp "$restore_dir"/package-lock.json ./
    
    # Restore golden tests if they exist
    if [[ -d "$restore_dir/tests/golden" ]]; then
        mkdir -p tests
        cp -r "$restore_dir"/tests/golden ./tests/
    fi
    
    # Clean up restore directory
    rm -rf "$restore_dir"
    
    log "Files restored from backup"
}

# Function to reinstall dependencies
reinstall_dependencies() {
    log "Reinstalling dependencies"
    
    if [[ -f "package-lock.json" ]]; then
        npm ci || {
            log "ERROR: Failed to install dependencies"
            exit 1
        }
    else
        npm install || {
            log "ERROR: Failed to install dependencies"
            exit 1
        }
    fi
    
    log "Dependencies installed successfully"
}

# Function to start services (customize for your deployment)
start_services() {
    log "Starting application services"
    
    # Start your application (customize as needed)
    if [[ -f "package.json" ]]; then
        nohup npm start > ./logs/app.log 2>&1 &
        sleep 10
    fi
    
    log "Services started"
}

# Function to perform health checks
perform_health_checks() {
    local max_attempts=5
    local attempt=1
    
    log "Performing post-rollback health checks"
    
    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts"
        
        # Basic process check
        if pgrep -f "node" > /dev/null; then
            log "✓ Node.js process is running"
        else
            log "✗ Node.js process not found"
            if [[ $attempt -eq $max_attempts ]]; then
                return 1
            fi
        fi
        
        # HTTP health check (customize URL and port)
        if command -v curl >/dev/null 2>&1; then
            if curl -f -s http://localhost:5001/health >/dev/null 2>&1; then
                log "✓ HTTP health check passed"
                break
            else
                log "✗ HTTP health check failed"
            fi
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log "ERROR: Health checks failed after $max_attempts attempts"
            return 1
        fi
        
        ((attempt++))
        sleep 10
    done
    
    log "Health checks completed successfully"
    return 0
}

# Function to run smoke tests
run_smoke_tests() {
    log "Running post-rollback smoke tests"
    
    if [[ -f "./scripts/deploy/smoke_tests.sh" ]]; then
        ./scripts/deploy/smoke_tests.sh || {
            log "WARNING: Smoke tests failed"
            return 1
        }
    else
        log "WARNING: Smoke test script not found, skipping smoke tests"
    fi
    
    log "Smoke tests completed"
}

# Main rollback execution
main() {
    log "Starting MOBIUS rollback process"
    log "Environment: $ENV"
    log "Backup: $BACKUP_PATH"
    
    # Verify backup integrity first
    verify_backup_integrity "$BACKUP_PATH"
    
    # Interactive confirmation unless forced
    if [[ "$FORCE_ROLLBACK" != true ]]; then
        echo "WARNING: This will rollback the $ENV environment to backup: $BACKUP_PATH"
        echo "This action cannot be easily undone. Continue? [y/N]"
        read -r confirmation
        if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
            log "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Create pre-rollback backup
    create_prerollback_backup
    
    # Stop services
    stop_services
    
    # Restore from backup
    restore_from_backup "$BACKUP_PATH"
    
    # Reinstall dependencies
    reinstall_dependencies
    
    # Start services
    start_services
    
    # Perform health checks
    if ! perform_health_checks; then
        log "ERROR: Post-rollback health checks failed"
        exit 1
    fi
    
    # Run smoke tests
    run_smoke_tests
    
    log "Rollback completed successfully"
    log "Please monitor the application and run additional validation as needed"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup)
            BACKUP_PATH="$2"
            shift 2
            ;;
        --env)
            ENV="$2"
            shift 2
            ;;
        --force)
            FORCE_ROLLBACK=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log "ERROR: Unknown argument: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$BACKUP_PATH" ]]; then
    log "ERROR: --backup argument is required"
    usage
    exit 1
fi

if [[ -z "$ENV" ]]; then
    log "ERROR: --env argument is required"
    usage
    exit 1
fi

# Execute main function
main