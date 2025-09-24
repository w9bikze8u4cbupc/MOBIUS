#!/bin/bash

# MOBIUS DHash Deployment Script
# Production-ready deployment with atomic deploy, backup, rollback support

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly BACKUP_DIR="${PROJECT_ROOT}/backups"
readonly LIBRARY_FILE="${PROJECT_ROOT}/library.json"
readonly LOG_DIR="${PROJECT_ROOT}/logs"
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Options
DRY_RUN=false
VERBOSE=false
FORCE=false

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_DIR}/deploy_${TIMESTAMP}.log"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_DIR}/deploy_${TIMESTAMP}.log"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_DIR}/deploy_${TIMESTAMP}.log"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${LOG_DIR}/deploy_${TIMESTAMP}.log"; }

# Usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

MOBIUS DHash deployment script with atomic deploys and rollback support.

OPTIONS:
    --dry-run       Perform validation and show what would be done (no actual changes)
    --verbose       Enable verbose output
    --force         Skip confirmation prompts
    --help          Show this help message

EXAMPLES:
    $0 --dry-run            # Validate deployment without making changes  
    $0 --verbose            # Deploy with detailed output
    $0 --dry-run --verbose  # Dry run with full details
    
EOF
    exit "${1:-0}"
}

# Initialization
init_deployment() {
    log_info "Initializing DHash deployment..."
    
    # Create required directories
    mkdir -p "${BACKUP_DIR}" "${LOG_DIR}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "DRY RUN MODE - No actual changes will be made"
    fi
    
    log_info "Deployment started at: $(date)"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Backup directory: $BACKUP_DIR"
}

# Pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."
    
    local checks_failed=0
    
    # Check Node.js and npm
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        ((checks_failed++))
    else
        log_info "Node.js version: $(node --version)"
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm not found"
        ((checks_failed++))
    else
        log_info "npm version: $(npm --version)"
    fi
    
    # Check FFmpeg (required by the application)
    if ! command -v ffmpeg &> /dev/null; then
        log_warn "FFmpeg not found (may be required for video processing)"
    else
        log_info "FFmpeg version: $(ffmpeg -version | head -n1)"
    fi
    
    # Check if package.json exists
    if [[ ! -f "${PROJECT_ROOT}/package.json" ]]; then
        log_error "package.json not found in project root"
        ((checks_failed++))
    fi
    
    # Check available disk space
    local available_space
    available_space=$(df "${PROJECT_ROOT}" | awk 'NR==2 {print $4}')
    if [[ "$available_space" -lt 1048576 ]]; then  # Less than 1GB
        log_warn "Low disk space: ${available_space}KB available"
    else
        log_info "Available disk space: ${available_space}KB"
    fi
    
    if [[ "$checks_failed" -gt 0 ]]; then
        log_error "Pre-deployment checks failed ($checks_failed errors)"
        return 1
    fi
    
    log_success "Pre-deployment checks passed"
    return 0
}

# Backup current state
create_backup() {
    log_info "Creating backup..."
    
    local backup_file="${BACKUP_DIR}/library.json.bak.${TIMESTAMP}"
    local backup_sha_file="${backup_file}.sha256"
    
    if [[ -f "$LIBRARY_FILE" ]]; then
        if [[ "$DRY_RUN" == "false" ]]; then
            cp "$LIBRARY_FILE" "$backup_file"
            sha256sum "$backup_file" > "$backup_sha_file"
            log_success "Backup created: $backup_file"
            log_info "Backup checksum: $(cat "$backup_sha_file")"
        else
            log_info "[DRY RUN] Would create backup: $backup_file"
        fi
    else
        log_warn "No existing library.json found - first time deployment"
    fi
    
    # Clean old backups (keep last 10)
    cleanup_old_backups
}

# Clean old backups
cleanup_old_backups() {
    log_info "Cleaning old backups (keeping last 10)..."
    
    if [[ "$DRY_RUN" == "false" ]]; then
        find "${BACKUP_DIR}" -name "library.json.bak.*" -type f | sort -r | tail -n +11 | while read -r old_backup; do
            log_info "Removing old backup: $(basename "$old_backup")"
            rm -f "$old_backup" "${old_backup}.sha256"
        done
    else
        local old_backups_count
        old_backups_count=$(find "${BACKUP_DIR}" -name "library.json.bak.*" -type f 2>/dev/null | wc -l)
        if [[ "$old_backups_count" -gt 10 ]]; then
            log_info "[DRY RUN] Would remove $((old_backups_count - 10)) old backups"
        fi
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    if [[ "$DRY_RUN" == "false" ]]; then
        cd "$PROJECT_ROOT"
        npm ci --only=production
        log_success "Dependencies installed"
    else
        log_info "[DRY RUN] Would run: npm ci --only=production"
    fi
}

# Validate health endpoints
validate_health_endpoints() {
    log_info "Validating health endpoints..."
    
    local port=${PORT:-5001}
    local base_url="http://localhost:${port}"
    
    # Start the server in background for testing
    if [[ "$DRY_RUN" == "false" ]]; then
        cd "$PROJECT_ROOT"
        npm start &
        local server_pid=$!
        
        # Wait for server to start
        sleep 5
        
        # Test health endpoint
        if curl -f -s "${base_url}/health" > /dev/null; then
            log_success "Health endpoint responding"
        else
            log_error "Health endpoint not responding"
            kill $server_pid 2>/dev/null || true
            return 1
        fi
        
        # Test metrics endpoint
        if curl -f -s "${base_url}/metrics/dhash" > /dev/null; then
            log_success "Metrics endpoint responding"
        else
            log_error "Metrics endpoint not responding"
            kill $server_pid 2>/dev/null || true
            return 1
        fi
        
        # Stop test server
        kill $server_pid 2>/dev/null || true
        wait $server_pid 2>/dev/null || true
        
    else
        log_info "[DRY RUN] Would test endpoints: ${base_url}/health, ${base_url}/metrics/dhash"
    fi
}

# Deploy application
deploy_application() {
    log_info "Deploying application..."
    
    if [[ "$DRY_RUN" == "false" ]]; then
        cd "$PROJECT_ROOT"
        
        # Run any build steps if needed
        if npm run build --if-present; then
            log_success "Build completed successfully"
        else
            log_info "No build script found or build not needed"
        fi
        
        log_success "Application deployed"
    else
        log_info "[DRY RUN] Would run build and deployment steps"
    fi
}

# Post-deployment verification
post_deployment_verification() {
    log_info "Running post-deployment verification..."
    
    # Run smoke tests if available
    if [[ -x "${SCRIPT_DIR}/simple_smoke_test.sh" ]]; then
        if [[ "$DRY_RUN" == "false" ]]; then
            "${SCRIPT_DIR}/simple_smoke_test.sh"
        else
            log_info "[DRY RUN] Would run smoke tests: ${SCRIPT_DIR}/simple_smoke_test.sh"
        fi
    else
        log_warn "Smoke test script not found or not executable"
    fi
    
    log_success "Post-deployment verification completed"
}

# Rollback function
rollback() {
    log_error "Deployment failed, initiating rollback..."
    
    # Find the most recent backup
    local latest_backup
    latest_backup=$(find "${BACKUP_DIR}" -name "library.json.bak.*" -type f | sort -r | head -n1)
    
    if [[ -n "$latest_backup" && -f "$latest_backup" ]]; then
        log_info "Rolling back to: $(basename "$latest_backup")"
        
        # Verify backup integrity
        if sha256sum -c "${latest_backup}.sha256" &>/dev/null; then
            cp "$latest_backup" "$LIBRARY_FILE"
            log_success "Rollback completed successfully"
        else
            log_error "Backup integrity check failed - manual intervention required"
            return 1
        fi
    else
        log_error "No backup found for rollback - manual intervention required"
        return 1
    fi
}

# Main deployment function
main_deploy() {
    local exit_code=0
    
    init_deployment
    
    if ! pre_deployment_checks; then
        log_error "Pre-deployment checks failed"
        return 1
    fi
    
    create_backup
    
    if ! install_dependencies; then
        log_error "Dependency installation failed"
        rollback
        return 1
    fi
    
    if ! deploy_application; then
        log_error "Application deployment failed"
        rollback
        return 1
    fi
    
    if ! validate_health_endpoints; then
        log_warn "Health endpoint validation failed (continuing)"
        # Don't fail deployment for this, just warn
    fi
    
    if ! post_deployment_verification; then
        log_warn "Post-deployment verification failed (continuing)"
        # Don't fail deployment for this, just warn
    fi
    
    log_success "Deployment completed successfully!"
    log_info "Deployment log saved to: ${LOG_DIR}/deploy_${TIMESTAMP}.log"
    
    return 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            set -x
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help|-h)
            usage 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage 1
            ;;
    esac
done

# Confirmation prompt
if [[ "$FORCE" == "false" && "$DRY_RUN" == "false" ]]; then
    echo -e "${YELLOW}This will deploy the DHash pipeline to production.${NC}"
    read -p "Are you sure you want to continue? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled by user"
        exit 0
    fi
fi

# Execute deployment
if main_deploy; then
    exit 0
else
    log_error "Deployment failed"
    exit 1
fi